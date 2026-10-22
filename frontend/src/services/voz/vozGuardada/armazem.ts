/**
 * Onde as gravações da voz guardada ficam, visto do renderer.
 *
 *   - No app instalado (Electron): na pasta do app, ao lado da voz clonada
 *     (`userData/voz/guardadas/`), pelo processo principal — `irisflowVozGuardada`.
 *   - Fora dele (navegador, desenvolvimento, testes): na memória, até fechar.
 *     A tela DIZ isso (`onde: 'memoria'`): ninguém pode achar que guardou a
 *     voz de alguém para sempre quando ela some ao fechar a janela.
 *
 * Em nenhum dos dois casos a gravação vai para a rede.
 */

import type { ResultadoDaImportacao } from '@tracker/voz/protocolo';
import {
  LIMITES_DA_VOZ_GUARDADA, consentimentoDoPerfil, ehIdDeGravacao, normalizarTextoDaGravacao,
  type ConsentimentoDaVozGuardada, type GravacaoGuardada, type PedidoDeSalvar, type ResultadoDaListagem,
  type ResultadoDeLer, type ResultadoDeSalvar, type ResultadoSimples,
} from '@tracker/voz/vozGuardada';

export interface ConsentimentoPedido {
  texto: string;
  aceitoEm: string;
  perfilId: string | null;
}

/** A ponte do preload (`electron/preload.ts`). */
export interface PonteDaVozGuardada {
  listar: () => Promise<ResultadoDaListagem>;
  consentir: (c: ConsentimentoPedido) => Promise<ResultadoSimples>;
  salvar: (p: PedidoDeSalvar) => Promise<ResultadoDeSalvar>;
  ler: (id: string) => Promise<ResultadoDeLer>;
  apagar: (id: string) => Promise<ResultadoSimples>;
  /** Remover o paciente: todas as gravações e o termo DELE (M4). */
  apagarDoPerfil: (perfilId: string) => Promise<ResultadoSimples>;
  usarComoReferencia: (id: string, c: ConsentimentoPedido) => Promise<ResultadoDaImportacao>;
}

export interface ArmazemDaVozGuardada {
  onde: 'computador' | 'memoria';
  listar: () => Promise<ResultadoDaListagem>;
  consentir: (c: ConsentimentoPedido) => Promise<ResultadoSimples>;
  salvar: (p: PedidoDeSalvar) => Promise<ResultadoDeSalvar>;
  ler: (id: string) => Promise<ResultadoDeLer>;
  apagar: (id: string) => Promise<ResultadoSimples>;
  /**
   * Todas as gravações do perfil e o termo que ele aceitou (as dos outros ficam). Chamado ao
   * REMOVER o paciente: a voz é dado biométrico e não pode ficar no computador, nem no backup,
   * sem dono (revisão final, rodada 1, M4, 21/10/2026).
   */
  apagarDoPerfil: (perfilId: string) => Promise<ResultadoSimples>;
  /** Só no app instalado: é o motor da voz clonada que prepara a referência. */
  usarComoReferencia: ((id: string, c: ConsentimentoPedido) => Promise<ResultadoDaImportacao>) | null;
}

export function ponteDaVozGuardada(w: Window | undefined = typeof window === 'undefined' ? undefined : window): PonteDaVozGuardada | null {
  if (!w) return null;
  return (w as unknown as { irisflowVozGuardada?: PonteDaVozGuardada }).irisflowVozGuardada ?? null;
}

const erroDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Um IPC que rejeita (janela recarregando, main ocupado) vira resposta, não exceção na tela. */
async function semExcecao<T>(chamada: () => Promise<T>, falha: (erro: string) => T, oQue: string): Promise<T> {
  try {
    return await chamada();
  } catch (e) {
    console.warn(`[voz-guardada] ${oQue} falhou:`, e);
    return falha(erroDe(e));
  }
}

export function armazemDoComputador(ponte: PonteDaVozGuardada): ArmazemDaVozGuardada {
  const falhou = (erro: string) => ({ ok: false as const, erro: `Não foi possível falar com o aplicativo agora (${erro}).` });
  return {
    onde: 'computador',
    listar: () => semExcecao(() => ponte.listar(), falhou, 'listar'),
    consentir: (c) => semExcecao(() => ponte.consentir(c), falhou, 'consentir'),
    salvar: (p) => semExcecao(() => ponte.salvar(p), falhou, 'salvar'),
    ler: (id) => semExcecao(() => ponte.ler(id), falhou, 'ler'),
    apagar: (id) => semExcecao(() => ponte.apagar(id), falhou, 'apagar'),
    apagarDoPerfil: (perfilId) =>
      semExcecao(
        () => (typeof ponte.apagarDoPerfil === 'function'
          ? ponte.apagarDoPerfil(perfilId)
          : Promise.resolve({ ok: false as const, erro: 'Esta versão do aplicativo não sabe apagar a voz de um paciente removido.' })),
        falhou,
        'apagar a voz do perfil',
      ),
    usarComoReferencia: (id, c) => semExcecao(() => ponte.usarComoReferencia(id, c), falhou, 'usar como referência'),
  };
}

/**
 * Armazém na memória: mesmas regras do arquivo do app (termo exigido, WAV,
 * limites) — inclusive um termo POR PERFIL (revisão de segurança de 20/10/2026).
 */
export function criarArmazemNaMemoria(): ArmazemDaVozGuardada {
  const gravacoes = new Map<string, { g: GravacaoGuardada; wav: ArrayBuffer }>();
  let consentimentos: ConsentimentoDaVozGuardada[] = [];
  return {
    onde: 'memoria',
    listar: async () => ({ ok: true, gravacoes: [...gravacoes.values()].map((x) => x.g), consentimentos: consentimentos.map((c) => ({ ...c })) }),
    consentir: async (c) => {
      if (typeof c?.texto !== 'string' || c.texto.length < LIMITES_DA_VOZ_GUARDADA.consentimentoMin) {
        return { ok: false, erro: 'Gravar a voz exige o termo de consentimento aceito.' };
      }
      const perfilId = typeof c.perfilId === 'string' ? c.perfilId : null;
      // O aceite de um perfil não apaga o dos outros.
      consentimentos = [...consentimentos.filter((x) => x.perfilId !== perfilId), { texto: c.texto, aceitoEm: c.aceitoEm, perfilId }];
      return { ok: true };
    },
    salvar: async (p) => {
      if (!consentimentoDoPerfil(consentimentos, typeof p?.perfilId === 'string' ? p.perfilId : null)) {
        return { ok: false, erro: 'Gravar a voz exige o termo de consentimento aceito.' };
      }
      const texto = normalizarTextoDaGravacao(p.texto ?? '');
      if (!ehIdDeGravacao(p.id) || !texto || !(p.wav instanceof ArrayBuffer) || p.wav.byteLength > LIMITES_DA_VOZ_GUARDADA.bytesMax) {
        return { ok: false, erro: 'Gravação inválida.' };
      }
      const g: GravacaoGuardada = {
        id: p.id, texto, criadaEm: new Date().toISOString(), duracaoS: p.duracaoS, qualidade: p.qualidade,
        perfilId: p.perfilId, bytes: p.wav.byteLength,
      };
      gravacoes.set(p.id, { g, wav: p.wav.slice(0) });
      if (p.substitui && p.substitui !== p.id) gravacoes.delete(p.substitui);
      return { ok: true, gravacao: g };
    },
    ler: async (id) => {
      const x = gravacoes.get(id);
      return x ? { ok: true, wav: x.wav.slice(0) } : { ok: false, erro: 'Esta gravação não está mais neste computador.' };
    },
    apagar: async (id) => {
      gravacoes.delete(id);
      return { ok: true };
    },
    apagarDoPerfil: async (perfilId) => {
      for (const [id, x] of gravacoes) if (x.g.perfilId === perfilId) gravacoes.delete(id);
      consentimentos = consentimentos.filter((c) => c.perfilId !== perfilId);
      return { ok: true };
    },
    usarComoReferencia: null,
  };
}

let daMemoria: ArmazemDaVozGuardada | null = null;

/** O armazém desta janela: o do app instalado, ou o da memória (o mesmo em todas as telas). */
export function armazemDaVozGuardada(): ArmazemDaVozGuardada {
  const ponte = ponteDaVozGuardada();
  if (ponte) return armazemDoComputador(ponte);
  daMemoria ??= criarArmazemNaMemoria();
  return daMemoria;
}

/** As gravações deste paciente (e as sem perfil), da mais nova para a mais antiga. */
export function gravacoesDoPerfil(gravacoes: readonly GravacaoGuardada[], perfilId: string | null): GravacaoGuardada[] {
  return gravacoes
    .filter((g) => g.perfilId === null || perfilId === null || g.perfilId === perfilId)
    .sort((a, b) => Date.parse(b.criadaEm) - Date.parse(a.criadaEm));
}

/** Só para testes. */
export function _zerarArmazemDaMemoria(): void {
  daMemoria = null;
}
