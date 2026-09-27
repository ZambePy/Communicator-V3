import { describe, it, expect } from 'vitest';
import {
  aoClicar, aoNavegar, criarRearme, filtrarAlvo, JANELA_DE_HERANCA_MS, SAIDA_PARA_REARMAR_MS,
  type EstadoDoRearme,
} from './rearmePorSaida';

// FE-7: o mesmo alvo disparava de novo com o olhar parado nele, e a tela nova
// selecionava sozinha o botão sob o olhar "herdado" da anterior.

const A = { nome: 'A' };
const B = { nome: 'B' };

function passar(estado: EstadoDoRearme, alvo: unknown | null, de: number, ate: number, passo = 33) {
  let e = estado;
  let ultimo = false;
  for (let t = de; t <= ate; t += passo) {
    const r = filtrarAlvo(e, alvo, t);
    e = r.estado;
    ultimo = r.bloqueado;
  }
  return { estado: e, bloqueado: ultimo };
}

describe('rearme por saída', () => {
  it('sem clique nem navegação, nada é bloqueado', () => {
    expect(filtrarAlvo(criarRearme(), A, 0).bloqueado).toBe(false);
  });

  it('o alvo clicado fica bloqueado enquanto o olhar ficar nele — por quanto tempo for', () => {
    const r = passar(aoClicar(A, false), A, 0, 10_000);
    expect(r.bloqueado).toBe(true);
  });

  it('volta a valer depois que o olhar sai por tempo suficiente', () => {
    let e = aoClicar(A, false);
    e = passar(e, B, 0, SAIDA_PARA_REARMAR_MS + 50).estado;
    expect(filtrarAlvo(e, A, 1000).bloqueado).toBe(false);
  });

  it('uma saída curta demais (tremor do olhar na borda) não rearma', () => {
    let e = aoClicar(A, false);
    e = passar(e, null, 0, SAIDA_PARA_REARMAR_MS - 100).estado;
    expect(filtrarAlvo(e, A, SAIDA_PARA_REARMAR_MS - 50).bloqueado).toBe(true);
  });

  it('outro alvo não é afetado pelo bloqueio', () => {
    const e = aoClicar(A, false);
    expect(filtrarAlvo(e, B, 10).bloqueado).toBe(false);
  });

  it('tecla repetível (Apagar) não bloqueia', () => {
    expect(filtrarAlvo(aoClicar(A, true), A, 10).bloqueado).toBe(false);
  });

  it('tela nova: o botão sob o olhar herdado não vale até o olhar sair dele', () => {
    let e = aoNavegar(1000);
    // a tela ainda entrando: primeiro nada sob o olhar, depois B desliza para baixo dele
    e = filtrarAlvo(e, null, 1010).estado;
    const r = passar(e, B, 1100, 1000 + JANELA_DE_HERANCA_MS + 3000);
    expect(r.bloqueado).toBe(true);
    // sai de B e volta: agora vale
    const e2 = passar(r.estado, null, 5000, 5000 + SAIDA_PARA_REARMAR_MS + 50).estado;
    expect(filtrarAlvo(e2, B, 6000).bloqueado).toBe(false);
  });

  it('tela nova sem nada sob o olhar na janela: o primeiro alvo olhado depois vale normalmente', () => {
    let e = aoNavegar(0);
    e = passar(e, null, 0, JANELA_DE_HERANCA_MS).estado;
    expect(filtrarAlvo(e, A, JANELA_DE_HERANCA_MS + 100).bloqueado).toBe(false);
  });
});
