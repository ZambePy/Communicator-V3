// Decisões puras da Edge Function `parear-celular` (pedido do dono de
// 19/10/2026: conectar o celular do cuidador por código QR, sem senha).
//
// Módulo sem APIs do Deno: é importado pela função e pelos testes
// (`deno test supabase/functions/parear-celular/`).

import { hex } from './codigoDoCelular.ts';

/**
 * A resposta de TODA falha ligada ao código: inexistente, vencido, já usado,
 * cancelado, de computador desvinculado, de conta sem e-mail confirmado. Uma
 * só, para a resposta não dizer a ninguém se um código existe.
 */
export const CODIGO_INVALIDO = { error: 'codigo_invalido' } as const;
export const MUITAS_TENTATIVAS = { error: 'muitas_tentativas' } as const;
export const SERVICO_INDISPONIVEL = { error: 'servico_indisponivel' } as const;
/** Corpo que não é `application/json` (415) — ver `atender.ts`. */
export const TIPO_NAO_SUPORTADO = { error: 'tipo_nao_suportado' } as const;

interface Cabecalhos {
  get(nome: string): string | null;
}

/** IPv4, ou IPv6 (com ":" e, no fim, talvez um IPv4), como os proxies escrevem — sem porta. */
const PARECE_IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|(?=[0-9a-fA-F:.]*:)[0-9a-fA-F:.]{2,45})$/;

/** O balde de quem não deu para saber o endereço (um só, para o limite continuar valendo). */
const DESCONHECIDO = 'desconhecido';

/**
 * Endereço de rede de quem chamou, para o limite de tentativas:
 *  - `cf-connecting-ip`, posto pelo Cloudflare na frente do Supabase (ele
 *    sobrescreve o que o cliente mandar com esse nome);
 *  - senão, o ÚLTIMO item do `x-forwarded-for`, o que o proxy acrescentou. O
 *    primeiro é o que o próprio cliente escreveu: trocá-lo a cada pedido
 *    furaria o limite;
 *  - senão, `x-real-ip`;
 *  - sem nenhum: um balde só, "desconhecido" — o limite continua valendo.
 * O limite é a segunda camada: o código tem 256 bits, e adivinhar é inviável
 * mesmo para quem consiga trocar de endereço.
 */
export function ipDoPedido(h: Cabecalhos): string {
  const limpo = (v: string | null | undefined) => (v ?? '').trim();
  const cf = limpo(h.get('cf-connecting-ip'));
  if (PARECE_IP.test(cf)) return cf;
  const xff = limpo(h.get('x-forwarded-for')).split(',').map((s) => s.trim()).filter(Boolean);
  const ultimo = xff[xff.length - 1] ?? '';
  if (PARECE_IP.test(ultimo)) return ultimo;
  const real = limpo(h.get('x-real-ip'));
  if (PARECE_IP.test(real)) return real;
  return DESCONHECIDO;
}

/** Os quatro números de um IPv4 em decimal (0–255), ou `null`. */
function octetosDoIPv4(texto: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(texto);
  if (!m) return null;
  const octetos = m.slice(1).map(Number);
  return octetos.every((o) => o <= 255) ? octetos : null;
}

/** Os oito grupos de 16 bits de um IPv6 (com `::` e um IPv4 no fim, se houver), ou `null`. */
function gruposDoIPv6(texto: string): number[] | null {
  let s = texto.toLowerCase();
  let fim: number[] = [];
  const comIPv4 = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (comIPv4) {
    const o = octetosDoIPv4(comIPv4[2]);
    if (!o) return null;
    fim = [o[0] * 256 + o[1], o[2] * 256 + o[3]];
    // "…::1.2.3.4" mantém o "::"; "…:ffff:1.2.3.4" perde só o ":" do fim.
    s = comIPv4[1].endsWith('::') ? comIPv4[1] : comIPv4[1].slice(0, -1);
  }
  const lados = s.split('::');
  if (lados.length > 2) return null;
  const ler = (parte: string): number[] | null => {
    if (parte === '') return [];
    const grupos: number[] = [];
    for (const g of parte.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      grupos.push(parseInt(g, 16));
    }
    return grupos;
  };
  const antes = ler(lados[0]);
  const depois = lados.length === 2 ? ler(lados[1]) : [];
  if (!antes || !depois) return null;
  const escritos = antes.length + depois.length + fim.length;
  if (lados.length === 1) return escritos === 8 ? [...antes, ...fim] : null;
  // O "::" vale por um ou mais grupos de zeros.
  if (escritos > 7) return null;
  return [...antes, ...new Array<number>(8 - escritos).fill(0), ...depois, ...fim];
}

/**
 * O balde do limite de tentativas para um endereço (revisão de segurança de
 * 20/10/2026): IPv4 inteiro; IPv6 pelo /64. O provedor entrega a cada casa um
 * /64 inteiro (2^64 endereços), e o sistema troca de endereço dentro dele
 * sozinho (endereços temporários): com um balde por endereço IPv6, trocar a
 * cada pedido furava o limite. O que não é endereço vai para o balde
 * "desconhecido" — um balde por texto qualquer deixaria trocar de balde a
 * cada pedido.
 */
export function baldeDoEndereco(ip: string): string {
  const v4 = octetosDoIPv4(ip);
  if (v4) return v4.join('.');
  if (!ip.includes(':')) return DESCONHECIDO;
  const g = gruposDoIPv6(ip);
  if (!g) return DESCONHECIDO;
  // IPv4 escrito como IPv6 (::ffff:a.b.c.d, como alguns proxies escrevem) é
  // o IPv4: pelo /64, TODOS esses clientes cairiam no mesmo balde (::/64).
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join('.');
  }
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}

/** HMAC-SHA-256 em hexadecimal (RFC 2104). */
export async function hmacHex(chave: string, mensagem: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(mensagem))));
}

/**
 * O endereço como o banco guarda: HMAC com uma chave que só a função tem. Um
 * SHA-256 puro do IP se desfaz em minutos (são só 4 bilhões de IPv4); com a
 * chave, o hash não volta ao endereço, e o banco não guarda dado pessoal à toa.
 * O HMAC é do BALDE (`baldeDoEndereco`: IPv6 pelo /64), não do endereço
 * exato — revisão de segurança de 20/10/2026.
 */
export function hashDoEndereco(segredo: string, ip: string): Promise<string> {
  return hmacHex(segredo, `pareamento-ip:${baldeDoEndereco(ip)}`);
}

export type Decisao =
  | { tipo: 'gerar_link'; email: string; userId: string; pareamentoId: string; paciente: string | null }
  | {
      tipo: 'recusar';
      status: 400 | 429 | 503;
      corpo: { error: string };
      /** Linha para o log da função (sem código, e-mail nem endereço). */
      registro?: string;
    };

/** O que fazer com o JSON de `usar_codigo_de_pareamento`. */
export function decidirUso(resultado: unknown): Decisao {
  const r = (resultado && typeof resultado === 'object' ? resultado : {}) as Record<string, unknown>;
  if (r.ok === true) {
    if (typeof r.email !== 'string' || !r.email || typeof r.user_id !== 'string' || typeof r.pareamento_id !== 'string') {
      return { tipo: 'recusar', status: 503, corpo: SERVICO_INDISPONIVEL, registro: 'resposta do banco sem a conta' };
    }
    // O link mágico confirmaria o e-mail (o Auth confirma ao verificar): conta
    // sem e-mail confirmado não entra por aqui. O código já foi gasto — de
    // propósito: falha fechada, e o computador nem gera código para essa conta.
    if (r.email_confirmado !== true) {
      return { tipo: 'recusar', status: 400, corpo: CODIGO_INVALIDO, registro: 'conta sem e-mail confirmado: entrada recusada' };
    }
    return {
      tipo: 'gerar_link',
      email: r.email,
      userId: r.user_id,
      pareamentoId: r.pareamento_id,
      paciente: typeof r.paciente === 'string' && r.paciente.trim() ? r.paciente.trim() : null,
    };
  }
  if (r.motivo === 'limite') return { tipo: 'recusar', status: 429, corpo: MUITAS_TENTATIVAS };
  if (r.motivo === 'invalido') return { tipo: 'recusar', status: 400, corpo: CODIGO_INVALIDO };
  return { tipo: 'recusar', status: 503, corpo: SERVICO_INDISPONIVEL, registro: 'resposta inesperada do banco' };
}

// ---------------------------------------------------------------------------
// Aviso de celular novo (decisão 1 da rodada 3, 21/10/2026). O QR abre a conta
// inteira da família, sem senha: quem fotografar o QR de outra pessoa entra.
// Por isso cada celular que entra por ele vira aviso para todos — uma nota de
// sistema na conversa e um push nos celulares que já estavam cadastrados —,
// e quem não reconhecer a entrada fica sabendo na hora.
// ---------------------------------------------------------------------------

/** "Um celular novo entrou na conta pelo QR às 14:03." — hora de Brasília. */
export function textoDoCelularNovo(agora: Date): string {
  const hora = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `Um celular novo entrou na conta pelo QR às ${hora}.`;
}

export interface MensagemDoCelularNovo {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  interruptionLevel: 'active';
  channelId: 'default';
  data: { kind: 'celular_novo'; beneficiary_id?: string };
}

/**
 * Um push por celular já cadastrado (API de push da Expo). Canal comum e
 * `active`, como os avisos de sistema da desktop-sync: é aviso, não socorro —
 * não fura o modo Foco nem o Não perturbe.
 */
export function mensagensDoCelularNovo(tokens: string[], texto: string, beneficiaryId: string | null): MensagemDoCelularNovo[] {
  return tokens.map((to) => ({
    to,
    title: 'Celular novo na conta',
    body: texto,
    sound: 'default',
    priority: 'high',
    interruptionLevel: 'active',
    channelId: 'default',
    data: beneficiaryId ? { kind: 'celular_novo', beneficiary_id: beneficiaryId } : { kind: 'celular_novo' },
  }));
}

/**
 * O que deu errado no envio do aviso, pela resposta da Expo (`{ data:
 * [ticket…] }`, um por mensagem, na mesma ordem; ou `{ errors: […] }`), ou
 * `null` se todos foram aceitos. Só códigos: o texto da Expo (`message`) pode
 * trazer o token do celular, e o token não vai para o log.
 */
export function problemaDoPush(httpOk: boolean, corpo: unknown, enviados: number): string | null {
  const r = (corpo && typeof corpo === 'object' ? corpo : {}) as {
    data?: unknown;
    errors?: Array<{ code?: unknown }>;
  };
  const tickets = Array.isArray(r.data) ? (r.data as Array<{ status?: unknown; details?: { error?: unknown } }>) : null;
  if (!httpOk || !tickets) {
    const codigos = new Set<string>();
    for (const e of Array.isArray(r.errors) ? r.errors : []) if (typeof e?.code === 'string') codigos.add(e.code);
    if (codigos.size === 0) codigos.add(httpOk ? 'resposta_inesperada' : 'http');
    return `recusado (${[...codigos].join(', ')})`;
  }
  const codigos = new Set<string>();
  let recusados = 0;
  for (let i = 0; i < enviados; i++) {
    const t = tickets[i];
    if (t && t.status === 'ok') continue;
    recusados++;
    codigos.add(!t ? 'sem_ticket' : typeof t.details?.error === 'string' ? t.details.error : 'erro');
  }
  return recusados ? `recusado para ${recusados} de ${enviados} celular(es) (${[...codigos].join(', ')})` : null;
}

/**
 * Confere o link mágico antes de entregar o `hashed_token` ao celular. Só
 * serve se for da conta do código e do tipo "magiclink": quando o e-mail não
 * existe, o `generateLink` do Auth CRIA uma conta nova e devolve um link de
 * cadastro — esse nunca pode sair daqui.
 */
export function conferirLink(dados: unknown, userIdEsperado: string): { ok: true; tokenHash: string } | { ok: false; registro: string } {
  const d = (dados && typeof dados === 'object' ? dados : {}) as {
    user?: { id?: unknown } | null;
    properties?: { hashed_token?: unknown; verification_type?: unknown } | null;
  };
  if (d.user?.id !== userIdEsperado) return { ok: false, registro: 'link mágico de outra conta: recusado' };
  const tipo = d.properties?.verification_type;
  if (tipo !== undefined && tipo !== 'magiclink') return { ok: false, registro: 'link que não é de entrada: recusado' };
  const token = d.properties?.hashed_token;
  if (typeof token !== 'string' || !token) return { ok: false, registro: 'link mágico sem token' };
  return { ok: true, tokenHash: token };
}
