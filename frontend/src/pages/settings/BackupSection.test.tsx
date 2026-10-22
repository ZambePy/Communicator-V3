import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BackupSection } from './BackupSection';
import { Z_EMERGENCIA } from '../../context/EmergencyContext';
import { ErroDeBackup } from '../../services/backup/erro';
import { somaDoConteudo, type BackupV1 } from '../../services/backup/formato';
import { CHAVE_DO_RESUMO_DA_RESTAURACAO, lerResumoDaRestauracao, type ResumoDaRestauracao } from '../../services/backup/resumo';
import { ID_A, ID_B } from '../../test/vozDoBackup';

// O PIN do cuidador é verificado pelo contexto de autenticação; aqui o certo é 4321.
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ loginCaregiver: (pin: string) => pin === '4321' }) }));

// -----------------------------------------------------------------------------
// A seção de Backup nos Ajustes (rodada 3, 21/10/2026). É tela do CUIDADOR: mouse
// e teclado. O que ela precisa garantir: ninguém restaura sem saber o que vai
// entrar e sem o PIN, e toda falha aparece em palavras — nada falha em silêncio.
// -----------------------------------------------------------------------------

const AGORA = new Date('2026-10-21T15:00:00.000Z');

const backup: BackupV1 = {
  formato: 'irisflow-backup',
  versao: 1,
  criadoEm: '2026-10-20T12:00:00.000Z',
  app: '2.5.0',
  chaves: {
    irisflow_settings: '{"schemaVersion":1}',
    irisflow_profiles: JSON.stringify([
      { id: 'p1', name: 'Ana', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p2', name: 'Bruno', createdAt: '2026-02-01T00:00:00.000Z' },
    ]),
    'irisflow.assistente.v1.p1': '{}',
    irisflow_clinical_data_p1: '{}',
  },
  arquivosDaVoz: [
    { nome: 'indice.json', base64: 'e30=' },
    { nome: `${ID_A}.wav`, base64: 'AAEC' },
    { nome: `${ID_B}.wav`, base64: 'AAEC' },
  ],
};

const arquivoDe = (conteudo: unknown, nome = 'irisflow-backup-2026-10-20.json') =>
  new File([typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo)], nome, { type: 'application/json' });

const resumoDeRestauracao: ResumoDaRestauracao = {
  modo: 'completo', restauradoEm: '2026-10-21T15:00:00.000Z', backupCriadoEm: '2026-10-20T12:00:00.000Z',
  chavesGravadas: 4, chavesRemovidas: 0, voz: { gravacoes: 2, termos: 1, ignoradas: 0, copiadas: 0 },
  copia: { onde: 'pasta-do-app', nome: 'copia-de-seguranca-X-01.json', pasta: 'C:\\Dados\\IrisFlow\\copias-de-seguranca' },
};

function montar(deps: Record<string, unknown> = {}) {
  const baixar = vi.fn();
  const restaurar = vi.fn(async () => resumoDeRestauracao);
  const usuario = userEvent.setup();
  const utils = render(<BackupSection deps={{ baixar, restaurar, agora: () => AGORA, ...deps }} />);
  const escolher = async (arquivo: File) => {
    await usuario.upload(screen.getByLabelText(/arquivo de backup/i), arquivo);
  };
  return { ...utils, usuario, baixar, restaurar, escolher };
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

// ----------------------------------------------------------------------------

describe('BackupSection — salvar um backup', () => {
  it('baixa o arquivo com a data de hoje no nome e o conteúdo que o montador devolveu', async () => {
    const { usuario, baixar } = montar({ montar: async () => backup });

    await usuario.click(screen.getByRole('button', { name: /salvar backup/i }));

    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
    const [nome, texto] = baixar.mock.calls[0] as [string, string];
    expect(nome).toMatch(/^irisflow-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(texto)).toEqual(backup);
    expect(await screen.findByRole('status')).toHaveTextContent(new RegExp(nome.replace(/\./g, '\\.')));
  });

  it('o aviso de sucesso manda guardar o arquivo fora do computador e diz quantas gravações da voz foram junto', async () => {
    const { usuario } = montar({ montar: async () => backup });

    await usuario.click(screen.getByRole('button', { name: /salvar backup/i }));

    const aviso = await screen.findByRole('status');
    expect(aviso).toHaveTextContent(/2 gravações da voz/);
    expect(aviso).toHaveTextContent(/fora deste computador/);
  });

  it('com os dados reais deste computador (sem injetar nada além do download), o arquivo leva o que está guardado', async () => {
    localStorage.setItem('irisflow_settings', '{"schemaVersion":1,"dwellMs":1800}');
    localStorage.setItem('irisflow.apresentacao', '{"ate":1}'); // transitória: não vai
    const baixar = vi.fn();
    const usuario = userEvent.setup();
    render(<BackupSection deps={{ baixar, agora: () => AGORA }} />);

    await usuario.click(screen.getByRole('button', { name: /salvar backup/i }));

    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
    const arquivo = JSON.parse((baixar.mock.calls[0] as [string, string])[1]);
    expect(arquivo.formato).toBe('irisflow-backup');
    expect(arquivo.chaves).toEqual({ irisflow_settings: '{"schemaVersion":1,"dwellMs":1800}' });
  });

  it('não cabe no arquivo com a voz: avisa e oferece salvar SEM as gravações, que continuam no computador', async () => {
    const semVoz: BackupV1 = { ...backup };
    delete semVoz.arquivosDaVoz;
    const montador = vi.fn(async (opcoes?: { comVoz?: boolean }) => {
      if (opcoes?.comVoz === false) return semVoz;
      throw new ErroDeBackup('grande-demais', 'Com as gravações da voz, o backup passa de 50 MB, o tamanho máximo de um arquivo de backup. Salve o backup sem as gravações da voz: elas continuam guardadas neste computador.');
    });
    const { usuario, baixar } = montar({ montar: montador });

    await usuario.click(screen.getByRole('button', { name: /^salvar backup/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/passa de 50 MB/);
    expect(baixar).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole('button', { name: /salvar sem as gravações da voz/i }));

    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
    expect(JSON.parse((baixar.mock.calls[0] as [string, string])[1]).arquivosDaVoz).toBeUndefined();
    expect(await screen.findByRole('status')).toHaveTextContent(/sem as gravações da voz/);
  });

  it('se nem SEM a voz o arquivo cabe, o aviso fica e o desvio não é oferecido de novo (não adiantaria nada)', async () => {
    const montador = vi.fn(async (opcoes?: { comVoz?: boolean }): Promise<BackupV1> => {
      throw new ErroDeBackup('grande-demais', opcoes?.comVoz === false
        ? 'Os dados deste computador passam de 50 MB, o tamanho máximo de um arquivo de backup.'
        : 'Com as gravações da voz, o backup passa de 50 MB, o tamanho máximo de um arquivo de backup.');
    });
    const { usuario, baixar } = montar({ montar: montador });
    await usuario.click(screen.getByRole('button', { name: /^salvar backup/i }));
    await usuario.click(await screen.findByRole('button', { name: /salvar sem as gravações da voz/i }));

    await waitFor(() => expect(montador).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Os dados deste computador passam de 50 MB/);
    expect(screen.queryByRole('button', { name: /sem as gravações da voz/i })).toBeNull();
    expect(baixar).not.toHaveBeenCalled();
  });

  it('outra falha (as gravações não puderam ser lidas) aparece em palavras e NÃO oferece o desvio sem a voz', async () => {
    const { usuario, baixar } = montar({
      montar: async () => { throw new ErroDeBackup('voz-ilegivel', 'Não foi possível ler as gravações da voz agora. Tente de novo em instantes.'); },
    });

    await usuario.click(screen.getByRole('button', { name: /^salvar backup/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível ler as gravações da voz agora/);
    expect(screen.queryByRole('button', { name: /sem as gravações da voz/i })).toBeNull();
    expect(baixar).not.toHaveBeenCalled();
  });

  it('um erro inesperado (não do backup) também vira aviso — nunca silêncio', async () => {
    const { usuario } = montar({ montar: async () => { throw new TypeError('algo quebrou'); } });

    await usuario.click(screen.getByRole('button', { name: /^salvar backup/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível salvar o backup agora/);
  });

  it('enquanto monta o backup, o botão fica desligado (dois cliques não geram dois arquivos)', async () => {
    let terminar: (b: BackupV1) => void = () => {};
    const { usuario, baixar } = montar({ montar: () => new Promise<BackupV1>((r) => { terminar = r; }) });

    await usuario.click(screen.getByRole('button', { name: /^salvar backup/i }));

    expect(screen.getByRole('button', { name: /salvando/i })).toBeDisabled();
    terminar(backup);
    await waitFor(() => expect(baixar).toHaveBeenCalledTimes(1));
  });
});

// ----------------------------------------------------------------------------

describe('BackupSection — escolher um arquivo para restaurar', () => {
  it('mostra o que vai entrar: de quando é, de quem são os dados e o que mais traz', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe(backup));

    const previa = await screen.findByTestId('previa-do-backup');
    expect(previa).toHaveTextContent(/20 de outubro de 2026/);
    expect(previa).toHaveTextContent(/IrisFlow 2\.5\.0/);
    expect(previa).toHaveTextContent(/Pacientes: Ana, Bruno/);
    expect(previa).toHaveTextContent(/Configurações do aplicativo/);
    expect(previa).toHaveTextContent(/Vocabulário aprendido/);
    expect(previa).toHaveTextContent(/Histórico/);
    expect(previa).toHaveTextContent(/Gravações da voz: 2/);
    expect(previa).toHaveTextContent(/licença, a calibração e as configurações de câmera e tela deste computador/);
  });

  it('a prévia diz qual arquivo foi escolhido (o campo de arquivo volta a ficar vazio, para permitir escolher o mesmo de novo)', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe(backup, 'backup-da-vovo-ana.json'));

    expect(await screen.findByTestId('previa-do-backup')).toHaveTextContent(/backup-da-vovo-ana\.json/);
  });

  it('um arquivo que não é backup é recusado em palavras, sem prévia e sem botão de restaurar', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe('isto não é um backup'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/não é um backup do IrisFlow/);
    expect(screen.queryByTestId('previa-do-backup')).toBeNull();
    expect(screen.queryByRole('button', { name: /^restaurar/i })).toBeNull();
  });

  it('o backup antigo (só as configurações) é recusado dizendo o porquê', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe({ dwellMs: 1500, soundEnabled: true, theme: 'dark' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/backup antigo.*só as configurações/s);
    expect(screen.queryByTestId('previa-do-backup')).toBeNull();
  });

  it('um backup de uma versão mais nova do aplicativo é recusado pedindo para atualizar', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe({ ...backup, versao: 2 }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/mais nova.*Atualize/s);
  });

  // Chave do IrisFlow que esta versão não restaura (licença, modo apresentação, sessão…): o arquivo vale, a chave é
  // ignorada, e a tela diz quantas foram (correção da rodada 1, 21/10/2026). Recusar o arquivo inteiro por ela deixaria
  // irrestaurável todo backup antigo cada vez que a lista de fora crescesse.
  it('um backup com UMA chave que o app não restaura (modo apresentação) vale: a prévia diz que 1 item será ignorado', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe({ ...backup, chaves: { ...backup.chaves, 'irisflow.apresentacao': '{"ate":9999999999999}' } }));

    const previa = await screen.findByTestId('previa-do-backup');
    expect(previa).toHaveTextContent(/1 item deste arquivo não é restaurado pelo IrisFlow e será ignorado/);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /^restaurar/i })).toBeEnabled();
  });

  it('com várias chaves de fora, diz quantas — no plural', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe({ ...backup, chaves: { ...backup.chaves, 'irisflow.apresentacao': '{}', irisflow_license: 'x', 'irisflow.sb.token': 'y' } }));

    expect(await screen.findByTestId('previa-do-backup')).toHaveTextContent(/3 itens deste arquivo não são restaurados pelo IrisFlow e serão ignorados/);
  });

  it('uma chave de fora não vira "vocabulário" nem "histórico" na lista do que entra', async () => {
    const { escolher } = montar();
    await escolher(arquivoDe({ ...backup, chaves: { irisflow_settings: '{}', 'irisflow.apresentacao': '{}' } }));

    const previa = await screen.findByTestId('previa-do-backup');
    expect(previa).toHaveTextContent(/1 item deste arquivo/);
    expect(previa).not.toHaveTextContent(/Vocabulário aprendido/);
    expect(previa).not.toHaveTextContent(/Histórico de uso/);
    expect(previa).toHaveTextContent(/Configurações do aplicativo/);
  });

  it('sem chaves de fora, a prévia não menciona itens ignorados', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe(backup));

    expect(await screen.findByTestId('previa-do-backup')).not.toHaveTextContent(/ignorado/);
  });

  it('o aviso de itens ignorados é calmo: sem nomes de chave nem jargão', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe({ ...backup, chaves: { ...backup.chaves, 'irisflow.apresentacao': '{}' } }));

    const previa = await screen.findByTestId('previa-do-backup');
    expect(previa).not.toHaveTextContent(/irisflow[._]apresentacao|localStorage|chave/i);
  });

  it('uma chave que nem é do IrisFlow continua sendo recusada: nenhum backup feito por este aplicativo a traz', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe({ ...backup, chaves: { ...backup.chaves, accuracyResult: 'lixo' } }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/accuracyResult.*não restaura/);
    expect(screen.queryByTestId('previa-do-backup')).toBeNull();
  });

  // A soma de verificação é conferida na escolha do arquivo, não só ao restaurar: descobrir que o arquivo está estragado
  // depois de digitar o PIN seria tarde (rodada 1, 21/10/2026).
  it('um arquivo cuja soma de verificação não bate é recusado já na escolha, em palavras, sem prévia', async () => {
    const { escolher } = montar();
    const comSoma = { ...backup, soma: await somaDoConteudo(backup) };

    await escolher(arquivoDe({ ...comSoma, chaves: { ...comSoma.chaves, irisflow_profiles: '[]' } })); // lista esvaziada: continua JSON válido

    expect(await screen.findByRole('alert')).toHaveTextContent(/alterado ou está estragado/);
    expect(screen.queryByTestId('previa-do-backup')).toBeNull();
    expect(screen.queryByRole('button', { name: /^restaurar/i })).toBeNull();
  });

  it('com a soma certa, a prévia aparece normalmente', async () => {
    const { escolher } = montar();

    await escolher(arquivoDe({ ...backup, soma: await somaDoConteudo(backup) }));

    expect(await screen.findByTestId('previa-do-backup')).toHaveTextContent(/Pacientes: Ana, Bruno/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('escolher um arquivo bom depois de um ruim limpa o aviso de erro', async () => {
    const { escolher } = montar();
    await escolher(arquivoDe('lixo'));
    await screen.findByRole('alert');

    await escolher(arquivoDe(backup));

    await screen.findByTestId('previa-do-backup');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('"Descartar" fecha a prévia sem restaurar nada', async () => {
    const { escolher, usuario, restaurar } = montar();
    await escolher(arquivoDe(backup));
    await screen.findByTestId('previa-do-backup');

    await usuario.click(screen.getByRole('button', { name: /descartar/i }));

    expect(screen.queryByTestId('previa-do-backup')).toBeNull();
    expect(restaurar).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------

describe('BackupSection — a escolha do que restaurar', () => {
  it('começa em "Tudo"; "Só um paciente" libera a lista de pacientes do backup', async () => {
    const { escolher, usuario } = montar();
    await escolher(arquivoDe(backup));

    expect(screen.getByRole('radio', { name: /tudo/i })).toBeChecked();
    expect(screen.getByLabelText(/^paciente$/i)).toBeDisabled();

    await usuario.click(screen.getByRole('radio', { name: /só um paciente/i }));

    const lista = screen.getByLabelText(/^paciente$/i);
    expect(lista).toBeEnabled();
    expect(within(lista).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ana', 'Bruno']);
  });

  it('"Só um paciente" já vem com o primeiro da lista escolhido: sem mexer na lista, o botão de restaurar funciona e vale para ele', async () => {
    const { escolher, usuario } = montar();
    await escolher(arquivoDe(backup));

    await usuario.click(screen.getByRole('radio', { name: /só um paciente/i }));

    expect(screen.getByLabelText(/^paciente$/i)).toHaveValue('p1');
    expect(screen.getByRole('button', { name: /^restaurar/i })).toBeEnabled();
    await usuario.click(screen.getByRole('button', { name: /^restaurar/i }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/dados de Ana serão trocados/);
  });

  it('escolher outro arquivo volta para "Tudo": a escolha de paciente do arquivo anterior não vale para o novo', async () => {
    const { escolher, usuario } = montar();
    await escolher(arquivoDe(backup));
    await usuario.click(screen.getByRole('radio', { name: /só um paciente/i }));
    expect(screen.getByRole('radio', { name: /só um paciente/i })).toBeChecked();

    await escolher(arquivoDe(backup, 'outro-backup.json'));

    expect(await screen.findByText(/outro-backup\.json/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /tudo/i })).toBeChecked();
  });

  it('"Tudo" não promete o que não faz: as gravações da voz são acrescentadas às que já estão aqui, nenhuma é apagada', async () => {
    const { escolher } = montar();
    await escolher(arquivoDe(backup));

    // A voz de quem não pode gravar de novo não entra no "substituído": a restauração só acrescenta.
    expect(screen.getByRole('radio', { name: /tudo/i })).toHaveAccessibleName(/gravações da voz são acrescentadas às que já estão aqui.*nenhuma é apagada/);
  });

  it('"Tudo" diz o que acontece quando a gravação do backup é a mesma de uma daqui com áudio diferente: as duas ficam', async () => {
    const { escolher } = montar();
    await escolher(arquivoDe(backup));

    expect(screen.getByRole('radio', { name: /tudo/i })).toHaveAccessibleName(/nenhuma é apagada\..*as duas ficam/);
  });

  it('backup sem pacientes: "Só um paciente" não é oferecido, e diz por quê', async () => {
    const { escolher } = montar();
    await escolher(arquivoDe({ ...backup, chaves: { irisflow_settings: '{}' } }));

    expect(await screen.findByRole('radio', { name: /só um paciente/i })).toBeDisabled();
    expect(screen.getByTestId('previa-do-backup')).toHaveTextContent(/Nenhum paciente/);
  });
});

// ----------------------------------------------------------------------------

describe('BackupSection — confirmar com o PIN e restaurar', () => {
  async function ateOPin(deps: Record<string, unknown> = {}) {
    const t = montar(deps);
    await t.escolher(arquivoDe(backup));
    await screen.findByTestId('previa-do-backup');
    await t.usuario.click(screen.getByRole('button', { name: /^restaurar/i }));
    const dialogo = await screen.findByRole('alertdialog');
    return { ...t, dialogo, campoDoPin: within(dialogo).getByLabelText(/pin do cuidador/i) };
  }

  it('a confirmação fica ABAIXO do botão de Emergência: o socorro continua ao alcance com ela aberta', async () => {
    const { dialogo } = await ateOPin();

    const fundo = dialogo.parentElement as HTMLElement; // o painel que cobre a tela
    expect(Number(fundo.style.zIndex)).toBeGreaterThan(0);
    expect(Number(fundo.style.zIndex)).toBeLessThan(Z_EMERGENCIA);
  });

  it('abre uma confirmação que diz o que vai acontecer, com o foco no PIN', async () => {
    const { dialogo, campoDoPin } = await ateOPin();

    expect(dialogo).toHaveTextContent(/trocados pelos do backup de 20 de outubro de 2026/);
    expect(dialogo).toHaveTextContent(/cópia do que há agora fica guardada antes/);
    expect(campoDoPin).toHaveFocus();
    expect(campoDoPin).toHaveAttribute('type', 'password');
  });

  it('PIN errado: avisa, limpa o campo e NÃO restaura', async () => {
    const { dialogo, campoDoPin, usuario, restaurar } = await ateOPin();

    await usuario.type(campoDoPin, '0000{Enter}');

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/PIN incorreto/);
    expect(campoDoPin).toHaveValue('');
    expect(restaurar).not.toHaveBeenCalled();
  });

  it('PIN certo: restaura TUDO com o backup validado, uma vez só', async () => {
    const { campoDoPin, usuario, restaurar } = await ateOPin();

    await usuario.type(campoDoPin, '4321{Enter}');

    await waitFor(() => expect(restaurar).toHaveBeenCalledTimes(1));
    expect(restaurar).toHaveBeenCalledWith(backup, {});
  });

  it('"Só um paciente": restaura apenas o escolhido', async () => {
    const t = montar();
    await t.escolher(arquivoDe(backup));
    await screen.findByTestId('previa-do-backup');
    await t.usuario.click(screen.getByRole('radio', { name: /só um paciente/i }));
    await t.usuario.selectOptions(screen.getByLabelText(/^paciente$/i), 'p2');
    await t.usuario.click(screen.getByRole('button', { name: /^restaurar/i }));
    const dialogo = await screen.findByRole('alertdialog');

    expect(dialogo).toHaveTextContent(/dados de Bruno serão trocados/);
    await t.usuario.type(within(dialogo).getByLabelText(/pin do cuidador/i), '4321{Enter}');

    await waitFor(() => expect(t.restaurar).toHaveBeenCalledTimes(1));
    expect(t.restaurar).toHaveBeenCalledWith(backup, { perfil: 'p2' });
  });

  it('Esc e "Cancelar" fecham sem restaurar', async () => {
    const { usuario, restaurar } = await ateOPin();

    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await usuario.click(screen.getByRole('button', { name: /^restaurar/i }));
    await usuario.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /cancelar/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(restaurar).not.toHaveBeenCalled();
  });

  it('ao fechar a confirmação sem restaurar, o foco volta ao botão que a abriu (quem usa só o teclado não recomeça do topo da página)', async () => {
    const { usuario } = await ateOPin();

    await usuario.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /^restaurar/i })).toHaveFocus();

    await usuario.click(screen.getByRole('button', { name: /^restaurar/i }));
    await usuario.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /cancelar/i }));
    expect(screen.getByRole('button', { name: /^restaurar/i })).toHaveFocus();
  });

  it('a confirmação é só de mouse e teclado: nenhum botão dela é alvo do olhar', async () => {
    const { dialogo } = await ateOPin();

    const botoes = Array.from(dialogo.querySelectorAll('button'));
    expect(botoes.length).toBeGreaterThanOrEqual(2);
    for (const b of botoes) expect(b.getAttribute('data-no-dwell'), b.textContent ?? '').toBe('true');
    expect(dialogo.closest('[data-no-dwell="true"]')).not.toBeNull();
  });

  it('o botão que ABRE a confirmação também fica fora do alcance do olhar', async () => {
    const t = montar();
    await t.escolher(arquivoDe(backup));

    expect(await screen.findByRole('button', { name: /^restaurar/i })).toHaveAttribute('data-no-dwell', 'true');
  });

  it('a confirmação fica no corpo da página, fora do cartão (o desfoque do cartão prenderia um elemento fixo dentro dele)', async () => {
    const { dialogo, container } = await ateOPin();

    expect(container.contains(dialogo)).toBe(false);
    expect(document.body.contains(dialogo)).toBe(true);
  });

  it('enquanto restaura, os botões ficam desligados e o texto pede para não fechar o aplicativo', async () => {
    let terminar: (r: ResumoDaRestauracao) => void = () => {};
    const { dialogo, campoDoPin, usuario } = await ateOPin({ restaurar: () => new Promise<ResumoDaRestauracao>((r) => { terminar = r; }) });

    await usuario.type(campoDoPin, '4321{Enter}');

    const confirmar = await within(dialogo).findByRole('button', { name: /restaurando/i });
    expect(confirmar).toBeDisabled();
    expect(within(dialogo).getByRole('button', { name: /cancelar/i })).toBeDisabled();
    expect(dialogo).toHaveTextContent(/não feche o aplicativo/i);
    await usuario.keyboard('{Escape}'); // restaurando: Esc não pode abandonar no meio
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await act(async () => { terminar(resumoDeRestauracao); });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('um segundo envio enquanto a restauração está em curso não restaura de novo (duas restaurações ao mesmo tempo se atropelariam)', async () => {
    let terminar: (r: ResumoDaRestauracao) => void = () => {};
    const restaurar = vi.fn(() => new Promise<ResumoDaRestauracao>((r) => { terminar = r; }));
    const { dialogo, campoDoPin, usuario } = await ateOPin({ restaurar });
    await usuario.type(campoDoPin, '4321{Enter}');
    await within(dialogo).findByRole('button', { name: /restaurando/i });

    fireEvent.submit(dialogo); // o que um clique duplo ou uma tecla repetida mandariam

    expect(restaurar).toHaveBeenCalledTimes(1);
    await act(async () => { terminar(resumoDeRestauracao); });
  });

  it('enviar com o campo do PIN vazio não conta como PIN errado: não há nada para conferir ainda', async () => {
    const { dialogo, restaurar } = await ateOPin();

    fireEvent.submit(dialogo);

    expect(within(dialogo).queryByRole('alert')).toBeNull();
    expect(restaurar).not.toHaveBeenCalled();
  });

  it('a restauração falhou: a confirmação fecha, o motivo aparece em palavras e a prévia continua para tentar de novo', async () => {
    const { campoDoPin, usuario } = await ateOPin({
      restaurar: async () => { throw new ErroDeBackup('copia-falhou', 'Não foi possível guardar a cópia de segurança neste computador. Nada foi restaurado.'); },
    });

    await usuario.type(campoDoPin, '4321{Enter}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await screen.findByRole('alert')).toHaveTextContent(/cópia de segurança.*Nada foi restaurado/);
    expect(screen.getByTestId('previa-do-backup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^restaurar/i })).toBeEnabled();
  });

  it('um erro inesperado na restauração também aparece, sem prometer que nada mudou', async () => {
    const { campoDoPin, usuario } = await ateOPin({ restaurar: async () => { throw new TypeError('algo quebrou'); } });

    await usuario.type(campoDoPin, '4321{Enter}');

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/Não foi possível restaurar o backup/);
    expect(aviso).toHaveTextContent(/cópia de segurança/);
  });

  it('se a página não recarregar sozinha depois de restaurar, a tela diz o que fazer', async () => {
    const { campoDoPin, usuario } = await ateOPin();

    await usuario.type(campoDoPin, '4321{Enter}');

    const aviso = await screen.findByRole('status');
    expect(aviso).toHaveTextContent(/restaura(ção|do)/i);
    expect(aviso).toHaveTextContent(/feche e abra o IrisFlow/);
  });
});

// ----------------------------------------------------------------------------

// "Tudo" faz este computador passar a ter o que o backup tem: o paciente que só existe aqui deixa de aparecer. Quem
// escolhe o arquivo errado só descobriria depois da recarga. A confirmação nomeia quem some, e avisa mais forte quando o
// arquivo não traz nenhum paciente e o computador tem (correção da rodada 1, 21/10/2026).
describe('BackupSection — quem deixa de aparecer no "Tudo"', () => {
  const daqui = (...nomes: string[]) => localStorage.setItem('irisflow_profiles', JSON.stringify(nomes.map((name, i) => ({ id: `local-${i}`, name }))));

  async function abrirAConfirmacao(arquivo: unknown = backup, antes?: (t: ReturnType<typeof montar>) => Promise<void>) {
    const t = montar();
    await t.escolher(arquivoDe(arquivo));
    await screen.findByTestId('previa-do-backup');
    await antes?.(t);
    await t.usuario.click(screen.getByRole('button', { name: /^restaurar/i }));
    return { ...t, dialogo: await screen.findByRole('alertdialog') };
  }

  it('nomeia os pacientes daqui que o backup não tem, e diz que os dados deles continuam na cópia de segurança', async () => {
    localStorage.setItem('irisflow_profiles', JSON.stringify([{ id: 'p1', name: 'Ana' }, { id: 'p8', name: 'Carla' }, { id: 'p9', name: 'Dora' }]));

    const { dialogo } = await abrirAConfirmacao();

    expect(dialogo).toHaveTextContent(/Deixam de aparecer neste computador: Carla e Dora\./);
    expect(dialogo).toHaveTextContent(/Os dados continuam na cópia de segurança/);
    // Quem ouve só a descrição (leitor de tela) também fica sabendo.
    expect(dialogo).toHaveAccessibleDescription(/Carla e Dora/);
  });

  it('um só paciente, e três: o singular e a lista com "e" no fim', async () => {
    daqui('Carla');
    const { dialogo, usuario } = await abrirAConfirmacao();
    expect(dialogo).toHaveTextContent(/Deixa de aparecer neste computador: Carla\./);
    expect(dialogo).toHaveTextContent(/Os dados continuam na cópia de segurança/);
    await usuario.keyboard('{Escape}');

    daqui('Carla', 'Dora', 'Eva');
    await usuario.click(screen.getByRole('button', { name: /^restaurar/i }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/Deixam de aparecer neste computador: Carla, Dora e Eva\./);
  });

  it('muitos pacientes: nomeia os primeiros e conta o resto, em vez de uma parede de nomes', async () => {
    daqui(...Array.from({ length: 12 }, (_, i) => `Paciente ${i + 1}`));

    const { dialogo } = await abrirAConfirmacao();

    expect(dialogo).toHaveTextContent(/Paciente 1, Paciente 2, Paciente 3, Paciente 4, Paciente 5, Paciente 6, Paciente 7, Paciente 8 e mais 4\./);
    expect(dialogo).not.toHaveTextContent(/Paciente 9/);
  });

  it('arquivo SEM nenhum paciente e computador com pacientes: o aviso é mais forte e pede para conferir o arquivo', async () => {
    daqui('Carla', 'Dora');

    const { dialogo } = await abrirAConfirmacao({ ...backup, chaves: { irisflow_settings: '{}' } });

    expect(dialogo).toHaveTextContent(/Este backup não tem nenhum paciente, e este computador tem 2: Carla e Dora\./);
    expect(dialogo).toHaveTextContent(/Se você continuar, os pacientes deixam de aparecer aqui\. Os dados continuam na cópia de segurança\. Confira se escolheu o arquivo certo/);
  });

  it('"Só um paciente": ninguém deixa de aparecer, e a confirmação não fala nisso', async () => {
    daqui('Carla', 'Dora');

    const { dialogo } = await abrirAConfirmacao(backup, async (t) => { await t.usuario.click(screen.getByRole('radio', { name: /só um paciente/i })); });

    expect(dialogo).toHaveTextContent(/dados de Ana serão trocados/);
    expect(dialogo).not.toHaveTextContent(/deixam? de aparecer/i);
    expect(dialogo).not.toHaveTextContent(/nenhum paciente/i);
  });

  it('sem pacientes neste computador, ou com todos já no backup: nada a avisar', async () => {
    const { dialogo, usuario } = await abrirAConfirmacao();
    expect(dialogo).not.toHaveTextContent(/deixam? de aparecer/i);
    await usuario.keyboard('{Escape}');

    localStorage.setItem('irisflow_profiles', JSON.stringify([{ id: 'p1', name: 'Ana (nome antigo)' }, { id: 'p2', name: 'Bruno' }]));
    await usuario.click(screen.getByRole('button', { name: /^restaurar/i }));
    expect(await screen.findByRole('alertdialog')).not.toHaveTextContent(/deixam? de aparecer/i);
  });

  it('a lista é a de AGORA, lida quando a confirmação abre — não a de quando o arquivo foi escolhido', async () => {
    const t = montar();
    await t.escolher(arquivoDe(backup));
    await screen.findByTestId('previa-do-backup');
    daqui('Carla'); // surgiu depois de escolher o arquivo

    await t.usuario.click(screen.getByRole('button', { name: /^restaurar/i }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/Deixa de aparecer neste computador: Carla\./);
  });

  it('se o navegador não deixa ler os pacientes daqui, a confirmação abre mesmo assim (o aviso é um reforço, não uma trava)', async () => {
    const t = montar();
    await t.escolher(arquivoDe(backup));
    await screen.findByTestId('previa-do-backup');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Acesso negado', 'SecurityError'); });

    await t.usuario.click(screen.getByRole('button', { name: /^restaurar/i }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/trocados pelos do backup/);
    expect(dialogo).not.toHaveTextContent(/deixam? de aparecer/i);
  });
});

// ----------------------------------------------------------------------------

describe('BackupSection — o recado depois da recarga', () => {
  const guardar = (r: ResumoDaRestauracao) => sessionStorage.setItem(CHAVE_DO_RESUMO_DA_RESTAURACAO, JSON.stringify(r));

  it('sem restauração recente, não há recado', () => {
    montar();

    expect(screen.queryByTestId('recado-da-restauracao')).toBeNull();
  });

  it('restauração completa: diz quando, onde ficou a cópia do que havia antes e quantas gravações voltaram', () => {
    guardar(resumoDeRestauracao);
    montar();

    const recado = screen.getByTestId('recado-da-restauracao');
    expect(recado).toHaveTextContent(/Backup restaurado/);
    expect(recado).toHaveTextContent(/20 de outubro de 2026/);
    expect(recado).toHaveTextContent(/2 gravações da voz voltaram/);
    expect(recado).toHaveTextContent(/copia-de-seguranca-X-01\.json/);
    expect(recado).toHaveTextContent(/C:\\Dados\\IrisFlow\\copias-de-seguranca/);
  });

  it('gravações que não voltaram são contadas — não finge que voltaram todas', () => {
    guardar({ ...resumoDeRestauracao, voz: { gravacoes: 3, termos: 1, ignoradas: 2 } });
    montar();

    expect(screen.getByTestId('recado-da-restauracao')).toHaveTextContent(/2 não puderam voltar/);
  });

  it('gravações que entraram como cópia (já havia uma daqui com outro áudio) são contadas e explicadas: nada foi trocado', () => {
    guardar({ ...resumoDeRestauracao, voz: { gravacoes: 3, termos: 1, ignoradas: 0, copiadas: 2 } });
    montar();

    const recado = screen.getByTestId('recado-da-restauracao');
    expect(recado).toHaveTextContent(/3 gravações da voz voltaram/);
    expect(recado).toHaveTextContent(/2 eram a mesma gravação de uma que já estava aqui, mas com outro áudio/);
    expect(recado).toHaveTextContent(/Nenhuma foi trocada.*entraram como gravações a mais.*apague a que não quiser/);
  });

  it('uma só cópia: o texto fica no singular', () => {
    guardar({ ...resumoDeRestauracao, voz: { gravacoes: 1, termos: 0, ignoradas: 0, copiadas: 1 } });
    montar();

    const recado = screen.getByTestId('recado-da-restauracao');
    expect(recado).toHaveTextContent(/1 gravação da voz voltou/);
    expect(recado).toHaveTextContent(/1 era a mesma gravação de uma que já estava aqui, mas com outro áudio/);
    expect(recado).toHaveTextContent(/entrou como gravação a mais/);
  });

  it('sem cópias (ou recado de antes do campo existir), o recado não fala de cópias', () => {
    guardar({ ...resumoDeRestauracao, voz: { gravacoes: 2, termos: 1, ignoradas: 0 } });
    montar();

    expect(screen.getByTestId('recado-da-restauracao')).not.toHaveTextContent(/outro áudio/);
  });

  it('um paciente restaurado: o nome dele no título; se ele estava escolhido, pede para escolher de novo', () => {
    guardar({ ...resumoDeRestauracao, modo: 'paciente', paciente: { id: 'p1', nome: 'Ana' }, voz: null, pacienteDesmarcado: true });
    montar();

    const recado = screen.getByTestId('recado-da-restauracao');
    expect(recado).toHaveTextContent(/Dados de Ana restaurados/);
    expect(recado).toHaveTextContent(/Escolha o paciente de novo/);
  });

  it('no navegador a cópia de segurança foi baixada, e o recado diz o nome do arquivo', () => {
    guardar({ ...resumoDeRestauracao, copia: { onde: 'download', nome: 'irisflow-copia-de-seguranca-2026-10-21-1200.json' } });
    montar();

    expect(screen.getByTestId('recado-da-restauracao')).toHaveTextContent(/baixado.*irisflow-copia-de-seguranca-2026-10-21-1200\.json/s);
  });

  it('"Entendi" dispensa o recado e o apaga: ele não volta na próxima abertura dos ajustes', async () => {
    guardar(resumoDeRestauracao);
    const { usuario, unmount } = montar();

    await usuario.click(screen.getByRole('button', { name: /entendi/i }));

    expect(screen.queryByTestId('recado-da-restauracao')).toBeNull();
    expect(lerResumoDaRestauracao()).toBeNull();
    unmount();
    montar();
    expect(screen.queryByTestId('recado-da-restauracao')).toBeNull();
  });

  it('o recado NÃO some só por abrir os ajustes: fica até a pessoa dispensar (ela pode ter caído antes na escolha do paciente)', () => {
    guardar(resumoDeRestauracao);
    const { unmount } = montar();
    unmount();

    montar();

    expect(screen.getByTestId('recado-da-restauracao')).toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------------

describe('BackupSection — estrutura', () => {
  it('é uma seção rotulada pelo título "Backup e restauração", com o campo do arquivo rotulado', () => {
    montar();

    const secao = screen.getByRole('region', { name: /backup e restauração/i });
    expect(within(secao).getByRole('heading', { level: 2, name: /backup e restauração/i })).toBeInTheDocument();
    expect(within(secao).getByLabelText(/arquivo de backup/i)).toHaveAttribute('type', 'file');
  });
});
