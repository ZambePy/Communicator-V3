import { describe, expect, it } from 'vitest';
import { ROTAS_SEM_SUGESTAO, kindPermiteSugestao, rotaPermiteSugestao, sugestoesPermitidas } from './quandoSugerir';

// Roadmap 1, rodada 3: "sugestão nunca aparece em emergência nem em dor". Esta é
// a regra, escrita uma vez, que a faixa de respostas consulta.

describe('rotaPermiteSugestao', () => {
  it('a tela da dor e a de emergência nunca', () => {
    expect(rotaPermiteSugestao('/dor')).toBe(false);
    expect(rotaPermiteSugestao('/dor/')).toBe(false);
    expect(rotaPermiteSugestao('/emergency')).toBe(false);
    expect(rotaPermiteSugestao('/emergency/confirmacao')).toBe(false);
  });

  it('a calibração também não: ninguém responde ao cuidador ali', () => {
    expect(rotaPermiteSugestao('/calibration-check')).toBe(false);
    expect(rotaPermiteSugestao('/calibration/resultado')).toBe(false);
  });

  it('a conversa e o teclado sim', () => {
    expect(rotaPermiteSugestao('/conversation')).toBe(true);
    expect(rotaPermiteSugestao('/keyboard')).toBe(true);
    expect(rotaPermiteSugestao('/menu')).toBe(true);
  });

  it('uma rota que só COMEÇA parecido não conta', () => {
    expect(rotaPermiteSugestao('/dormir')).toBe(true);
    expect(rotaPermiteSugestao('/emergencyx')).toBe(true);
  });

  it('a lista é a que o teste enxerga', () => {
    expect(ROTAS_SEM_SUGESTAO).toEqual(['/dor', '/emergency', '/calibration-check', '/calibration']);
  });
});

describe('kindPermiteSugestao', () => {
  it('Sim/Não do cuidador tem tela própria (a pergunta de sim ou não, Task 5): sem faixa', () => {
    expect(kindPermiteSugestao('simnao')).toBe(false);
  });

  it('mensagem do sistema não é pergunta de ninguém', () => {
    expect(kindPermiteSugestao('sistema')).toBe(false);
  });

  it('texto, frase, pictograma e tipo ausente podem ter sugestão', () => {
    for (const kind of ['texto', 'frase', 'pictograma', undefined]) expect(kindPermiteSugestao(kind)).toBe(true);
  });
});

describe('sugestoesPermitidas', () => {
  const ok = { pathname: '/conversation', emergencia: false, kind: 'texto' } as const;

  it('conversa normal: pode', () => {
    expect(sugestoesPermitidas(ok)).toBe(true);
  });

  it('emergência em curso vence qualquer outra coisa', () => {
    expect(sugestoesPermitidas({ ...ok, emergencia: true })).toBe(false);
  });

  it('rota proibida ou tipo proibido: não', () => {
    expect(sugestoesPermitidas({ ...ok, pathname: '/dor' })).toBe(false);
    expect(sugestoesPermitidas({ ...ok, kind: 'simnao' })).toBe(false);
  });
});
