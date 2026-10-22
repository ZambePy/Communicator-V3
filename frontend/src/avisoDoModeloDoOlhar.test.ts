import { describe, it, expect } from 'vitest';
import type { EngineDiagnostics } from '@tracker/tracker/engine';
import { avisoDoModeloDoOlhar, SEM_LEITURA_VALIDA_PARA_AVISAR_MS } from './avisoDoModeloDoOlhar';
import { problemaPersistenteDoOlhar } from './components/GazeStatusBanner';
import { avisoParaOCuidador } from './cloud/avisoDoProblemaAoCuidador';

// Modelo do olhar parado ou que não carregou (relato de 19/10/2026, falhas
// silenciosas #10). Antes só o HUD do desenvolvedor mostrava "stale 100 %".

type Diag = Pick<EngineDiagnostics, 'l2cs' | 'olho'>;

function diag(over: {
  l2cs?: Partial<EngineDiagnostics['l2cs']>;
  olho?: Partial<EngineDiagnostics['olho']>;
} = {}): Diag {
  return {
    l2cs: { status: 'ready', motivoDoErro: null, reinicio: null, ...over.l2cs },
    olho: { ativo: false, status: 'desligado', motivoDoErro: null, reinicio: null, ...over.olho },
  } as unknown as Diag;
}

describe('avisoDoModeloDoOlhar', () => {
  it('sem diagnóstico ou com os modelos bem: nenhum aviso', () => {
    expect(avisoDoModeloDoOlhar(null, 'tracking')).toBeNull();
    expect(avisoDoModeloDoOlhar(diag(), 'tracking')).toBeNull();
    expect(avisoDoModeloDoOlhar(diag({ olho: { ativo: true, status: 'pronto' } }), 'tracking')).toBeNull();
  });

  it('só com o olhar em uso: na calibração a própria tela fala do modelo', () => {
    const d = diag({ l2cs: { status: 'error', motivoDoErro: 'falha_do_worker' } });
    expect(avisoDoModeloDoOlhar(d, 'calibrating')).toBeNull();
    expect(avisoDoModeloDoOlhar(d, 'idle')).toBeNull();
    for (const estado of ['tracking', 'degraded', 'no_face']) {
      expect(avisoDoModeloDoOlhar(d, estado)).not.toBeNull();
    }
  });

  it('worker que parou: diz que está reiniciando e que o cursor continua com a íris', () => {
    const a = avisoDoModeloDoOlhar(diag({ l2cs: { status: 'error', motivoDoErro: 'falha_do_worker' } }), 'tracking');
    expect(a?.titulo).toBe('O modelo do olhar parou de responder');
    expect(a?.detalhe).toMatch(/reiniciando/);
    expect(a?.detalhe).toMatch(/íris/);
  });

  it('acabadas as tentativas: diz que não voltou e o que costuma resolver', () => {
    const a = avisoDoModeloDoOlhar(
      diag({ l2cs: { status: 'error', motivoDoErro: 'falha_do_worker', reinicio: { tentativas: 4, desistiu: true } } }),
      'tracking'
    );
    expect(a?.titulo).toBe('O modelo do olhar parou e não voltou');
    expect(a?.detalhe).toMatch(/fechar e abrir o IrisFlow/);
  });

  it('carga: não carregou, e calibrar só com a íris é o caminho', () => {
    const a = avisoDoModeloDoOlhar(diag({ l2cs: { status: 'error', motivoDoErro: 'carga' } }), 'tracking');
    expect(a?.titulo).toBe('O modelo do olhar não carregou');
    expect(a?.detalhe).toMatch(/calibrar só com a íris/);
  });

  it('saída travada: espera a imagem voltar', () => {
    const a = avisoDoModeloDoOlhar(diag({ l2cs: { status: 'error', motivoDoErro: 'saida_travada' } }), 'degraded');
    expect(a?.titulo).toBe('O modelo do olhar está esperando a imagem');
  });

  it('o ramo ocular (EyeNet) só avisa quando ligado', () => {
    const ligado = diag({ olho: { ativo: true, status: 'erro', motivoDoErro: 'falha_do_worker' } });
    expect(avisoDoModeloDoOlhar(ligado, 'tracking')?.titulo).toBe('O modelo dos olhos (EyeNet) parou de responder');
    const desligado = diag({ olho: { ativo: false, status: 'erro', motivoDoErro: 'falha_do_worker' } });
    expect(avisoDoModeloDoOlhar(desligado, 'tracking')).toBeNull();
  });

  it('os dois parados: o do rosto primeiro (é o que pesa na mira de produção)', () => {
    const d = diag({
      l2cs: { status: 'error', motivoDoErro: 'falha_do_worker' },
      olho: { ativo: true, status: 'erro', motivoDoErro: 'falha_do_worker' },
    });
    expect(avisoDoModeloDoOlhar(d, 'tracking')?.titulo).toMatch(/^O modelo do olhar/);
  });
});

// Revisão do pipeline de 20/10/2026 — o modelo VIVO, em `ready`, mas com toda
// resposta chegando vencida (448² em WASM numa máquina lenta: ~2,7 s por
// resposta, acima do teto de 2,5 s). Antes, nenhum aviso: nem na tela, nem ao
// cuidador. O teste da revisão (reinicio448LentoSemAviso.test.ts, o terceiro)
// afirmava `null` para os dois; aqui, invertido.
describe('avisoDoModeloDoOlhar — status ready com as leituras vencendo', () => {
  const lento = (semLeituraValidaMs: number) => diag({
    l2cs: { status: 'ready', executionProvider: 'wasm', inputSize: 448, stalePct: 100, semLeituraValidaMs, reinicio: { tentativas: 1, desistiu: false } } as Partial<EngineDiagnostics['l2cs']>,
  });

  it('10 s sem leitura válida: o aviso diz que o modelo está lento e que o cursor segue com a íris', () => {
    expect(SEM_LEITURA_VALIDA_PARA_AVISAR_MS).toBe(10_000);
    expect(avisoDoModeloDoOlhar(lento(9_999), 'tracking')).toBeNull();
    const a = avisoDoModeloDoOlhar(lento(10_000), 'tracking');
    expect(a?.titulo).toBe('O modelo do olhar está lento neste computador');
    expect(a?.detalhe).toMatch(/atrasadas/);
    expect(a?.detalhe).toMatch(/íris/);
    for (const estado of ['degraded', 'no_face']) expect(avisoDoModeloDoOlhar(lento(12_000), estado)).not.toBeNull();
    // Na calibração a própria tela fala do modelo.
    expect(avisoDoModeloDoOlhar(lento(12_000), 'calibrating')).toBeNull();
  });

  it('vai para o caminho de problema de rastreamento (`modelo_do_olhar`) e, se durar, ao cuidador', () => {
    const avisoDoModelo = avisoDoModeloDoOlhar(lento(12_000), 'tracking');
    expect(avisoDoModelo).not.toBeNull();
    const p = problemaPersistenteDoOlhar({ state: 'tracking', cameraError: null, calibrationInvalidated: null, avisoDoModelo } as never);
    expect(p?.tipo).toBe('modelo_do_olhar');
    const texto = avisoParaOCuidador(
      { tipo: 'modelo_do_olhar', mensagem: p!.mensagem, desdeMs: 0 } as never,
      { agoraMs: 45_000, ultimoRastreamentoOkMs: null, estado: { ultimoAvisoPorTipo: {} } },
    );
    // O texto ao cuidador não promete que alguém "está tentando voltar sozinho".
    expect(texto).toMatch(/parou ou está lento/);
    expect(texto).not.toMatch(/tentando voltar sozinho/);
  });

  it('um erro do modelo continua na frente do aviso de lentidão', () => {
    const d = diag({ l2cs: { status: 'error', motivoDoErro: 'falha_do_worker', semLeituraValidaMs: 60_000 } as Partial<EngineDiagnostics['l2cs']> });
    expect(avisoDoModeloDoOlhar(d, 'tracking')?.titulo).toBe('O modelo do olhar parou de responder');
  });

  it('engine sem o campo (dublê antigo): nenhum aviso de lentidão', () => {
    expect(avisoDoModeloDoOlhar(diag({ l2cs: { status: 'ready', stalePct: 100 } as Partial<EngineDiagnostics['l2cs']> }), 'tracking')).toBeNull();
  });
});
