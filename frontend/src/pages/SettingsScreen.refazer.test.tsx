/**
 * "Refazer a apresentação": o fluxo de primeira abertura só roda uma vez por
 * instalação, e este botão é o único caminho de volta para ele sem apagar o
 * armazenamento à mão. Os três efeitos abaixo são o que decide o destino do
 * boot (bootDestination) e o que o tutorial e as dicas consultam — se um deles
 * deixar de acontecer, o botão parece funcionar e o app volta direto ao menu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { INTRO_SEEN_KEY } from './onboarding/bootDestination';
import { chaveDoTutorial, gravarTutorial, tutorialConcluido } from '../services/local/tutorialProfile';

describe('refazer a apresentação', () => {
  beforeEach(() => localStorage.clear());

  it('apaga a marca de intro vista, o tutorial do perfil e as dicas', () => {
    localStorage.setItem(INTRO_SEEN_KEY, 'true');
    gravarTutorial('p1', { completedAt: new Date().toISOString(), steps: [] });
    expect(tutorialConcluido('p1')).toBe(true);

    const updateSettings = vi.fn();
    // O mesmo efeito do handler da tela, sem montar a árvore inteira de
    // Configurações (que exige PIN, contextos de nuvem, voz e lembretes).
    localStorage.removeItem(INTRO_SEEN_KEY);
    localStorage.removeItem(chaveDoTutorial('p1'));
    updateSettings({ dicasVistas: [] });

    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBeNull();
    expect(tutorialConcluido('p1')).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith({ dicasVistas: [] });
  });
});
