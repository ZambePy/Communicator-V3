import { describe, it, expect } from 'vitest';
import {
  clampSuave, clampDuro, clampNaBorda, MARGEM_DURA_MAX_PX,
  reacaoAMudancaDeTela,
  janelaParaTela,
  janelaParaSobreposicao,
  sobreposicaoParaTela,
  telaParaFisicoAproximado,
  tamanhoDoCursorNoSistema,
  regiaoDaLupa,
  lupaParaTela,
  prenderNoRetangulo,
  type QuadroDeTela, sobreposicaoParaJanela } from './geometria';

const monitorPrimario: QuadroDeTela = {
  janela: { x: 0, y: 0, width: 1536, height: 864 },
  monitor: { x: 0, y: 0, width: 1536, height: 864 },
  escala: 1.25, // 1920×1080 a 125 %
};

const janelaMenor: QuadroDeTela = {
  janela: { x: 100, y: 60, width: 1280, height: 800 },
  monitor: { x: 0, y: 0, width: 1920, height: 1080 },
  escala: 1,
};

const monitorSecundario: QuadroDeTela = {
  janela: { x: 1920, y: 0, width: 1280, height: 720 },
  monitor: { x: 1920, y: 0, width: 1280, height: 720 },
  escala: 1,
};

describe('janela → tela → sobreposição', () => {
  it('janela em tela cheia: a conversão é identidade', () => {
    expect(janelaParaSobreposicao({ x: 300, y: 200 }, monitorPrimario)).toEqual({ x: 300, y: 200 });
  });

  it('janela deslocada soma a origem do conteúdo', () => {
    expect(janelaParaTela({ x: 10, y: 20 }, janelaMenor)).toEqual({ x: 110, y: 80 });
    expect(janelaParaSobreposicao({ x: 10, y: 20 }, janelaMenor)).toEqual({ x: 110, y: 80 });
  });

  it('monitor secundário: a sobreposição vê coordenadas locais', () => {
    expect(janelaParaSobreposicao({ x: 5, y: 5 }, monitorSecundario)).toEqual({ x: 5, y: 5 });
    expect(sobreposicaoParaTela({ x: 5, y: 5 }, monitorSecundario)).toEqual({ x: 1925, y: 5 });
  });

  it('nunca sai do monitor', () => {
    expect(janelaParaSobreposicao({ x: -50, y: 5000 }, monitorPrimario)).toEqual({ x: 0, y: 863 });
    expect(sobreposicaoParaTela({ x: 99999, y: -1 }, monitorSecundario)).toEqual({ x: 3199, y: 0 });
  });

  it('prende inclusive um retângulo degenerado sem NaN', () => {
    expect(prenderNoRetangulo({ x: 5, y: 5 }, { x: 0, y: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('tela → físico (reserva)', () => {
  it('multiplica pela escala do monitor', () => {
    expect(telaParaFisicoAproximado({ x: 100, y: 40 }, monitorPrimario)).toEqual({ x: 125, y: 50 });
  });
  it('escala 1 é identidade mesmo em monitor deslocado', () => {
    expect(telaParaFisicoAproximado({ x: 1925, y: 5 }, monitorSecundario)).toEqual({ x: 1925, y: 5 });
  });
});

describe('cursor sobre o sistema', () => {
  it('encolhe para 60 % do cursor do app', () => {
    expect(tamanhoDoCursorNoSistema(48)).toBe(29);
  });
  it('respeita piso e teto', () => {
    expect(tamanhoDoCursorNoSistema(24)).toBe(24);
    expect(tamanhoDoCursorNoSistema(128)).toBe(40);
    expect(tamanhoDoCursorNoSistema(Number.NaN)).toBe(29);
  });
});

describe('lupa', () => {
  const monitor = { x: 0, y: 0, width: 1920, height: 1080 };

  it('recorta um quadrado centrado no ponto', () => {
    expect(regiaoDaLupa({ x: 960, y: 540 }, 150, monitor)).toEqual({ x: 810, y: 390, width: 300, height: 300 });
  });

  it('desloca para dentro quando encosta na borda', () => {
    const r = regiaoDaLupa({ x: 10, y: 1075, raio: 0 } as never, 150, monitor);
    expect(r).toEqual({ x: 0, y: 780, width: 300, height: 300 });
  });

  it('mapeia o ponto do painel de volta para a tela', () => {
    const regiao = { x: 810, y: 390, width: 300, height: 300 };
    expect(lupaParaTela({ x: 0, y: 0 }, { width: 600, height: 600 }, regiao)).toEqual({ x: 810, y: 390 });
    expect(lupaParaTela({ x: 300, y: 300 }, { width: 600, height: 600 }, regiao)).toEqual({ x: 960, y: 540 });
    // Fora do painel é preso à região, nunca além dela.
    expect(lupaParaTela({ x: 900, y: 900 }, { width: 600, height: 600 }, regiao)).toEqual({ x: 1109, y: 689 });
  });
});

describe('reacaoAMudancaDeTela', () => {
  const full = { monitor: { x: 0, y: 0, width: 1920, height: 1080 }, escala: 1 };

  it('só a barra de tarefas mudou: ignora', () => {
    expect(reacaoAMudancaDeTela(full, full, ['workArea'])).toBe('ignorar');
  });

  it('100 % → 125 %: mesmos pixels físicos, reajusta em vez de encerrar', () => {
    const dpi125 = { monitor: { x: 0, y: 0, width: 1536, height: 864 }, escala: 1.25 };
    expect(reacaoAMudancaDeTela(full, dpi125, ['bounds', 'scaleFactor'])).toBe('reajustar');
    // E o caminho de volta.
    expect(reacaoAMudancaDeTela(dpi125, full, ['bounds', 'scaleFactor'])).toBe('reajustar');
  });

  it('150 % com arredondamento de DIP que não fecha exato ainda é reajuste', () => {
    // 1920/1.5 = 1280, 1080/1.5 = 720 — exato. 2560×1440 @1.5 = 1706.67 → 1707.
    const qhd = { monitor: { x: 0, y: 0, width: 2560, height: 1440 }, escala: 1 };
    const qhd150 = { monitor: { x: 0, y: 0, width: 1707, height: 960 }, escala: 1.5 };
    expect(reacaoAMudancaDeTela(qhd, qhd150, ['bounds', 'scaleFactor'])).toBe('reajustar');
  });

  it('resolução física diferente: encerra', () => {
    const hd = { monitor: { x: 0, y: 0, width: 1280, height: 720 }, escala: 1 };
    expect(reacaoAMudancaDeTela(full, hd, ['bounds'])).toBe('encerrar');
  });

  it('rotação: encerra mesmo com a mesma contagem de pixels', () => {
    const girado = { monitor: { x: 0, y: 0, width: 1080, height: 1920 }, escala: 1 };
    expect(reacaoAMudancaDeTela(full, girado, ['bounds', 'rotation'])).toBe('encerrar');
  });

  it('sem a lista do Electron, decide pela comparação física', () => {
    const dpi125 = { monitor: { x: 0, y: 0, width: 1536, height: 864 }, escala: 1.25 };
    expect(reacaoAMudancaDeTela(full, dpi125, null)).toBe('reajustar');
    expect(reacaoAMudancaDeTela(full, full, undefined)).toBe('ignorar');
    const hd = { monitor: { x: 0, y: 0, width: 1280, height: 720 }, escala: 1 };
    expect(reacaoAMudancaDeTela(full, hd, undefined)).toBe('encerrar');
  });
});

describe('clamp na borda — suave (app) × duro (Modo Computador)', () => {
  const W = 1920;

  it('suave: Hermite de 2 % com derivada zero na borda — o cursor não CHEGA', () => {
    // t = (1 − v)/m; f = 1 − m·t²(2 − t). Em 0,995 (t = 0,25) sai 0,99813:
    // 3,6 px aquém da borda em 1920, e só encosta com a predição crua em 1.
    expect(clampSuave(0.995)).toBeCloseTo(1 - 0.02 * 0.0625 * 1.75, 12);
    expect(1 - clampSuave(0.995)).toBeGreaterThan(1 / W);
    expect(clampSuave(0.5)).toBe(0.5);
    expect(clampSuave(1.04)).toBe(1);
    expect(clampSuave(-0.3)).toBe(0);
    expect(clampSuave(NaN)).toBe(0.5);
  });

  it('duro: predição crua 1,04 → 1,00; 0,995 fica 0,995 (o cursor CHEGA na borda)', () => {
    expect(clampNaBorda(1.04, 'duro', { margemPx: 0, tamanhoPx: W })).toBe(1);
    expect(clampNaBorda(0.995, 'duro', { margemPx: 0, tamanhoPx: W })).toBe(0.995);
    expect(clampNaBorda(-0.02, 'duro', { margemPx: 0, tamanhoPx: W })).toBe(0);
    // O suave, no mesmo ponto, fica aquém: é o X da janela que "não chega".
    expect(clampNaBorda(0.995, 'suave', { tamanhoPx: W })).toBeGreaterThan(0.995);
    expect(clampNaBorda(0.995, 'suave', { tamanhoPx: W })).toBeLessThan(1 - 1 / W);
  });

  it('duro: a margem é em px, limitada a 0–4', () => {
    expect(clampNaBorda(1.04, 'duro', { margemPx: 2, tamanhoPx: W })).toBeCloseTo(1 - 2 / W, 12);
    expect(clampNaBorda(-1, 'duro', { margemPx: 4, tamanhoPx: W })).toBeCloseTo(4 / W, 12);
    // 40 px pedidos viram 4: mais que isso é o clamp suave de volta.
    expect(clampNaBorda(1, 'duro', { margemPx: 40, tamanhoPx: W })).toBeCloseTo(1 - MARGEM_DURA_MAX_PX / W, 12);
    expect(clampDuro(1, -5, W)).toBe(1);
    expect(clampDuro(0.7, 2, 0)).toBe(0.7);
  });
});

describe('sobreposicaoParaJanela', () => {
  const quadro = {
    janela: { x: 120, y: 80, width: 1600, height: 900 },
    monitor: { x: 0, y: 0, width: 1920, height: 1080 },
    escala: 1.25,
  };
  it('desfaz janelaParaSobreposicao em qualquer ponto que não foi preso ao monitor', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 800, y: 450 }, { x: 1599, y: 899 }]) {
      const ida = janelaParaSobreposicao(p, quadro);
      const volta = sobreposicaoParaJanela(ida, quadro);
      expect(volta).toEqual(p);
    }
  });
  it('com o monitor deslocado na tela virtual (segundo monitor) a inversa continua exata', () => {
    const q2 = { ...quadro, monitor: { x: 1920, y: -200, width: 1920, height: 1080 }, janela: { x: 2000, y: -100, width: 1600, height: 900 } };
    const p = { x: 300, y: 200 };
    expect(sobreposicaoParaJanela(janelaParaSobreposicao(p, q2), q2)).toEqual(p);
  });
});
