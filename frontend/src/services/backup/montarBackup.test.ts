import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { TAMANHO_MAXIMO_DO_BACKUP_BYTES } from '@tracker/backup/protocolo';
import { LIMITES_DO_BACKUP_DA_VOZ } from '@tracker/voz/vozGuardada';
import { ErroDeBackup } from './erro';
import { BYTES_DA_SOMA_NO_ARQUIVO, conferirSoma, serializarBackup, validarBackup } from './formato';
import { montarBackup } from './montarBackup';
import { bytesDoTexto, ID_A, ID_B, ponteFalsaDoBackup } from '../../test/vozDoBackup';

// -----------------------------------------------------------------------------
// Montar o backup (rodada 3, 21/10/2026): o arquivo que leva, para outro
// computador, tudo o que é da pessoa. O que se perde aqui se perde para sempre —
// uma gravação da própria voz, muitas vezes de quando ela ainda falava, não se
// grava de novo. Por isso: nada de backup "completo" que na verdade não é.
// -----------------------------------------------------------------------------

const AGORA = new Date('2026-10-21T12:34:56.789Z');
const base = { agora: () => AGORA, versaoDoApp: async () => '2.5.0', ponteDaVoz: null };

// As falhas daqui avisam no console (é o que se quer em produção); no teste, só poluem a saída.
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

/** Um `Storage` falso: sem a cota de 5 MB do jsdom, para os testes de tamanho. */
function armazenamentoFalso(dados: Record<string, string | null>, quebraEm?: string) {
  const nomes = Object.keys(dados);
  return {
    length: nomes.length,
    key: (i: number) => nomes[i] ?? null,
    getItem: (k: string) => {
      if (k === quebraEm) throw new DOMException('Acesso negado', 'SecurityError');
      return dados[k] ?? null;
    },
  };
}

describe('montarBackup — as chaves', () => {
  it('leva o que é da pessoa e deixa de fora o transitório, a conta e o que não é do app', async () => {
    const dentro = {
      irisflow_settings: '{"dwellMs":1800}',
      irisflow_profiles: '[{"id":"p1"}]',
      irisflow_clinical_data_p1: '{"x":1}',
      'irisflow.assistente.v1.p1': '{"palavras":{}}',
      'irisflow.chave.nova.de.outra.tarefa': '1', // entra por padrão: nenhuma tarefa nova fica de fora sem querer
    };
    const fora = {
      'irisflow.apresentacao': '{"ate":1}', // descartaria os pedidos de socorro
      irisflow_socorro_ativo: '1',
      'irisflow.fila': '[]',
      irisflow_license: 'segredo',
      'irisflow.supabase.session': 'token',
      outra_coisa: 'x',
    };
    for (const [k, v] of Object.entries({ ...dentro, ...fora })) localStorage.setItem(k, v);

    const b = await montarBackup({}, base);

    expect(b.chaves).toEqual(dentro);
  });

  it('o cabeçalho diz o formato, a versão, quando foi feito e por qual versão do aplicativo', async () => {
    const b = await montarBackup({}, base);

    expect(b).toMatchObject({ formato: 'irisflow-backup', versao: 1, criadoEm: '2026-10-21T12:34:56.789Z', app: '2.5.0' });
  });

  it('sem a versão injetada, usa a do aplicativo (fora do app instalado: "dev")', async () => {
    const b = await montarBackup({}, { ponteDaVoz: null });

    expect(b.app).toBe('dev');
  });

  it('o que sai daqui passa pelo validador, depois de ir e voltar pelo texto do arquivo, e volta igual', async () => {
    localStorage.setItem('irisflow_settings', '{"dwellMs":1800,"nome":"João — ação"}');
    localStorage.setItem('irisflow_profiles', '[]');
    const ponte = ponteFalsaDoBackup({ 'indice.json': bytesDoTexto('{}'), [`${ID_A}.wav`]: new Uint8Array([72, 101, 108, 108, 111]) });

    const b = await montarBackup({}, { ...base, ponteDaVoz: ponte });

    // Um campo que o montar escreve e o validar recusa faria o aplicativo gerar backups que ele mesmo não abre.
    expect(validarBackup(JSON.parse(serializarBackup(b).texto))).toEqual({ ok: true, backup: b });
  });

  it('as chaves saem em ordem alfabética, seja qual for a ordem do armazenamento: o mesmo estado dá sempre o mesmo arquivo', async () => {
    const armazenamento = armazenamentoFalso({ irisflow_z: '3', irisflow_a: '1', irisflow_m: '2', 'irisflow.b': '0' });

    const b = await montarBackup({}, { ...base, armazenamento });

    expect(Object.keys(b.chaves)).toEqual(['irisflow.b', 'irisflow_a', 'irisflow_m', 'irisflow_z']);
  });

  it('um valor que sumiu entre listar a chave e ler o valor não vira null no arquivo', async () => {
    const armazenamento = armazenamentoFalso({ irisflow_settings: '{}', irisflow_profiles: null });

    const b = await montarBackup({}, { ...base, armazenamento });

    // `null` no arquivo: o validador recusaria o backup que o próprio aplicativo acabou de fazer.
    expect(b.chaves).toEqual({ irisflow_settings: '{}' });
  });

  it('se o navegador nega a leitura, recusa dizendo o motivo — não entrega um backup pela metade', async () => {
    const armazenamento = armazenamentoFalso({ irisflow_settings: '{}', irisflow_profiles: '[]' }, 'irisflow_profiles');

    const falha = await montarBackup({}, { ...base, armazenamento }).catch((e: unknown) => e);

    expect(falha).toBeInstanceOf(ErroDeBackup);
    expect(falha).toMatchObject({ codigo: 'armazenamento', message: expect.stringMatching(/dados guardados/) });
  });
});

// As configurações deste computador podem estar estragadas: o próprio app documenta (SettingsContext) que o valor
// fica truncado quando os perfis de calibração estouram a cota, e que ele o descarta e segue com os padrões.
// O backup tem de fazer o mesmo — senão quem está com o armazenamento danificado, que é justamente quem mais
// precisa salvar e restaurar, não consegue nenhum dos dois (correção da rodada 1, 21/10/2026).
describe('montarBackup — configurações deste computador ilegíveis', () => {
  const ESTRAGADAS: [string, string][] = [
    ['truncadas', '{"dwellMs": 900, "theme": "dar'],
    ['vazias', ''],
    ['uma lista', '[]'],
    ['um número', '42'],
    ['null', 'null'],
    ['um texto', '"oi"'],
  ];
  const PACIENTES = '[{"id":"p1","name":"Ana"}]';

  it.each(ESTRAGADAS)('configurações %s: o backup sai com o resto dos dados, só sem elas', async (_nome, estragada) => {
    localStorage.setItem('irisflow_settings', estragada);
    localStorage.setItem('irisflow_profiles', PACIENTES);
    localStorage.setItem('irisflow_clinical_data_p1', '{"x":1}');

    const b = await montarBackup({}, base);

    expect(b.chaves).toEqual({ irisflow_profiles: PACIENTES, irisflow_clinical_data_p1: '{"x":1}' });
    // E o arquivo que sai passa na conferência de quem vai restaurá-lo.
    expect(validarBackup(JSON.parse(serializarBackup(b).texto)).ok).toBe(true);
  });

  it('avisa no log o que deixou de fora e por quê (não é uma falha do arquivo)', async () => {
    localStorage.setItem('irisflow_settings', '{"dwellMs": 900, "theme": "dar');

    await montarBackup({}, base);

    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/irisflow_settings.*ilegível/), expect.anything());
  });

  it('configurações legíveis continuam indo, inclusive o objeto vazio', async () => {
    for (const legivel of ['{}', '{"dwellMs":1800,"theme":"dark"}']) {
      localStorage.setItem('irisflow_settings', legivel);

      const b = await montarBackup({}, base);

      expect(b.chaves.irisflow_settings, legivel).toBe(legivel);
    }
  });

  it('o que é de OUTRA chave e não é objeto JSON não é mexido: só as configurações têm essa regra', async () => {
    localStorage.setItem('irisflow_settings', '{"dwellMs":1800}');
    localStorage.setItem('irisflow_lang', 'pt-BR'); // texto puro, nunca foi JSON
    localStorage.setItem('irisflow_leituras', 'isto não é JSON');

    const b = await montarBackup({}, base);

    expect(b.chaves).toEqual({ irisflow_settings: '{"dwellMs":1800}', irisflow_lang: 'pt-BR', irisflow_leituras: 'isto não é JSON' });
  });
});

// A soma de verificação (rodada 1, 21/10/2026): o arquivo leva o SHA-256 do conteúdo; quem restaura confere antes de escrever.
describe('montarBackup — a soma de verificação', () => {
  it('o backup sai com a soma do conteúdo (chaves e voz), e ela confere depois de ir e voltar pelo texto do arquivo', async () => {
    localStorage.setItem('irisflow_settings', '{"dwellMs":1800}');
    localStorage.setItem('irisflow_profiles', '[{"id":"p1","name":"Ana"}]');
    const ponte = ponteFalsaDoBackup({ 'indice.json': bytesDoTexto('{}'), [`${ID_A}.wav`]: new Uint8Array([72, 101, 108, 108, 111]) });

    const b = await montarBackup({}, { ...base, ponteDaVoz: ponte });

    expect(b.soma).toMatch(/^[0-9a-f]{64}$/);
    const lido = validarBackup(JSON.parse(serializarBackup(b).texto));
    if (!lido.ok) throw new Error(lido.motivo);
    expect(await conferirSoma(lido.backup)).toEqual({ ok: true });
  });

  it('a soma é o ÚLTIMO campo do arquivo (é com essa posição que o limite de tamanho conta o espaço dela)', async () => {
    const b = await montarBackup({}, { ...base, ponteDaVoz: ponteFalsaDoBackup({ 'indice.json': bytesDoTexto('{}') }) });

    expect(Object.keys(b).at(-1)).toBe('soma');
    expect(serializarBackup(b).texto).toMatch(/,"soma":"[0-9a-f]{64}"\}$/);
  });

  it('dois backups do mesmo estado têm a mesma soma; um byte de diferença, outra', async () => {
    localStorage.setItem('irisflow_leituras', 'a');
    const um = await montarBackup({}, base);
    const outro = await montarBackup({}, base);
    localStorage.setItem('irisflow_leituras', 'b');
    const diferente = await montarBackup({}, base);

    expect(outro.soma).toBe(um.soma);
    expect(diferente.soma).not.toBe(um.soma);
  });

  it('a soma ocupa o espaço previsto: o arquivo tem exatamente BYTES_DA_SOMA_NO_ARQUIVO a mais do que o mesmo backup sem ela', async () => {
    const b = await montarBackup({}, base);
    const { soma: _soma, ...semSoma } = b;

    expect(serializarBackup(b).bytes - serializarBackup(semSoma).bytes).toBe(BYTES_DA_SOMA_NO_ARQUIVO);
  });

  it('sem o recurso de criptografia na janela, o backup sai SEM a soma (o campo é opcional) e avisa no log — não deixa de ser feito', async () => {
    localStorage.setItem('irisflow_settings', '{}');
    vi.spyOn(globalThis.crypto, 'subtle', 'get').mockReturnValue(undefined as unknown as SubtleCrypto);

    const b = await montarBackup({}, base);

    expect('soma' in b).toBe(false);
    expect(b.chaves).toEqual({ irisflow_settings: '{}' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/soma de verificação/), expect.anything());
    expect(validarBackup(JSON.parse(serializarBackup(b).texto)).ok).toBe(true);
  });

  it('o cálculo da soma falhou: o mesmo — o backup sai sem ela, e o log diz o que houve', async () => {
    localStorage.setItem('irisflow_settings', '{}');
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new DOMException('sem memória', 'OperationError'));

    const b = await montarBackup({}, base);

    expect('soma' in b).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/soma de verificação/), expect.anything());
  });
});

describe('montarBackup — a voz guardada', () => {
  it('leva o índice, as gravações e os termos em base64, com os mesmos nomes que têm na pasta do app', async () => {
    const ponte = ponteFalsaDoBackup({
      'indice.json': bytesDoTexto('{}'), // base64 de "{}"
      [`${ID_A}.wav`]: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
      [`${ID_B}.wav`]: new Uint8Array([0, 1, 2]),
      'consentimento.json': bytesDoTexto('[]'), // base64 de "[]"
    });

    const b = await montarBackup({}, { ...base, ponteDaVoz: ponte });

    expect(b.arquivosDaVoz).toEqual([
      { nome: 'indice.json', base64: 'e30=' },
      { nome: `${ID_A}.wav`, base64: 'SGVsbG8=' },
      { nome: `${ID_B}.wav`, base64: 'AAEC' },
      { nome: 'consentimento.json', base64: 'W10=' },
    ]);
  });

  it('quem não gravou a voz tem um backup sem o campo da voz', async () => {
    const b = await montarBackup({}, { ...base, ponteDaVoz: ponteFalsaDoBackup({}) });

    expect('arquivosDaVoz' in b).toBe(false);
  });

  it('fora do aplicativo instalado (sem a ponte), o backup sai sem a voz e sem falhar', async () => {
    localStorage.setItem('irisflow_settings', '{}');

    const b = await montarBackup({}, { ...base, ponteDaVoz: null });

    expect(b.chaves).toEqual({ irisflow_settings: '{}' });
    expect('arquivosDaVoz' in b).toBe(false);
  });

  it('"sem a voz" (comVoz: false) não leva a voz mesmo que ela exista — e nem chega a ler os áudios', async () => {
    const ponte = ponteFalsaDoBackup({ [`${ID_A}.wav`]: new Uint8Array([1, 2, 3]) });

    const b = await montarBackup({ comVoz: false }, { ...base, ponteDaVoz: ponte });

    expect('arquivosDaVoz' in b).toBe(false);
    expect(ponte.lidos).toEqual([]);
  });

  it('se as gravações não puderem ser lidas agora, RECUSA — um backup sem a voz entregue como completo seria perda em silêncio', async () => {
    const ponte = ponteFalsaDoBackup({}, {
      backupListar: async () => ({ ok: false, erro: 'Não foi possível ler as gravações agora. Tente de novo em instantes.' }),
    });

    const falha = await montarBackup({}, { ...base, ponteDaVoz: ponte }).catch((e: unknown) => e);

    expect(falha).toBeInstanceOf(ErroDeBackup);
    expect(falha).toMatchObject({ codigo: 'voz-ilegivel', message: expect.stringMatching(/gravações/) });
  });

  it('um IPC que rejeita (janela recarregando, aplicativo ocupado) também vira recusa com motivo', async () => {
    const ponte = ponteFalsaDoBackup({}, { backupListar: async () => { throw new Error('Object has been destroyed'); } });

    const falha = await montarBackup({}, { ...base, ponteDaVoz: ponte }).catch((e: unknown) => e);

    expect(falha).toMatchObject({ codigo: 'voz-ilegivel', message: expect.stringMatching(/falar com o aplicativo/) });
  });

  it('um áudio que não abre recusa o backup inteiro, em vez de seguir sem ele', async () => {
    const ponte = ponteFalsaDoBackup({ [`${ID_A}.wav`]: new Uint8Array([1, 2, 3]) }, {
      backupLer: async () => ({ ok: false, erro: 'Esta gravação não está mais neste computador.' }),
    });

    const falha = await montarBackup({}, { ...base, ponteDaVoz: ponte }).catch((e: unknown) => e);

    expect(falha).toMatchObject({ codigo: 'voz-ilegivel', message: expect.stringMatching(/não está mais neste computador/) });
  });

  it('bytes que não são bytes (texto, número) recusam — nunca viram um áudio de zeros ou vazio', async () => {
    for (const estranho of ['SGVsbG8=', 3, null]) {
      const ponte = ponteFalsaDoBackup({ [`${ID_A}.wav`]: new Uint8Array([1, 2, 3]) }, {
        backupLer: async () => ({ ok: true, bytes: estranho as unknown as ArrayBuffer }),
      });

      const falha = await montarBackup({}, { ...base, ponteDaVoz: ponte }).catch((e: unknown) => e);

      expect(falha, String(estranho)).toMatchObject({ codigo: 'voz-ilegivel' });
    }
  });

  it('se um arquivo mudou de tamanho entre listar e ler (gravaram uma voz agora), recusa e pede para tentar de novo', async () => {
    const ponte = ponteFalsaDoBackup({ [`${ID_A}.wav`]: new Uint8Array([1, 2, 3, 4, 5]) }, {
      backupLer: async () => ({ ok: true, bytes: new Uint8Array([1, 2, 3, 4]).buffer }),
    });

    const falha = await montarBackup({}, { ...base, ponteDaVoz: ponte }).catch((e: unknown) => e);

    expect(falha).toMatchObject({ codigo: 'voz-ilegivel', message: expect.stringMatching(/mudaram.*Tente de novo/) });
  });

  it('a voz que passa do limite recusa ANTES de ler qualquer áudio (ler centenas de MB para depois recusar trava a tela)', async () => {
    const ponte = ponteFalsaDoBackup({}, {
      backupListar: async () => ({ ok: true, arquivos: [{ nome: `${ID_A}.wav`, bytes: LIMITES_DO_BACKUP_DA_VOZ.bytesMax + 1 }] }),
    });

    const falha = await montarBackup({}, { ...base, ponteDaVoz: ponte }).catch((e: unknown) => e);

    expect(falha).toMatchObject({ codigo: 'grande-demais', message: expect.stringMatching(/sem as gravações da voz/) });
    expect(ponte.lidos).toEqual([]);
  });

  it('a voz que faz o arquivo passar do limite por poucos bytes recusa — e SEM a voz o mesmo backup cabe', async () => {
    // Quanto pesa a moldura do arquivo, e uma chave que deixa o backup SEM voz a 10 bytes do limite.
    const moldura = serializarBackup(await montarBackup({ comVoz: false }, { ...base, armazenamento: armazenamentoFalso({ irisflow_leituras: '' }) })).bytes;
    const armazenamento = armazenamentoFalso({ irisflow_leituras: 'x'.repeat(TAMANHO_MAXIMO_DO_BACKUP_BYTES - moldura - 10) });
    const ponte = ponteFalsaDoBackup({ [`${ID_A}.wav`]: new Uint8Array([1, 2, 3]) });

    const semVoz = await montarBackup({ comVoz: false }, { ...base, armazenamento, ponteDaVoz: ponte });
    const comVoz = await montarBackup({}, { ...base, armazenamento, ponteDaVoz: ponte }).catch((e: unknown) => e);

    expect(serializarBackup(semVoz).bytes).toBe(TAMANHO_MAXIMO_DO_BACKUP_BYTES - 10);
    expect(comVoz).toMatchObject({ codigo: 'grande-demais', message: expect.stringMatching(/50 MB.*sem as gravações da voz/) });
  }, 30_000);

  it('o teto da voz, depois de virar base64, cabe no arquivo (a conta que sustenta "recusar antes de ler")', () => {
    // 4 letras de base64 para cada 3 bytes: a voz no teto ocupa, no máximo, o arquivo inteiro.
    expect(Math.ceil(LIMITES_DO_BACKUP_DA_VOZ.bytesMax / 3) * 4).toBeLessThanOrEqual(TAMANHO_MAXIMO_DO_BACKUP_BYTES);
  });
});

describe('montarBackup — a conferência final', () => {
  it('o aplicativo nunca entrega um backup que ele mesmo se recusaria a restaurar (nome de arquivo da voz fora do formato)', async () => {
    // Se o processo principal um dia listar um nome que o validador não aceita, o erro aparece AQUI, na hora
    // de salvar — e não meses depois, no computador novo, quando o arquivo velho é a única cópia.
    const ponte = ponteFalsaDoBackup({ '../fora.wav': new Uint8Array([1, 2, 3]) });

    const falha = await montarBackup({}, { ...base, ponteDaVoz: ponte }).catch((e: unknown) => e);

    expect(falha).toBeInstanceOf(ErroDeBackup);
    expect(falha).toMatchObject({ codigo: 'invalido', message: expect.stringMatching(/não foi salvo/) });
  });
});

describe('montarBackup — o tamanho do arquivo', () => {
  it('o arquivo com exatamente o tamanho máximo cabe; com um byte a mais, não (o limite é "mais que")', async () => {
    const moldura = serializarBackup(await montarBackup({}, { ...base, armazenamento: armazenamentoFalso({ irisflow_leituras: '' }) })).bytes;
    const comLeituras = (extra: number) => armazenamentoFalso({ irisflow_leituras: 'x'.repeat(TAMANHO_MAXIMO_DO_BACKUP_BYTES - moldura + extra) });

    const noLimite = await montarBackup({}, { ...base, armazenamento: comLeituras(0) });
    const falha = await montarBackup({}, { ...base, armazenamento: comLeituras(1) }).catch((e: unknown) => e);

    expect(serializarBackup(noLimite).bytes).toBe(TAMANHO_MAXIMO_DO_BACKUP_BYTES);
    expect(falha).toMatchObject({ codigo: 'grande-demais' });
  }, 30_000);

  it('a soma de verificação também conta para o limite: um backup que só cabe SEM os 74 bytes dela é recusado, nunca entregue grande demais', async () => {
    const moldura = serializarBackup(await montarBackup({}, { ...base, armazenamento: armazenamentoFalso({ irisflow_leituras: '' }) })).bytes;
    // 10 bytes a menos do que o limite COM a soma: sem a soma ainda sobrariam 64.
    const armazenamento = armazenamentoFalso({ irisflow_leituras: 'x'.repeat(TAMANHO_MAXIMO_DO_BACKUP_BYTES - moldura + 10) });

    const falha = await montarBackup({}, { ...base, armazenamento }).catch((e: unknown) => e);

    expect(falha).toMatchObject({ codigo: 'grande-demais' });
  }, 30_000);

  it('sem a soma (janela sem criptografia), o que cabe sem ela cabe: o espaço dela só é reservado quando ela existe', async () => {
    const moldura = serializarBackup(await montarBackup({}, { ...base, armazenamento: armazenamentoFalso({ irisflow_leituras: '' }) })).bytes;
    vi.spyOn(globalThis.crypto, 'subtle', 'get').mockReturnValue(undefined as unknown as SubtleCrypto);
    const armazenamento = armazenamentoFalso({ irisflow_leituras: 'x'.repeat(TAMANHO_MAXIMO_DO_BACKUP_BYTES - moldura + BYTES_DA_SOMA_NO_ARQUIVO) });

    const b = await montarBackup({}, { ...base, armazenamento });

    expect('soma' in b).toBe(false);
    expect(serializarBackup(b).bytes).toBe(TAMANHO_MAXIMO_DO_BACKUP_BYTES);
  }, 30_000);

  it('sem a soma (janela sem criptografia), um byte acima do limite continua sendo recusado — o limite não depende da soma', async () => {
    const moldura = serializarBackup(await montarBackup({}, { ...base, armazenamento: armazenamentoFalso({ irisflow_leituras: '' }) })).bytes;
    vi.spyOn(globalThis.crypto, 'subtle', 'get').mockReturnValue(undefined as unknown as SubtleCrypto);
    // A moldura medida acima já leva os 74 bytes da soma; sem ela o arquivo é 74 bytes menor: o limite + 1 é este.
    const armazenamento = armazenamentoFalso({ irisflow_leituras: 'x'.repeat(TAMANHO_MAXIMO_DO_BACKUP_BYTES - moldura + BYTES_DA_SOMA_NO_ARQUIVO + 1) });

    const falha = await montarBackup({}, { ...base, armazenamento }).catch((e: unknown) => e);

    expect(falha).toMatchObject({ codigo: 'grande-demais' });
  }, 30_000);

  it('conta BYTES, não letras: 27 milhões de "ã" são 54 MB no arquivo, acima dos 50 MB', async () => {
    const armazenamento = armazenamentoFalso({ irisflow_leituras: 'ã'.repeat(26 * 1024 * 1024) });

    const falha = await montarBackup({}, { ...base, armazenamento }).catch((e: unknown) => e);

    // Sem a voz no pacote, o motivo é só o limite — oferecer "sem as gravações" não adiantaria.
    expect(falha).toMatchObject({ codigo: 'grande-demais', message: expect.stringMatching(/50 MB/) });
    expect((falha as Error).message).not.toMatch(/sem as gravações da voz/);
  });
});
