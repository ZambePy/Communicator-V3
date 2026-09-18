import { describe, it, expect } from 'vitest';
import {
  ESTABILIDADE_EXIGIDA_MS,
  ESPERA_MAXIMA_MS,
  inicial,
  acumular,
  msEstavel,
  estavel,
  podeSeguir,
  liberadoPorEspera,
} from './estabilidade';

// -----------------------------------------------------------------------------
// O portão do passo de posicionamento.
//
// Sem uma janela de tempo, "Continuar" fica habilitado no primeiro frame verde
// — e o cuidador clica no instante de sorte, com o paciente numa pose que ele
// não sustenta. A calibração inteira parte de uma posição que durou 30 ms.
//
// A regra que importa é o RESET: cair para amarelo zera o contador. Um
// acumulador que apenas somasse tempo verde deixaria passar três segundos
// picotados em trinta lampejos de cem milissegundos, que é exatamente a
// situação que a janela existe para reprovar.
// -----------------------------------------------------------------------------

describe('sem nada verde', () => {
  it('começa em zero', () => {
    expect(msEstavel(inicial(), 1000)).toBe(0);
  });

  it('não está estável', () => {
    expect(estavel(inicial(), 1000)).toBe(false);
  });
});

describe('acumulando verde', () => {
  it('conta desde o primeiro frame verde', () => {
    const s = acumular(inicial(), true, 1000);
    expect(msEstavel(s, 2000)).toBe(1000);
  });

  it('frames verdes seguidos não reiniciam a contagem', () => {
    let s = acumular(inicial(), true, 1000);
    s = acumular(s, true, 1500);
    s = acumular(s, true, 2000);
    expect(msEstavel(s, 2500)).toBe(1500);
  });

  it('ainda não libera antes da janela', () => {
    const s = acumular(inicial(), true, 1000);
    expect(estavel(s, 1000 + ESTABILIDADE_EXIGIDA_MS - 1)).toBe(false);
  });

  it('libera exatamente na janela', () => {
    const s = acumular(inicial(), true, 1000);
    expect(estavel(s, 1000 + ESTABILIDADE_EXIGIDA_MS)).toBe(true);
  });

  it('continua liberado depois dela', () => {
    const s = acumular(inicial(), true, 1000);
    expect(estavel(s, 1000 + ESTABILIDADE_EXIGIDA_MS + 5000)).toBe(true);
  });
});

describe('o reset — a regra que dá sentido à janela', () => {
  it('um frame amarelo zera o contador', () => {
    let s = acumular(inicial(), true, 1000);
    s = acumular(s, false, 2500);
    expect(msEstavel(s, 2500)).toBe(0);
  });

  it('depois do reset a contagem recomeça do zero, não de onde parou', () => {
    let s = acumular(inicial(), true, 1000);
    s = acumular(s, false, 2500); // 1,5 s perdidos
    s = acumular(s, true, 3000);
    expect(msEstavel(s, 4000)).toBe(1000);
  });

  it('verde picotado nunca libera', () => {
    // Trinta lampejos de 100 ms somam três segundos de verde e não valem nada:
    // ninguém ficou parado.
    let s = inicial();
    let t = 0;
    for (let i = 0; i < 30; i++) {
      s = acumular(s, true, t);
      t += 100;
      s = acumular(s, false, t);
      t += 100;
    }
    expect(estavel(s, t)).toBe(false);
  });

  it('perder o verde depois de liberado volta a travar', () => {
    // O cuidador não pode ficar com o botão habilitado enquanto o paciente
    // escorrega da posição.
    let s = acumular(inicial(), true, 1000);
    expect(estavel(s, 1000 + ESTABILIDADE_EXIGIDA_MS)).toBe(true);

    s = acumular(s, false, 1000 + ESTABILIDADE_EXIGIDA_MS + 100);
    expect(estavel(s, 1000 + ESTABILIDADE_EXIGIDA_MS + 100)).toBe(false);
  });
});

describe('robustez do relógio', () => {
  it('relógio que anda para trás não inventa tempo estável', () => {
    // `performance.now()` não retrocede, mas o estado pode atravessar uma
    // suspensão da aba. Tempo negativo virando "estável" liberaria o botão sem
    // ninguém ter ficado parado.
    const s = acumular(inicial(), true, 5000);
    expect(msEstavel(s, 1000)).toBe(0);
    expect(estavel(s, 1000)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Válvula de escape da porta de posicionamento.
//
// A janela de 3 s é boa regra e armadilha ruim: quem tem movimento involuntário
// de cabeça, câmera ruim ou sala escura pode nunca encadear três segundos
// verdes, e "Continuar" ficava desabilitado para sempre — o mesmo desfecho do
// bug do tutorial, com a pessoa concluindo que o app travou.
// ─────────────────────────────────────────────────────────────────────────────
describe('a porta de posicionamento não prende ninguém', () => {
  const T0 = 1000;

  it('abre por estabilidade, como antes', () => {
    const e = acumular(inicial(), true, T0);
    expect(podeSeguir(e, T0 + ESTABILIDADE_EXIGIDA_MS, T0)).toBe(true);
    expect(liberadoPorEspera(e, T0 + ESTABILIDADE_EXIGIDA_MS, T0)).toBe(false);
  });

  it('continua fechada enquanto há tempo e não houve estabilidade', () => {
    const e = inicial();
    expect(podeSeguir(e, T0 + 10_000, T0)).toBe(false);
    expect(podeSeguir(e, T0 + ESPERA_MAXIMA_MS - 1, T0)).toBe(false);
  });

  it('abre por ESPERA quando a estabilidade nunca vem', () => {
    const e = inicial();
    expect(podeSeguir(e, T0 + ESPERA_MAXIMA_MS, T0)).toBe(true);
    // E a tela precisa saber que foi por espera, para avisar.
    expect(liberadoPorEspera(e, T0 + ESPERA_MAXIMA_MS, T0)).toBe(true);
  });

  it('verde picotado não engana a espera nem a estabilidade', () => {
    // Trinta lampejos de 100 ms não são três segundos parados.
    let e = inicial();
    for (let k = 0; k < 30; k++) {
      e = acumular(e, true, T0 + k * 200);
      e = acumular(e, false, T0 + k * 200 + 100);
    }
    expect(estavel(e, T0 + 6000)).toBe(false);
    expect(podeSeguir(e, T0 + 6000, T0)).toBe(false);
  });

  it('a espera é generosa: ninguém chega nela por pressa', () => {
    expect(ESPERA_MAXIMA_MS).toBeGreaterThan(ESTABILIDADE_EXIGIDA_MS * 10);
  });
});
