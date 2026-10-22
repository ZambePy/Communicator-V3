import { describe, it, expect, afterEach } from 'vitest';
import { suspenderDwell, dwellEstaSuspenso, textoDaSuspensaoDaCalibracao } from './GazeContext';

// Revisão do pipeline de 19/10/2026: a calibração também fica suspensa quando
// o modelo do rosto volta de um reinício noutro lado do recorte (e não há
// calibração salva para ele). Esse caso NÃO volta com a janela: a faixa não
// pode dizer "Não é preciso calibrar de novo".
describe('o texto da calibração suspensa', () => {
  const tela = { w: 1920, h: 1080, dpr: 1 };
  it('pela janela: o tamanho, o F11 e "não é preciso calibrar de novo", como antes', () => {
    const t = textoDaSuspensaoDaCalibracao({ calibracao: tela, atual: { w: 1600, h: 900, dpr: 1 }, desde: 0 });
    expect(t).toContain('1920×1080; agora 1600×900');
    expect(t).toContain('Não é preciso calibrar de novo');
  });
  it('pelo recorte: o que aconteceu, a Emergência, e calibrar de novo se não voltar', () => {
    const t = textoDaSuspensaoDaCalibracao({ calibracao: tela, atual: tela, desde: 0, recorte: { calibracao: 448, atual: 224 } })!;
    expect(t).toContain('reiniciar a leitura do rosto');
    expect(t).toContain('Emergência');
    expect(t).toContain('calibre de novo');
    expect(t).not.toContain('Não é preciso calibrar');
    // Sem jargão: nada de "recorte", "448²" ou "WASM" na faixa do paciente.
    expect(t).not.toMatch(/recorte|448|224|WASM|WebGPU/);
  });
  it('sem suspensão, sem texto', () => {
    expect(textoDaSuspensaoDaCalibracao(null)).toBeNull();
  });
});

// Revisão de UX de 19/10/2026: a suspensão do dwell era um booleano único,
// dividido entre o Modo Computador e o acionador do Plano B. Sair do Modo
// Computador devolvia o olhar mesmo com "o olhar não clica" ligado.

describe('suspensão do dwell por motivo', () => {
  afterEach(() => {
    suspenderDwell(false, 'acionador');
    suspenderDwell(false, 'modo_computador');
  });

  it('sair do Modo Computador não devolve o olhar que o acionador suspendeu', () => {
    suspenderDwell(true, 'acionador');
    suspenderDwell(true, 'modo_computador');
    suspenderDwell(false, 'modo_computador');
    expect(dwellEstaSuspenso()).toBe(true);
    suspenderDwell(false, 'acionador');
    expect(dwellEstaSuspenso()).toBe(false);
  });

  it('cada motivo sozinho suspende; devolver duas vezes não quebra nada', () => {
    expect(dwellEstaSuspenso()).toBe(false);
    suspenderDwell(true, 'modo_computador');
    expect(dwellEstaSuspenso()).toBe(true);
    suspenderDwell(false, 'modo_computador');
    suspenderDwell(false, 'modo_computador');
    expect(dwellEstaSuspenso()).toBe(false);
    // Sem motivo, vale o do acionador.
    suspenderDwell(true);
    suspenderDwell(false, 'modo_computador');
    expect(dwellEstaSuspenso()).toBe(true);
    suspenderDwell(false);
    expect(dwellEstaSuspenso()).toBe(false);
  });
});
