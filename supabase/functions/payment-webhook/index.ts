// Edge Function `payment-webhook`
//
// Único ponto por onde o GATEWAY DE PAGAMENTO escreve no banco. O site nunca
// marca uma assinatura como paga (a RLS impede de propósito); quem faz isso é
// esta função, com a service_role, chamando `register_charge()` — a máquina
// de estados da assinatura, definida em
// supabase/migrations/20260923022507_integracao_ecossistema.sql.
//
// Efeito em cascata no ecossistema:
//   pagamento confirmado → subscriptions.status = 'ativa'
//                        → desktop_license() passa a liberar o app desktop
//                        → o app do cuidador enxerga o plano ativo
//   falha/vencimento      → 'inadimplente' → carência de 7 dias no desktop
//
// Deploy:   supabase functions deploy payment-webhook --no-verify-jwt
//           (o gateway não manda JWT do Supabase; a autenticação é a assinatura
//            HMAC do próprio gateway, verificada abaixo)
// Segredos: supabase secrets set PAYMENT_GATEWAY=stripe PAYMENT_WEBHOOK_SECRET=whsec_...
//
// O que falta para ligar de verdade (marcado com TODO):
//   1. Escolher o gateway em PAYMENT_GATEWAY e colar o segredo do webhook.
//   2. Conferir o mapeamento de eventos do gateway escolhido em `normalizar()`.
//   3. Cadastrar a URL desta função no painel do gateway.
//   4. No checkout do site, gravar `gateway_subscription_id` na assinatura
//      (via attach_payment_method/gateway) para o webhook localizar a conta.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const GATEWAY = (Deno.env.get('PAYMENT_GATEWAY') ?? 'stripe').toLowerCase();
const SECRET = Deno.env.get('PAYMENT_WEBHOOK_SECRET') ?? '';

type ChargeStatus = 'pendente' | 'paga' | 'vencida' | 'estornada' | 'falhou';
type Method = 'cartao' | 'pix' | 'boleto';

/** Formato interno: o que `register_charge()` precisa, independente do gateway. */
interface EventoNormalizado {
  eventId: string;
  type: string;
  chargeId: string;
  gatewaySubscriptionId: string | null;
  /** Nosso subscriptions.id, quando o gateway devolve o metadata que o checkout enviou. */
  subscriptionId: string | null;
  status: ChargeStatus | null;
  amountBrl: number;
  method: Method;
  dueAt: string;
  paidAt: string | null;
  pixCopyPaste?: string | null;
  boletoBarcode?: string | null;
  boletoPdfUrl?: string | null;
}

// ---------------------------------------------------------------------
// Assinatura HMAC
// ---------------------------------------------------------------------
async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Verifica a assinatura do gateway. Sem segredo configurado, recusa tudo. */
async function assinaturaValida(req: Request, corpo: string): Promise<boolean> {
  if (!SECRET) return false;
  switch (GATEWAY) {
    case 'stripe': {
      // Stripe-Signature: t=<timestamp>,v1=<hmac(t + "." + corpo)>
      const header = req.headers.get('stripe-signature') ?? '';
      const partes = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
      if (!partes.t || !partes.v1) return false;
      if (Math.abs(Date.now() / 1000 - Number(partes.t)) > 300) return false; // 5 min de tolerância
      return igualConstante(await hmacHex(SECRET, `${partes.t}.${corpo}`), partes.v1);
    }
    case 'mercadopago': {
      // x-signature: ts=<ts>,v1=<hmac("id:<data.id>;request-id:<x-request-id>;ts:<ts>;")>
      const header = req.headers.get('x-signature') ?? '';
      const partes = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]));
      const url = new URL(req.url);
      const dataId = url.searchParams.get('data.id') ?? '';
      const requestId = req.headers.get('x-request-id') ?? '';
      if (!partes.ts || !partes.v1) return false;
      const manifest = `id:${dataId};request-id:${requestId};ts:${partes.ts};`;
      return igualConstante(await hmacHex(SECRET, manifest), partes.v1);
    }
    case 'pagarme': {
      // Pagar.me v5: HMAC-SHA256 do corpo no header X-Hub-Signature ("sha256=<hex>")
      const header = (req.headers.get('x-hub-signature') ?? '').replace(/^sha256=/, '');
      if (!header) return false;
      return igualConstante(await hmacHex(SECRET, corpo), header);
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------
// Normalização por gateway
//
// TODO: confira os nomes de evento/campos na conta do gateway escolhido.
// Os mapeamentos abaixo seguem a documentação pública de cada um.
// ---------------------------------------------------------------------
function normalizar(evento: Record<string, unknown>): EventoNormalizado | null {
  switch (GATEWAY) {
    case 'stripe': {
      const type = String(evento.type ?? '');
      const obj = ((evento.data as Record<string, unknown>)?.object ?? {}) as Record<string, unknown>;
      const metadata = (obj.metadata ?? {}) as Record<string, string>;
      const status: ChargeStatus | null =
        type === 'invoice.paid' || type === 'invoice.payment_succeeded' ? 'paga'
        : type === 'invoice.payment_failed' ? 'falhou'
        : type === 'charge.refunded' ? 'estornada'
        : type === 'invoice.marked_uncollectible' ? 'vencida'
        : type === 'invoice.finalized' ? 'pendente'
        : null;
      if (!status) return null;
      const metodo = String(obj.payment_method_types?.toString() ?? 'card');
      return {
        eventId: String(evento.id),
        type,
        chargeId: String(obj.id),
        gatewaySubscriptionId: obj.subscription ? String(obj.subscription) : null,
        subscriptionId: metadata.subscription_id ?? null,
        status,
        amountBrl: Number(obj.amount_paid ?? obj.amount_due ?? obj.amount ?? 0) / 100,
        method: /boleto/.test(metodo) ? 'boleto' : /pix/.test(metodo) ? 'pix' : 'cartao',
        dueAt: obj.due_date ? new Date(Number(obj.due_date) * 1000).toISOString() : new Date().toISOString(),
        paidAt: status === 'paga' ? new Date().toISOString() : null,
      };
    }
    case 'mercadopago': {
      // Mercado Pago manda só {action, type, data:{id}}; o detalhe do pagamento
      // precisa ser buscado na API (GET /v1/payments/:id) com o access token.
      // TODO: buscar o pagamento e preencher os campos abaixo.
      const data = (evento.data ?? {}) as Record<string, unknown>;
      const pagamento = (evento._payment ?? {}) as Record<string, unknown>; // preenchido pelo TODO acima
      const st = String(pagamento.status ?? '');
      const status: ChargeStatus | null =
        st === 'approved' ? 'paga' : st === 'rejected' ? 'falhou' : st === 'refunded' || st === 'charged_back' ? 'estornada'
        : st === 'cancelled' ? 'vencida' : st === 'pending' || st === 'in_process' ? 'pendente' : null;
      if (!status) return null;
      const tipo = String(pagamento.payment_type_id ?? '');
      return {
        eventId: String(evento.id ?? `${data.id}-${evento.action}`),
        type: String(evento.action ?? evento.type ?? ''),
        chargeId: String(data.id),
        gatewaySubscriptionId: pagamento.preapproval_id ? String(pagamento.preapproval_id) : null,
        subscriptionId: ((pagamento.metadata as Record<string, string>)?.subscription_id) ?? null,
        status,
        amountBrl: Number(pagamento.transaction_amount ?? 0),
        method: tipo === 'bank_transfer' ? 'pix' : tipo === 'ticket' ? 'boleto' : 'cartao',
        dueAt: String(pagamento.date_of_expiration ?? new Date().toISOString()),
        paidAt: pagamento.date_approved ? String(pagamento.date_approved) : null,
        pixCopyPaste: ((pagamento.point_of_interaction as Record<string, Record<string, string>>)?.transaction_data?.qr_code) ?? null,
      };
    }
    case 'pagarme': {
      const type = String(evento.type ?? '');
      const charge = ((evento.data ?? {}) as Record<string, unknown>);
      const st = String(charge.status ?? '');
      const status: ChargeStatus | null =
        type === 'charge.paid' || st === 'paid' ? 'paga'
        : type === 'charge.payment_failed' || st === 'failed' ? 'falhou'
        : type === 'charge.refunded' || st === 'refunded' ? 'estornada'
        : type === 'charge.overpaid' || type === 'charge.underpaid' ? 'pendente'
        : st === 'pending' ? 'pendente' : null;
      if (!status) return null;
      const pm = String(charge.payment_method ?? 'credit_card');
      const tx = (charge.last_transaction ?? {}) as Record<string, unknown>;
      return {
        eventId: String(evento.id),
        type,
        chargeId: String(charge.id),
        gatewaySubscriptionId: (charge.subscription as Record<string, unknown>)?.id ? String((charge.subscription as Record<string, unknown>).id) : null,
        subscriptionId: ((charge.metadata as Record<string, string>)?.subscription_id) ?? null,
        status,
        amountBrl: Number(charge.amount ?? 0) / 100,
        method: pm === 'pix' ? 'pix' : pm === 'boleto' ? 'boleto' : 'cartao',
        dueAt: String(charge.due_at ?? charge.created_at ?? new Date().toISOString()),
        paidAt: charge.paid_at ? String(charge.paid_at) : null,
        pixCopyPaste: (tx.qr_code as string | undefined) ?? null,
        boletoBarcode: (tx.line as string | undefined) ?? null,
        boletoPdfUrl: (tx.pdf as string | undefined) ?? null,
      };
    }
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const corpo = await req.text();

  if (!(await assinaturaValida(req, corpo))) {
    console.warn('[payment-webhook] assinatura inválida ou segredo não configurado');
    return new Response('invalid signature', { status: 401 });
  }

  let evento: Record<string, unknown>;
  try {
    evento = JSON.parse(corpo);
  } catch {
    return new Response('json inválido', { status: 400 });
  }

  const n = normalizar(evento);
  if (!n) {
    // Evento que não muda cobrança nem assinatura: aceita e ignora.
    return Response.json({ ok: true, ignored: true });
  }

  // Idempotência: o gateway reenvia eventos; cada um é processado uma vez.
  // Um evento que FALHOU no processamento (linha com `error`) pode ser
  // reprocessado — é justamente o caso de "assinatura ainda sem
  // gateway_subscription_id" que o reenvio do gateway resolve.
  const { error: erroEvento } = await supabase
    .from('gateway_events')
    .insert({ gateway: GATEWAY, event_id: n.eventId, event_type: n.type, payload: evento });
  if (erroEvento) {
    if (erroEvento.code !== '23505') {
      console.error('[payment-webhook] gateway_events', erroEvento);
      return new Response('erro ao registrar evento', { status: 500 });
    }
    const { data: anterior } = await supabase
      .from('gateway_events')
      .select('processed_at, error')
      .eq('gateway', GATEWAY).eq('event_id', n.eventId)
      .maybeSingle();
    if (anterior?.processed_at && !anterior.error) return Response.json({ ok: true, duplicate: true });
  }

  const { data, error } = await supabase.rpc('register_charge', {
    p_gateway: GATEWAY,
    p_gateway_charge_id: n.chargeId,
    p_status: n.status,
    p_amount_brl: n.amountBrl,
    p_method: n.method,
    p_gateway_subscription_id: n.gatewaySubscriptionId,
    p_subscription_id: n.subscriptionId,
    p_due_at: n.dueAt,
    p_paid_at: n.paidAt,
    p_pix_copy_paste: n.pixCopyPaste ?? null,
    p_boleto_barcode: n.boletoBarcode ?? null,
    p_boleto_pdf_url: n.boletoPdfUrl ?? null,
  });

  await supabase
    .from('gateway_events')
    .update({ processed_at: new Date().toISOString(), error: error?.message ?? null })
    .eq('gateway', GATEWAY)
    .eq('event_id', n.eventId);

  if (error) {
    console.error('[payment-webhook] register_charge', error);
    // 500 faz o gateway reenviar mais tarde (ex.: assinatura ainda sem gateway_subscription_id).
    return new Response(error.message, { status: 500 });
  }
  return Response.json({ ok: true, ...(data as Record<string, unknown>) });
});
