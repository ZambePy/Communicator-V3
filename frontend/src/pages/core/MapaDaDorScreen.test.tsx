import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { setConsent, definirPerfilAtivo, getRegistrosDeDor, getClinicalData } from '../../utils/clinicalLogger';
import {
  ouvir, informarEntrega, informarEntregaDaMensagem, _limparOuvintes,
  type EntregaDaMensagem, type EntregaDoPedido, type EventoDoPaciente,
} from '../../cloud/eventos';
import { definirModoApresentacao } from '../../services/apresentacao';
import { SettingsProvider } from '../../context/SettingsContext';

// Mapa da dor (pedido de 19/10/2026): o caminho inteiro pelo olhar (aqui, por
// clique — é o mesmo `onClick` que o dwell aciona), o que sai no fim e a
// oferta de emergência nos níveis altos. O barramento da nuvem é o de verdade:
// a "nuvem" dos testes é um ouvinte dele, que responde como o CloudProvider.

const falar = vi.fn(async (..._a: unknown[]) => ({ origem: 'sistema' as 'sistema' | 'nenhuma', motivo: undefined as string | undefined }));
vi.mock('../../services/voz', () => ({ falar: (...a: unknown[]) => falar(...a) }));
const iniciarContagemDeEmergencia = vi.fn();
vi.mock('../../context/EmergencyContext', () => ({ useEmergency: () => ({ iniciarContagemDeEmergencia }) }));
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children, subtitulo, backRoute }: { children: React.ReactNode; subtitulo?: string; backRoute?: string }) => (
    <div>
      <a data-testid="voltar" href={backRoute}>Voltar</a>
      <p data-testid="subtitulo">{subtitulo}</p>
      {children}
    </div>
  ),
}));

const { MapaDaDorScreen } = await import('./MapaDaDorScreen');

const montar = (url = '/dor') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dor" element={<MapaDaDorScreen />} />
        <Route path="/comunicacao" element={<p>hub da comunicação</p>} />
      </Routes>
    </MemoryRouter>,
  );

const clicar = (nome: string | RegExp) => fireEvent.click(screen.getByRole('button', { name: nome }));
const esperarFala = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const status = () => screen.getByRole('status');

/** Um CloudProvider de mentira: guarda o que saiu e responde quando o teste mandar. */
function nuvemFalsa() {
  const eventos: EventoDoPaciente[] = [];
  ouvir((e) => {
    eventos.push(e);
    // Como o provider: "enviando" na hora, a resposta depois.
    if (e.tipo === 'fala' && e.id) informarEntregaDaMensagem(e.id, 'enviando');
    if (e.tipo === 'ajuda' && e.id) informarEntrega(e.id, 'enviando');
  });
  const ultimo = <T extends EventoDoPaciente['tipo']>(tipo: T) =>
    [...eventos].reverse().find((e) => e.tipo === tipo) as Extract<EventoDoPaciente, { tipo: T }> | undefined;
  return {
    eventos,
    responderFrase: (r: EntregaDaMensagem) => act(() => { informarEntregaDaMensagem(ultimo('fala')!.id!, r); }),
    responderAviso: (r: EntregaDoPedido) => act(() => { informarEntrega(ultimo('ajuda')!.id!, r); }),
  };
}

describe('mapa da dor', () => {
  beforeEach(() => {
    falar.mockClear();
    falar.mockImplementation(async () => ({ origem: 'sistema', motivo: undefined }));
    iniciarContagemDeEmergencia.mockClear();
    _limparOuvintes();
    definirModoApresentacao(false);
    definirPerfilAtivo('paciente-1');
    setConsent(true);
  });
  afterEach(() => {
    _limparOuvintes();
    definirModoApresentacao(false);
  });

  it('do começo ao fim: braço esquerdo, nível 7 — fala, manda ao cuidador como fala do paciente e anota no histórico', async () => {
    const nuvem = nuvemFalsa();
    montar();
    clicar(/Braços e mãos/);
    clicar('Braço esquerdo');
    clicar(/^Forte/);
    clicar(/^7,/);
    expect(screen.getByTestId('frase-da-dor')).toHaveTextContent('Dor no braço esquerdo, nível 7 de 10');
    // Nada sai antes de a pessoa escolher "Falar e avisar".
    expect(falar).not.toHaveBeenCalled();
    expect(nuvem.eventos).toEqual([]);

    clicar('Falar e avisar o cuidador');
    await esperarFala();
    expect(falar).toHaveBeenCalledWith('Dor no braço esquerdo, nível 7 de 10', expect.anything());
    expect(nuvem.eventos[0]).toMatchObject({ tipo: 'fala', texto: 'Dor no braço esquerdo, nível 7 de 10', kind: 'frase', id: expect.any(String) });
    expect(getRegistrosDeDor()[0]).toMatchObject({ local: 'braco-esquerdo', lugar: 'Braço esquerdo', nivel: 7 });
    expect(getClinicalData().sentences.map((s) => s.text)).toEqual(['Dor no braço esquerdo, nível 7 de 10']);
    expect(status()).toHaveTextContent('Falei em voz alta.');
    expect(status()).toHaveTextContent('Anotado no histórico.');
    // Nível 7: sem oferta de emergência.
    expect(screen.queryByRole('button', { name: /Chamar ajuda agora/ })).toBeNull();
  });

  it('nível 8 ou mais OFERECE a emergência (com a contagem normal) e só chama se a pessoa escolher', async () => {
    montar('/dor?local=cabeca&nivel=9');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    expect(iniciarContagemDeEmergencia).not.toHaveBeenCalled();
    clicar(/Chamar ajuda agora/);
    expect(iniciarContagemDeEmergencia).toHaveBeenCalledTimes(1);
    expect(iniciarContagemDeEmergencia.mock.calls[0][0]).toMatchObject({ tipo: 'pain' });
    expect(iniciarContagemDeEmergencia.mock.calls[0][0].rotulo).toContain('cabeça, 9 de 10');
  });

  it('"Voltar" volta um passo; depois de falar, sai do mapa (não convida a mandar de novo)', async () => {
    const { unmount } = montar('/dor?local=braco-esquerdo&faixa=forte');
    expect(screen.getByTestId('voltar')).toHaveAttribute('href', '/dor?local=braco-esquerdo');
    unmount();
    montar('/dor?local=braco-esquerdo&nivel=8');
    expect(screen.getByTestId('voltar')).toHaveAttribute('href', '/dor?local=braco-esquerdo&faixa=forte');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    expect(screen.getByTestId('voltar')).toHaveAttribute('href', '/comunicacao');
  });

  it('"sem dor" e "pior dor possível" não têm passo de número: vão direto para conferir', () => {
    montar('/dor?local=costas');
    clicar(/^Pior dor possível/);
    expect(screen.getByTestId('frase-da-dor')).toHaveTextContent('Dor nas costas, nível 10 de 10');
  });

  it('esquerdo e direito: a legenda diz que são do corpo da pessoa, e a coluna da esquerda é a do lado esquerdo', () => {
    montar('/dor?grupo=pernas');
    expect(screen.getByTestId('subtitulo')).toHaveTextContent(/SEU corpo/);
    expect(screen.getByText(/Seu lado esquerdo/)).toBeInTheDocument();
    const nomes = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(nomes).toEqual(['Perna esquerda', 'As duas pernas', 'Perna direita', 'Pé esquerdo', 'Os dois pés', 'Pé direito']);
  });

  it('a fala que não saiu é dita na tela, sem fingir', async () => {
    falar.mockImplementation(async () => ({ origem: 'nenhuma', motivo: 'sem_voz' }));
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    montar('/dor?local=pescoco&nivel=4');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    expect(status()).toHaveTextContent('Não consegui falar em voz alta. A frase está escrita aqui.');
    aviso.mockRestore();
  });

  it('sem autorização do histórico clínico: fala e manda, mas não diz que anotou', async () => {
    const nuvem = nuvemFalsa();
    setConsent(false);
    montar('/dor?local=barriga&nivel=5');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    expect(nuvem.eventos.some((e) => e.tipo === 'fala')).toBe(true);
    expect(within(status()).queryByText('Anotado no histórico.')).toBeNull();
    expect(getRegistrosDeDor()).toEqual([]);
  });

  it('URL estranha cai no começo, nunca num envio', () => {
    montar('/dor?local=olho&nivel=99');
    expect(screen.getByRole('button', { name: 'Cabeça' })).toBeInTheDocument();
    expect(falar).not.toHaveBeenCalled();
  });
});

// Revisão de UX de 20/10/2026, achado 3: a tela dizia "Mandei para o celular do
// cuidador" deduzindo do vínculo e de `navigator.onLine`, sem olhar o envio — e
// a frase só entra na conversa (o servidor não manda push). Agora ela diz o que
// o envio respondeu e, de nível 7 em diante, manda também o pedido de ajuda,
// que toca no celular.
describe('achado 3 — o que a tela diz sobre o celular é o envio de verdade', () => {
  beforeEach(() => {
    _limparOuvintes();
    definirModoApresentacao(false);
    definirPerfilAtivo('paciente-1');
    setConsent(true);
  });
  afterEach(() => {
    _limparOuvintes();
    definirModoApresentacao(false);
  });

  it('sem nuvem ligada a este computador: diz isso, e nunca "mandei"', async () => {
    montar('/dor?local=peito&nivel=3');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    expect(status()).toHaveTextContent('Este computador não está ligado ao celular de um cuidador.');
    expect(status()).not.toHaveTextContent(/Mandei/);
  });

  it('nível abaixo de 7: só a conversa, com o estado real (enviando → na conversa; fila; falha)', async () => {
    const nuvem = nuvemFalsa();
    montar('/dor?local=peito&nivel=3');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    // Nenhum pedido de ajuda abaixo de 7.
    expect(nuvem.eventos.map((e) => e.tipo)).toEqual(['fala']);
    expect(status()).toHaveTextContent('Mandando para a conversa no celular do cuidador…');
    nuvem.responderFrase('gravada');
    expect(status()).toHaveTextContent('Foi para a conversa no celular do cuidador; ele vê quando abrir o app.');
    expect(status()).not.toHaveTextContent(/avisado/);

    clicar('Outra dor');
    clicar('Peito');
    clicar(/^Leve/);
    clicar(/^2,/);
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    nuvem.responderFrase('na_fila');
    expect(status()).toHaveTextContent('Sem internet agora: vai para a conversa no celular do cuidador quando a conexão voltar.');
    // A fila esvaziou (a frase saiu): a tela acompanha.
    nuvem.responderFrase('gravada');
    expect(status()).toHaveTextContent('Foi para a conversa no celular do cuidador');

    clicar('Outra dor');
    clicar('Peito');
    clicar(/^Leve/);
    clicar(/^1,/);
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    nuvem.responderFrase('falhou');
    expect(status()).toHaveTextContent('Não consegui mandar a frase para o celular do cuidador.');
  });

  it('de nível 7 em diante a frase vai TAMBÉM como pedido de ajuda, e a tela diz se o celular foi avisado', async () => {
    const nuvem = nuvemFalsa();
    montar('/dor?local=braco-esquerdo&nivel=7');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    const ajuda = nuvem.eventos.find((e) => e.tipo === 'ajuda');
    expect(ajuda).toMatchObject({ tipo: 'ajuda', kind: 'ajuda', mensagem: 'Dor no braço esquerdo, nível 7 de 10', id: expect.any(String) });
    expect(status()).toHaveTextContent('Avisando o celular do cuidador…');
    nuvem.responderFrase('gravada');
    nuvem.responderAviso('enviado');
    expect(status()).toHaveTextContent('Foi para a conversa no celular do cuidador; ele vê quando abrir o app.');
    expect(status()).toHaveTextContent('O celular do cuidador foi avisado.');
  });

  it('pedido de ajuda gravado sem push: a tela não diz que avisou', async () => {
    const nuvem = nuvemFalsa();
    montar('/dor?local=cabeca&nivel=9');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    nuvem.responderFrase('gravada');
    nuvem.responderAviso('sem_push');
    expect(status()).toHaveTextContent('Nenhum celular de cuidador foi avisado agora.');
    expect(status()).not.toHaveTextContent('O celular do cuidador foi avisado.');
    // A oferta de emergência de 8–10 continua como estava.
    expect(screen.getByRole('button', { name: /Chamar ajuda agora/ })).toBeInTheDocument();
  });

  // Revisão final, rodada 1 (M6, 21/10/2026): o limite de chamados do servidor (6 em 10 min) descarta o
  // aviso. A tela diz por quê e lembra da Emergência — não só "Nenhum celular foi avisado".
  it('limite de chamados atingido: a tela diz o motivo e manda para a Emergência', async () => {
    const nuvem = nuvemFalsa();
    montar('/dor?local=cabeca&nivel=7');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    nuvem.responderFrase('gravada');
    nuvem.responderAviso('limitado');
    expect(status()).toHaveTextContent('Você chamou várias vezes; o celular não recebe novos avisos por alguns minutos. Se for urgente, use a Emergência.');
    expect(status()).not.toHaveTextContent('O celular do cuidador foi avisado.');
    expect(status()).not.toHaveTextContent('Nenhum celular de cuidador foi avisado agora.');
  });

  it('modo apresentação: nada sai, e a tela diz isso uma vez só', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const nuvem = nuvemFalsa();
    definirModoApresentacao(true);
    montar('/dor?local=cabeca&nivel=9');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    expect(nuvem.eventos).toEqual([]);
    expect(within(status()).getAllByText('Modo apresentação: nada foi enviado ao celular.')).toHaveLength(1);
    info.mockRestore();
  });
});

// No modo hospital (rodada 3, 21/10/2026) a tela de onde se parte é a do quarto:
// quem abre o mapa da dor por ela volta para ela, e não para a Comunicação, que
// ali nem é um caminho que a pessoa tenha percorrido.
describe('mapa da dor no modo hospital', () => {
  const montarNoHospital = (url: string) =>
    render(
      <SettingsProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/dor" element={<MapaDaDorScreen />} />
            <Route path="/comunicacao" element={<p>hub da comunicação</p>} />
            <Route path="/hospital" element={<p>tela do hospital</p>} />
          </Routes>
        </MemoryRouter>
      </SettingsProvider>,
    );

  beforeEach(() => {
    falar.mockClear();
    falar.mockImplementation(async () => ({ origem: 'sistema', motivo: undefined }));
    _limparOuvintes();
    definirModoApresentacao(false);
    definirPerfilAtivo('paciente-1');
    setConsent(true);
    localStorage.setItem('irisflow_settings', JSON.stringify({ modoHospital: true, schemaVersion: 1 }));
  });
  afterEach(() => {
    localStorage.clear();
    _limparOuvintes();
    definirModoApresentacao(false);
  });

  it('o "Voltar" do primeiro passo vai à tela do hospital; os passos do meio continuam voltando um passo', () => {
    montarNoHospital('/dor');
    expect(screen.getByTestId('voltar')).toHaveAttribute('href', '/hospital');
    document.body.innerHTML = '';
    montarNoHospital('/dor?local=braco-esquerdo&faixa=forte');
    expect(screen.getByTestId('voltar')).toHaveAttribute('href', '/dor?local=braco-esquerdo');
  });

  it('com o modo só horizontal também ligado, a saída é a Comunicação, e não a grade do hospital (M8)', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ modoHospital: true, modoHorizontal: true, schemaVersion: 1 }));
    montarNoHospital('/dor');
    expect(screen.getByTestId('voltar')).toHaveAttribute('href', '/comunicacao');
  });

  it('depois de falar, o "Voltar" e o "Pronto" levam à tela do hospital', async () => {
    montarNoHospital('/dor?local=cabeca&nivel=3');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    expect(screen.getByTestId('voltar')).toHaveAttribute('href', '/hospital');
    clicar('Pronto');
    expect(screen.getByText('tela do hospital')).toBeInTheDocument();
    expect(screen.queryByText('hub da comunicação')).toBeNull();
  });

  it('fora do modo hospital, "Pronto" e "Voltar" continuam indo à Comunicação', async () => {
    localStorage.clear();
    montarNoHospital('/dor?local=cabeca&nivel=3');
    clicar('Falar e avisar o cuidador');
    await esperarFala();
    expect(screen.getByTestId('voltar')).toHaveAttribute('href', '/comunicacao');
    clicar('Pronto');
    expect(screen.getByText('hub da comunicação')).toBeInTheDocument();
  });
});
