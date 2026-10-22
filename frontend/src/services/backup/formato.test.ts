import { describe, it, expect, vi } from 'vitest';
import { LIMITES_DO_BACKUP_DA_VOZ } from '@tracker/voz/vozGuardada';
import { TAMANHO_MAXIMO_DO_BACKUP_BYTES } from '@tracker/backup/protocolo';
import { paraBase64 } from './base64';
import {
  BYTES_DA_SOMA_NO_ARQUIVO, chavesIgnoradasDoBackup, conferirSoma, serializarBackup, somaDoConteudo, validarBackup, type BackupV1,
} from './formato';

// -----------------------------------------------------------------------------
// O formato do arquivo de backup e a barreira de entrada (rodada 3, 21/10/2026).
//
// `validarBackup` é o que impede um arquivo estragado — ou mexido à mão — de
// escrever no armazenamento. Recusar é a resposta certa para o que não é um
// backup deste app e para uma versão que não se sabe ler. Uma chave do IrisFlow
// que a restauração não toca (a licença, o modo apresentação, a sessão…) não
// recusa o arquivo: é IGNORADA e contada, e nunca chega ao armazenamento — um
// backup editado não liga o modo apresentação (que descarta todos os pedidos de
// socorro) nem troca a licença do computador. Recusar o arquivo inteiro por ela
// deixaria irrestaurável todo backup antigo cada vez que a lista de fora crescesse
// (rodada 1, 21/10/2026).
// -----------------------------------------------------------------------------

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

const valido = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  formato: 'irisflow-backup',
  versao: 1,
  criadoEm: '2026-10-21T08:00:00.000Z',
  app: '1.2.3',
  chaves: {
    irisflow_settings: JSON.stringify({ dwellMs: 1500, theme: 'dark' }),
    irisflow_profiles: JSON.stringify([{ id: 'p1', name: 'Ana', createdAt: '2026-01-01T00:00:00Z' }]),
  },
  ...extra,
});

const recusa = (x: unknown) => {
  const r = validarBackup(x);
  if (r.ok) throw new Error(`devia recusar: ${JSON.stringify(x).slice(0, 120)}`);
  return r.motivo;
};

describe('o que é aceito', () => {
  it('um backup só de chaves, e devolve o mesmo conteúdo', () => {
    const entrada = valido();
    const r = validarBackup(entrada);
    expect(r.ok).toBe(true);
    expect(r.ok && r.backup).toEqual(entrada);
  });

  it('um backup com a voz: o índice, o termo e os áudios, em base64', () => {
    const audio = paraBase64(new Uint8Array(100));
    const entrada = valido({
      arquivosDaVoz: [
        { nome: 'indice.json', base64: paraBase64(new TextEncoder().encode('{"versao":1,"gravacoes":[]}')) },
        { nome: 'consentimento.json', base64: paraBase64(new TextEncoder().encode('{"versao":2,"consentimentos":[]}')) },
        { nome: `${ID1}.wav`, base64: audio },
        { nome: `${ID2}.wav`, base64: audio },
      ],
    });
    const r = validarBackup(entrada);
    expect(r.ok && r.backup.arquivosDaVoz?.map((a) => a.nome)).toEqual(['indice.json', 'consentimento.json', `${ID1}.wav`, `${ID2}.wav`]);
  });

  it('campo solto no topo do arquivo não passa adiante — o resto do app só vê o que o formato define', () => {
    const r = validarBackup(valido({ extra: 'lixo', arquivosDaVoz: undefined, __proto__x: 1 }));
    expect(r.ok).toBe(true);
    expect(r.ok && Object.keys(r.backup).sort()).toEqual(['app', 'chaves', 'criadoEm', 'formato', 'versao']);
  });

  it('não mexe no que recebeu', () => {
    const entrada = valido({ arquivosDaVoz: [{ nome: `${ID1}.wav`, base64: 'AAAA' }] });
    const antes = JSON.stringify(entrada);
    validarBackup(entrada);
    expect(JSON.stringify(entrada)).toBe(antes);
  });
});

describe('o que não é um backup deste app', () => {
  it('não é um objeto: nada, texto, número, lista', () => {
    for (const x of [null, undefined, 42, 'texto', true, []]) {
      expect(recusa(x), String(x)).toMatch(/não é um backup do IrisFlow/);
    }
  });

  it('outro formato (ou nenhum)', () => {
    expect(recusa({ formato: 'outro-programa', versao: 1 })).toMatch(/não é um backup do IrisFlow/);
    expect(recusa({ qualquer: 'coisa' })).toMatch(/não é um backup do IrisFlow/);
    expect(recusa({ formato: 'IRISFLOW-BACKUP', versao: 1 })).toMatch(/não é um backup do IrisFlow/);
  });

  it('o backup ANTIGO (só as configurações, do botão que existia antes) tem mensagem própria — não se sabe de que paciente nem de que computador', () => {
    const antigo = { dwellMs: 1500, theme: 'dark', soundEnabled: true, voiceGender: 'female' };
    const motivo = recusa(antigo);
    expect(motivo).toMatch(/antigo/);
    expect(motivo).toMatch(/só as configurações/);
    expect(motivo).not.toMatch(/não é um backup do IrisFlow/);
    // O mesmo, gravado já com a versão do esquema das configurações.
    expect(recusa({ ...antigo, schemaVersion: 1 })).toMatch(/antigo/);
  });
});

describe('versão', () => {
  it('uma versão mais nova que esta: diz para atualizar o aplicativo, em vez de tentar ler pela metade', () => {
    const motivo = recusa(valido({ versao: 2 }));
    expect(motivo).toMatch(/mais nova/);
    expect(motivo).toMatch(/Atualize/);
    expect(recusa(valido({ versao: 17 }))).toMatch(/mais nova/);
  });

  it('versão que não existe: zero, negativa, quebrada, texto, ausente', () => {
    for (const versao of [0, -1, 1.5, '1', null, undefined, NaN, {}]) {
      expect(recusa(valido({ versao })), String(versao)).toMatch(/versão/);
    }
  });
});

describe('campos do cabeçalho', () => {
  it('a data de criação tem de ser uma data; a versão do app, um texto', () => {
    for (const criadoEm of [undefined, null, 42, '', 'ontem', '2026-13-45']) {
      expect(recusa(valido({ criadoEm })), String(criadoEm)).toMatch(/data/);
    }
    for (const app of [undefined, null, 42, {}]) {
      expect(recusa(valido({ app })), String(app)).toMatch(/versão do aplicativo/);
    }
  });
});

describe('as chaves', () => {
  it('têm de ser um objeto de textos', () => {
    for (const chaves of [undefined, null, [], 'x', 42]) {
      expect(recusa(valido({ chaves })), String(chaves)).toMatch(/dados/);
    }
    expect(recusa(valido({ chaves: { irisflow_settings: 42 } }))).toMatch(/irisflow_settings/);
    expect(recusa(valido({ chaves: { irisflow_lang: null } }))).toMatch(/irisflow_lang/);
    expect(recusa(valido({ chaves: { irisflow_lang: { a: 1 } } }))).toMatch(/irisflow_lang/);
  });

  const DE_FORA = ['irisflow.apresentacao', 'irisflow_license', 'irisflow.licenca', 'irisflow.supabase.session', 'irisflow.calib.profiles.v2', 'irisflow_device_id', 'irisflow.fila', 'irisflow_consent_clinical_data', 'irisflow_setup_p1'];

  it('chave do IrisFlow que a restauração não toca NÃO recusa o arquivo: o resto vale, e ela é contada como ignorada', () => {
    for (const chave of DE_FORA) {
      const r = validarBackup(valido({ chaves: { irisflow_settings: '{}', [chave]: 'x' } }));
      expect(r.ok, chave).toBe(true);
      expect(r.ok && chavesIgnoradasDoBackup(r.backup), chave).toEqual([chave]);
    }
  });

  it('um backup com várias chaves de fora conta cada uma; o que a restauração toca não entra na conta', () => {
    const r = validarBackup(valido({ chaves: { irisflow_settings: '{}', irisflow_lang: 'pt-BR', 'irisflow.apresentacao': '{"ate":1}', irisflow_license: 'x', 'irisflow.sb.token': 'y' } }));

    expect(r.ok && chavesIgnoradasDoBackup(r.backup)).toEqual(['irisflow.apresentacao', 'irisflow_license', 'irisflow.sb.token']);
  });

  it('um backup que só traz o que a restauração toca não tem nada ignorado', () => {
    const r = validarBackup(valido());

    expect(r.ok && chavesIgnoradasDoBackup(r.backup)).toEqual([]);
  });

  it('o valor de uma chave ignorada continua tendo de ser texto: número ou objeto ali é arquivo estragado, não "ignorável"', () => {
    for (const valor of [42, null, { a: 1 }, ['x']]) {
      expect(recusa(valido({ chaves: { irisflow_settings: '{}', 'irisflow.apresentacao': valor } })), JSON.stringify(valor)).toContain('irisflow.apresentacao');
    }
  });

  it('chave que nem é do IrisFlow: recusa — um arquivo feito por este aplicativo nunca a traz', () => {
    for (const chave of ['accuracyResult', 'i18nextLng', 'qualquer', '', 'IRISFLOW_settings', 'meu_irisflow_x', 'constructor', 'toString']) {
      expect(recusa(valido({ chaves: { irisflow_settings: '{}', [chave]: 'x' } })), JSON.stringify(chave)).toMatch(/não restaura/);
    }
  });

  it('as configurações têm de ser um objeto JSON — texto solto ali é arquivo estragado, não "configurações vazias"', () => {
    for (const irisflow_settings of ['isto não é JSON', '[]', '42', 'null', '']) {
      expect(recusa(valido({ chaves: { irisflow_settings } })), irisflow_settings).toMatch(/configurações/);
    }
  });
});

describe('a voz dentro do backup', () => {
  const comVoz = (arquivosDaVoz: unknown) => valido({ arquivosDaVoz });

  it('tem de ser uma lista de { nome, base64 } — "nulo", zero, falso e texto vazio não passam por "sem voz"', () => {
    for (const x of ['x', 42, {}, [null], [42], ['texto'], [{}], [{ nome: `${ID1}.wav` }], [{ base64: 'AAAA' }], null, 0, false, '']) {
      expect(recusa(comVoz(x)), JSON.stringify(x)).toMatch(/gravações/);
    }
  });

  it('cada arquivo da voz sai só com { nome, base64 }: campo solto dentro dele não passa adiante', () => {
    const r = validarBackup(comVoz([{ nome: `${ID1}.wav`, base64: 'AAAA', extra: 'lixo' }]));

    expect(r.ok && r.backup.arquivosDaVoz).toEqual([{ nome: `${ID1}.wav`, base64: 'AAAA' }]);
  });

  it('nome que não é da pasta da voz: caminho, solto, repetido', () => {
    const b64 = 'AAAA';
    for (const nome of ['../indice.json', '..\\x.wav', 'C:\\x.wav', 'estado.json', 'indice.json.bak', `${ID1}.WAV`, 'x.wav', '']) {
      expect(recusa(comVoz([{ nome, base64: b64 }])), JSON.stringify(nome)).toMatch(/gravações/);
    }
    expect(recusa(comVoz([{ nome: `${ID1}.wav`, base64: b64 }, { nome: `${ID1}.wav`, base64: b64 }]))).toMatch(/gravações/);
  });

  it('áudio que não é base64 de verdade: recusa (uma gravação estragada é voz perdida)', () => {
    for (const base64 of ['abc', '!!!!', 'AA=A', 'AAAA AAAA', 42, null]) {
      expect(recusa(comVoz([{ nome: `${ID1}.wav`, base64 }])), String(base64)).toMatch(/gravações/);
    }
  });

  it('mais áudio do que um arquivo de backup comporta: recusa, sem decodificar nada', () => {
    const limite = LIMITES_DO_BACKUP_DA_VOZ.bytesMax;
    // 4 caracteres de base64 por 3 bytes: o suficiente para passar de `limite` sem alocar o áudio todo.
    const quase = 'AAAA'.repeat(Math.ceil(limite / 3) + 1);
    const motivo = recusa(comVoz([{ nome: `${ID1}.wav`, base64: quase }]));
    expect(motivo).toMatch(/maior/);
  });

  it('a voz que ocupa exatamente o máximo cabe; três bytes a mais, não (o limite é "mais que", não "a partir de")', () => {
    const limite = LIMITES_DO_BACKUP_DA_VOZ.bytesMax;
    expect(limite % 3).toBe(0); // sem preenchimento: 3 bytes viram 4 letras
    const noLimite = 'A'.repeat((limite / 3) * 4);

    expect(validarBackup(comVoz([{ nome: `${ID1}.wav`, base64: noLimite }])).ok).toBe(true);
    expect(recusa(comVoz([{ nome: `${ID1}.wav`, base64: `${noLimite}AAAA` }]))).toMatch(/maior/);
    // Dois arquivos que, somados, passam do máximo: o limite é da voz inteira, não de cada arquivo.
    const metade = 'A'.repeat((limite / 6) * 4);
    expect(recusa(comVoz([{ nome: `${ID1}.wav`, base64: metade }, { nome: `${ID2}.wav`, base64: `${metade}AAAA` }]))).toMatch(/maior/);
  }, 30_000);

  it('o máximo de arquivos da pasta da voz (300 gravações, o índice e o termo) cabe; um a mais, não', () => {
    const gravacoes = (n: number) => Array.from({ length: n }, (_, i) => ({
      nome: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}.wav`,
      base64: 'AAAA',
    }));
    const fixos = [{ nome: 'indice.json', base64: 'e30=' }, { nome: 'consentimento.json', base64: 'e30=' }];

    expect(validarBackup(comVoz([...fixos, ...gravacoes(300)])).ok).toBe(true);
    expect(recusa(comVoz([...fixos, ...gravacoes(301)]))).toMatch(/gravações/);
  });

  it('mais arquivos do que a pasta da voz pode ter: recusa', () => {
    const muitos = Array.from({ length: 303 }, (_, i) => ({
      nome: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}.wav`,
      base64: 'AAAA',
    }));
    expect(recusa(comVoz(muitos))).toMatch(/gravações/);
  });
});

describe('nunca lança', () => {
  it('uma bateria de lixo vira recusa com motivo, não exceção', () => {
    const lixo: unknown[] = [
      { formato: 'irisflow-backup', versao: 1, criadoEm: '2026-10-21T00:00:00Z', app: 'x', chaves: Object.create(null) },
      { formato: 'irisflow-backup', versao: 1, criadoEm: '2026-10-21T00:00:00Z', app: 'x', chaves: { irisflow_settings: '{}' }, arquivosDaVoz: [{ nome: `${ID1}.wav`, base64: 'x'.repeat(1001) }] },
      new Date(), new Map(), () => 1, Symbol('x'),
    ];
    for (const x of lixo) expect(() => validarBackup(x)).not.toThrow();
  });
});

// -----------------------------------------------------------------------------
// A soma de verificação (rodada 1, 21/10/2026). Antes, um valor estragado que continuasse JSON válido (a lista de
// pacientes, por exemplo) passava no validador e, no "Tudo", trocava o dado bom. A soma SHA-256 do conteúdo é campo
// OPCIONAL: os backups já feitos não a têm e continuam válidos.
// -----------------------------------------------------------------------------

describe('a soma de verificação', () => {
  const SOMA_QUALQUER = 'a'.repeat(64);
  const conteudo = {
    chaves: { irisflow_settings: '{"dwellMs":1500}', irisflow_profiles: '[{"id":"p1","name":"Ana"}]' },
    arquivosDaVoz: [{ nome: `${ID1}.wav`, base64: 'AAEC' }, { nome: 'indice.json', base64: 'e30=' }],
  };
  const comSoma = async (extra: Partial<BackupV1> = {}): Promise<BackupV1> => {
    const b = { formato: 'irisflow-backup', versao: 1, criadoEm: '2026-10-21T08:00:00.000Z', app: '1.2.3', ...conteudo, ...extra } as BackupV1;
    return { ...b, soma: (await somaDoConteudo(b)) as string };
  };

  it('é o SHA-256 de verdade: 64 letras hexadecimais minúsculas, igual em duas chamadas', async () => {
    const soma = await somaDoConteudo(conteudo);

    expect(soma).toMatch(/^[0-9a-f]{64}$/);
    expect(await somaDoConteudo(conteudo)).toBe(soma);
  });

  it('bate com o SHA-256 calculado por fora, sobre o conteúdo na forma canônica (chaves e arquivos em ordem alfabética)', async () => {
    const canonico = JSON.stringify({
      chaves: [['irisflow_profiles', '[{"id":"p1","name":"Ana"}]'], ['irisflow_settings', '{"dwellMs":1500}']],
      voz: [[`${ID1}.wav`, 'AAEC'], ['indice.json', 'e30=']], // "1…" vem antes de "i…"
    });
    const esperado = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonico))), (n) => n.toString(16).padStart(2, '0')).join('');

    expect(await somaDoConteudo(conteudo)).toBe(esperado);
  });

  it('muda com QUALQUER diferença no conteúdo: um byte de valor, o nome de uma chave, um áudio, um arquivo a mais', async () => {
    const base = await somaDoConteudo(conteudo);
    const variacoes: Parameters<typeof somaDoConteudo>[0][] = [
      { ...conteudo, chaves: { ...conteudo.chaves, irisflow_settings: '{"dwellMs":1501}' } },
      { ...conteudo, chaves: { ...conteudo.chaves, irisflow_setting: '{"dwellMs":1500}' } },
      { ...conteudo, chaves: { ...conteudo.chaves, irisflow_lang: 'pt-BR' } },
      { ...conteudo, arquivosDaVoz: [{ nome: `${ID1}.wav`, base64: 'AAED' }, conteudo.arquivosDaVoz[1]] },
      { ...conteudo, arquivosDaVoz: [{ nome: `${ID2}.wav`, base64: 'AAEC' }, conteudo.arquivosDaVoz[1]] },
      { ...conteudo, arquivosDaVoz: [conteudo.arquivosDaVoz[0]] },
      { ...conteudo, arquivosDaVoz: undefined },
    ];
    for (const v of variacoes) expect(await somaDoConteudo(v), JSON.stringify(v).slice(0, 80)).not.toBe(base);
  });

  it('não depende da ordem em que as chaves e os arquivos aparecem no arquivo, nem do espaçamento do texto', async () => {
    const embaralhado = {
      chaves: { irisflow_profiles: conteudo.chaves.irisflow_profiles, irisflow_settings: conteudo.chaves.irisflow_settings },
      arquivosDaVoz: [...conteudo.arquivosDaVoz].reverse(),
    };

    expect(await somaDoConteudo(embaralhado)).toBe(await somaDoConteudo(conteudo));
  });

  it('não cobre o cabeçalho (data e versão do app): são só para mostrar', async () => {
    const a = await somaDoConteudo({ ...conteudo, criadoEm: '2020-01-01T00:00:00Z', app: '0.0.1' } as Parameters<typeof somaDoConteudo>[0]);

    expect(a).toBe(await somaDoConteudo(conteudo));
  });

  it('o campo é opcional: backup sem soma continua válido (os backups já feitos), e sai sem o campo', () => {
    const r = validarBackup(valido());

    expect(r.ok).toBe(true);
    expect(r.ok && 'soma' in r.backup).toBe(false);
  });

  it('com soma bem formada, o validador a mantém no backup; maiúsculas viram minúsculas', () => {
    expect(validarBackup(valido({ soma: SOMA_QUALQUER })).ok && (validarBackup(valido({ soma: SOMA_QUALQUER })) as { backup: BackupV1 }).backup.soma).toBe(SOMA_QUALQUER);
    const r = validarBackup(valido({ soma: 'ABCDEF0123456789'.repeat(4) }));
    expect(r.ok && r.backup.soma).toBe('abcdef0123456789'.repeat(4));
  });

  it('soma que não é uma soma (tamanho errado, letras fora do hexadecimal, não é texto, nula, vazia) é recusada: arquivo estragado', () => {
    for (const soma of ['abc', 'a'.repeat(63), 'a'.repeat(65), `${'a'.repeat(63)}g`, `${'a'.repeat(63)} `, '', null, 42, {}, [SOMA_QUALQUER]]) {
      expect(recusa(valido({ soma })), JSON.stringify(soma)).toMatch(/soma de verificação/);
    }
  });

  it('o campo "soma" ocupa um número FIXO de bytes no arquivo (é com essa conta que o limite de 50 MiB é conferido antes de calcular)', async () => {
    const sem = valido() as unknown as BackupV1;
    const com = { ...sem, soma: SOMA_QUALQUER };

    expect(serializarBackup(com).bytes - serializarBackup(sem).bytes).toBe(BYTES_DA_SOMA_NO_ARQUIVO);
  });

  describe('conferirSoma', () => {
    it('conteúdo que bate com a soma: ok', async () => {
      expect(await conferirSoma(await comSoma())).toEqual({ ok: true });
    });

    it('backup sem soma (feito antes dela): ok, sem conferir — não se recusa o que nunca teve como ser conferido', async () => {
      expect(await conferirSoma({ formato: 'irisflow-backup', versao: 1, criadoEm: '2026-10-21T08:00:00.000Z', app: '1', ...conteudo })).toEqual({ ok: true });
    });

    it('um valor mexido, MESMO que continue JSON válido, não bate: recusa dizendo que o arquivo foi alterado ou está estragado', async () => {
      const b = await comSoma();
      const mexido: BackupV1 = { ...b, chaves: { ...b.chaves, irisflow_profiles: '[]' } }; // a lista de pacientes esvaziada

      const r = await conferirSoma(mexido);

      expect(r.ok).toBe(false);
      expect(!r.ok && r.motivo).toMatch(/alterado ou está estragado/);
    });

    it('um áudio mexido, um arquivo da voz a mais ou a menos e uma chave a mais: nenhum passa', async () => {
      const b = await comSoma();
      const mexidos: BackupV1[] = [
        { ...b, arquivosDaVoz: [{ nome: `${ID1}.wav`, base64: 'AAED' }, b.arquivosDaVoz![1]] },
        { ...b, arquivosDaVoz: [b.arquivosDaVoz![0]] },
        { ...b, arquivosDaVoz: undefined },
        { ...b, chaves: { ...b.chaves, irisflow_lang: 'pt-BR' } },
        { ...b, chaves: { irisflow_settings: b.chaves.irisflow_settings } },
      ];
      for (const m of mexidos) expect((await conferirSoma(m)).ok, JSON.stringify(m).slice(0, 80)).toBe(false);
    });

    it('depois de ir e voltar pelo texto do arquivo (e reformatado, com as chaves em outra ordem), a soma ainda bate', async () => {
      const b = await comSoma();
      const reformatado = JSON.stringify({ app: b.app, soma: b.soma, chaves: Object.fromEntries(Object.entries(b.chaves).reverse()), arquivosDaVoz: [...b.arquivosDaVoz!].reverse(), versao: 1, formato: 'irisflow-backup', criadoEm: b.criadoEm }, null, 2);
      const lido = validarBackup(JSON.parse(reformatado));
      if (!lido.ok) throw new Error(lido.motivo);

      expect(await conferirSoma(lido.backup)).toEqual({ ok: true });
    });

    it('a soma cobre também as chaves que o app não restaura (o arquivo é conferido como está)', async () => {
      const b = await comSoma({ chaves: { ...conteudo.chaves, 'irisflow.apresentacao': '{"ate":1}' } });
      const lido = validarBackup(JSON.parse(serializarBackup(b).texto));
      if (!lido.ok) throw new Error(lido.motivo);

      expect(await conferirSoma(lido.backup)).toEqual({ ok: true });
      expect((await conferirSoma({ ...lido.backup, chaves: { ...lido.backup.chaves, 'irisflow.apresentacao': '{"ate":2}' } })).ok).toBe(false);
    });

    it('sem o recurso de criptografia da janela (página insegura), com soma no arquivo: recusa dizendo por quê — nunca "confere" sem conferir', async () => {
      const b = await comSoma();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(globalThis.crypto, 'subtle', 'get').mockReturnValue(undefined as unknown as SubtleCrypto);
      try {
        const r = await conferirSoma(b);

        expect(r.ok).toBe(false);
        expect(!r.ok && r.motivo).toMatch(/Não foi possível conferir se o arquivo está íntegro/);
        expect(console.warn).toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('o cálculo falhou (memória, janela fechando): recusa dizendo por quê, e avisa no log', async () => {
      const b = await comSoma();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new DOMException('sem memória', 'OperationError'));

      const r = await conferirSoma(b);

      expect(r.ok).toBe(false);
      expect(!r.ok && r.motivo).toMatch(/Não foi possível conferir se o arquivo está íntegro/);
      expect(console.warn).toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    it('sem o recurso de criptografia e SEM soma no arquivo, não há o que conferir: ok', async () => {
      vi.spyOn(globalThis.crypto, 'subtle', 'get').mockReturnValue(undefined as unknown as SubtleCrypto);
      try {
        expect(await conferirSoma({ formato: 'irisflow-backup', versao: 1, criadoEm: '2026-10-21T08:00:00.000Z', app: '1', ...conteudo })).toEqual({ ok: true });
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});

describe('serializarBackup', () => {
  it('devolve o texto do arquivo e o tamanho dele em BYTES (acento ocupa dois) — é o que se confere contra o limite', () => {
    const b = validarBackup(valido({ chaves: { irisflow_settings: JSON.stringify({ nome: 'ação ✓ 😀' }) } }));
    if (!b.ok) throw new Error(b.motivo);
    const { texto, bytes } = serializarBackup(b.backup);
    expect(bytes).toBe(new TextEncoder().encode(texto).byteLength);
    expect(bytes).toBeGreaterThan(texto.length);
  });

  it('o texto volta a ser o mesmo backup depois de lido e validado', () => {
    const entrada = valido({ arquivosDaVoz: [{ nome: `${ID2}.wav`, base64: paraBase64(new Uint8Array([1, 2, 3, 4, 5])) }] });
    const v = validarBackup(entrada);
    if (!v.ok) throw new Error(v.motivo);
    const volta = validarBackup(JSON.parse(serializarBackup(v.backup).texto));
    expect(volta.ok && volta.backup).toEqual(v.backup as BackupV1);
  });

  it('o limite do arquivo é o do protocolo (50 MiB)', () => {
    expect(TAMANHO_MAXIMO_DO_BACKUP_BYTES).toBe(50 * 1024 * 1024);
  });
});
