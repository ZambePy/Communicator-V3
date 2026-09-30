import { describe, it, expect } from 'vitest';
import {
  aoClicar, aoNavegar, criarRearme, filtrarAlvo, JANELA_DE_HERANCA_MS, SAIDA_PARA_REARMAR_MS,
  AMOSTRAS_PARA_SALTO, PERMANENCIA_PARA_REARMAR_MS, type EstadoDoRearme, type OpcoesDoAlvo, type PontoDoOlhar,
} from './rearmePorSaida';
import { DISTANCIA_DE_SALTO_PX } from './seguidorDeCursor';

// FE-7: o mesmo alvo disparava de novo com o olhar parado nele, e a tela nova
// selecionava sozinha o botão sob o olhar "herdado" da anterior.

const A = { nome: 'A' };
const B = { nome: 'B' };
/** Onde o olhar está quando a tela muda. */
const AQUI: PontoDoOlhar = { x: 600, y: 350 };
/** Um salto: bem mais longe que `DISTANCIA_DE_SALTO_PX`. */
const LONGE: PontoDoOlhar = { x: AQUI.x + 3 * DISTANCIA_DE_SALTO_PX, y: AQUI.y };

function passar(
  estado: EstadoDoRearme, alvo: unknown | null, de: number, ate: number, passo = 33, ponto: PontoDoOlhar = AQUI,
  opcoes?: OpcoesDoAlvo,
) {
  let e = estado;
  let ultimo = false;
  /** Primeiro instante em que o alvo deixou de estar bloqueado (ou `null`). */
  let liberouEm: number | null = null;
  for (let t = de; t <= ate; t += passo) {
    const r = filtrarAlvo(e, alvo, t, ponto, opcoes);
    e = r.estado;
    ultimo = r.bloqueado;
    if (!r.bloqueado && liberouEm === null) liberouEm = t;
  }
  return { estado: e, bloqueado: ultimo, liberouEm };
}

describe('rearme por saída', () => {
  it('sem clique nem navegação, nada é bloqueado', () => {
    expect(filtrarAlvo(criarRearme(), A, 0, AQUI).bloqueado).toBe(false);
  });

  it('o alvo clicado fica bloqueado enquanto o olhar ficar nele — por quanto tempo for', () => {
    const r = passar(aoClicar(A, false), A, 0, 10_000);
    expect(r.bloqueado).toBe(true);
  });

  it('volta a valer depois que o olhar sai por tempo suficiente', () => {
    let e = aoClicar(A, false);
    e = passar(e, B, 0, SAIDA_PARA_REARMAR_MS + 50).estado;
    expect(filtrarAlvo(e, A, 1000, AQUI).bloqueado).toBe(false);
  });

  it('uma saída curta demais (tremor do olhar na borda) não rearma', () => {
    let e = aoClicar(A, false);
    e = passar(e, null, 0, SAIDA_PARA_REARMAR_MS - 100).estado;
    expect(filtrarAlvo(e, A, SAIDA_PARA_REARMAR_MS - 50, AQUI).bloqueado).toBe(true);
  });

  it('outro alvo não é afetado pelo bloqueio', () => {
    const e = aoClicar(A, false);
    expect(filtrarAlvo(e, B, 10, AQUI).bloqueado).toBe(false);
  });

  it('tecla repetível (Apagar) não bloqueia', () => {
    expect(filtrarAlvo(aoClicar(A, true), A, 10, AQUI).bloqueado).toBe(false);
  });

  it('tela nova: o botão sob o olhar herdado não vale até o olhar sair dele', () => {
    let e = aoNavegar(1000, AQUI);
    // a tela ainda entrando: primeiro nada sob o olhar, depois B desliza para baixo dele
    e = filtrarAlvo(e, null, 1010, AQUI).estado;
    const r = passar(e, B, 1100, 1000 + JANELA_DE_HERANCA_MS + 3000);
    expect(r.bloqueado).toBe(true);
    // sai de B e volta: agora vale
    const e2 = passar(r.estado, null, 5000, 5000 + SAIDA_PARA_REARMAR_MS + 50, 33, LONGE).estado;
    expect(filtrarAlvo(e2, B, 6000, AQUI).bloqueado).toBe(false);
  });

  it('a tela antiga ainda desenhada na janela: o botão da nova que aparece sob o olhar parado também é herdado', () => {
    // O percurso da Fase 8: menu → tutorial num computador lento. Nos 400 ms
    // o que havia sob o olhar era o cartão do menu (A), ainda não desmontado;
    // o botão do tutorial (B) apareceu depois no mesmo lugar e era clicado.
    let e = aoNavegar(0, AQUI);
    e = passar(e, A, 0, JANELA_DE_HERANCA_MS).estado;
    const r = passar(e, B, JANELA_DE_HERANCA_MS + 33, 4000);
    expect(r.bloqueado).toBe(true);
  });

  it('tela nova sem nada sob o olhar na janela: o primeiro alvo para onde o olhar SALTA vale normalmente', () => {
    let e = aoNavegar(0, AQUI);
    e = passar(e, null, 0, JANELA_DE_HERANCA_MS).estado;
    const r = passar(e, A, JANELA_DE_HERANCA_MS + 33, JANELA_DE_HERANCA_MS + 1000, 33, LONGE);
    expect(r.bloqueado).toBe(false);
  });

  it('tela que demora a desenhar: o alvo que aparece depois sob o olhar parado também é herdado', () => {
    // Computador lento: a janela de 400 ms passa antes de a tela nova ter um
    // botão; ele aparece 1 s depois exatamente onde o olhar já estava.
    let e = aoNavegar(0, AQUI);
    e = passar(e, null, 0, 1000).estado;
    const tremido = { x: AQUI.x + DISTANCIA_DE_SALTO_PX / 3, y: AQUI.y - DISTANCIA_DE_SALTO_PX / 3 };
    const r = passar(e, B, 1033, 5000, 33, tremido);
    expect(r.bloqueado).toBe(true);
    // Sair e voltar rearma, como em qualquer herança.
    const e2 = passar(r.estado, null, 5033, 5033 + SAIDA_PARA_REARMAR_MS + 50, 33, LONGE).estado;
    expect(filtrarAlvo(e2, B, 6000, AQUI).bloqueado).toBe(false);
  });

  it('depois de um salto a herança acaba, mesmo que o olhar volte ao ponto de antes', () => {
    let e = aoNavegar(0, AQUI);
    e = passar(e, null, 0, 1000).estado;
    e = passar(e, null, 1033, 1033 + SAIDA_PARA_REARMAR_MS + 50, 33, LONGE).estado;
    expect(filtrarAlvo(e, B, 1400, AQUI).bloqueado).toBe(false);
  });

  it('um pico do ruído do cursor não é salto: a herança continua', () => {
    // Uma amostra isolada a mais de um salto do ponto da troca, e o olhar de
    // volta no lugar: o botão que aparece sob ele continua herdado.
    let e = aoNavegar(0, AQUI);
    e = passar(e, null, 0, JANELA_DE_HERANCA_MS).estado;
    e = filtrarAlvo(e, null, JANELA_DE_HERANCA_MS + 33, LONGE).estado;
    const r = passar(e, B, JANELA_DE_HERANCA_MS + 66, 4000);
    expect(r.bloqueado).toBe(true);
  });

  it('a 3–4 quadros por segundo, duas amostras longe não bastam: são ruído até a terceira', () => {
    // 280 ms entre amostras: os 200 ms da saída cabem numa amostra só.
    const PASSO = 280;
    let e = aoNavegar(0, AQUI);
    e = passar(e, null, 0, JANELA_DE_HERANCA_MS, PASSO).estado;
    let t = JANELA_DE_HERANCA_MS + PASSO;
    for (let i = 0; i < AMOSTRAS_PARA_SALTO - 1; i++, t += PASSO) e = filtrarAlvo(e, null, t, LONGE).estado;
    // volta: o botão que aparece sob o olhar continua herdado
    expect(filtrarAlvo(e, B, t, AQUI).bloqueado).toBe(true);
  });

  it('a fixação herdada é a média das amostras perto dela, não só a primeira', () => {
    // A amostra que viu a troca pode ser um pico: o centro anda para a média
    // e o resto da fixação continua "perto".
    const pico = { x: AQUI.x + DISTANCIA_DE_SALTO_PX * 0.9, y: AQUI.y };
    let e = aoNavegar(0, pico);
    e = passar(e, null, 33, 2000, 33, AQUI).estado;
    const alem = { x: AQUI.x - DISTANCIA_DE_SALTO_PX * 0.5, y: AQUI.y };
    const r = passar(e, B, 2033, 4000, 33, alem);
    expect(r.bloqueado).toBe(true);
  });

  it('o alvo para onde o olhar salta não vira herança enquanto o salto se confirma', () => {
    let e = aoNavegar(0, AQUI);
    e = passar(e, A, 0, JANELA_DE_HERANCA_MS).estado;
    const r = passar(e, B, JANELA_DE_HERANCA_MS + 33, 2000, 33, LONGE);
    expect(r.bloqueado).toBe(false);
  });
});

// Gravação de 30/09: escrito o "H", o teclado volta aos grupos e o
// "G H I / J K L" cai sob o olhar; quem queria o "I" ficava olhando a célula e
// nada acontecia, porque o grupo herdado só valia depois de o olhar sair.
describe('rearme por permanência (grupos do teclado)', () => {
  const GRUPO: OpcoesDoAlvo = { permanencia: true };

  it('grupo herdado com o olhar parado nele volta a valer depois da permanência', () => {
    const e = aoNavegar(0, AQUI);
    const r = passar(e, B, 33, 3000, 33, AQUI, GRUPO);
    expect(r.bloqueado).toBe(false);
    // Nem antes da permanência, nem muito depois dela.
    expect(r.liberouEm).not.toBeNull();
    expect(r.liberouEm!).toBeGreaterThanOrEqual(33 + PERMANENCIA_PARA_REARMAR_MS);
    expect(r.liberouEm!).toBeLessThanOrEqual(33 + PERMANENCIA_PARA_REARMAR_MS + 34);
  });

  it('sem a marca (as letras), o olhar parado continua bloqueado — a regra da Fase 8', () => {
    const r = passar(aoNavegar(0, AQUI), B, 33, 12_000);
    expect(r.bloqueado).toBe(true);
    expect(r.liberouEm).toBeNull();
  });

  it('a permanência conta do alvo que está sob o olhar: trocar de alvo recomeça a conta', () => {
    // A tela ainda trocando: A (que vai sumir) e depois o grupo B no lugar.
    let e = aoNavegar(0, AQUI);
    e = passar(e, A, 0, PERMANENCIA_PARA_REARMAR_MS - 100, 33, AQUI, GRUPO).estado;
    const inicioB = PERMANENCIA_PARA_REARMAR_MS - 67;
    const r = passar(e, B, inicioB, inicioB + PERMANENCIA_PARA_REARMAR_MS - 50, 33, AQUI, GRUPO);
    expect(r.bloqueado).toBe(true);
  });

  it('sair do grupo zera a permanência', () => {
    let e = aoNavegar(0, AQUI);
    e = passar(e, B, 33, 33 + PERMANENCIA_PARA_REARMAR_MS - 100, 33, AQUI, GRUPO).estado;
    // Um instante no vão entre as células (nenhum alvo) e de volta.
    e = filtrarAlvo(e, null, 33 + PERMANENCIA_PARA_REARMAR_MS - 67, AQUI, GRUPO).estado;
    const volta = 33 + PERMANENCIA_PARA_REARMAR_MS - 34;
    expect(filtrarAlvo(e, B, volta + PERMANENCIA_PARA_REARMAR_MS - 50, AQUI, GRUPO).bloqueado).toBe(true);
  });

  it('célula grande: o olhar anda dentro dela para longe do ponto da troca e a conta continua', () => {
    // Um salto confirmado (> 96 px por 3 amostras e 200 ms) sem sair do grupo.
    let e = aoNavegar(0, AQUI);
    e = passar(e, B, 33, 200, 33, AQUI, GRUPO).estado;
    const r = passar(e, B, 233, 233 + PERMANENCIA_PARA_REARMAR_MS, 33, LONGE, GRUPO);
    expect(r.bloqueado).toBe(false);
    expect(r.liberouEm!).toBeLessThanOrEqual(33 + PERMANENCIA_PARA_REARMAR_MS + 34);
  });

  it('também rearma um grupo clicado que continue na tela', () => {
    const r = passar(aoClicar(A, false), A, 0, 2000, 33, AQUI, GRUPO);
    expect(r.bloqueado).toBe(false);
    expect(r.liberouEm!).toBeGreaterThanOrEqual(PERMANENCIA_PARA_REARMAR_MS);
  });

  it('a permanência libera só o grupo: o botão que a tela nova desenha depois sob o olhar parado continua herdado', () => {
    // Computador lento: a rota mudou (por um clique do cuidador), a célula de
    // grupo da tela ANTIGA ficou 600 ms sob o olhar parado e foi liberada pela
    // permanência; o botão da tela nova aparece depois no mesmo lugar.
    let e = aoNavegar(0, AQUI);
    const g = passar(e, A, 0, 600, 33, AQUI, GRUPO);
    expect(g.bloqueado).toBe(false);
    e = g.estado;
    const r = passar(e, B, 633, 4000, 33, AQUI);
    expect(r.bloqueado).toBe(true);
    expect(r.liberouEm).toBeNull();
  });

  it('o grupo liberado continua livre enquanto a herança dura', () => {
    const r = passar(aoNavegar(0, AQUI), A, 0, 3000, 33, AQUI, GRUPO);
    expect(r.bloqueado).toBe(false);
    expect(filtrarAlvo(r.estado, A, 3033, AQUI, GRUPO).bloqueado).toBe(false);
  });
});
