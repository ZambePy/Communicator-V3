import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Auditoria de falhas silenciosas de 18/10/2026, itens 2 e 6: o pedido sai e o
// alarme é vigiado FORA da tela; o alarme local começa conforme a entrega, e
// não só no prazo do cuidador; parar o alarme é decisão explícita.

const emitirPedidoDeAjuda = vi.fn();
const emitirFalaDoPaciente = vi.fn();
vi.mock('../../cloud/eventos', async (original) => ({
  ...(await original<typeof import('../../cloud/eventos')>()),
  emitirPedidoDeAjuda: (...a: unknown[]) => emitirPedidoDeAjuda(...a),
  emitirFalaDoPaciente: (...a: unknown[]) => emitirFalaDoPaciente(...a),
}));
const tocarSirene = vi.fn();
vi.mock('../../utils/emergencyAudio', () => ({
  tocarSirene: (...a: unknown[]) => tocarSirene(...a),
  getSharedAudioContext: () => null,
}));
const ligarAlarmeDoSistema = vi.fn();
const desligarAlarmeDoSistema = vi.fn();
const reconciliarAlarmeDoSistema = vi.fn();
vi.mock('./ponteDoAlarme', () => ({
  ligarAlarmeDoSistema: (...a: unknown[]) => ligarAlarmeDoSistema(...a),
  desligarAlarmeDoSistema: (...a: unknown[]) => desligarAlarmeDoSistema(...a),
  reconciliarAlarmeDoSistema: (...a: unknown[]) => reconciliarAlarmeDoSistema(...a),
}));

const { informarEntrega, entregaDaResposta, _limparOuvintes } = await import('../../cloud/eventos');
const socorro = await import('./pedidoDeSocorro');
const { emergenciaAtiva, _reiniciarParaTeste } = await import('../estadoDeEmergencia');

const ack = (id: string, quando = new Date().toISOString()) => ({
  id, kind: 'emergencia' as const, created_at: new Date().toISOString(), acknowledged_at: quando, resolved_at: null,
});

describe('pedido de socorro fora da tela', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _limparOuvintes();
    _reiniciarParaTeste();
    socorro._reiniciarSocorroParaTestes();
    emitirPedidoDeAjuda.mockClear();
    emitirFalaDoPaciente.mockClear();
    tocarSirene.mockClear();
    ligarAlarmeDoSistema.mockClear();
    desligarAlarmeDoSistema.mockClear();
    reconciliarAlarmeDoSistema.mockClear();
  });
  afterEach(() => {
    socorro._reiniciarSocorroParaTestes();
    vi.useRealTimers();
  });

  it('envia na hora, uma vez só, mesmo que dispare de novo com o pedido ativo', () => {
    const p = socorro.dispararPedidoDeSocorro('other', 'OUTRA URGÊNCIA');
    expect(emitirPedidoDeAjuda).toHaveBeenCalledWith('emergencia', 'OUTRA URGÊNCIA', p.id);
    const de_novo = socorro.dispararPedidoDeSocorro('pain', 'DOR');
    expect(de_novo.id).toBe(p.id);
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    expect(emergenciaAtiva()).toBe(true);
  });

  it('entregue ao celular: o alarme local espera o prazo do cuidador (45 s por padrão, o do servidor)', () => {
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    informarEntrega(p.id, 'enviado');
    vi.advanceTimersByTime(44_000);
    expect(socorro.pedidoAtual()?.fase).toBe('aguardando');
    expect(tocarSirene).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_100);
    expect(socorro.pedidoAtual()?.fase).toBe('escalado');
    expect(socorro.pedidoAtual()?.motivoDoEscalonamento).toBe('prazo');
    expect(tocarSirene).toHaveBeenCalled();
    expect(ligarAlarmeDoSistema).toHaveBeenCalledTimes(1);
  });

  it('o prazo configurado pelo cuidador vale, inclusive para o pedido em andamento', () => {
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    informarEntrega(p.id, 'enviado');
    socorro.definirPrazoDoCuidador(20);
    vi.advanceTimersByTime(19_000);
    expect(socorro.pedidoAtual()?.fase).toBe('aguardando');
    vi.advanceTimersByTime(1_100);
    expect(socorro.pedidoAtual()?.fase).toBe('escalado');
  });

  it.each(['na_fila', 'falhou', 'sem_nuvem', 'sem_push', 'limitado'] as const)(
    'não entregue a ninguém (%s): o alarme local começa em 5 s, não no prazo do cuidador',
    (entrega) => {
      socorro.definirPrazoDoCuidador(300);
      const p = socorro.dispararPedidoDeSocorro('other', 'X');
      informarEntrega(p.id, entrega);
      vi.advanceTimersByTime(4_900);
      expect(socorro.pedidoAtual()?.fase).toBe('aguardando');
      vi.advanceTimersByTime(200);
      expect(socorro.pedidoAtual()?.fase).toBe('escalado');
      expect(socorro.pedidoAtual()?.motivoDoEscalonamento).toBe('sem_entrega');
    },
  );

  // Revisão de UX de 19/10/2026 (achado 13): o reenvio da fila que acha o
  // pedido já gravado volta sem dado do push. Antes isso era "enviado" — o
  // alarme esperava o prazo do cuidador (até 300 s) como se o celular tivesse
  // sido avisado, e a tela dizia que tinha.
  it('reenvio sem dado de push (gravado, push incerto): o alarme local começa em 5 s, não no prazo do cuidador', () => {
    socorro.definirPrazoDoCuidador(300);
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    informarEntrega(p.id, entregaDaResposta({ ok: true, id: p.id, repetido: true }));
    expect(socorro.pedidoAtual()?.entrega).toBe('push_incerto');
    vi.advanceTimersByTime(4_900);
    expect(socorro.pedidoAtual()?.fase).toBe('aguardando');
    vi.advanceTimersByTime(200);
    expect(socorro.pedidoAtual()?.fase).toBe('escalado');
    expect(socorro.pedidoAtual()?.motivoDoEscalonamento).toBe('sem_entrega');
  });

  it('sem resposta do envio por 12 s: tratado como não entregue', () => {
    socorro.dispararPedidoDeSocorro('other', 'X');
    vi.advanceTimersByTime(11_900);
    expect(socorro.pedidoAtual()?.fase).toBe('aguardando');
    vi.advanceTimersByTime(200);
    expect(socorro.pedidoAtual()?.fase).toBe('escalado');
  });

  it('a fila entregou depois (na_fila → enviado): o alarme já ligado continua até alguém confirmar', () => {
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    informarEntrega(p.id, 'na_fila');
    vi.advanceTimersByTime(6_000);
    expect(socorro.pedidoAtual()?.fase).toBe('escalado');
    informarEntrega(p.id, 'enviado');
    vi.advanceTimersByTime(60_000);
    expect(socorro.pedidoAtual()?.fase).toBe('escalado');
    expect(socorro.pedidoAtual()?.entrega).toBe('enviado');
  });

  it('a confirmação do cuidador (pelo id) para o alarme, mesmo sem tela montada', () => {
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    informarEntrega(p.id, 'na_fila');
    vi.advanceTimersByTime(6_000);
    const sirenesAntes = tocarSirene.mock.calls.length;
    socorro.registrarReconhecimento(ack(p.id));
    expect(socorro.pedidoAtual()?.fase).toBe('visto');
    expect(desligarAlarmeDoSistema).toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(tocarSirene.mock.calls.length).toBe(sirenesAntes);
  });

  // Revisão de segurança de 19/10/2026: a confirmação de OUTRO pedido com
  // horário próximo valia. O "Estou indo" do "Chamar atenção" calava o
  // socorro disparado logo depois, e o alarme local nunca tocava.
  it('confirmação de OUTRO pedido nunca conta, nem a recente: o alarme local ainda toca no prazo', () => {
    const p = socorro.dispararPedidoDeSocorro('breath', 'FALTA DE AR');
    informarEntrega(p.id, 'enviado');
    socorro.registrarReconhecimento({ ...ack('pedido-de-atencao', new Date(Date.now() - 20_000).toISOString()), kind: 'ajuda' });
    socorro.registrarReconhecimento(ack('socorro-anterior', new Date(Date.now() + 1000).toISOString()));
    socorro.registrarReconhecimento(ack('antigo', '2026-01-01T10:00:30Z'));
    expect(socorro.pedidoAtual()?.fase).toBe('aguardando');
    vi.advanceTimersByTime(45_100);
    expect(socorro.pedidoAtual()?.fase).toBe('escalado');
    expect(ligarAlarmeDoSistema).toHaveBeenCalledTimes(1);
  });

  it('servidor que gravou o pedido com outro id: vale a confirmação com o id da resposta do envio', () => {
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    informarEntrega(p.id, 'enviado', 'id-gravado-no-servidor');
    socorro.registrarReconhecimento(ack('id-gravado-no-servidor'));
    expect(socorro.pedidoAtual()?.fase).toBe('visto');
    expect(socorro.pedidoAtual()?.idNoServidor).toBe('id-gravado-no-servidor');
  });

  it('o paciente parou o alarme antes de o cuidador ver: o celular recebe o aviso, o sinal de emergência apaga', () => {
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    informarEntrega(p.id, 'enviado');
    socorro.encerrarPedido('paciente_parou');
    expect(socorro.pedidoAtual()?.fase).toBe('encerrado');
    expect(socorro.haPedidoAtivo()).toBe(false);
    expect(emitirFalaDoPaciente).toHaveBeenCalledWith('O alarme de socorro foi parado no computador do paciente.', 'sistema');
    expect(emergenciaAtiva()).toBe(false);
    // Nada mais dispara depois de encerrado.
    vi.advanceTimersByTime(120_000);
    expect(tocarSirene).not.toHaveBeenCalled();
  });

  it('sem celular vinculado, parar o alarme não manda aviso para ninguém', () => {
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    informarEntrega(p.id, 'sem_nuvem');
    socorro.encerrarPedido('paciente_parou');
    expect(emitirFalaDoPaciente).not.toHaveBeenCalled();
  });

  it('depois de encerrado, um novo disparo é um pedido novo', () => {
    const a = socorro.dispararPedidoDeSocorro('other', 'X');
    socorro.encerrarPedido('concluido');
    const b = socorro.dispararPedidoDeSocorro('pain', 'DOR');
    expect(b.id).not.toBe(a.id);
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(2);
  });

  it('com o alarme tocando, a sirene repete e a frase não fala por cima da sirene', () => {
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; rate = 1; pitch = 1; volume = 1; constructor(t: string) { this.text = t; } });
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    speak.mockClear();
    informarEntrega(p.id, 'falhou');
    vi.advanceTimersByTime(5_100); // escalou: sirene de 3 s
    expect(tocarSirene).toHaveBeenCalledTimes(1);
    expect(speak).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_300); // a frase vem depois da sirene
    expect(speak).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(socorro.CICLO_DO_ALARME_MS);
    expect(tocarSirene).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  // Revisão de segurança de 19/10/2026: a página travada que o vigia recarrega
  // voltava sem o pedido e sem a sirene, e o alarme do sistema ficava preso.
  describe('recarga da página', () => {
    /** Recarga: a memória some, o sessionStorage fica. */
    function recarregar() {
      const gravado = sessionStorage.getItem(socorro.CHAVE_DO_PEDIDO_ATIVO);
      socorro._reiniciarSocorroParaTestes();
      _limparOuvintes();
      _reiniciarParaTeste();
      if (gravado !== null) sessionStorage.setItem(socorro.CHAVE_DO_PEDIDO_ATIVO, gravado);
      tocarSirene.mockClear();
      ligarAlarmeDoSistema.mockClear();
      desligarAlarmeDoSistema.mockClear();
      reconciliarAlarmeDoSistema.mockClear();
    }

    it('alarme tocando: o pedido volta escalado e o alarme volta a tocar', () => {
      const p = socorro.dispararPedidoDeSocorro('breath', 'FALTA DE AR');
      informarEntrega(p.id, 'falhou');
      vi.advanceTimersByTime(5_100);
      expect(socorro.pedidoAtual()?.fase).toBe('escalado');
      recarregar();
      expect(socorro.pedidoAtual()).toBeNull();
      expect(socorro.restaurarPedidoDeSocorro()).toBe(true);
      expect(socorro.pedidoAtual()).toMatchObject({ id: p.id, fase: 'escalado', rotulo: 'FALTA DE AR', entrega: 'falhou' });
      expect(emergenciaAtiva()).toBe(true);
      expect(tocarSirene).toHaveBeenCalledTimes(1);
      expect(ligarAlarmeDoSistema).toHaveBeenCalledTimes(1);
      expect(reconciliarAlarmeDoSistema).not.toHaveBeenCalled();
      // E a confirmação do cuidador ainda o encontra.
      socorro.registrarReconhecimento(ack(p.id));
      expect(socorro.pedidoAtual()?.fase).toBe('visto');
    });

    it('aguardando: o prazo conta do disparo, não da recarga', () => {
      const p = socorro.dispararPedidoDeSocorro('other', 'X');
      informarEntrega(p.id, 'enviado');
      vi.advanceTimersByTime(30_000);
      recarregar();
      socorro.restaurarPedidoDeSocorro();
      expect(socorro.pedidoAtual()?.fase).toBe('aguardando');
      // O alarme do sistema não fica ligado de uma página anterior.
      expect(reconciliarAlarmeDoSistema).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(14_000);
      expect(socorro.pedidoAtual()?.fase).toBe('aguardando');
      vi.advanceTimersByTime(1_200);
      expect(socorro.pedidoAtual()?.fase).toBe('escalado');
    });

    it('"gravado, push incerto" sobrevive à recarga (não vira "sem notícia")', () => {
      const p = socorro.dispararPedidoDeSocorro('other', 'X');
      informarEntrega(p.id, 'push_incerto');
      recarregar();
      socorro.restaurarPedidoDeSocorro();
      expect(socorro.pedidoAtual()?.entrega).toBe('push_incerto');
    });

    it('sem pedido gravado, a abertura desliga o alarme do sistema que tenha ficado ligado', () => {
      expect(socorro.restaurarPedidoDeSocorro()).toBe(false);
      expect(reconciliarAlarmeDoSistema).toHaveBeenCalledTimes(1);
      expect(socorro.pedidoAtual()).toBeNull();
      expect(emergenciaAtiva()).toBe(false);
    });

    it('pedido encerrado não fica gravado, e não volta', () => {
      socorro.dispararPedidoDeSocorro('other', 'X');
      expect(sessionStorage.getItem(socorro.CHAVE_DO_PEDIDO_ATIVO)).not.toBeNull();
      socorro.encerrarPedido('concluido');
      expect(sessionStorage.getItem(socorro.CHAVE_DO_PEDIDO_ATIVO)).toBeNull();
      recarregar();
      expect(socorro.restaurarPedidoDeSocorro()).toBe(false);
    });

    it('gravado ilegível, inválido ou de mais de 6 h não volta (e é apagado)', () => {
      for (const bruto of ['{quebrado', JSON.stringify({ id: 'x', fase: 'escalado' }), JSON.stringify({
        id: 'a', tipo: 'other', rotulo: 'X', disparadoEm: Date.now() - socorro.RESTAURAR_PEDIDO_ATE_MS - 1000,
        entrega: 'enviado', fase: 'escalado', vistoEm: null, escaladoEm: null, motivoDoEscalonamento: null, prazoS: 45, idNoServidor: null,
      })]) {
        sessionStorage.setItem(socorro.CHAVE_DO_PEDIDO_ATIVO, bruto);
        expect(socorro.restaurarPedidoDeSocorro()).toBe(false);
        expect(sessionStorage.getItem(socorro.CHAVE_DO_PEDIDO_ATIVO)).toBeNull();
      }
      expect(tocarSirene).not.toHaveBeenCalled();
    });
  });
});

// Revisão final, rodada 1 (M1, 21/10/2026): uma pergunta do cuidador à espera
// abre no instante do "visto", e a voz dela começa com `speechSynthesis.cancel()`:
// cortava "Seu cuidador viu o pedido às HH:MM", dita sem prioridade. O módulo diz
// quando a frase está sendo dita, para a pergunta esperar o fim dela.
describe('a frase "Seu cuidador viu o pedido às HH:MM"', () => {
  type Fala = { text: string; onend?: () => void; onerror?: () => void };
  let falas: Fala[];

  beforeEach(() => {
    vi.useFakeTimers();
    _limparOuvintes();
    _reiniciarParaTeste();
    socorro._reiniciarSocorroParaTestes();
    falas = [];
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn((u: Fala) => { falas.push(u); }) });
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      volume = 1;
      onend?: () => void;
      onerror?: () => void;
      constructor(t: string) { this.text = t; }
    });
  });
  afterEach(() => {
    socorro._reiniciarSocorroParaTestes();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const visto = () => {
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    falas = [];
    socorro.registrarReconhecimento(ack(p.id));
    return falas.find((f) => /viu o pedido/.test(f.text));
  };

  it('enquanto é dita, o módulo diz que está sendo dita; no fim, solta e avisa os ouvintes', () => {
    const avisos = vi.fn();
    const soltar = socorro.ouvirPedido(avisos);
    expect(socorro.vistoSendoDito()).toBe(false);
    const fala = visto();
    expect(fala).toBeDefined();
    expect(socorro.vistoSendoDito()).toBe(true);
    avisos.mockClear();
    fala!.onend?.();
    expect(socorro.vistoSendoDito()).toBe(false);
    expect(avisos).toHaveBeenCalled();
    soltar();
  });

  it('a fala que dá erro (ou é cortada) também solta', () => {
    const fala = visto();
    expect(socorro.vistoSendoDito()).toBe(true);
    fala!.onerror?.();
    expect(socorro.vistoSendoDito()).toBe(false);
  });

  it('o Chromium esquece de avisar o fim: solta pelo teto de 8 s, para a pergunta não esperar para sempre', () => {
    visto();
    vi.advanceTimersByTime(socorro.ESPERA_MAXIMA_DO_VISTO_MS - 100);
    expect(socorro.vistoSendoDito()).toBe(true);
    vi.advanceTimersByTime(200);
    expect(socorro.vistoSendoDito()).toBe(false);
  });

  it('sem voz no sistema não há o que esperar', () => {
    vi.unstubAllGlobals();
    const p = socorro.dispararPedidoDeSocorro('other', 'X');
    socorro.registrarReconhecimento(ack(p.id));
    expect(socorro.vistoSendoDito()).toBe(false);
  });

  it('encerrar o pedido solta a espera', () => {
    visto();
    expect(socorro.vistoSendoDito()).toBe(true);
    socorro.encerrarPedido('concluido');
    expect(socorro.vistoSendoDito()).toBe(false);
  });
});
