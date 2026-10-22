import { describe, it, expect } from 'vitest';
import {
  CHAVE_DO_RESUMO_DA_RESTAURACAO, descartarResumoDaRestauracao, guardarResumoDaRestauracao, lerResumoDaRestauracao,
  pacientesQueDeixamDeAparecer, resumoDoBackup, type ResumoDaRestauracao,
} from './resumo';
import type { BackupV1 } from './formato';

// -----------------------------------------------------------------------------
// O resumo do backup: o que a pessoa lê ANTES de confirmar a restauração ("o que
// vai entrar") e o recado que sobrevive à recarga ("o que entrou"). Quem confirma
// uma restauração precisa saber de quem são os dados e de quando — não decide
// por uma lista de chaves.
// -----------------------------------------------------------------------------

const backup = (chaves: Record<string, string>, arquivosDaVoz?: BackupV1['arquivosDaVoz']): BackupV1 => ({
  formato: 'irisflow-backup', versao: 1, criadoEm: '2026-10-20T09:00:00.000Z', app: '2.5.0', chaves,
  ...(arquivosDaVoz ? { arquivosDaVoz } : {}),
});

describe('resumoDoBackup', () => {
  it('diz de quem são os dados, de quando, e o que mais o backup traz', () => {
    const b = backup({
      irisflow_settings: '{}',
      irisflow_profiles: JSON.stringify([{ id: 'p1', name: 'Ana', createdAt: 'x' }, { id: 'p2', name: 'Bruno', createdAt: 'y' }]),
      'irisflow.assistente.v1.p1': '{}',
      irisflow_clinical_data_p1: '{}',
    }, [
      { nome: 'indice.json', base64: 'e30=' },
      { nome: '8d6f1f0a-aaaa-bbbb-cccc-000000000001.wav', base64: 'AAAA' },
      { nome: '1b2c3d4e-0000-4000-8000-00000000000a.wav', base64: 'AAAA' },
      { nome: 'consentimento.json', base64: 'W10=' },
    ]);

    expect(resumoDoBackup(b)).toEqual({
      criadoEm: '2026-10-20T09:00:00.000Z',
      app: '2.5.0',
      pacientes: [{ id: 'p1', nome: 'Ana' }, { id: 'p2', nome: 'Bruno' }],
      configuracoes: true,
      vocabulario: true,
      historico: true,
      gravacoesDaVoz: 2, // os dois .wav; o índice e o termo não são gravações
      itensIgnorados: 0,
    });
  });

  // O arquivo pode trazer chaves do IrisFlow que esta versão não restaura (ficam de fora do que se grava). A prévia
  // descreve o que VAI entrar: elas não contam como vocabulário, histórico nem configurações (rodada 1, 21/10/2026).
  it('chaves que o app não restaura não entram na descrição do que vai entrar — só na contagem de itens ignorados', () => {
    const r = resumoDoBackup(backup({
      'irisflow.apresentacao': '{"ate":1}', irisflow_license: 'x', 'irisflow.sb.token': 'y',
      irisflow_setup_p1: 'z', irisflow_consent_clinical_data: 'true',
    }));

    expect(r).toMatchObject({ configuracoes: false, vocabulario: false, historico: false, itensIgnorados: 5 });
  });

  it('as chaves ignoradas somam com as que entram sem atrapalhar a descrição', () => {
    const r = resumoDoBackup(backup({ irisflow_settings: '{}', irisflow_clinical_data_p1: '{}', irisflow_license: 'x' }));

    expect(r).toMatchObject({ configuracoes: true, historico: true, itensIgnorados: 1 });
  });

  it('o formato antigo do vocabulário também conta como vocabulário', () => {
    expect(resumoDoBackup(backup({ irisflow_user_words: '[]' })).vocabulario).toBe(true);
    expect(resumoDoBackup(backup({ 'irisflow.assistente.desligado': '1' })).vocabulario).toBe(false); // só a escolha de desligar
  });

  it('backup sem nada disso: tudo falso e nenhum paciente — e a lista de pacientes ilegível não derruba a tela', () => {
    expect(resumoDoBackup(backup({}))).toMatchObject({ pacientes: [], configuracoes: false, vocabulario: false, historico: false, gravacoesDaVoz: 0 });
    for (const torto of ['isto não é JSON', '{"a":1}', 'null', '"texto"']) {
      expect(resumoDoBackup(backup({ irisflow_profiles: torto })).pacientes, torto).toEqual([]);
    }
  });

  it('linha sem id (ou com id vazio) fica de fora; sem nome vira "Paciente sem nome"; nome com espaços sobrando é aparado; repetida entra uma vez', () => {
    const lista = [
      { name: 'Sem id' }, { id: '', name: 'Id vazio' }, { id: 'p1' }, { id: 'p2', name: '  ' }, { id: 'p1', name: 'Repetida' },
      null, 7, { id: 'p3', name: 'Carla' }, { id: 'p4', name: '  Dora  ' },
    ];

    const { pacientes } = resumoDoBackup(backup({ irisflow_profiles: JSON.stringify(lista) }));

    expect(pacientes).toEqual([
      { id: 'p1', nome: 'Paciente sem nome' },
      { id: 'p2', nome: 'Paciente sem nome' },
      { id: 'p3', nome: 'Carla' },
      { id: 'p4', nome: 'Dora' },
    ]);
  });
});

// "Tudo" faz o computador passar a ter o que o backup tem: o paciente que só existe aqui deixa de aparecer na lista. Quem
// escolhe o arquivo errado só descobriria depois da recarga (a cópia de segurança desfaz, mas ninguém sabe procurá-la
// sem ser avisado). Por isso a confirmação nomeia quem some (rodada 1, 21/10/2026).
describe('pacientesQueDeixamDeAparecer', () => {
  const lista = (...pacientes: { id: string; name?: string }[]) => JSON.stringify(pacientes);
  const doBackup = (profiles?: string) => backup(profiles === undefined ? {} : { irisflow_profiles: profiles });

  it('os pacientes daqui que o backup não tem, na ordem em que estão aqui', () => {
    const daqui = lista({ id: 'p1', name: 'Ana' }, { id: 'p3', name: 'Carla' }, { id: 'p4', name: 'Dora' });

    const somem = pacientesQueDeixamDeAparecer(daqui, doBackup(lista({ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Bruno' })));

    expect(somem).toEqual([{ id: 'p3', nome: 'Carla' }, { id: 'p4', nome: 'Dora' }]);
  });

  it('o mesmo paciente (mesmo id) não some, mesmo que o nome tenha mudado', () => {
    const somem = pacientesQueDeixamDeAparecer(lista({ id: 'p1', name: 'Ana (nome antigo)' }), doBackup(lista({ id: 'p1', name: 'Ana' })));

    expect(somem).toEqual([]);
  });

  it('backup sem nenhum paciente (lista vazia, sem a chave, ou ilegível) e computador com pacientes: todos somem', () => {
    const daqui = lista({ id: 'p3', name: 'Carla' }, { id: 'p4' });
    for (const profiles of [lista(), undefined, 'isto não é JSON', 'null']) {
      expect(pacientesQueDeixamDeAparecer(daqui, doBackup(profiles)), String(profiles)).toEqual([
        { id: 'p3', nome: 'Carla' }, { id: 'p4', nome: 'Paciente sem nome' },
      ]);
    }
  });

  it('computador sem pacientes (ou com a lista ilegível, que o app ignora): ninguém some', () => {
    for (const daqui of [null, undefined, '[]', 'isto não é JSON', '{"a":1}']) {
      expect(pacientesQueDeixamDeAparecer(daqui, doBackup(lista({ id: 'p1', name: 'Ana' }))), String(daqui)).toEqual([]);
    }
  });
});

describe('o recado da restauração, que atravessa a recarga', () => {
  const resumo: ResumoDaRestauracao = {
    modo: 'paciente',
    paciente: { id: 'p1', nome: 'Ana' },
    restauradoEm: '2026-10-21T15:00:00.000Z',
    backupCriadoEm: '2026-10-20T09:00:00.000Z',
    chavesGravadas: 5,
    chavesRemovidas: 1,
    voz: { gravacoes: 3, termos: 1, ignoradas: 0, copiadas: 1 },
    copia: { onde: 'pasta-do-app', nome: 'copia-de-seguranca-2026-10-21T15-00-00Z-01.json', pasta: 'C:\\Users\\x\\AppData\\Roaming\\IrisFlow\\copias-de-seguranca' },
    pacienteDesmarcado: true,
  };

  it('o que se guarda é o que se lê depois da recarga', () => {
    guardarResumoDaRestauracao(resumo);

    expect(lerResumoDaRestauracao()).toEqual(resumo);
  });

  it('fica na sessão da janela (sobrevive à recarga) e NÃO no armazenamento permanente — senão entraria no próximo backup', () => {
    guardarResumoDaRestauracao(resumo);

    expect(sessionStorage.getItem(CHAVE_DO_RESUMO_DA_RESTAURACAO)).not.toBeNull();
    expect(localStorage.getItem(CHAVE_DO_RESUMO_DA_RESTAURACAO)).toBeNull();
  });

  it('um recado de antes de existir o campo das cópias (sem `copiadas`) ainda é lido', () => {
    const antigo = { ...resumo, voz: { gravacoes: 3, termos: 1, ignoradas: 0 } };
    sessionStorage.setItem(CHAVE_DO_RESUMO_DA_RESTAURACAO, JSON.stringify(antigo));

    expect(lerResumoDaRestauracao()).toEqual(antigo);
  });

  it('descartar apaga: o aviso aparece uma vez só, não a cada abertura dos ajustes', () => {
    guardarResumoDaRestauracao(resumo);

    descartarResumoDaRestauracao();

    expect(lerResumoDaRestauracao()).toBeNull();
  });

  it('sem recado, ou com um recado estragado ou de forma errada: null (nunca uma tela quebrada)', () => {
    expect(lerResumoDaRestauracao()).toBeNull();
    const ruins: (string | object)[] = [
      'isto não é JSON', 'null', '[]', '{"modo":"outro"}',
      { ...resumo, modo: 'outro' },
      { ...resumo, chavesGravadas: 'cinco' },
      { ...resumo, paciente: { id: 7, nome: 'Ana' } },
      { ...resumo, voz: { gravacoes: 'três', termos: 1, ignoradas: 0 } },
      { ...resumo, voz: 'sim' },
      { ...resumo, voz: { gravacoes: 3, termos: 1, ignoradas: 0, copiadas: 'uma' } },
      { ...resumo, copia: { onde: 'nuvem' } },
      { ...resumo, copia: { onde: 'download' } }, // sem o nome do arquivo baixado
      { ...resumo, copia: { onde: 'pasta-do-app', nome: 'x.json' } }, // sem a pasta
      { ...resumo, pacienteDesmarcado: 'sim' },
    ];
    for (const ruim of ruins) {
      const texto = typeof ruim === 'string' ? ruim : JSON.stringify(ruim);
      sessionStorage.setItem(CHAVE_DO_RESUMO_DA_RESTAURACAO, texto);
      expect(lerResumoDaRestauracao(), texto).toBeNull();
    }
  });

  it('o recado do download (navegador) e o da restauração completa, sem voz, também voltam iguais', () => {
    const completo: ResumoDaRestauracao = {
      modo: 'completo', restauradoEm: resumo.restauradoEm, backupCriadoEm: resumo.backupCriadoEm,
      chavesGravadas: 40, chavesRemovidas: 0, voz: null, copia: { onde: 'download', nome: 'irisflow-copia-de-seguranca-2026-10-21-1200.json' },
    };

    guardarResumoDaRestauracao(completo);

    expect(lerResumoDaRestauracao()).toEqual(completo);
  });
});
