import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EXPERIMENT } from './config/experiment';
import { loadProfile, haCalibracaoNoDisco, isCalibrated, PROFILES_STORAGE_KEY } from './calibration';

/**
 * Desligar a persistência da calibração — modo de desenvolvimento.
 *
 * Testar o fluxo de calibração com um perfil salvo é testar outra coisa: o app
 * pula a coleta, carrega o modelo de ontem, e qualquer regressão no caminho que
 * se queria exercitar passa despercebida. Com `persistirCalibracao: false` cada
 * abertura começa sem modelo e a única forma de ter cursor é calibrar.
 *
 * A propriedade que mais importa aqui NÃO é "não carrega": é **não apaga**. Um
 * mecanismo de teste que destrói o perfil de um paciente por engano é o
 * acidente que este projeto não pode ter, e é por isso que ele desliga a
 * leitura e a escrita em vez de limpar o disco.
 */

const CHAVE = PROFILES_STORAGE_KEY;

/** Um perfil qualquer, só para o disco não estar vazio. */
const PERFIL_NO_DISCO = JSON.stringify([
  {
    meta: { id: 'perfil-de-teste', createdAt: new Date().toISOString(), schemaVersion: 2 },
    modelLeft: {}, modelRight: {}, scalerParamsLeft: {}, scalerParamsRight: {},
  },
]);

describe('persistirCalibracao = false', () => {
  const original = EXPERIMENT.persistirCalibracao;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(CHAVE, PERFIL_NO_DISCO);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    EXPERIMENT.persistirCalibracao = original;
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('o default é GRAVAR — o produto não pode esquecer a calibração do paciente', () => {
    // Um paciente com ELA não refaz nove alvos toda vez que o computador liga.
    // Se este teste falhar, alguém inverteu o default e o dano é no uso real.
    expect(original).toBe(true);
  });

  it('não carrega o perfil que está no disco', () => {
    EXPERIMENT.persistirCalibracao = false;
    expect(loadProfile()).toBe(false);
    expect(isCalibrated()).toBe(false);
  });

  it('`haCalibracaoNoDisco` responde a MESMA coisa que o carregamento', () => {
    // A tela de abertura decide a rota por esta função. Se ela dissesse "sim"
    // enquanto `loadProfile` diz "não", o app mandaria para o menu alguém que
    // vai chegar lá sem modelo — cursor escondido e nada explicando.
    EXPERIMENT.persistirCalibracao = false;
    expect(haCalibracaoNoDisco()).toBe(false);
    EXPERIMENT.persistirCalibracao = true;
    expect(haCalibracaoNoDisco()).toBe(true);
  });

  it('NÃO apaga o que está gravado — religar a flag traz o perfil de volta', () => {
    EXPERIMENT.persistirCalibracao = false;
    loadProfile();
    haCalibracaoNoDisco();
    // O disco continua intacto: desligar é deixar de ler, não destruir.
    expect(localStorage.getItem(CHAVE)).toBe(PERFIL_NO_DISCO);
    EXPERIMENT.persistirCalibracao = true;
    expect(haCalibracaoNoDisco()).toBe(true);
  });
});
