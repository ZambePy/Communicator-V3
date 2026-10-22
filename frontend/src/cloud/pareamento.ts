/**
 * Conectar o celular do cuidador por código QR — o lado do computador (pedido
 * do dono de 19/10/2026: "conectar o celular do cuidador por QR code, sem
 * digitar código nem senha").
 *
 * O computador já vinculado pede um código à Edge Function `desktop-sync`
 * (`pairing.create`, autenticado pela chave do computador), desenha o QR com o
 * endereço do site e pergunta de poucos em poucos segundos se um celular já
 * entrou (`pairing.status`). Fechar a tela cancela o código (`pairing.cancel`).
 * Contrato: supabase/functions/desktop-sync/index.ts e ./pareamento.ts de lá.
 *
 * Por que `#t=` (fragmento) e não `?t=` no endereço do QR: o fragmento nunca sai
 * do celular. Não vai no pedido ao servidor do site, então não aparece no log
 * de acesso da hospedagem, nem no cabeçalho Referer dos arquivos que a página
 * carrega. A página /parear lê o código e o tira da barra de endereço antes de
 * qualquer outra coisa (site/src/lib/pareamento.ts).
 *
 * Não passa pela `DesktopSync` de propósito: nada disto pode ir para a fila
 * offline (um código de 3 minutos não serve depois), e uma segunda instância
 * dela drenaria a mesma fila em dobro.
 */
import { cloudConfig } from './config';

/** 32 bytes em base64url: 43 caracteres (o mesmo formato de supabase/functions/desktop-sync/codigoDoCelular.ts). */
export const FORMATO_DO_CODIGO = /^[A-Za-z0-9_-]{43}$/;

/** Espelho de `EstadoDoCodigo` da desktop-sync (ver o cabeçalho). */
export type EstadoDoCodigo = 'aguardando' | 'usado' | 'conectado' | 'vencido' | 'cancelado' | 'desconhecido';
const ESTADOS: readonly EstadoDoCodigo[] = ['aguardando', 'usado', 'conectado', 'vencido', 'cancelado', 'desconhecido'];

export interface CodigoGerado {
  id: string;
  codigo: string;
  /** Segundos de validade contados pelo SERVIDOR na hora da resposta. */
  restanteS: number;
  validadeS: number;
}

export interface EstadoConsultado {
  estado: EstadoDoCodigo;
  restanteS?: number;
  usadoEm?: string;
  conectadoEm?: string;
}

export type FalhaDoPareamento = 'limite' | 'email_nao_confirmado' | 'computador_desvinculado' | 'sem_conexao' | 'servico';

export class ErroDoPareamento extends Error {
  readonly falha: FalhaDoPareamento;
  /** `limite`: a partir de quando dá para gerar de novo (ISO). */
  readonly tenteEm?: string;
  constructor(falha: FalhaDoPareamento, tenteEm?: string) {
    super(falha);
    this.name = 'ErroDoPareamento';
    this.falha = falha;
    this.tenteEm = tenteEm;
  }
}

export interface OpcoesDoPareamento {
  /** Chave do computador (`pair_device()`), a mesma da desktop-sync. */
  chave: string;
  url?: string;
  anonKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function chamar(op: OpcoesDoPareamento, corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = op.url ?? cloudConfig.desktopSyncUrl;
  const anonKey = op.anonKey ?? cloudConfig.anonKey;
  const fetchImpl = op.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  if (!url) throw new ErroDoPareamento('servico');
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), op.timeoutMs ?? 10_000);
  let res: Response;
  let dados: Record<string, unknown> = {};
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-key': op.chave,
        ...(anonKey ? { apikey: anonKey, authorization: `Bearer ${anonKey}` } : {}),
      },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    // Relato de 22/10/2026: o prazo ficava desarmado assim que os cabeçalhos
    // chegavam e `res.json()` esperava sem limite — a consulta do QR (e o
    // "venceu" no fim dos 3 minutos) ficava parada para sempre com o corpo
    // pendurado. O prazo só cai depois da leitura, como na `DesktopSync`.
    try {
      dados = ((await res.json()) ?? {}) as Record<string, unknown>;
    } catch {
      /* sem corpo */
      // Mas se foi o PRAZO que cortou a leitura, é falta de resposta, não "sem corpo".
      if (controle.signal.aborted) throw new Error('prazo');
    }
  } catch {
    // Sem rede, ou o prazo estourou.
    throw new ErroDoPareamento('sem_conexao');
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return dados;
  const codigo = typeof dados.error === 'string' ? dados.error : '';
  if (res.status === 429 && codigo === 'limite') {
    throw new ErroDoPareamento('limite', typeof dados.tente_em === 'string' ? dados.tente_em : undefined);
  }
  if (res.status === 409 && codigo === 'email_nao_confirmado') throw new ErroDoPareamento('email_nao_confirmado');
  // Só os códigos da PRÓPRIA função: um 401 do gateway (função publicada com
  // verify_jwt) é problema de implantação, não de vínculo — como na DesktopSync.
  if ((res.status === 401 || res.status === 403) && (codigo === 'unauthorized' || codigo === 'device_revoked')) {
    throw new ErroDoPareamento('computador_desvinculado');
  }
  throw new ErroDoPareamento('servico');
}

/** Pede um código novo (o anterior deste computador para de valer). */
export async function pedirCodigo(op: OpcoesDoPareamento): Promise<CodigoGerado> {
  const r = await chamar(op, { action: 'pairing.create' });
  // Nada fora do formato vai para o QR: uma resposta estranha vira falha visível.
  if (typeof r.id !== 'string' || typeof r.codigo !== 'string' || !FORMATO_DO_CODIGO.test(r.codigo)) {
    throw new ErroDoPareamento('servico');
  }
  const validadeS = typeof r.validade_s === 'number' && r.validade_s > 0 ? r.validade_s : 180;
  const restanteS = typeof r.restante_s === 'number' && Number.isFinite(r.restante_s) ? Math.max(0, Math.min(r.restante_s, validadeS)) : validadeS;
  return { id: r.id, codigo: r.codigo, restanteS, validadeS };
}

/** Pergunta se um celular já usou o código (e se confirmou que entrou). */
export async function consultarCodigo(op: OpcoesDoPareamento, id: string): Promise<EstadoConsultado> {
  const r = await chamar(op, { action: 'pairing.status', id });
  const estado = ESTADOS.includes(r.estado as EstadoDoCodigo) ? (r.estado as EstadoDoCodigo) : 'desconhecido';
  return {
    estado,
    ...(typeof r.restante_s === 'number' ? { restanteS: r.restante_s } : {}),
    ...(typeof r.usado_em === 'string' ? { usadoEm: r.usado_em } : {}),
    ...(typeof r.conectado_em === 'string' ? { conectadoEm: r.conectado_em } : {}),
  };
}

/** Cancela o código da tela (fechou, desistiu). Melhor esforço: nunca lança. */
export async function cancelarCodigo(op: OpcoesDoPareamento, id: string): Promise<boolean> {
  try {
    await chamar(op, { action: 'pairing.cancel', id });
    return true;
  } catch {
    // Sem rede: o código vence sozinho em até 3 minutos.
    return false;
  }
}

/** Endereço do QR: `<site>/parear#t=<código>` (ver o cabeçalho sobre o `#`). */
export function urlDoPareamento(siteUrl: string, codigo: string): string {
  if (!FORMATO_DO_CODIGO.test(codigo)) throw new Error('código de pareamento fora do formato');
  return `${siteUrl.replace(/\/+$/, '')}/parear#t=${codigo}`;
}

/** "14:32" no fuso deste computador; vazio para data ilegível. */
export function horaCurta(iso: string | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "2:41" para o tempo que falta. */
export function tempoRestante(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** O que a tela diz quando o código não saiu, em linguagem de gente. */
export function mensagemDaFalha(falha: FalhaDoPareamento, tenteEm?: string): string {
  switch (falha) {
    case 'limite': {
      const hora = horaCurta(tenteEm);
      return `Já foram gerados vários códigos em pouco tempo. Dá para gerar outro ${hora ? `a partir das ${hora}` : 'daqui a alguns minutos'}.`;
    }
    case 'email_nao_confirmado':
      return 'Para conectar um celular, o e-mail da conta precisa estar confirmado. Procure o e-mail do IrisFlow com o código de confirmação (veja também o lixo eletrônico) e confirme no site.';
    case 'computador_desvinculado':
      return 'Este computador não está mais conectado à conta da família. Entre de novo com o e-mail e a senha da conta para conectar um celular.';
    case 'sem_conexao':
      return 'Sem conexão com a internet agora. Confira a rede e tente de novo.';
    default:
      return 'Não foi possível gerar o código agora. Tente de novo em instantes.';
  }
}
