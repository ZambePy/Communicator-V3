// Edge Function `parear-celular`
//
// Conecta o celular do cuidador à conta da família pelo código QR que o
// computador do paciente mostra em Configurações, sem digitar e-mail nem senha
// (pedido do dono de 19/10/2026). O celular manda o código que leu; a função o
// troca, UMA vez, por um link mágico da conta — gerado aqui dentro com a
// service_role — e devolve só o `token_hash` dele. O app abre a sessão com
// `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })` e segue o
// fluxo normal (registro do push etc.).
//
// Deploy:   supabase functions deploy parear-celular
//           (verify_jwt desligado em supabase/config.toml: quem chama é um
//            celular ainda sem conta; a credencial é o próprio código)
// Segredos: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, que já existem em toda
//           Edge Function. A service_role também é a chave do HMAC do endereço
//           de rede (ver ./logica.ts) — nenhum segredo novo. EXPO_ACCESS_TOKEN
//           é opcional (o mesmo da desktop-sync: push autenticado).
// Banco:    migração 20261019200000_pareamento_do_celular.
//
// Aviso de celular novo (decisão 1 da rodada 3, 21/10/2026): depois de cada
// troca bem-sucedida, a conversa do paciente recebe a nota de sistema "Um
// celular novo entrou na conta pelo QR às HH:MM." e os celulares já
// cadastrados na conta recebem o mesmo texto por push. Falha na nota ou no
// push não muda a resposta (ver avisarCelularNovo em ./atender.ts).
//
// Contrato (POST JSON { codigo }, content-type application/json):
//   200 { ok, token_hash, tipo: 'magiclink', pareamento_id, paciente }
//   400 { error: 'codigo_invalido' }       inexistente, vencido, já usado,
//                                          cancelado, computador desvinculado ou
//                                          conta sem e-mail confirmado: a MESMA
//                                          resposta (não revela se existe)
//   415 { error: 'tipo_nao_suportado' }    corpo que não é application/json
//                                          (text/plain, formulário): nem chega
//                                          ao banco
//   429 { error: 'muitas_tentativas' }     tentativas que FALHARAM: 10 a cada
//                                          10 min por endereço de rede (IPv6:
//                                          pelo /64) e 300 por minuto no total.
//                                          O código certo passa sempre.
//   503 { error: 'servico_indisponivel' }  banco ou Auth fora: tente de novo
//
// Nunca vão para o log: o código, o hash dele, o e-mail, o token devolvido e o
// endereço de rede (o teste de ./atender.ts confere). Sem CORS, de propósito:
// nenhum site precisa chamar esta função (o app nativo não passa por CORS), e
// um navegador não consegue ler a resposta a partir de outra origem. O 415
// (revisão de segurança de 20/10/2026) fecha o que sobrava: o POST "simples"
// que qualquer página manda sem preflight não conta mais no limite.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { atender } from './atender.ts';

const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/** O aviso não pode segurar a entrada do celular novo por muito tempo. */
const PRAZO_DO_PUSH_MS = 4_000;

Deno.serve((req) =>
  atender(req, {
    segredo: CHAVE_DE_SERVICO,
    usarCodigo: async (tokenHash, ipHash) => {
      const { data, error } = await supabase.rpc('usar_codigo_de_pareamento', { p_token_hash: tokenHash, p_ip_hash: ipHash });
      return { data, error };
    },
    gerarLink: async (email) => {
      const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
      return { data, error: error ? { status: error.status, code: error.code } : null };
    },
    registrar: (nivel, linha) => console[nivel](`[parear-celular] ${linha}`),
    gravarNota: async (pareamentoId, texto) => {
      const { data: pareamento, error } = await supabase
        .from('pareamentos_de_celular').select('beneficiary_id').eq('id', pareamentoId).maybeSingle();
      if (error) return { beneficiaryId: null, error };
      if (!pareamento) return { beneficiaryId: null, error: { code: 'sem_pareamento' } };
      // Como as notas do escalonamento: do "cuidador", tipo sistema, já
      // falada — o app mostra como aviso do IrisFlow, e o computador do
      // paciente não a lê em voz alta.
      const { error: erroDaNota } = await supabase.from('messages').insert({
        beneficiary_id: pareamento.beneficiary_id, sender: 'cuidador', kind: 'sistema', text: texto, spoken: true,
      });
      return { beneficiaryId: pareamento.beneficiary_id as string, error: erroDaNota };
    },
    celularesDaConta: async (userId) => {
      const { data, error } = await supabase.from('push_tokens').select('token').eq('profile_id', userId);
      return { tokens: (data ?? []).map((t) => t.token as string), error };
    },
    enviarPush: async (mensagens) => {
      const tokenDaExpo = Deno.env.get('EXPO_ACCESS_TOKEN');
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(tokenDaExpo ? { authorization: `Bearer ${tokenDaExpo}` } : {}),
        },
        body: JSON.stringify(mensagens),
        signal: AbortSignal.timeout(PRAZO_DO_PUSH_MS),
      });
      let corpo: unknown = null;
      try {
        corpo = await res.json();
      } catch {
        // sem corpo: problemaDoPush trata como resposta inesperada
      }
      return { ok: res.ok, corpo };
    },
    agora: () => new Date(),
  })
);
