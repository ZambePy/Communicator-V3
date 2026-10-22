import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVE_DO_MODELO, chaveDoModeloDoPerfil, definirPerfilDoAssistente, descarregar, registrarFala, reiniciarParaTeste } from '../assistente/armazenamento';
import { ErroDeBackup } from './erro';
import { serializarBackup, somaDoConteudo, validarBackup, type BackupV1 } from './formato';
import { montarBackup } from './montarBackup';
import { restaurarBackup } from './restaurarBackup';
import { CHAVE_DO_RESUMO_DA_RESTAURACAO, lerResumoDaRestauracao } from './resumo';
import { ID_A, ID_B, ponteFalsaDoBackup } from '../../test/vozDoBackup';
import { BLOCO_DA_DECODIFICACAO, paraBase64 } from './base64';

// -----------------------------------------------------------------------------
// Restaurar um backup (rodada 3, 21/10/2026). É a operação mais perigosa do app:
// troca o que há neste computador pelo que veio de um arquivo. As regras que os
// testes seguram:
//   1. Nada entra sem passar pelo validador — e uma recusa NÃO escreve nada.
//   2. Antes de escrever, guarda uma cópia do que há (a única volta possível).
//   3. O que é deste computador (licença, calibração, câmera, tela) não é tocado.
//   4. Falhou no meio? Volta tudo como estava.
// -----------------------------------------------------------------------------

const AGORA = new Date('2026-10-21T15:00:00.000Z');

const doBackup = {
  irisflow_settings: JSON.stringify({ schemaVersion: 1, dwellMs: 1800, soundEnabled: false, screenDiagonalIn: 15.6, cameraDeviceId: 'cam-A' }),
  irisflow_profiles: JSON.stringify([
    { id: 'p1', name: 'Ana', age: 61, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'p2', name: 'Bruno', createdAt: '2026-02-01T00:00:00.000Z' },
  ]),
  irisflow_auth: JSON.stringify({ currentProfile: { id: 'p1', name: 'Ana' } }),
  irisflow_clinical_data_p1: '{"A":1}',
  irisflow_clinical_data_p2: '{"B":1}',
  'irisflow.assistente.v1.p1': '{"vocab":"da Ana"}',
  irisflow_favorites_p2: '["do Bruno"]',
  irisflow_lang: 'pt-BR',
};

/** O que este computador tem ANTES de restaurar: dados da pessoa (entram no escopo) e coisas dele (ficam). */
const daqui = {
  irisflow_settings: JSON.stringify({ schemaVersion: 1, dwellMs: 900, screenDiagonalIn: 27, cameraDeviceId: 'cam-B' }),
  irisflow_profiles: JSON.stringify([{ id: 'p3', name: 'Carla', createdAt: '2026-03-01T00:00:00.000Z' }]),
  irisflow_auth: JSON.stringify({ currentProfile: { id: 'p3', name: 'Carla' } }),
  irisflow_clinical_data_p3: '{"C":1}',
  irisflow_reminders: '[{"r":1}]',
};
const deste = {
  irisflow_license: 'licenca-deste-computador',
  'irisflow.calib.profiles.v2': 'calibracao-deste-computador',
  'irisflow.apresentacao': '{"ate":9999999999999}',
  irisflow_setup_p3: 'preparo-deste-computador',
};

const semear = (dados: Record<string, string>) => { for (const [k, v] of Object.entries(dados)) localStorage.setItem(k, v); };
const guardado = (): Record<string, string> => {
  const tudo: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) as string;
    tudo[k] = localStorage.getItem(k) as string;
  }
  return tudo;
};

const umBackup = (chaves: Record<string, string>, arquivosDaVoz?: BackupV1['arquivosDaVoz']): BackupV1 => ({
  formato: 'irisflow-backup', versao: 1, criadoEm: '2026-10-20T09:00:00.000Z', app: '2.5.0', chaves,
  ...(arquivosDaVoz ? { arquivosDaVoz } : {}),
});

/** Os dois lados da fronteira que o teste observa: as cópias de segurança guardadas e as recargas. */
function ambiente(sobrescreve: Record<string, unknown> = {}) {
  const copias: string[] = [];
  const recarga = { vezes: 0, resumoNaHora: null as string | null };
  const deps = {
    ponteDaVoz: null,
    guardarCopia: async (texto: string) => {
      copias.push(texto);
      return { ok: true as const, nome: 'copia-de-seguranca-2026-10-21T15-00-00Z-01.json', pasta: '/dados/copias-de-seguranca' };
    },
    recarregar: () => {
      recarga.vezes++;
      recarga.resumoNaHora = sessionStorage.getItem(CHAVE_DO_RESUMO_DA_RESTAURACAO);
    },
    agora: () => AGORA,
    versaoDoApp: async () => '2.5.0',
    ...sobrescreve,
  };
  return { deps, copias, recarga };
}

/** Um `Storage` em memória que falha quando se pede (a cota estourou, o disco morreu). */
function armazenamentoQueFalha(inicial: Record<string, string>, quando: { naGravacaoDe?: string; depoisDaFalhaTudoFalha?: boolean }) {
  const dados = new Map(Object.entries(inicial));
  let quebrou = false;
  return {
    dados,
    get length() { return dados.size; },
    key: (i: number) => [...dados.keys()][i] ?? null,
    getItem: (k: string) => dados.get(k) ?? null,
    removeItem: (k: string) => {
      if (quebrou && quando.depoisDaFalhaTudoFalha) throw new DOMException('disco', 'InvalidStateError');
      dados.delete(k);
    },
    setItem: (k: string, v: string) => {
      if (quebrou && quando.depoisDaFalhaTudoFalha) throw new DOMException('disco', 'InvalidStateError');
      if (k === quando.naGravacaoDe) { quebrou = true; throw new DOMException('cheio', 'QuotaExceededError'); }
      dados.set(k, v);
    },
    clear: () => dados.clear(),
  } as unknown as Storage & { dados: Map<string, string> };
}

beforeEach(() => {
  reiniciarParaTeste();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

// ----------------------------------------------------------------------------

describe('restaurarBackup — o que uma recusa NÃO faz (nada é escrito)', () => {
  /** Roda a restauração que tem de ser recusada e confere que o computador ficou exatamente como estava. */
  async function recusa(b: BackupV1, opcoes: { perfil?: string } = {}, extras: Record<string, unknown> = {}) {
    semear({ ...daqui, ...deste });
    const antes = guardado();
    const { deps, copias, recarga } = ambiente(extras);

    const falha = await restaurarBackup(b, opcoes, deps).catch((e: unknown) => e);

    expect(guardado()).toEqual(antes);
    expect(sessionStorage.getItem(CHAVE_DO_RESUMO_DA_RESTAURACAO)).toBeNull();
    expect(recarga.vezes).toBe(0);
    return { falha, copias };
  }

  it('um arquivo que não passa no validador (versão que o app não conhece) não escreve nada nem faz cópia', async () => {
    const { falha, copias } = await recusa({ ...umBackup(doBackup), versao: 2 } as unknown as BackupV1);

    expect(falha).toBeInstanceOf(ErroDeBackup);
    expect(falha).toMatchObject({ codigo: 'invalido', message: expect.stringMatching(/mais nova/) });
    expect(copias).toEqual([]);
  });

  it('um arquivo com uma chave que nem é do IrisFlow (de outro programa, ou mexido à mão) é recusado — e nada entra', async () => {
    const { falha, copias } = await recusa(umBackup({ ...doBackup, accuracyResult: 'lixo' }));

    expect(falha).toMatchObject({ codigo: 'invalido', message: expect.stringMatching(/accuracyResult.*não restaura/) });
    expect(copias).toEqual([]);
  });

  // A soma de verificação (rodada 1, 21/10/2026): um valor estragado que continue JSON válido (a lista de pacientes
  // esvaziada, por exemplo) passava no validador e, no "Tudo", trocava o dado bom. Com soma no arquivo, a conferência
  // vem antes de QUALQUER escrita — inclusive a do vocabulário que o assistente ainda só tinha na memória.
  describe('a soma de verificação não bate', () => {
    const comSoma = async (chaves: Record<string, string>, voz?: BackupV1['arquivosDaVoz']): Promise<BackupV1> => {
      const b = umBackup(chaves, voz);
      return { ...b, soma: (await somaDoConteudo(b)) as string };
    };

    it('um valor mexido que continua JSON válido (lista de pacientes esvaziada): recusa, sem cópia, sem escrever, sem recarregar', async () => {
      const b = await comSoma(doBackup);
      const mexido: BackupV1 = { ...b, chaves: { ...b.chaves, irisflow_profiles: '[]' } };

      const { falha, copias } = await recusa(mexido);

      expect(falha).toBeInstanceOf(ErroDeBackup);
      expect(falha).toMatchObject({ codigo: 'invalido', message: expect.stringMatching(/alterado ou está estragado.*Nada foi restaurado/s) });
      expect(copias).toEqual([]);
    });

    it('vale também para "Só um paciente"', async () => {
      const b = await comSoma(doBackup);

      const { falha } = await recusa({ ...b, chaves: { ...b.chaves, irisflow_clinical_data_p1: '{"A":2}' } }, { perfil: 'p1' });

      expect(falha).toMatchObject({ codigo: 'invalido', message: expect.stringMatching(/alterado ou está estragado/) });
    });

    it('um áudio mexido: recusa ANTES de mandar qualquer coisa para a pasta da voz', async () => {
      const ponte = ponteFalsaDoBackup();
      const b = await comSoma(doBackup, [{ nome: `${ID_A}.wav`, base64: 'AAEC' }]);

      const { falha } = await recusa({ ...b, arquivosDaVoz: [{ nome: `${ID_A}.wav`, base64: 'AAED' }] }, {}, { ponteDaVoz: ponte });

      expect(falha).toMatchObject({ codigo: 'invalido' });
      expect(ponte.restauracoes).toEqual([]);
    });

    it('a conferência vem antes de gravar o vocabulário que o assistente só tinha na memória (nem isso é escrito numa recusa)', async () => {
      const b = await comSoma(doBackup);
      definirPerfilDoAssistente('p3');
      registrarFala('frase só na memória');

      const { falha } = await recusa({ ...b, chaves: { ...b.chaves, irisflow_lang: 'en' } });

      expect(falha).toMatchObject({ codigo: 'invalido' });
      expect(localStorage.getItem(chaveDoModeloDoPerfil('p3'))).toBeNull();
    });

    it('a soma que bate deixa restaurar normalmente', async () => {
      semear({ ...daqui, ...deste });
      const { deps, recarga } = ambiente();

      const resumo = await restaurarBackup(await comSoma(doBackup), {}, deps);

      expect(resumo).toMatchObject({ modo: 'completo', chavesGravadas: 8 });
      expect(recarga.vezes).toBe(1);
    });

    it('um backup SEM soma (feito antes dela) restaura como sempre', async () => {
      semear({ ...daqui, ...deste });
      const { deps, recarga } = ambiente();

      await restaurarBackup(umBackup(doBackup), {}, deps);

      expect(recarga.vezes).toBe(1);
    });

    it('sem como conferir a soma (janela sem criptografia), recusa em vez de restaurar sem conferir', async () => {
      const b = await comSoma(doBackup);
      vi.spyOn(globalThis.crypto, 'subtle', 'get').mockReturnValue(undefined as unknown as SubtleCrypto);

      const { falha } = await recusa(b);

      expect(falha).toMatchObject({ codigo: 'invalido', message: expect.stringMatching(/Não foi possível conferir se o arquivo está íntegro.*Nada foi restaurado/s) });
    });
  });

  it('o paciente pedido não está no backup: recusa, sem cópia e sem escrever', async () => {
    const { falha, copias } = await recusa(umBackup(doBackup), { perfil: 'fantasma' });

    expect(falha).toMatchObject({ codigo: 'perfil-ausente' });
    expect(copias).toEqual([]);
  });

  it('um pedido de paciente vazio ou torto não vira "restaurar todos"', async () => {
    for (const perfil of ['', '   ', 7 as unknown as string]) {
      const { falha } = await recusa(umBackup(doBackup), { perfil });
      expect(falha, String(perfil)).toMatchObject({ codigo: 'perfil-ausente' });
    }
  });

  it('o backup traz gravações da voz e esta janela não tem como restaurá-las (navegador): recusa tudo, em vez de restaurar pela metade', async () => {
    const comVoz = umBackup(doBackup, [{ nome: `${ID_A}.wav`, base64: 'AAEC' }]);

    const { falha, copias } = await recusa(comVoz, {}, { ponteDaVoz: null });

    expect(falha).toMatchObject({ codigo: 'voz-falhou', message: expect.stringMatching(/aplicativo instalado/) });
    expect(copias).toEqual([]);
  });

  it('a cópia de segurança não pôde ser guardada: NADA é restaurado (sem cópia não há volta)', async () => {
    const { falha } = await recusa(umBackup(doBackup), {}, {
      guardarCopia: async () => ({ ok: false, erro: 'Não foi possível guardar a cópia de segurança neste computador.' }),
    });

    expect(falha).toMatchObject({ codigo: 'copia-falhou', message: expect.stringMatching(/Nada foi restaurado/) });
    expect((falha as Error).message).toMatch(/cópia de segurança/);
  });

  it('o canal da cópia de segurança rejeita (aplicativo ocupado): o mesmo — nada é restaurado', async () => {
    const { falha } = await recusa(umBackup(doBackup), {}, { guardarCopia: async () => { throw new Error('Object has been destroyed'); } });

    expect(falha).toMatchObject({ codigo: 'copia-falhou', message: expect.stringMatching(/Nada foi restaurado/) });
  });

  it('as gravações da voz não voltaram: as configurações e o resto NÃO são trocados', async () => {
    const ponte = ponteFalsaDoBackup({}, { backupRestaurar: async () => ({ ok: false, erro: 'Não foi possível guardar as gravações do backup neste computador.' }) });
    const comVoz = umBackup(doBackup, [{ nome: `${ID_A}.wav`, base64: 'AAEC' }]);

    const { falha } = await recusa(comVoz, {}, { ponteDaVoz: ponte });

    expect(falha).toMatchObject({ codigo: 'voz-falhou', message: expect.stringMatching(/gravações do backup.*Nada foi restaurado/) });
  });

  it('o canal da voz rejeita no meio da restauração: o mesmo', async () => {
    const ponte = ponteFalsaDoBackup({}, { backupRestaurar: async () => { throw new Error('Object has been destroyed'); } });
    const comVoz = umBackup(doBackup, [{ nome: `${ID_A}.wav`, base64: 'AAEC' }]);

    const { falha } = await recusa(comVoz, {}, { ponteDaVoz: ponte });

    expect(falha).toMatchObject({ codigo: 'voz-falhou', message: expect.stringMatching(/falar com o aplicativo.*Nada foi restaurado/) });
  });
});

// ----------------------------------------------------------------------------

// Uma chave do IrisFlow que o app não restaura (a licença, o modo apresentação, a sessão…) não recusa o arquivo: é
// ignorada. Ela pode estar lá porque uma versão futura passou a deixá-la de fora, ou porque o arquivo foi mexido à mão —
// nos dois casos NUNCA pode chegar ao armazenamento (o modo apresentação descarta todos os pedidos de socorro por 2 h)
// (correção da rodada 1, 21/10/2026).
describe('restaurarBackup — chaves do arquivo que o app não restaura', () => {
  const DE_FORA: Record<string, string> = {
    'irisflow.apresentacao': '{"ate":1111111111111}', // ligaria o modo que descarta os socorros
    irisflow_license: 'licenca-do-OUTRO-computador',
    'irisflow.vinculo': '{"device_key":"do-outro"}',
    'irisflow.supabase.session': 'sessao-do-outro',
    'irisflow.sb.token': 'token-do-outro',
    'irisflow.fila': '[{"socorro":"antigo"}]',
    'irisflow.calib.profiles.v2': 'calibracao-do-OUTRO-computador',
    irisflow_setup_p1: 'preparo-do-outro',
    irisflow_consent_clinical_data: 'true',
    irisflow_caregiver_session: '1',
  };

  it('o resto do backup restaura, as chaves de fora NÃO entram e as deste computador continuam como estavam', async () => {
    semear({ ...daqui, ...deste });
    const { deps, recarga } = ambiente();

    const resumo = await restaurarBackup(umBackup({ ...doBackup, ...DE_FORA }), {}, deps);

    const depois = guardado();
    for (const k of Object.keys(DE_FORA)) {
      expect(depois[k], k).toBe((deste as Record<string, string>)[k]); // o valor DESTE computador (ou nenhum)
      if (!(k in deste)) expect(k in depois, `${k} não podia aparecer`).toBe(false);
    }
    expect(depois['irisflow.apresentacao']).toBe(deste['irisflow.apresentacao']);
    expect(depois.irisflow_clinical_data_p1).toBe('{"A":1}'); // o que é da pessoa entrou
    expect(resumo.chavesGravadas).toBe(8); // só as 8 do backup que o app restaura; as de fora não contam
    expect(recarga.vezes).toBe(1);
  });

  it('"Só um paciente": também não toca nelas', async () => {
    semear({ ...daqui, ...deste });
    const { deps } = ambiente();

    await restaurarBackup(umBackup({ ...doBackup, ...DE_FORA }), { perfil: 'p1' }, deps);

    const depois = guardado();
    for (const k of Object.keys(DE_FORA)) expect(depois[k], k).toBe((deste as Record<string, string>)[k]);
    expect(depois.irisflow_clinical_data_p1).toBe('{"A":1}');
  });

  it('a cópia de segurança não é afetada: tem o estado de antes, sem nada do arquivo', async () => {
    semear({ ...daqui, ...deste });
    const { deps, copias } = ambiente();

    await restaurarBackup(umBackup({ ...doBackup, ...DE_FORA }), {}, deps);

    expect(JSON.parse(copias[0]).chaves).toEqual(daqui);
  });

  it('o "Tudo" também não APAGA o que é de fora (nunca apagou: só remove o que o app restaura)', async () => {
    semear({ ...daqui, ...deste });
    const { deps } = ambiente();

    await restaurarBackup(umBackup(doBackup), {}, deps); // este backup NÃO traz nenhuma chave de fora

    for (const [k, v] of Object.entries(deste)) expect(localStorage.getItem(k), k).toBe(v);
  });
});

// ----------------------------------------------------------------------------

describe('restaurarBackup — a restauração completa', () => {
  it('ida e volta entre dois computadores: o que era da pessoa chega igual; o que era do outro computador fica como estava', async () => {
    // Computador A: faz o backup e o arquivo vai e volta pelo texto.
    semear(doBackup);
    const arquivo = serializarBackup(await montarBackup({}, { ponteDaVoz: null, agora: () => AGORA, versaoDoApp: async () => '2.5.0' })).texto;
    // Computador B: tem outros dados da pessoa e as suas próprias coisas.
    localStorage.clear();
    semear({ ...daqui, ...deste });
    const validado = validarBackup(JSON.parse(arquivo));
    if (!validado.ok) throw new Error(validado.motivo);
    expect(validado.backup.soma).toMatch(/^[0-9a-f]{64}$/); // o backup de verdade traz a soma, e a restauração a confere
    const { deps, recarga } = ambiente();

    const resumo = await restaurarBackup(validado.backup, {}, deps);

    const depois = guardado();
    // Chega igual:
    for (const k of ['irisflow_profiles', 'irisflow_auth', 'irisflow_clinical_data_p1', 'irisflow_clinical_data_p2', 'irisflow.assistente.v1.p1', 'irisflow_favorites_p2', 'irisflow_lang']) {
      expect(depois[k], k).toBe((doBackup as Record<string, string>)[k]);
    }
    // O que só havia em B e é da pessoa sai (o backup é a verdade):
    expect('irisflow_clinical_data_p3' in depois).toBe(false);
    expect('irisflow_reminders' in depois).toBe(false);
    // O que é de B fica:
    for (const [k, v] of Object.entries(deste)) expect(depois[k], k).toBe(v);
    expect(resumo).toMatchObject({ modo: 'completo', chavesGravadas: 8, chavesRemovidas: 2, voz: null });
    expect(recarga.vezes).toBe(1);
  });

  it('as configurações vêm do backup, MENOS o que descreve a câmera e a tela: isso continua como neste computador', async () => {
    semear({ ...daqui, ...deste });
    const { deps } = ambiente();

    await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(JSON.parse(localStorage.getItem('irisflow_settings') as string)).toEqual({
      schemaVersion: 1, dwellMs: 1800, soundEnabled: false, // da pessoa: vêm do backup
      screenDiagonalIn: 27, cameraDeviceId: 'cam-B', // do posto de B: ficam
    });
  });

  it('um computador sem configurações próprias recebe as do backup sem os campos da câmera e da tela de A (valem os padrões)', async () => {
    const { deps } = ambiente();

    await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(JSON.parse(localStorage.getItem('irisflow_settings') as string)).toEqual({ schemaVersion: 1, dwellMs: 1800, soundEnabled: false });
  });

  it('um backup sem configurações NÃO apaga as deste computador', async () => {
    semear(daqui);
    const { deps } = ambiente();
    const semConfig: Record<string, string> = { ...doBackup };
    delete semConfig.irisflow_settings;

    await restaurarBackup(umBackup(semConfig), {}, deps);

    expect(localStorage.getItem('irisflow_settings')).toBe(daqui.irisflow_settings);
    expect(localStorage.getItem('irisflow_lang')).toBe('pt-BR');
  });

  it('as gravações da voz vão para o aplicativo com os nomes e os bytes do backup, inteiras e sem recorte por paciente', async () => {
    const ponte = ponteFalsaDoBackup();
    const voz = [
      { nome: 'indice.json', base64: 'e30=' },
      { nome: `${ID_A}.wav`, base64: 'SGVsbG8=' },
      { nome: `${ID_B}.wav`, base64: 'AAEC' },
      { nome: 'consentimento.json', base64: 'W10=' },
    ];
    const { deps } = ambiente({ ponteDaVoz: ponte });

    const resumo = await restaurarBackup(umBackup(doBackup, voz), {}, deps);

    expect(ponte.restauracoes).toHaveLength(1);
    const { arquivos, opcoes } = ponte.restauracoes[0];
    expect(arquivos.map((a) => [a.nome, [...new Uint8Array(a.bytes as Uint8Array)]])).toEqual([
      ['indice.json', [123, 125]],
      [`${ID_A}.wav`, [72, 101, 108, 108, 111]],
      [`${ID_B}.wav`, [0, 1, 2]],
      ['consentimento.json', [91, 93]],
    ]);
    expect(opcoes).toBeUndefined();
    expect(resumo.voz).toEqual({ gravacoes: 2, termos: 1, ignoradas: 0, copiadas: 0 });
  });

  it('sem voz no backup, o canal da voz nem é chamado', async () => {
    const ponte = ponteFalsaDoBackup();
    const { deps } = ambiente({ ponteDaVoz: ponte });

    await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(ponte.restauracoes).toEqual([]);
  });

  it('sem voz no backup, restaura normalmente mesmo sem o aplicativo instalado (navegador)', async () => {
    const { deps, recarga } = ambiente({ ponteDaVoz: null });

    const resumo = await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(resumo.voz).toBeNull();
    expect(recarga.vezes).toBe(1);
  });

  it('quando algumas gravações do backup não voltam (áudio estragado), o resumo conta — não finge que voltaram todas', async () => {
    const ponte = ponteFalsaDoBackup({}, { backupRestaurar: async () => ({ ok: true, gravacoes: 5, termos: 1, ignoradas: 2, copiadas: 0 }) });
    const { deps } = ambiente({ ponteDaVoz: ponte });

    const resumo = await restaurarBackup(umBackup(doBackup, [{ nome: `${ID_A}.wav`, base64: 'AAEC' }]), {}, deps);

    expect(resumo.voz).toEqual({ gravacoes: 5, termos: 1, ignoradas: 2, copiadas: 0 });
  });

  it('as gravações que entraram como CÓPIA (já havia uma de cá com o mesmo id e outro áudio) chegam ao resumo — a tela precisa dizer', async () => {
    const ponte = ponteFalsaDoBackup({}, { backupRestaurar: async () => ({ ok: true, gravacoes: 5, termos: 1, ignoradas: 0, copiadas: 3 }) });
    const { deps } = ambiente({ ponteDaVoz: ponte });

    const resumo = await restaurarBackup(umBackup(doBackup, [{ nome: `${ID_A}.wav`, base64: 'AAEC' }]), {}, deps);

    expect(resumo.voz).toEqual({ gravacoes: 5, termos: 1, ignoradas: 0, copiadas: 3 });
    expect(lerResumoDaRestauracao()?.voz?.copiadas).toBe(3); // e atravessa a recarga
  });

  it('uma resposta da voz sem o campo das cópias (aplicativo mais velho) vale como zero — não vira NaN na tela', async () => {
    const ponte = ponteFalsaDoBackup({}, { backupRestaurar: async () => ({ ok: true, gravacoes: 2, termos: 0, ignoradas: 0 }) as never });
    const { deps } = ambiente({ ponteDaVoz: ponte });

    const resumo = await restaurarBackup(umBackup(doBackup, [{ nome: `${ID_A}.wav`, base64: 'AAEC' }]), {}, deps);

    expect(resumo.voz).toEqual({ gravacoes: 2, termos: 0, ignoradas: 0, copiadas: 0 });
  });

  it('um áudio de vários blocos de texto chega à voz byte a byte igual (a decodificação em partes não corta nem repete nada)', async () => {
    const ponte = ponteFalsaDoBackup();
    const grande = Uint8Array.from({ length: 3 * BLOCO_DA_DECODIFICACAO + 5 }, (_, i) => (i * 131 + (i >> 9)) & 0xff);
    const { deps } = ambiente({ ponteDaVoz: ponte });

    await restaurarBackup(umBackup(doBackup, [{ nome: `${ID_A}.wav`, base64: paraBase64(grande) }, { nome: `${ID_B}.wav`, base64: 'AAEC' }]), {}, deps);

    const recebidos = ponte.restauracoes[0].arquivos;
    expect(recebidos.map((a) => a.nome)).toEqual([`${ID_A}.wav`, `${ID_B}.wav`]);
    expect(Buffer.from(recebidos[0].bytes as Uint8Array).equals(Buffer.from(grande))).toBe(true);
    expect([...(recebidos[1].bytes as Uint8Array)]).toEqual([0, 1, 2]);
  });

  it('decodifica a voz do backup sem prender a janela: os temporizadores rodam durante a restauração, mesmo com muitos áudios pequenos', async () => {
    const ponte = ponteFalsaDoBackup();
    const id = (i: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`;
    const audio = paraBase64(Uint8Array.from({ length: 80_000 }, (_, i) => i & 0xff)); // ~107 mil caracteres: menos que um bloco
    const voz = Array.from({ length: 40 }, (_, i) => ({ nome: `${id(i)}.wav`, base64: audio }));
    const { deps } = ambiente({ ponteDaVoz: ponte });
    let batidas = 0;
    let rodando = true;
    const batida = () => { if (!rodando) return; batidas++; setTimeout(batida, 0); };
    setTimeout(batida, 0);

    await restaurarBackup(umBackup(doBackup, voz), {}, deps);
    rodando = false;

    expect(ponte.restauracoes[0].arquivos).toHaveLength(40);
    // ~4,3 milhões de caracteres = ~16 blocos de leitura; a janela precisa ter tido vez em boa parte deles.
    // (Sem a leitura em partes, a restauração toda roda sem uma única pausa: no máximo uma batida, de outra espera.)
    expect(batidas).toBeGreaterThanOrEqual(8);
  });
});

// ----------------------------------------------------------------------------

describe('restaurarBackup — só de um paciente', () => {
  const dePaciente = {
    irisflow_settings: '{"schemaVersion":1,"dwellMs":900}',
    irisflow_profiles: JSON.stringify([
      { id: 'p1', name: 'Ana (nome antigo)', createdAt: '2025-12-01T00:00:00.000Z' },
      { id: 'p3', name: 'Carla', createdAt: '2026-03-01T00:00:00.000Z' },
    ]),
    irisflow_auth: JSON.stringify({ currentProfile: { id: 'p3', name: 'Carla' } }),
    irisflow_clinical_data_p1: '{"velho":1}',
    irisflow_favorites_p1: '["antigo"]', // o backup não tem favoritos da Ana: o estado dela passa a ser sem favoritos
    irisflow_clinical_data_p3: '{"C":1}',
    irisflow_lang: 'en',
    ...deste,
  };

  it('troca só os dados daquele paciente: histórico, vocabulário e a linha dele na lista; o resto do computador não muda', async () => {
    semear(dePaciente);
    const { deps } = ambiente();

    const resumo = await restaurarBackup(umBackup(doBackup), { perfil: 'p1' }, deps);

    const depois = guardado();
    expect(depois.irisflow_clinical_data_p1).toBe('{"A":1}');
    expect(depois['irisflow.assistente.v1.p1']).toBe('{"vocab":"da Ana"}');
    expect('irisflow_favorites_p1' in depois).toBe(false);
    // A linha da Ana é a do backup, no mesmo lugar; a da Carla não mudou; o Bruno NÃO entrou.
    expect(JSON.parse(depois.irisflow_profiles)).toEqual([
      { id: 'p1', name: 'Ana', age: 61, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p3', name: 'Carla', createdAt: '2026-03-01T00:00:00.000Z' },
    ]);
    expect('irisflow_clinical_data_p2' in depois).toBe(false);
    // Nada do resto foi tocado:
    for (const k of ['irisflow_settings', 'irisflow_clinical_data_p3', 'irisflow_lang', 'irisflow_auth', ...Object.keys(deste)]) {
      expect(depois[k], k).toBe((dePaciente as Record<string, string>)[k]);
    }
    expect(resumo).toMatchObject({ modo: 'paciente', paciente: { id: 'p1', nome: 'Ana' } });
    expect(resumo.pacienteDesmarcado).toBeUndefined();
  });

  it('paciente que ainda não existe neste computador: a linha dele entra no fim da lista', async () => {
    semear(dePaciente);
    const { deps } = ambiente();

    await restaurarBackup(umBackup(doBackup), { perfil: 'p2' }, deps);

    expect(JSON.parse(guardado().irisflow_profiles).map((p: { id: string }) => p.id)).toEqual(['p1', 'p3', 'p2']);
    expect(guardado().irisflow_clinical_data_p2).toBe('{"B":1}');
    expect(guardado().irisflow_favorites_p2).toBe('["do Bruno"]');
  });

  it('computador com a lista de pacientes ilegível: a lista recomeça só com o paciente restaurado (a antiga continua na cópia de segurança)', async () => {
    semear({ ...dePaciente, irisflow_profiles: 'isto não é JSON' });
    const { deps, copias } = ambiente();

    await restaurarBackup(umBackup(doBackup), { perfil: 'p1' }, deps);

    expect(JSON.parse(guardado().irisflow_profiles)).toEqual([{ id: 'p1', name: 'Ana', age: 61, createdAt: '2026-01-01T00:00:00.000Z' }]);
    expect(JSON.parse(copias[0]).chaves.irisflow_profiles).toBe('isto não é JSON');
  });

  it('as gravações da voz vão com o recorte daquele paciente', async () => {
    semear(dePaciente);
    const ponte = ponteFalsaDoBackup();
    const { deps } = ambiente({ ponteDaVoz: ponte });

    await restaurarBackup(umBackup(doBackup, [{ nome: `${ID_A}.wav`, base64: 'AAEC' }]), { perfil: 'p1' }, deps);

    expect(ponte.restauracoes[0].opcoes).toEqual({ perfil: 'p1' });
  });

  it('se o paciente restaurado é o que está escolhido, a escolha volta: o app não pode seguir com a cópia velha dele na memória', async () => {
    semear({ ...dePaciente, irisflow_auth: JSON.stringify({ currentProfile: { id: 'p1', name: 'Ana (nome antigo)' } }) });
    const { deps } = ambiente();

    const resumo = await restaurarBackup(umBackup(doBackup), { perfil: 'p1' }, deps);

    expect(JSON.parse(guardado().irisflow_auth)).toEqual({ currentProfile: null });
    expect(resumo.pacienteDesmarcado).toBe(true);
  });
});

// ----------------------------------------------------------------------------

describe('restaurarBackup — a cópia de segurança do que havia antes', () => {
  it('guarda o estado de ANTES (só o da pessoa, sem a licença nem a calibração), num backup que o app consegue restaurar', async () => {
    semear({ ...daqui, ...deste });
    const { deps, copias } = ambiente();

    await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(copias).toHaveLength(1);
    const copia = validarBackup(JSON.parse(copias[0]));
    expect(copia.ok).toBe(true);
    expect(copia.ok && copia.backup.chaves).toEqual(daqui); // exatamente o de antes: sem `deste`, sem nada do backup
    expect(copia.ok && copia.backup.arquivosDaVoz).toBeUndefined(); // a restauração só SOMA voz: nada dela se perde
  });

  it('o vocabulário que o assistente ainda não tinha gravado (a gravação é adiada) também entra na cópia', async () => {
    definirPerfilDoAssistente('p3');
    registrarFala('frase ainda só na memória');
    const { deps, copias } = ambiente();

    await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(copias[0]).toContain('frase ainda só na memória');
  });

  // O plano do que sai é calculado olhando o `localStorage`. O vocabulário que o assistente ainda só tem na memória
  // só chega lá quando `descarregar()` o grava; se o plano fosse feito ANTES disso, esse modelo entraria na cópia mas
  // ficaria de fora da remoção, e sobraria depois do "Tudo" (ou do "Só um paciente") — vocabulário de outra pessoa
  // misturado com o do backup (correção da rodada 1, 21/10/2026).
  it('"Tudo": o vocabulário que o assistente só tinha na memória sai com o resto do que o backup não tem — e fica na cópia', async () => {
    semear(daqui); // nada do assistente gravado ainda
    definirPerfilDoAssistente('p3');
    registrarFala('frase de antes, só na memória');
    expect(localStorage.getItem(chaveDoModeloDoPerfil('p3'))).toBeNull(); // é isto que o plano via antes da correção
    const { deps, copias } = ambiente();

    const resumo = await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(localStorage.getItem(chaveDoModeloDoPerfil('p3'))).toBeNull();
    expect(copias[0]).toContain('frase de antes, só na memória');
    // O histórico e os lembretes de antes + o vocabulário.
    expect(resumo.chavesRemovidas).toBe(3);
  });

  it('"Só um paciente": o vocabulário dele que só estava na memória também é trocado pelo do backup (aqui, nenhum)', async () => {
    semear({ ...daqui, irisflow_profiles: JSON.stringify([{ id: 'p1', name: 'Ana (antes)' }]) });
    definirPerfilDoAssistente('p1');
    registrarFala('frase antiga da Ana, só na memória');
    const { [chaveDoModeloDoPerfil('p1')]: _doBackup, ...semVocabularioDaAna } = doBackup as Record<string, string>;
    const { deps, copias } = ambiente();

    await restaurarBackup(umBackup(semVocabularioDaAna), { perfil: 'p1' }, deps);

    expect(localStorage.getItem(chaveDoModeloDoPerfil('p1'))).toBeNull();
    expect(copias[0]).toContain('frase antiga da Ana, só na memória');
  });

  it('no navegador (sem pasta do app) a cópia é BAIXADA, com a hora no nome, e o resumo diz isso', async () => {
    semear(daqui);
    const baixados: { nome: string; texto: string }[] = [];
    const { deps } = ambiente({ guardarCopia: null, baixarCopia: (nome: string, texto: string) => { baixados.push({ nome, texto }); } });

    const resumo = await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(baixados).toHaveLength(1);
    expect(baixados[0].nome).toMatch(/^irisflow-copia-de-seguranca-\d{4}-\d{2}-\d{2}-\d{4}\.json$/); // data e hora de AQUI: o dia depende do fuso de quem roda
    expect(JSON.parse(baixados[0].texto).chaves).toEqual(daqui);
    expect(resumo.copia).toEqual({ onde: 'download', nome: baixados[0].nome });
  });

  it('no aplicativo instalado o resumo diz onde a cópia ficou', async () => {
    const { deps } = ambiente();

    const resumo = await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(resumo.copia).toEqual({ onde: 'pasta-do-app', nome: 'copia-de-seguranca-2026-10-21T15-00-00Z-01.json', pasta: '/dados/copias-de-seguranca' });
  });

  it('o navegador não conseguiu baixar a cópia: nada é restaurado', async () => {
    semear(daqui);
    const antes = guardado();
    const { deps, recarga } = ambiente({ guardarCopia: null, baixarCopia: () => { throw new Error('bloqueado'); } });

    const falha = await restaurarBackup(umBackup(doBackup), {}, deps).catch((e: unknown) => e);

    expect(falha).toMatchObject({ codigo: 'copia-falhou' });
    expect(guardado()).toEqual(antes);
    expect(recarga.vezes).toBe(0);
  });
});

// ----------------------------------------------------------------------------

// O computador que precisa se recuperar é justamente o que pode estar com as configurações estragadas (o valor fica
// truncado quando a calibração estoura a cota; o app o descarta e usa os padrões). Ele tem de conseguir restaurar —
// e a mensagem não pode culpar o arquivo (correção da rodada 1, 21/10/2026).
describe('restaurarBackup — computador com as configurações ilegíveis', () => {
  const ESTRAGADAS: [string, string][] = [
    ['truncadas', '{"dwellMs": 900, "theme": "dar'],
    ['vazias', ''],
    ['uma lista', '[]'],
  ];
  const semConfiguracoes = (() => { const { irisflow_settings: _fora, ...resto } = daqui; return resto; })();

  it.each(ESTRAGADAS)('configurações %s: a restauração completa acontece, com a cópia de segurança do resto', async (_nome, estragada) => {
    semear({ ...daqui, ...deste, irisflow_settings: estragada });
    const { deps, copias, recarga } = ambiente();

    const resumo = await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(recarga.vezes).toBe(1);
    expect(resumo).toMatchObject({ modo: 'completo', chavesGravadas: 8 });
    // A cópia tem tudo o que dava para guardar, e passa na conferência de quem a restaurar um dia.
    expect(copias).toHaveLength(1);
    const copia = validarBackup(JSON.parse(copias[0]));
    expect(copia.ok && copia.backup.chaves).toEqual(semConfiguracoes);
    // As configurações passam a ser as do backup, sem os campos da câmera e da tela do outro computador (valem os padrões).
    expect(JSON.parse(localStorage.getItem('irisflow_settings') as string)).toEqual({ schemaVersion: 1, dwellMs: 1800, soundEnabled: false });
    expect(localStorage.getItem('irisflow_profiles')).toBe(doBackup.irisflow_profiles);
  });

  it('restaurar só um paciente também funciona, e não mexe nas configurações estragadas (o app já as ignora)', async () => {
    semear({ ...daqui, ...deste, irisflow_settings: '{"dwellMs": 900, "theme": "dar' });
    const { deps, copias } = ambiente();

    const resumo = await restaurarBackup(umBackup(doBackup), { perfil: 'p1' }, deps);

    expect(resumo).toMatchObject({ modo: 'paciente', paciente: { id: 'p1', nome: 'Ana' } });
    expect(copias).toHaveLength(1);
    expect(localStorage.getItem('irisflow_clinical_data_p1')).toBe('{"A":1}');
    expect(localStorage.getItem('irisflow_settings')).toBe('{"dwellMs": 900, "theme": "dar');
  });

  it('o mesmo computador consegue SALVAR um backup (o ciclo de recuperação começa por salvar)', async () => {
    semear({ ...daqui, ...deste, irisflow_settings: '{"dwellMs": 900, "theme": "dar' });

    const b = await montarBackup({}, { ponteDaVoz: null, agora: () => AGORA, versaoDoApp: async () => '2.5.0' });

    expect(b.chaves).toEqual(semConfiguracoes);
  });
});

// ----------------------------------------------------------------------------

describe('restaurarBackup — se a gravação falha no meio, volta tudo como estava', () => {
  it('cota estourada na quarta chave: o armazenamento fica idêntico ao de antes e a página NÃO recarrega', async () => {
    const armazenamento = armazenamentoQueFalha({ ...daqui, ...deste }, { naGravacaoDe: 'irisflow_clinical_data_p2' });
    const antes = new Map(armazenamento.dados);
    const { deps, recarga } = ambiente({ armazenamento });

    const falha = await restaurarBackup(umBackup(doBackup), {}, deps).catch((e: unknown) => e);

    expect(falha).toBeInstanceOf(ErroDeBackup);
    expect(falha).toMatchObject({ codigo: 'armazenamento', message: expect.stringMatching(/O que havia antes foi mantido/) });
    expect(armazenamento.dados).toEqual(antes);
    expect(recarga.vezes).toBe(0);
    expect(sessionStorage.getItem(CHAVE_DO_RESUMO_DA_RESTAURACAO)).toBeNull();
  });

  it('se nem desfazer funciona (o disco morreu), a mensagem manda procurar a cópia de segurança', async () => {
    const armazenamento = armazenamentoQueFalha({ ...daqui, ...deste }, { naGravacaoDe: 'irisflow_clinical_data_p2', depoisDaFalhaTudoFalha: true });
    const { deps } = ambiente({ armazenamento });

    const falha = await restaurarBackup(umBackup(doBackup), {}, deps).catch((e: unknown) => e);

    expect(falha).toMatchObject({ codigo: 'armazenamento', message: expect.stringMatching(/nem tudo pôde ser desfeito.*copia-de-seguranca-2026-10-21T15-00-00Z-01\.json/) });
  });
});

// ----------------------------------------------------------------------------

describe('restaurarBackup — a recarga', () => {
  it('guarda o recado ANTES de recarregar (o aviso aparece depois da recarga), e recarrega uma vez só', async () => {
    const { deps, recarga } = ambiente();

    const resumo = await restaurarBackup(umBackup(doBackup), {}, deps);

    expect(recarga.vezes).toBe(1);
    expect(JSON.parse(recarga.resumoNaHora as string)).toEqual(resumo);
    expect(lerResumoDaRestauracao()).toEqual(resumo);
    expect(resumo).toMatchObject({ restauradoEm: '2026-10-21T15:00:00.000Z', backupCriadoEm: '2026-10-20T09:00:00.000Z' });
  });

  it('o vocabulário do assistente que a janela tem na memória NÃO desfaz a restauração quando a página fecha para recarregar', async () => {
    semear({ ...daqui });
    definirPerfilDoAssistente('p1');
    registrarFala('frase de antes da restauração');
    const { deps } = ambiente();
    const modeloDoBackup = JSON.stringify({ versao: 1, palavras: {}, bigramas: {}, frases: { 'frase do backup': { texto: 'frase do backup', n: 1, em: 1 } }, respostas: {} });

    await restaurarBackup(umBackup({ ...doBackup, [chaveDoModeloDoPerfil('p1')]: modeloDoBackup }), {}, deps);
    descarregar(); // o `pagehide` da recarga

    expect(localStorage.getItem(chaveDoModeloDoPerfil('p1'))).toBe(modeloDoBackup);
    expect(localStorage.getItem(CHAVE_DO_MODELO)).toBeNull();
  });
});
