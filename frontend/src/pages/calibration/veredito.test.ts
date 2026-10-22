import { describe, it, expect } from 'vitest';
import {
  ehCanto,
  lerCalibracao,
  lugarDoPonto,
  palavraDaCalibracao,
  LOO_BOM_PX,
  DERIVA_ALTA_GRAUS,
} from './veredito';
import { classificarErroPx } from '@tracker/resultadoSimples';
import type { CalibrationFitDiagnostics } from '@tracker/calibration';

// -----------------------------------------------------------------------------
// Tradução do diagnóstico de ajuste para linguagem de cuidador.
//
// Quem decide o veredito é o `gridDiagnosis` do core, que já distingue
// "a periferia saiu do alcance" de "a sessão inteira está ruim" e já é testado.
// Um segundo classificador aqui divergiria dele no primeiro ajuste de limiar, e
// a tela diria "bom" sobre uma calibração que o core reprova.
//
// LOO e deriva postural escolhem o MOTIVO, não o veredito.
//
// Os números vêm das seis sessões reais em `docs/medicoes/historico/`:
//
//   LOO:    68 (melhor) · 170 (mediana) · 252 (pior)
//   deriva: 1,7° a 3,5°
//
// A sessão com deriva de 3,47° foi classificada pelo core como
// `periferia_fora_de_alcance`, e não como sessão ruim. Um limiar de deriva que
// reprovasse por conta própria contradiria o core em dado medido.
// -----------------------------------------------------------------------------

type Grade = CalibrationFitDiagnostics['gridDiagnosis'];

const grade = (veredicto: string, over: Partial<Grade> = {}): Grade =>
  ({
    veredicto,
    centroPx: 100,
    periferiaPx: 110,
    razao: 1.1,
    piorAlvoPx: 150,
    mensagem: null,
    ...over,
  }) as Grade;

const diag = (over: Partial<CalibrationFitDiagnostics> = {}): CalibrationFitDiagnostics =>
  ({
    trainErrorPx: 50,
    looErrorPx: 70,
    looByTarget: [],
    poseMean: null,
    poseStd: null,
    poseDrift: { targets: 8, yawDeg: 1.0, pitchDeg: 1.0, rollDeg: 1.0 },
    gridDiagnosis: grade('ok'),
    ...over,
  }) as CalibrationFitDiagnostics;

describe('quem decide é o veredito da grade', () => {
  it('sessão ruim manda refazer', () => {
    expect(lerCalibracao(diag({ gridDiagnosis: grade('sessao_ruim') })).veredicto).toBe('refazer');
  });

  it('alvo inaprendível manda refazer', () => {
    // O comentário do core: um único alvo inaprendível não move muito a média,
    // mas está DENTRO do treino dos outros e corrompe o ajuste todo.
    expect(lerCalibracao(diag({ gridDiagnosis: grade('alvo_inaprendivel') })).veredicto).toBe(
      'refazer'
    );
  });

  it('periferia fora de alcance é aceitável, não reprovação', () => {
    // É um problema específico e parcial: o centro da tela continua utilizável.
    expect(
      lerCalibracao(diag({ gridDiagnosis: grade('periferia_fora_de_alcance') })).veredicto
    ).toBe('aceitavel');
  });

  it('grade ok com LOO baixo é bom', () => {
    expect(lerCalibracao(diag({ looErrorPx: 68 })).veredicto).toBe('bom');
  });
});

describe('o LOO rebaixa, mas não reprova sozinho', () => {
  it('grade ok com LOO alto vira aceitável', () => {
    // Dizer "bom" sobre um LOO de 170 px — a mediana das sessões reais —
    // ensinaria o cuidador a confiar num número que não merece.
    expect(lerCalibracao(diag({ looErrorPx: 170 })).veredicto).toBe('aceitavel');
  });

  it('LOO alto NÃO manda refazer por conta própria', () => {
    // Quem reprova é a grade. LOO alto com grade ok pode ser distância ou luz,
    // e refazer a calibração não corrige nenhuma das duas.
    expect(lerCalibracao(diag({ looErrorPx: 250 })).veredicto).not.toBe('refazer');
  });

  it('exatamente no limiar ainda é bom', () => {
    expect(lerCalibracao(diag({ looErrorPx: LOO_BOM_PX })).veredicto).toBe('bom');
  });

  it('julga pelo LOO da grade interna: os cantos da tela, extrapolação por construção, não rebaixam', () => {
    // A mesma sessão do replay de 23/09: ~83 px na grade, ~150 px com os cantos.
    const l = lerCalibracao(diag({ looErrorPx: 150, looGradeInternaPx: 83 }));
    expect(l.veredicto).toBe('bom');
    expect(l.looErrorPx).toBe(83);
    // E a tela sabe que o número deixou os cantos de fora.
    expect(l.semOsCantos).toBe(true);
    expect(lerCalibracao(diag({ looErrorPx: 150 })).semOsCantos).toBe(false);
    // Diagnóstico antigo, sem o número interno: vale o de todos os alvos.
    expect(lerCalibracao(diag({ looErrorPx: 150 })).veredicto).toBe('aceitavel');
    expect(lerCalibracao(diag({ looErrorPx: 150, looGradeInternaPx: Number.NaN })).veredicto).toBe('aceitavel');
  });
});

describe('a deriva postural escolhe o motivo', () => {
  it('deriva alta vira o motivo quando o veredito não é bom', () => {
    // "Você se mexeu entre os alvos" é acionável; recalibrar sem corrigir a
    // posição repete o resultado.
    const r = lerCalibracao(
      diag({
        gridDiagnosis: grade('sessao_ruim'),
        poseDrift: { targets: 8, yawDeg: 4.2, pitchDeg: 1.0, rollDeg: 1.0 },
      })
    );
    expect(r.motivo).toMatch(/deriva|movimento|posicao|posição/i);
  });

  it('deriva alta sozinha NÃO reprova', () => {
    // A sessão real com 3,47° de deriva foi classificada como
    // `periferia_fora_de_alcance` pelo core, não como ruim.
    const r = lerCalibracao(
      diag({ poseDrift: { targets: 8, yawDeg: DERIVA_ALTA_GRAUS + 0.5, pitchDeg: 1, rollDeg: 1 } })
    );
    expect(r.veredicto).not.toBe('refazer');
  });

  it('reporta a maior deriva entre os eixos', () => {
    const r = lerCalibracao(
      diag({ poseDrift: { targets: 8, yawDeg: 1.2, pitchDeg: 3.9, rollDeg: 0.8 } })
    );
    expect(r.derivaGraus).toBeCloseTo(3.9, 5);
  });
});

describe('sem diagnóstico', () => {
  it('não manda refazer', () => {
    // Reprovar por ausência de medição faria o paciente repetir a calibração
    // inteira sem que nada estivesse errado.
    expect(lerCalibracao(null).veredicto).not.toBe('refazer');
  });

  it('não inventa motivo nem número', () => {
    const r = lerCalibracao(null);
    expect(r.motivo).toBeNull();
    expect(r.derivaGraus).toBeNull();
  });
});

describe('o que a tela precisa mostrar', () => {
  it('o LOO sempre acompanha o veredito', () => {
    expect(lerCalibracao(diag({ looErrorPx: 123 })).looErrorPx).toBe(123);
  });

  it('grade ok e LOO baixo não têm motivo a explicar', () => {
    expect(lerCalibracao(diag({ looErrorPx: 68 })).motivo).toBeNull();
  });
});

describe('a palavra do resultado (pedido de 19/10/2026)', () => {
  const ler = (over: Partial<CalibrationFitDiagnostics> = {}) => {
    const d = diag(over);
    return { d, l: lerCalibracao(d) };
  };
  const semPontos = { validacao: null, pontosRuins: [] };

  it('os limiares são os do teste de precisão: Excelente/Bom → Ótima, Regular → Boa, Ruim → refazer', () => {
    for (const [px, esperado] of [[20, 'otima'], [59, 'otima'], [60, 'boa'], [99, 'boa'], [100, 'refazerTudo']] as const) {
      const { d, l } = ler({ looErrorPx: px });
      expect(palavraDaCalibracao(l, d, semPontos).palavra).toBe(esperado);
    }
    // E a fronteira é exatamente a do `accuracy.ts`.
    expect(classificarErroPx(59.9)).toBe('Bom');
    expect(classificarErroPx(60)).toBe('Regular');
    expect(classificarErroPx(100)).toBe('Ruim');
  });

  it('com o teste de precisão medido contra o modelo, vale o erro do teste (o painel disse o mesmo)', () => {
    const { d, l } = ler({ looErrorPx: 150 });
    const r = palavraDaCalibracao(l, d, { validacao: { erroInternoPx: 45 }, pontosRuins: [] });
    expect(r.palavra).toBe('otima');
    expect(r.fonte).toBe('teste');
  });

  it('cantos ruins: "Refazer os cantos"; um meio de borda: "Refazer as bordas"', () => {
    const { d, l } = ler({ looErrorPx: 50 });
    const cantos = palavraDaCalibracao(l, d, { validacao: null, pontosRuins: [{ x: 0.05, y: 0.05, borda: true }] });
    expect(cantos.palavra).toBe('refazerCantos');
    expect(cantos.titulo).toBe('refazerCantos');
    const bordas = palavraDaCalibracao(l, d, { validacao: null, pontosRuins: [{ x: 0.5, y: 0.98, borda: true }] });
    expect(bordas.titulo).toBe('refazerBordas');
  });

  it('um ponto ruim no miolo: "Refazer alguns pontos"', () => {
    const { d, l } = ler({ looErrorPx: 50 });
    const r = palavraDaCalibracao(l, d, {
      validacao: null,
      pontosRuins: [{ x: 0.5, y: 0.5, borda: false }, { x: 0.05, y: 0.05, borda: true }],
    });
    expect(r.palavra).toBe('refazerPontos');
    // Com um ponto do miolo na lista, o botão não pode dizer "só os cantos".
    expect(r.soCantos).toBe(false);
  });

  it('o miolo ruim vence os pontos: refazer a calibração, com a frase do motivo', () => {
    const { d, l } = ler({
      gridDiagnosis: grade('sessao_ruim'),
      poseDrift: { targets: 8, yawDeg: 4.5, pitchDeg: 1, rollDeg: 1 },
    });
    const r = palavraDaCalibracao(l, d, { validacao: null, pontosRuins: [{ x: 0.05, y: 0.05, borda: true }] });
    expect(r.palavra).toBe('refazerTudo');
    expect(r.frase).toBe('refazerTudoDeriva');
  });

  it('alvo inaprendível reprova como o core; se ele está na lista, refaz só ele', () => {
    const { d, l } = ler({ looErrorPx: 50, gridDiagnosis: grade('alvo_inaprendivel') });
    const semLista = palavraDaCalibracao(l, d, semPontos);
    expect(semLista.palavra).toBe('refazerTudo');
    expect(semLista.frase).toBe('refazerTudoPonto');
    const comLista = palavraDaCalibracao(l, d, { validacao: null, pontosRuins: [{ x: 0.5, y: 0.5, borda: false }] });
    expect(comLista.palavra).toBe('refazerPontos');
  });

  it('com o teste medido, o veredito da grade não reprova sozinho (o painel do teste já falou)', () => {
    const { d, l } = ler({ looErrorPx: 50, gridDiagnosis: grade('sessao_ruim') });
    expect(palavraDaCalibracao(l, d, { validacao: { erroInternoPx: 40 }, pontosRuins: [] }).palavra).toBe('otima');
  });

  it('sem diagnóstico não reprova nem promete "Ótima"', () => {
    const r = palavraDaCalibracao(lerCalibracao(null), null, semPontos);
    expect(r.palavra).toBe('boa');
    expect(r.fonte).toBe('nenhuma');
  });

  // Revisão do pipeline de 19/10/2026: sem como refazer (recoleta desligada,
  // calibração do disco) a lista vem vazia, e a tela dizia "Ótima" logo depois
  // de o painel do teste dizer "Refazer os cantos".
  it('sem como refazer, os cantos que o TESTE mediu "Ruim" ainda dão a palavra — sem prometer o botão', () => {
    const { d, l } = ler({ looErrorPx: 50 });
    const cantos = palavraDaCalibracao(l, d, {
      validacao: { erroInternoPx: 40, cantosRuins: [{ x: 0.05, y: 0.95 }] },
      pontosRuins: [],
    });
    expect(cantos.palavra).toBe('refazerCantos');
    expect(cantos.titulo).toBe('refazerCantos');
    expect(cantos.frase).toBe('refazerCantosSemBotao');
    const bordas = palavraDaCalibracao(l, d, {
      validacao: { erroInternoPx: 40, cantosRuins: [{ x: 0.5, y: 0.98 }] },
      pontosRuins: [],
    });
    expect(bordas.titulo).toBe('refazerBordas');
    expect(bordas.frase).toBe('refazerBordasSemBotao');
    // Com a lista do núcleo (o botão existe), a frase é a de sempre.
    const comBotao = palavraDaCalibracao(l, d, {
      validacao: { erroInternoPx: 40, cantosRuins: [{ x: 0.05, y: 0.95 }] },
      pontosRuins: [{ x: 0.05, y: 0.95, borda: true }],
    });
    expect(comBotao.frase).toBe('refazerCantos');
    // Sem canto ruim no teste, nada muda.
    expect(palavraDaCalibracao(l, d, { validacao: { erroInternoPx: 40, cantosRuins: [] }, pontosRuins: [] }).palavra).toBe('otima');
  });
});

describe('onde fica cada ponto, em palavras', () => {
  it('nove regiões', () => {
    expect(lugarDoPonto({ x: 0.05, y: 0.05 })).toBe('cima.esquerda');
    expect(lugarDoPonto({ x: 0.5, y: 0.5 })).toBe('meio.centro');
    expect(lugarDoPonto({ x: 0.95, y: 0.95 })).toBe('baixo.direita');
  });

  it('canto é longe do centro nos dois eixos', () => {
    expect(ehCanto({ x: 0.05, y: 0.95 })).toBe(true);
    expect(ehCanto({ x: 0.5, y: 0.98 })).toBe(false);
  });
});
