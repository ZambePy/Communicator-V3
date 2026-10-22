import { describe, it, expect } from 'vitest';
import { mensagemDoRegistro } from './mensagens';
import { MAX_PERGUNTAS } from './perguntas';

// Cada resultado de gravação do diário e das perguntas vira uma frase para o
// cuidador (21/10/2026). Falha de gravação calada é o defeito que o relato de
// 18/10/2026 apontou: a tela não pode dar por salvo o que não foi.

describe('mensagemDoRegistro', () => {
  it('gravado não tem mensagem de erro', () => {
    expect(mensagemDoRegistro('gravado')).toBeNull();
  });

  it.each(['sem_consentimento', 'sem_perfil', 'falhou', 'invalido', 'repetida', 'cheia'] as const)(
    '%s diz o que aconteceu, em palavras, e não é vazio',
    (r) => {
      const m = mensagemDoRegistro(r);
      expect(m).not.toBeNull();
      expect(m!.length).toBeGreaterThan(20);
      // Sem jargão nem código de erro à vista.
      expect(m).not.toMatch(/localStorage|undefined|null|exception|erro \d+|_/i);
    },
  );

  it('sem autorização manda para Configurações, onde se liga', () => {
    expect(mensagemDoRegistro('sem_consentimento')).toMatch(/Configurações/);
    expect(mensagemDoRegistro('sem_consentimento')).toMatch(/nada foi guardado/i);
  });

  it('lista cheia diz o teto real, vindo da mesma constante das perguntas', () => {
    expect(mensagemDoRegistro('cheia')).toContain(String(MAX_PERGUNTAS));
  });

  it('as mensagens são todas diferentes entre si (cada causa tem a sua)', () => {
    const todas = (['sem_consentimento', 'sem_perfil', 'falhou', 'invalido', 'repetida', 'cheia'] as const).map(mensagemDoRegistro);
    expect(new Set(todas).size).toBe(todas.length);
  });
});
