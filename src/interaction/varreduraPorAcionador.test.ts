import { describe, it, expect } from 'vitest';
import {
  criarEstadoDaVarredura, passoDaVarredura, ehDoAcionador, limitarPasso, nomeDoAcionador, teclaPodeSerAcionador,
  limitarPressaoLonga, textoDosSegundos,
  PRESSAO_LONGA_EMERGENCIA_MS, PRESSAO_LONGA_MIN_MS, PRESSAO_LONGA_MAX_MS,
  PAUSA_APOS_SELECAO_MS, APERTO_MINIMO_MS, PASSO_MIN_MS, PASSO_MAX_MS,
  type EstadoDaVarredura, type EventoDaVarredura,
} from './varreduraPorAcionador';

function rodar(eventos: EventoDaVarredura[], e0: EstadoDaVarredura = criarEstadoDaVarredura()) {
  let e = e0;
  const acoes: unknown[] = [];
  for (const ev of eventos) {
    const r = passoDaVarredura(e, ev);
    e = r.estado;
    if (r.acao) acoes.push(r.acao);
  }
  return { e, acoes };
}

const tique = (nowMs: number, nItens = 4, passoMs = 1000) => ({ tipo: 'tique' as const, nowMs, nItens, passoMs });

describe('varredura com acionador', () => {
  it('o destaque anda um item por passo e dá a volta', () => {
    const { e } = rodar([tique(0), tique(999), tique(1000), tique(2000), tique(3000), tique(4000)]);
    // 0 → 1 (1000) → 2 (2000) → 3 (3000) → 0 (4000)
    expect(e.indice).toBe(0);
  });

  it('apertar e soltar seleciona o item destacado e recomeça do primeiro depois de uma pausa', () => {
    const { e, acoes } = rodar([tique(0), tique(1000), { tipo: 'apertou', nowMs: 1100 }, { tipo: 'soltou', nowMs: 1250, nItens: 4 }]);
    expect(acoes).toEqual([{ tipo: 'selecionar', indice: 1 }]);
    expect(e.indice).toBeNull();
    // Durante a pausa nada anda; depois, volta ao primeiro.
    const r = rodar([tique(1250 + PAUSA_APOS_SELECAO_MS - 10), tique(1250 + PAUSA_APOS_SELECAO_MS + 10)], e);
    expect(r.e.indice).toBe(0);
  });

  it('segurar o acionador para o destaque; segurar 2 s abre a emergência e o soltar não seleciona', () => {
    const { acoes, e } = rodar([
      tique(0), tique(1000),
      { tipo: 'apertou', nowMs: 1100 },
      tique(2100), // parado no item 1, mesmo com o passo vencido
      tique(1100 + PRESSAO_LONGA_EMERGENCIA_MS),
      tique(1100 + PRESSAO_LONGA_EMERGENCIA_MS + 500),
      { tipo: 'soltou', nowMs: 1100 + PRESSAO_LONGA_EMERGENCIA_MS + 600, nItens: 4 },
    ]);
    expect(acoes).toEqual([{ tipo: 'emergencia' }]);
    expect(e.apertadoDesde).toBeNull();
  });

  it('ressalto do contato (aperto curtíssimo) não seleciona', () => {
    const { acoes } = rodar([tique(0), { tipo: 'apertou', nowMs: 10 }, { tipo: 'soltou', nowMs: 10 + APERTO_MINIMO_MS - 5, nItens: 4 }]);
    expect(acoes).toEqual([]);
  });

  it('a tela encolheu: o índice volta para dentro da lista; sem itens, nada é destacado', () => {
    const { e } = rodar([tique(0, 6), tique(1000, 6), tique(2000, 6), tique(3000, 6), tique(3500, 2)]);
    expect(e.indice).toBe(0);
    expect(rodar([tique(0, 0)]).e.indice).toBeNull();
  });

  it('repetição automática da tecla (keydown repetido) não reinicia o aperto', () => {
    const { e } = rodar([{ tipo: 'apertou', nowMs: 100 }, { tipo: 'apertou', nowMs: 600 }]);
    expect(e.apertadoDesde).toBe(100);
  });
});

// Revisão de UX de 19/10/2026, itens 3, 7 e 9.
describe('pressão longa: sem o botão de Emergência, limiar ajustável, aperto só para emergência', () => {
  it('sem o botão de Emergência e SEM socorro em curso (a tela de emergência antes do pedido), segurar ESCOLHE o destacado — e o soltar não escolhe de novo', () => {
    // Antes: segurar virava "emergência" de novo, sem botão para abrir. Com o
    // socorro em curso a regra é outra (achado 1 de 20/10/2026, abaixo).
    const t = (nowMs: number) => ({ ...tique(nowMs, 1), emergenciaNaTela: false });
    const { acoes, e } = rodar([
      t(0),
      { tipo: 'apertou', nowMs: 100 },
      t(100 + PRESSAO_LONGA_EMERGENCIA_MS - 1),
      t(100 + PRESSAO_LONGA_EMERGENCIA_MS),
      t(100 + PRESSAO_LONGA_EMERGENCIA_MS + 400),
      { tipo: 'soltou', nowMs: 100 + PRESSAO_LONGA_EMERGENCIA_MS + 500, nItens: 1 },
    ]);
    expect(acoes).toEqual([{ tipo: 'selecionar', indice: 0 }]);
    expect(e.apertadoDesde).toBeNull();
    // A volta recomeça do primeiro, depois da pausa de sempre, contada do soltar.
    expect(e.indice).toBeNull();
    expect(e.pausadoAte).toBe(100 + PRESSAO_LONGA_EMERGENCIA_MS + 500 + PAUSA_APOS_SELECAO_MS);
  });

  it('com o botão de Emergência na tela, segurar continua abrindo a emergência', () => {
    const t = (nowMs: number) => ({ ...tique(nowMs), emergenciaNaTela: true });
    const { acoes } = rodar([t(0), { tipo: 'apertou', nowMs: 100 }, t(100 + PRESSAO_LONGA_EMERGENCIA_MS)]);
    expect(acoes).toEqual([{ tipo: 'emergencia' }]);
  });

  it('o limiar vem do ajuste: com 3 s, segurar 2,5 s não chama a emergência; 3 s chama', () => {
    const t = (nowMs: number) => ({ ...tique(nowMs), pressaoLongaMs: 3000 });
    const antes = rodar([t(0), { tipo: 'apertou', nowMs: 100 }, t(2100), t(2600), t(3099)]);
    expect(antes.acoes).toEqual([]);
    expect(rodar([t(3100)], antes.e).acoes).toEqual([{ tipo: 'emergencia' }]);
  });

  it('limiar fora da faixa segura volta para dentro; sem valor, vale o padrão (2 s)', () => {
    expect(PRESSAO_LONGA_EMERGENCIA_MS).toBe(2000);
    expect(limitarPressaoLonga(undefined)).toBe(PRESSAO_LONGA_EMERGENCIA_MS);
    expect(limitarPressaoLonga(null)).toBe(PRESSAO_LONGA_EMERGENCIA_MS);
    expect(limitarPressaoLonga(Number.NaN)).toBe(PRESSAO_LONGA_EMERGENCIA_MS);
    expect(limitarPressaoLonga(100)).toBe(PRESSAO_LONGA_MIN_MS);
    expect(limitarPressaoLonga(60_000)).toBe(PRESSAO_LONGA_MAX_MS);
    expect(limitarPressaoLonga(2499.6)).toBe(2500);
    // Um aperto normal (até ~0,6 s) nunca vira emergência, e o máximo fica
    // abaixo dos 5 s da contagem da emergência.
    expect(PRESSAO_LONGA_MIN_MS).toBeGreaterThanOrEqual(1000);
    expect(PRESSAO_LONGA_MAX_MS).toBeLessThan(5000);
    // E um tique sem limiar válido usa o padrão.
    const t = (nowMs: number) => ({ ...tique(nowMs), pressaoLongaMs: Number.NaN });
    const r = rodar([t(0), { tipo: 'apertou', nowMs: 100 }, t(100 + PRESSAO_LONGA_EMERGENCIA_MS)]);
    expect(r.acoes).toEqual([{ tipo: 'emergencia' }]);
  });

  it('aperto só para a emergência (pausa, medição, campo de texto): soltar não escolhe nada; segurar ainda chama a emergência', () => {
    const curto = rodar([tique(0), { tipo: 'apertou', nowMs: 100, soEmergencia: true }, { tipo: 'soltou', nowMs: 250, nItens: 4 }]);
    expect(curto.acoes).toEqual([]);
    const longo = rodar([tique(0), { tipo: 'apertou', nowMs: 100, soEmergencia: true }, tique(100 + PRESSAO_LONGA_EMERGENCIA_MS)]);
    expect(longo.acoes).toEqual([{ tipo: 'emergencia' }]);
    // Sem o botão de Emergência, um aperto desses não escolhe nada, nem segurando.
    const semBotao = rodar([
      tique(0),
      { tipo: 'apertou', nowMs: 100, soEmergencia: true },
      { ...tique(100 + PRESSAO_LONGA_EMERGENCIA_MS), emergenciaNaTela: false },
      { tipo: 'soltou', nowMs: 100 + PRESSAO_LONGA_EMERGENCIA_MS + 100, nItens: 4 },
    ]);
    expect(semBotao.acoes).toEqual([]);
    // O aperto seguinte, comum, volta a escolher (o destaque continuou no 0).
    const depois = rodar([{ tipo: 'apertou', nowMs: 2300 }, { tipo: 'soltou', nowMs: 2450, nItens: 4 }], semBotao.e);
    expect(depois.acoes).toEqual([{ tipo: 'selecionar', indice: 0 }]);
  });

  it('segundos escritos como na tela', () => {
    expect(textoDosSegundos(2000)).toBe('2 s');
    expect(textoDosSegundos(2500)).toBe('2,5 s');
    expect(textoDosSegundos(1000)).toBe('1 s');
  });
});

// Revisão de UX de 20/10/2026, achado 1: segurar é o gesto do socorro, e com o
// socorro em curso ele não pode cancelar a contagem nem parar o alarme.
describe('pressão longa com o socorro em curso', () => {
  const naContagem = (nowMs: number, nItens = 1) => ({ ...tique(nowMs, nItens), emergenciaNaTela: false, socorroEmCurso: true });

  it('na contagem aberta, segurar além do limiar não escolhe nada — nem na hora, nem no soltar', () => {
    const { acoes, e } = rodar([
      naContagem(0),
      { tipo: 'apertou', nowMs: 100 },
      naContagem(100 + PRESSAO_LONGA_EMERGENCIA_MS),
      naContagem(100 + PRESSAO_LONGA_EMERGENCIA_MS + 3000), // quem segura mais que a contagem inteira
      { tipo: 'soltou', nowMs: 100 + PRESSAO_LONGA_EMERGENCIA_MS + 3100, nItens: 1 },
    ]);
    expect(acoes).toEqual([]);
    expect(e.apertadoDesde).toBeNull();
    expect(e.pressaoLongaAgiu).toBe(false);
    expect(e.pressaoLongaSemEfeito).toBe(false);
  });

  it('o 2º "segurar" (o cenário da revisão) também não cancela; um aperto curto, sim', () => {
    const fim1 = 100 + PRESSAO_LONGA_EMERGENCIA_MS + 100;
    const fim2 = fim1 + 900 + PRESSAO_LONGA_EMERGENCIA_MS + 100;
    const dois = rodar([
      naContagem(0),
      { tipo: 'apertou', nowMs: 100 }, naContagem(100 + PRESSAO_LONGA_EMERGENCIA_MS), { tipo: 'soltou', nowMs: fim1, nItens: 1 },
      naContagem(fim1 + 900),
      { tipo: 'apertou', nowMs: fim1 + 900 }, naContagem(fim2 - 50), { tipo: 'soltou', nowMs: fim2, nItens: 1 },
    ]);
    expect(dois.acoes).toEqual([]);
    const curto = rodar([naContagem(fim2 + 100), { tipo: 'apertou', nowMs: fim2 + 200 }, { tipo: 'soltou', nowMs: fim2 + 500, nItens: 1 }], dois.e);
    expect(curto.acoes).toEqual([{ tipo: 'selecionar', indice: 0 }]);
  });

  it('depois de um "segurar" sem efeito, o destaque segue de onde estava (não volta ao primeiro), com um passo inteiro', () => {
    // Na tela do pedido: três itens, destaque no do meio.
    const t = (nowMs: number) => naContagem(nowMs, 3);
    const antes = rodar([t(0), t(1000), { tipo: 'apertou', nowMs: 1100 }, t(1100 + PRESSAO_LONGA_EMERGENCIA_MS)]);
    expect(antes.acoes).toEqual([]);
    expect(antes.e.indice).toBe(1);
    const solto = 1100 + PRESSAO_LONGA_EMERGENCIA_MS + 200;
    const depois = rodar([{ tipo: 'soltou', nowMs: solto, nItens: 3 }], antes.e);
    expect(depois.acoes).toEqual([]);
    expect(depois.e.indice).toBe(1);
    expect(depois.e.pausadoAte).toBe(antes.e.pausadoAte);
    // O item continua destacado por um passo inteiro, contado do soltar.
    expect(rodar([t(solto + 999)], depois.e).e.indice).toBe(1);
    expect(rodar([t(solto + 1000)], depois.e).e.indice).toBe(2);
  });

  it('item que só aceita aperto curto ("Sim, parar"): segurar nunca o escolhe, mesmo sem o sinal do socorro', () => {
    const t = (nowMs: number) => ({ ...tique(nowMs, 2), emergenciaNaTela: false, destacadoSoComApertoCurto: true });
    const longo = rodar([t(0), { tipo: 'apertou', nowMs: 100 }, t(100 + PRESSAO_LONGA_EMERGENCIA_MS), { tipo: 'soltou', nowMs: 2300, nItens: 2 }]);
    expect(longo.acoes).toEqual([]);
    const curto = rodar([t(2400), { tipo: 'apertou', nowMs: 2500 }, { tipo: 'soltou', nowMs: 2700, nItens: 2 }], longo.e);
    expect(curto.acoes).toEqual([{ tipo: 'selecionar', indice: 0 }]);
  });

  it('com o botão de Emergência na tela (o pedido em andamento, o paciente em outra tela), segurar leva ao pedido como sempre', () => {
    const t = (nowMs: number) => ({ ...tique(nowMs), emergenciaNaTela: true, socorroEmCurso: true });
    expect(rodar([t(0), { tipo: 'apertou', nowMs: 100 }, t(100 + PRESSAO_LONGA_EMERGENCIA_MS)]).acoes).toEqual([{ tipo: 'emergencia' }]);
  });
});

describe('qual entrada é o acionador', () => {
  it('sem configuração: Espaço e Enter (padrão dos acionadores USB)', () => {
    expect(ehDoAcionador(null, { tipo: 'tecla', codigo: 'Space' })).toBe(true);
    expect(ehDoAcionador(null, { tipo: 'tecla', codigo: 'Enter' })).toBe(true);
    expect(ehDoAcionador(null, { tipo: 'tecla', codigo: 'KeyA' })).toBe(false);
    expect(ehDoAcionador(null, { tipo: 'mouse', botao: 0 })).toBe(false);
  });

  it('configurado: só ele', () => {
    expect(ehDoAcionador({ tipo: 'tecla', codigo: 'F9' }, { tipo: 'tecla', codigo: 'F9' })).toBe(true);
    expect(ehDoAcionador({ tipo: 'tecla', codigo: 'F9' }, { tipo: 'tecla', codigo: 'Space' })).toBe(false);
    expect(ehDoAcionador({ tipo: 'mouse', botao: 2 }, { tipo: 'mouse', botao: 2 })).toBe(true);
  });

  it('Escape, Tab e F11 nunca viram acionador (são a saída do cuidador)', () => {
    for (const k of ['Escape', 'Tab', 'F11', 'ShiftLeft']) expect(teclaPodeSerAcionador(k)).toBe(false);
    expect(teclaPodeSerAcionador('F9')).toBe(true);
  });

  it('nomes legíveis e passo limitado', () => {
    expect(nomeDoAcionador({ tipo: 'tecla', codigo: 'KeyJ' })).toBe('J');
    expect(nomeDoAcionador({ tipo: 'mouse', botao: 0 })).toBe('Clique esquerdo');
    expect(limitarPasso(100)).toBe(PASSO_MIN_MS);
    expect(limitarPasso(99999)).toBe(PASSO_MAX_MS);
    expect(limitarPasso(Number.NaN)).toBe(1500);
  });
});
