import { describe, it, expect } from 'vitest';
import { caminhoDoHash, rotaMostraCursor, ROTAS_SEM_CURSOR } from './rotasComCursor';

describe('caminhoDoHash', () => {
  it('tira a cerquilha e a query do HashRouter', () => {
    expect(caminhoDoHash('#/menu')).toBe('/menu');
    expect(caminhoDoHash('#/menu?preflight=1')).toBe('/menu');
    expect(caminhoDoHash('/menu')).toBe('/menu');
  });

  it('hash vazio é a abertura', () => {
    expect(caminhoDoHash('')).toBe('/');
    expect(caminhoDoHash('#')).toBe('/');
    expect(caminhoDoHash('#/')).toBe('/');
  });

  it('barra final não cria uma rota diferente', () => {
    expect(caminhoDoHash('#/profiles/')).toBe('/profiles');
  });
});

describe('rotaMostraCursor', () => {
  it('ESCONDE em toda a jornada até a calibração', () => {
    // O defeito relatado: na escolha de paciente o cursor aparecia, porque o
    // perfil salvo já deixa `isCalibrated()` verdadeiro — só que o modelo
    // carregado é do último paciente, não de quem vai usar agora.
    for (const rota of ['#/', '#/intro', '#/login', '#/activated', '#/consent',
                        '#/profiles', '#/setup', '#/calibration-check']) {
      expect(rotaMostraCursor(rota), rota).toBe(false);
    }
  });

  it('esconde também no preparo e no resultado, não só durante a coleta', () => {
    // `engine.getState() === 'calibrating'` cobre a COLETA. A tela de preparo
    // antes dela e a de resultado depois ficavam de fora.
    expect(rotaMostraCursor('#/setup/camera')).toBe(false);
    expect(rotaMostraCursor('#/calibration/resultado')).toBe(false);
  });

  it('MOSTRA nas telas que o paciente opera pelo olhar', () => {
    for (const rota of ['#/welcome', '#/menu', '#/keyboard', '#/phrases', '#/pictograms',
                        '#/emergency', '#/conversation', '#/games', '#/games/bubble',
                        '#/drawing', '#/gallery', '#/news', '#/meditation', '#/rest',
                        '#/iamok', '#/virtual-mouse', '#/tutorial']) {
      expect(rotaMostraCursor(rota), rota).toBe(true);
    }
  });

  it('o tutorial MOSTRA — ele roda depois da calibração e é feito pelo olhar', () => {
    // Guarda explícita: `/tutorial` parece "parte inicial" pelo nome, mas vem
    // DEPOIS da calibração e a prática de dwell não funciona sem cursor.
    expect(rotaMostraCursor('#/tutorial')).toBe(true);
  });

  it('rota desconhecida mostra — o erro seguro é o cursor sobrar, não faltar', () => {
    expect(rotaMostraCursor('#/tela-que-ainda-nao-existe')).toBe(true);
  });

  it('prefixo parcial não conta como a rota', () => {
    // `/consent` na lista não pode esconder o cursor em `/consentimento-x`.
    expect(rotaMostraCursor('#/consentimento-do-paciente')).toBe(true);
    expect(ROTAS_SEM_CURSOR).toContain('/consent');
  });
});
