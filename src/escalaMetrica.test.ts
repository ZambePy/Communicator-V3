import { describe, it, expect } from 'vitest';
import {
  cantalDoQuadroCm,
  diametroDaIrisPx,
  DIAMETRO_DA_IRIS_CM,
  IRIS_DIREITA_ANEL,
  IRIS_ESQUERDA_ANEL,
  MedidorDeEscalaFacial,
  AMOSTRAS_MINIMAS,
  CANTAL_MAX_CM,
  type AmostraDeEscala,
  type Ponto2D,
} from './escalaMetrica';
import { CANTHAL_DISTANCE_CM } from './anthropometry';

/**
 * A régua é a íris (11,7 mm, ±4 % entre adultos); o que se mede com ela é a
 * distância cantal DESTA pessoa, que varia ±10 % e hoje é chutada em 9,0 cm.
 *
 * Os quadros sintéticos abaixo montam um rosto em coordenadas normalizadas com
 * uma escala conhecida, e o teste confere que a medida devolvida é a que a
 * geometria manda — e que amostras ruins (perfil, olho fechado, anel
 * assimétrico) são recusadas em vez de virarem uma régua torta.
 */

const LARGURA = 1280;
const ALTURA = 720;

/** Monta landmarks com íris de `irisPx` de diâmetro e cantal de `cantalPx`. */
function quadro(irisPx: number, cantalPx: number, opts: { verticalPx?: number; irisDireitaPx?: number } = {}) {
  const lm: Ponto2D[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const rx = (px: number) => px / LARGURA / 2;
  const ry = (px: number) => px / ALTURA / 2;
  const vert = opts.verticalPx ?? irisPx;
  const irisDir = opts.irisDireitaPx ?? irisPx;

  // Olho esquerdo, centrado em x=0,40; direito em x=0,60.
  const centros = [
    { c: 0.4, anel: IRIS_ESQUERDA_ANEL, d: irisPx, v: vert },
    { c: 0.6, anel: IRIS_DIREITA_ANEL, d: irisDir, v: vert },
  ];
  for (const { c, anel, d, v } of centros) {
    const [dir, topo, esq, base] = anel;
    lm[dir] = { x: c + rx(d), y: 0.5 };
    lm[esq] = { x: c - rx(d), y: 0.5 };
    lm[topo] = { x: c, y: 0.5 - ry(v) };
    lm[base] = { x: c, y: 0.5 + ry(v) };
  }
  const amostra: AmostraDeEscala = {
    landmarks: lm, cantalPx, videoWidth: LARGURA, videoHeight: ALTURA, yawDeg: 0, pitchDeg: 0,
  };
  return amostra;
}

describe('escala métrica pela íris', () => {
  it('mede o diâmetro horizontal em pixels', () => {
    const a = quadro(40, 300);
    expect(diametroDaIrisPx(a.landmarks, IRIS_ESQUERDA_ANEL, LARGURA, ALTURA)).toBeCloseTo(40, 6);
  });

  it('devolve a distância cantal desta pessoa a partir da íris', () => {
    // íris 40 px ↔ 1,17 cm  →  0,02925 cm/px; cantal 300 px → 8,775 cm.
    const cm = cantalDoQuadroCm(quadro(40, 300));
    expect(cm).not.toBeNull();
    expect(cm as number).toBeCloseTo((300 * DIAMETRO_DA_IRIS_CM) / 40, 6);
  });

  it('a distância da câmera se cancela: mesmo rosto mais longe dá o mesmo cantal', () => {
    // Tudo encolhe pela metade (pessoa duas vezes mais longe).
    const perto = cantalDoQuadroCm(quadro(40, 300)) as number;
    const longe = cantalDoQuadroCm(quadro(20, 150)) as number;
    expect(longe).toBeCloseTo(perto, 6);
  });

  it('recusa quadro de perfil: a íris projetada encolhe e a régua mente', () => {
    const a = { ...quadro(40, 300), yawDeg: 25 };
    expect(cantalDoQuadroCm(a)).toBeNull();
  });

  it('recusa olho quase fechado (anel achatado)', () => {
    expect(cantalDoQuadroCm(quadro(40, 300, { verticalPx: 18 }))).toBeNull();
  });

  it('recusa pose desconhecida: "não sei" não é "de frente"', () => {
    const { yawDeg: _y, pitchDeg: _p, ...semPose } = quadro(40, 300);
    expect(cantalDoQuadroCm(semPose as AmostraDeEscala)).toBeNull();
  });

  it('recusa anel colapsado (topo e base coincidentes)', () => {
    expect(cantalDoQuadroCm(quadro(40, 300, { verticalPx: 0 }))).toBeNull();
  });

  it('recusa assimetria grande entre os dois olhos', () => {
    expect(cantalDoQuadroCm(quadro(40, 300, { irisDireitaPx: 60 }))).toBeNull();
  });

  it('recusa resultado fora da faixa plausível', () => {
    // Cantal enorme para a íris medida → 15 cm, impossível.
    const cm = cantalDoQuadroCm(quadro(40, 520));
    expect((520 * DIAMETRO_DA_IRIS_CM) / 40).toBeGreaterThan(CANTAL_MAX_CM);
    expect(cm).toBeNull();
  });

  it('o medidor só responde depois do mínimo de amostras e usa mediana', () => {
    const m = new MedidorDeEscalaFacial();
    expect(m.resultadoCm()).toBeNull();
    expect(m.cantalOuPadraoCm()).toBe(CANTHAL_DISTANCE_CM);

    for (let i = 0; i < AMOSTRAS_MINIMAS - 1; i++) expect(m.adicionar(quadro(40, 300))).toBe(true);
    expect(m.resultadoCm()).toBeNull();

    // Uma leitura destoante que passou pelas guardas não deve mover a mediana.
    m.adicionar(quadro(40, 340));
    m.adicionar(quadro(40, 300));
    const esperado = (300 * DIAMETRO_DA_IRIS_CM) / 40;
    expect(m.resultadoCm() as number).toBeCloseTo(esperado, 6);
    expect(m.total).toBe(AMOSTRAS_MINIMAS + 1);
  });

  it('amostra recusada não conta', () => {
    const m = new MedidorDeEscalaFacial();
    expect(m.adicionar({ ...quadro(40, 300), yawDeg: 40 })).toBe(false);
    expect(m.total).toBe(0);
  });
});
