import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Message } from '../cloud/types';

// Pergunta sim/não do cuidador na tela do paciente (pedido de 21/10/2026).

const nuvem: {
  perguntasDoCuidador: Message[];
  responderPerguntaDoCuidador: ReturnType<typeof vi.fn>;
  fecharPerguntaDoCuidador: ReturnType<typeof vi.fn>;
} = { perguntasDoCuidador: [], responderPerguntaDoCuidador: vi.fn(), fecharPerguntaDoCuidador: vi.fn() };
vi.mock('../cloud/CloudContext', () => ({ useCloud: () => nuvem }));
const emergencia = { isConfirming: false };
vi.mock('../context/EmergencyContext', () => ({ useEmergency: () => emergencia }));
const olhar = { state: 'tracking', reancorando: false, isDegraded: false };
const avisarConteudoNovoSobOOlhar = vi.fn();
vi.mock('../context/GazeContext', () => ({
  useGaze: () => olhar,
  avisarConteudoNovoSobOOlhar: () => avisarConteudoNovoSobOOlhar(),
  dwellEstaSuspenso: () => false,
}));
const ajustes: { modoHorizontal: boolean; modoDeEntrada?: 'olhar' | 'acionador' } = { modoHorizontal: true };
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings: ajustes }) }));
const falarComVozDoSistema = vi.fn(async () => true);
vi.mock('../services/voz/sistema', () => ({ falarComVozDoSistema: (...a: unknown[]) => falarComVozDoSistema(...(a as [])) }));
const falarDoPaciente = vi.fn(async () => ({ origem: 'sistema' as const }));
vi.mock('../services/voz/falaDoPaciente', () => ({ falarDoPaciente: (...a: unknown[]) => falarDoPaciente(...(a as [])) }));
vi.mock('../utils/clinicalLogger', () => ({ logSentence: vi.fn() }));
// O pedido de socorro em curso (a fase dele decide se a pergunta pode abrir na tela de socorro).
const socorro: { pedido: { fase: 'aguardando' | 'escalado' | 'visto' | 'encerrado' } | null } = { pedido: null };
vi.mock('../services/emergencia/usePedidoDeSocorro', () => ({ usePedidoDeSocorro: () => socorro.pedido }));

// A frase "Seu cuidador viu o pedido às HH:MM" ainda sendo dita (a pergunta espera o fim dela).
const visto = { falando: false, ouvintes: new Set<() => void>() };
vi.mock('../services/emergencia/pedidoDeSocorro', () => ({
  vistoSendoDito: () => visto.falando,
  ouvirPedido: (o: () => void) => { visto.ouvintes.add(o); return () => { visto.ouvintes.delete(o); }; },
}));
const mudarVisto = (falando: boolean) => act(() => { visto.falando = falando; visto.ouvintes.forEach((o) => o()); });

const { PerguntaDoCuidador, BOM_DEPOIS_DO_DEGRADADO_MS } = await import('./PerguntaDoCuidador');
const { perguntaNaTela } = await import('../services/perguntaNaTela');
const { definirEmergenciaAtiva, _reiniciarParaTeste } = await import('../services/estadoDeEmergencia');
const { informarEntregaDaMensagem, _limparOuvintes } = await import('../cloud/eventos');
const { _limparZonasLaterais } = await import('./ui/zonasLaterais');

const pergunta = (id: string, text: string): Message => ({
  id, beneficiary_id: 'b1', sender: 'cuidador', kind: 'simnao', text, created_at: new Date().toISOString(), read_at: null, spoken: false,
});

const arvore = (rota = '/menu') => (
  <MemoryRouter initialEntries={[rota]}>
    <PerguntaDoCuidador />
  </MemoryRouter>
);
const montar = (rota = '/menu') => render(arvore(rota));
/** Muda o estado do olhar (o mock não avisa o React) e redesenha. */
const mudarOlhar = (r: ReturnType<typeof render>, mudanca: Partial<typeof olhar>) => {
  Object.assign(olhar, mudanca);
  r.rerender(arvore());
};

describe('Pergunta do cuidador na tela do paciente', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nuvem.perguntasDoCuidador = [pergunta('q-1', 'Você está com dor?')];
    nuvem.responderPerguntaDoCuidador = vi.fn(() => 'resp-1');
    nuvem.fecharPerguntaDoCuidador = vi.fn();
    emergencia.isConfirming = false;
    olhar.state = 'tracking';
    olhar.reancorando = false;
    olhar.isDegraded = false;
    ajustes.modoHorizontal = true;
    ajustes.modoDeEntrada = 'olhar';
    visto.falando = false;
    visto.ouvintes.clear();
    falarComVozDoSistema.mockClear();
    falarDoPaciente.mockClear();
    avisarConteudoNovoSobOOlhar.mockClear();
    socorro.pedido = null;
    _reiniciarParaTeste();
    _limparOuvintes();
    _limparZonasLaterais();
  });
  afterEach(() => {
    vi.useRealTimers();
    _reiniciarParaTeste();
    _limparZonasLaterais();
  });

  it('numa tela comum: mostra a pergunta grande, fala uma vez e avisa o olhar de que há conteúdo novo', () => {
    montar();
    expect(screen.getByRole('dialog', { name: 'Você está com dor?' })).toBeInTheDocument();
    expect(falarComVozDoSistema).toHaveBeenCalledTimes(1);
    expect(falarComVozDoSistema).toHaveBeenCalledWith('Você está com dor?', expect.objectContaining({ prioritaria: true }));
    expect(avisarConteudoNovoSobOOlhar).toHaveBeenCalledTimes(1);
    // NÃO à esquerda e SIM à direita, pela coluna do olhar.
    const nao = screen.getByRole('button', { name: 'Responder NÃO' });
    const sim = screen.getByRole('button', { name: 'Responder SIM' });
    expect(nao.dataset.lado).toBe('esquerda');
    expect(sim.dataset.lado).toBe('direita');
    expect(sim.getAttribute('data-dwell-eixo')).toBe('x');
  });

  it('não abre durante a emergência (pedido em curso): espera, e abre quando ela acaba', () => {
    act(() => definirEmergenciaAtiva(true, 'pedido'));
    montar();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(falarComVozDoSistema).not.toHaveBeenCalled();
    act(() => definirEmergenciaAtiva(false, 'pedido'));
    expect(screen.getByRole('dialog', { name: 'Você está com dor?' })).toBeInTheDocument();
    expect(falarComVozDoSistema).toHaveBeenCalledTimes(1);
  });

  it('não abre durante a contagem da Emergência', () => {
    emergencia.isConfirming = true;
    montar();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(falarComVozDoSistema).not.toHaveBeenCalled();
  });

  it('não abre durante a calibração, nem no reajuste rápido, nem nas telas da calibração', () => {
    olhar.state = 'calibrating';
    const { unmount } = montar();
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    olhar.state = 'tracking';
    olhar.reancorando = true;
    const segunda = montar();
    expect(screen.queryByRole('dialog')).toBeNull();
    segunda.unmount();
    olhar.reancorando = false;
    montar('/calibration-check');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(falarComVozDoSistema).not.toHaveBeenCalled();
  });

  it('se a emergência começa com a pergunta aberta, ela sai da frente e volta depois (falada de novo)', () => {
    montar();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => definirEmergenciaAtiva(true, 'confirmacao'));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => definirEmergenciaAtiva(false, 'confirmacao'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(falarComVozDoSistema).toHaveBeenCalledTimes(2);
    // Ao abrir, ao sair da frente (a tela de baixo volta sob o olhar) e ao voltar.
    expect(avisarConteudoNovoSobOOlhar).toHaveBeenCalledTimes(3);
  });

  // Revisão de 21/10/2026: ao fechar, a tela de baixo volta sob o olhar parado
  // — a metade do Sim · Não logo atrás da resposta acionaria sozinha.
  it('ao fechar (respondida), avisa o olhar de que a tela de baixo voltou', () => {
    montar();
    expect(avisarConteudoNovoSobOOlhar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Responder SIM' }));
    nuvem.perguntasDoCuidador = [];
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(avisarConteudoNovoSobOOlhar).toHaveBeenCalledTimes(2);
  });

  it('a resposta é enviada UMA vez (dois acionamentos seguidos), falada pela voz do paciente e mostrada com a entrega', () => {
    montar();
    const sim = screen.getByRole('button', { name: 'Responder SIM' });
    fireEvent.click(sim);
    fireEvent.click(sim);
    fireEvent.click(screen.getByRole('button', { name: 'Responder NÃO' }));
    expect(nuvem.responderPerguntaDoCuidador).toHaveBeenCalledTimes(1);
    expect(nuvem.responderPerguntaDoCuidador).toHaveBeenCalledWith('q-1', 'sim');
    expect(falarDoPaciente).toHaveBeenCalledTimes(1);
    expect(falarDoPaciente).toHaveBeenCalledWith('Sim', expect.anything());
    expect(screen.getByText('Você respondeu SIM.')).toBeInTheDocument();
    // A pergunta respondida sai da fila (a nuvem tira); a tela segue mostrando a resposta.
    nuvem.perguntasDoCuidador = [];
    act(() => informarEntregaDaMensagem('resp-1', 'gravada'));
    expect(screen.getByText(/A resposta foi para a conversa no celular do cuidador/)).toBeInTheDocument();
    // Depois de alguns segundos a tela fecha.
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sem internet: diz que a resposta vai quando a conexão voltar', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Responder NÃO' }));
    act(() => informarEntregaDaMensagem('resp-1', 'na_fila'));
    expect(screen.getByText('Você respondeu NÃO.')).toBeInTheDocument();
    expect(screen.getByText(/Sem internet agora/)).toBeInTheDocument();
  });

  it('pergunta já respondida em outro lugar: nada é falado nem mostrado como respondido', () => {
    nuvem.responderPerguntaDoCuidador = vi.fn(() => null);
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Responder SIM' }));
    expect(falarDoPaciente).not.toHaveBeenCalled();
    expect(screen.queryByText('Você respondeu SIM.')).toBeNull();
  });

  it('o "Fechar sem responder" é do cuidador: mouse e teclado, nunca o olhar', () => {
    montar();
    const fechar = screen.getByRole('button', { name: /Fechar sem responder/ });
    expect(fechar.dataset.noDwell).toBe('true');
    fireEvent.click(fechar);
    expect(nuvem.fecharPerguntaDoCuidador).toHaveBeenCalledWith('q-1');
    expect(nuvem.responderPerguntaDoCuidador).not.toHaveBeenCalled();
  });

  it('sem pergunta na fila, nada aparece', () => {
    nuvem.perguntasDoCuidador = [];
    montar();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Revisão de 21/10/2026 (Important 1): na tela de socorro, depois de o
  // cuidador VER o pedido, a pergunta dele pode abrir — é o jeito de perguntar
  // "está com dor?" enquanto ele vem. Antes do visto, e na contagem, espera.
  it('na tela de socorro: espera enquanto o cuidador não viu; depois do visto, abre ali mesmo', () => {
    act(() => {
      definirEmergenciaAtiva(true, 'pedido');
      definirEmergenciaAtiva(true, 'tela');
    });
    socorro.pedido = { fase: 'aguardando' };
    const antes = montar('/emergency');
    expect(screen.queryByRole('dialog')).toBeNull();
    antes.unmount();
    socorro.pedido = { fase: 'escalado' };
    const escalado = montar('/emergency');
    expect(screen.queryByRole('dialog')).toBeNull();
    escalado.unmount();
    expect(falarComVozDoSistema).not.toHaveBeenCalled();
    socorro.pedido = { fase: 'visto' };
    montar('/emergency');
    const dialogo = screen.getByRole('dialog', { name: 'Você está com dor?' });
    expect(falarComVozDoSistema).toHaveBeenCalledTimes(1);
    // Na tela de socorro não há faixa da Emergência: a pergunta usa a largura toda.
    expect(dialogo.style.right).toBe('0px');
  });

  it('a contagem da Emergência continua barrando, mesmo com um pedido visto', () => {
    socorro.pedido = { fase: 'visto' };
    act(() => definirEmergenciaAtiva(true, 'confirmacao'));
    montar();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a tela de socorro sem pedido (escolher o tipo) também espera', () => {
    act(() => definirEmergenciaAtiva(true, 'tela'));
    socorro.pedido = { fase: 'encerrado' };
    montar('/emergency');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Revisão de 21/10/2026 (Minor 2): a checagem rápida da retomada coleta
  // amostras em três alvos; a pergunta por cima sujaria a checagem.
  it('na retomada (a checagem rápida) espera', () => {
    montar('/retomada');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(falarComVozDoSistema).not.toHaveBeenCalled();
  });

  // Revisão de 21/10/2026 (Minor 3): com a pergunta na tela, a piscada do
  // Sim · Não de baixo pausa — ela lê este sinal.
  it('enquanto está na tela, sinaliza que há uma pergunta à vista (e para de sinalizar ao sair)', () => {
    const { unmount } = montar();
    expect(perguntaNaTela()).toBe(true);
    act(() => definirEmergenciaAtiva(true, 'confirmacao'));
    expect(perguntaNaTela()).toBe(false);
    act(() => definirEmergenciaAtiva(false, 'confirmacao'));
    expect(perguntaNaTela()).toBe(true);
    unmount();
    expect(perguntaNaTela()).toBe(false);
  });

  // Revisão de 21/10/2026 (Minor 4): sem expirar a pergunta — ela mostra a
  // hora, e a fala começa por ela quando já passou de uma hora.
  it('mostra a hora da pergunta; recente, fala só a pergunta', () => {
    vi.setSystemTime(new Date('2026-10-21T17:00:00Z'));
    nuvem.perguntasDoCuidador = [{ ...pergunta('q-h', 'Você está com dor?'), created_at: '2026-10-21T16:30:00Z' }];
    montar();
    expect(screen.getByText('Pergunta do cuidador, das 13:30')).toBeInTheDocument();
    expect(falarComVozDoSistema).toHaveBeenCalledWith('Você está com dor?', expect.anything());
  });

  it('com mais de uma hora, a fala começa pela hora', () => {
    vi.setSystemTime(new Date('2026-10-21T17:00:00Z'));
    nuvem.perguntasDoCuidador = [{ ...pergunta('q-v', 'Quer água?'), created_at: '2026-10-20T15:00:00Z' }];
    montar();
    expect(screen.getByText('Pergunta do cuidador, de ontem, às 12:00')).toBeInTheDocument();
    expect(falarComVozDoSistema).toHaveBeenCalledWith('Pergunta de ontem, às 12:00: Quer água?', expect.anything());
    // O título do diálogo continua sendo a pergunta (sem a hora).
    expect(screen.getByRole('dialog', { name: 'Quer água?' })).toBeInTheDocument();
  });

  // Revisão final, rodada 1 (I2): em `degraded` o despachante só aceita a
  // Emergência e os alvos de recuperação. As metades SIM/NÃO não são
  // recuperação, e a pergunta (z 99986) cobria o "Recalibre aqui" (z 99980): o
  // paciente sozinho em casa, com o cuidador fora, ficava sem comunicação
  // nenhuma. A pergunta espera, com histerese, enquanto o rastreamento está
  // degradado.
  describe('com o rastreamento degradado (I2)', () => {
    it('não abre (nem fala) enquanto está degradado: o "Recalibre aqui" nunca fica coberto', () => {
      olhar.isDegraded = true;
      montar();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(falarComVozDoSistema).not.toHaveBeenCalled();
      expect(perguntaNaTela()).toBe(false);
    });

    it('só abre depois de alguns segundos BONS (histerese de 4 s), e fala uma vez', () => {
      olhar.isDegraded = true;
      const r = montar();
      mudarOlhar(r, { isDegraded: false });
      expect(screen.queryByRole('dialog')).toBeNull();
      act(() => { vi.advanceTimersByTime(BOM_DEPOIS_DO_DEGRADADO_MS - 100); });
      expect(screen.queryByRole('dialog')).toBeNull();
      act(() => { vi.advanceTimersByTime(200); });
      expect(screen.getByRole('dialog', { name: 'Você está com dor?' })).toBeInTheDocument();
      expect(falarComVozDoSistema).toHaveBeenCalledTimes(1);
    });

    it('um instante bom no meio da degradação não abre: a contagem dos segundos bons recomeça', () => {
      olhar.isDegraded = true;
      const r = montar();
      mudarOlhar(r, { isDegraded: false });
      act(() => { vi.advanceTimersByTime(BOM_DEPOIS_DO_DEGRADADO_MS - 1000); });
      mudarOlhar(r, { isDegraded: true });
      mudarOlhar(r, { isDegraded: false });
      act(() => { vi.advanceTimersByTime(BOM_DEPOIS_DO_DEGRADADO_MS - 1000); });
      expect(screen.queryByRole('dialog')).toBeNull();
      act(() => { vi.advanceTimersByTime(1100); });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('aberta, sai da frente na hora em que degrada e volta falada de novo depois dos segundos bons', () => {
      const r = montar();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(falarComVozDoSistema).toHaveBeenCalledTimes(1);
      mudarOlhar(r, { isDegraded: true });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(perguntaNaTela()).toBe(false);
      mudarOlhar(r, { isDegraded: false });
      act(() => { vi.advanceTimersByTime(BOM_DEPOIS_DO_DEGRADADO_MS + 100); });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(falarComVozDoSistema).toHaveBeenCalledTimes(2);
    });

    it('quem usa o acionador não fica sem a pergunta por causa do olhar: o gate não vale nesse modo', () => {
      ajustes.modoDeEntrada = 'acionador';
      olhar.isDegraded = true;
      montar();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  // Revisão final, rodada 1 (M1): a pergunta pendente abre no instante do
  // "visto" e a voz dela (`speechSynthesis.cancel()`) cortava "Seu cuidador viu o
  // pedido às HH:MM". Agora espera o fim da frase.
  describe('o "visto" do socorro (M1)', () => {
    it('na tela de socorro, depois do visto, espera a frase "Seu cuidador viu o pedido" acabar para abrir', () => {
      act(() => {
        definirEmergenciaAtiva(true, 'pedido');
        definirEmergenciaAtiva(true, 'tela');
      });
      socorro.pedido = { fase: 'visto' };
      visto.falando = true;
      montar('/emergency');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(falarComVozDoSistema).not.toHaveBeenCalled();
      mudarVisto(false);
      expect(screen.getByRole('dialog', { name: 'Você está com dor?' })).toBeInTheDocument();
      expect(falarComVozDoSistema).toHaveBeenCalledTimes(1);
    });
  });

  // Revisão final, rodada 1 (M2): a pergunta sai da frente quando a Emergência
  // abre, e a fala dela (prioritária, até 120 s) seguia — o "ALERTA MÉDICO"
  // entrava na fila atrás e o "ALERTA CRÍTICO" era pulado. A fala dela para.
  describe('a fala da pergunta quando ela sai da frente (M2)', () => {
    const sinalDaUltimaFala = () => {
      const chamadas = falarComVozDoSistema.mock.calls as unknown as Array<[string, { sinal?: AbortSignal }]>;
      return chamadas[chamadas.length - 1][1].sinal;
    };

    it('passa um sinal para parar a própria fala, e o sinal dispara quando a Emergência abre', () => {
      montar();
      const sinal = sinalDaUltimaFala();
      expect(sinal).toBeDefined();
      expect(sinal!.aborted).toBe(false);
      act(() => definirEmergenciaAtiva(true, 'confirmacao'));
      expect(sinal!.aborted).toBe(true);
    });

    it('ao voltar, a pergunta fala de novo com um sinal NOVO (o antigo continua abortado)', () => {
      montar();
      const primeiro = sinalDaUltimaFala()!;
      act(() => definirEmergenciaAtiva(true, 'confirmacao'));
      act(() => definirEmergenciaAtiva(false, 'confirmacao'));
      const segundo = sinalDaUltimaFala()!;
      expect(segundo).not.toBe(primeiro);
      expect(primeiro.aborted).toBe(true);
      expect(segundo.aborted).toBe(false);
    });

    it('responder NÃO para a fala por sinal: a voz do paciente que vem a seguir não é cortada', () => {
      montar();
      const sinal = sinalDaUltimaFala()!;
      fireEvent.click(screen.getByRole('button', { name: 'Responder SIM' }));
      expect(sinal.aborted).toBe(false);
    });

    it('a rastreamento degradado também tira a pergunta da frente e para a fala dela', () => {
      const r = montar();
      const sinal = sinalDaUltimaFala()!;
      mudarOlhar(r, { isDegraded: true });
      expect(sinal.aborted).toBe(true);
    });

    it('fechar sem responder (o cuidador, com o mouse) também para a fala', () => {
      const r = montar();
      const sinal = sinalDaUltimaFala()!;
      nuvem.perguntasDoCuidador = [];
      r.rerender(arvore());
      expect(sinal.aborted).toBe(true);
    });
  });
});
