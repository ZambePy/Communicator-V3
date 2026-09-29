import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULTS, gravarExperimento } from './experiment';

// -----------------------------------------------------------------------------
// `gravarExperimento` é a gravação do `__irisflowExp.set` do console e do botão
// "Calibrar só com a íris" da tela de calibração (Fase 8). Ela escreve para a
// PRÓXIMA carga da página, e quem chama recarrega — por isso precisa dizer se
// gravou: com o armazenamento cheio, recarregar voltava à mesma tela e o botão
// parecia não fazer nada.
// -----------------------------------------------------------------------------

const CHAVE = 'irisflow.experiment';
const gravado = () => JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Record<string, unknown> | null;

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('gravar uma escolha de experimento', () => {
  it('grava só o que difere do padrão', () => {
    // Gravar a configuração inteira congelaria no disco os padrões do dia.
    const outro = DEFAULTS.l2cs === 'off' ? 'auto' : 'off';
    expect(gravarExperimento('l2cs', outro)).toBe(true);
    expect(gravado()).toEqual({ l2cs: outro });
  });

  it('mantém as escolhas que já estavam gravadas', () => {
    localStorage.setItem(CHAVE, JSON.stringify({ expandFactor: 1.6 }));
    const outro = DEFAULTS.l2cs === 'off' ? 'auto' : 'off';
    gravarExperimento('l2cs', outro);
    expect(gravado()).toEqual({ expandFactor: 1.6, l2cs: outro });
  });

  it('voltar ao padrão tira a chave do disco', () => {
    const outro = DEFAULTS.l2cs === 'off' ? 'auto' : 'off';
    gravarExperimento('l2cs', outro);
    gravarExperimento('l2cs', DEFAULTS.l2cs);
    expect(gravado()).toEqual({});
  });

  it('valor fora da lista não entra (cai no padrão)', () => {
    gravarExperimento('l2cs', 'turbo');
    expect(gravado()).toEqual({});
  });

  it('com o armazenamento cheio, diz que não gravou em vez de lançar', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError');
    });
    expect(gravarExperimento('l2cs', DEFAULTS.l2cs === 'off' ? 'auto' : 'off')).toBe(false);
  });
});
