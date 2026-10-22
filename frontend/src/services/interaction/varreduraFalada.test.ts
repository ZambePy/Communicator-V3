import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DesfechoDaVozDoSistema, OpcoesDaVozDoSistema } from '../voz/sistema';

// A mensagem do cuidador (fala prioritária) é da voz do sistema de verdade; o
// teste a liga e desliga à mão, sem montar o `speechSynthesis`.
let prioritaria = false;
vi.mock('../voz/sistema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../voz/sistema')>()),
  falaPrioritariaEmCurso: () => prioritaria,
}));

import {
  rotuloDoItem, quemEstaFalando, criarAnunciadorDaVarredura,
  VOLUME_DA_VARREDURA_FALADA, LIMITE_DO_ROTULO, ROTULO_SEM_NOME, ESPERA_PARA_COMECAR_MS,
  FALHAS_SEGUIDAS_PARA_AVISAR, INTERVALO_DO_AVISO_NO_CONSOLE_MS, _reiniciarAvisosDaVarreduraFalada,
} from './varreduraFalada';
import { marcarFalaDoPaciente, _reiniciarFalaEmCurso } from '../voz/falaEmCurso';
import { definirEmergenciaAtiva, _reiniciarParaTeste } from '../estadoDeEmergencia';

// -----------------------------------------------------------------------------
// Varredura falada do Plano B (rodada 3, 21/10/2026): a voz do computador diz o
// nome do botão destacado, baixinho, e a cada passo corta o nome anterior.
//
// O que o paciente NÃO pode perder por causa dela:
//  - a frase dele: a voz do computador começa sempre com `cancel()`, que corta
//    qualquer fala em curso — então nada de anunciar (nem de cortar o próprio
//    anúncio) enquanto o paciente fala;
//  - o alarme do pedido de socorro e a mensagem do cuidador, pela mesma razão.
// -----------------------------------------------------------------------------

const html = (conteudo: string): HTMLElement => {
  const caixa = document.createElement('div');
  caixa.innerHTML = conteudo;
  document.body.appendChild(caixa);
  return caixa.firstElementChild as HTMLElement;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('rotuloDoItem — o nome que a voz diz', () => {
  it('o aria-label vence o texto (botão só de ícone)', () => {
    expect(rotuloDoItem(html('<button aria-label="Chamar a enfermagem">🔔</button>'))).toBe('Chamar a enfermagem');
  });

  it('o texto do botão, com espaços e quebras de linha normalizados', () => {
    expect(rotuloDoItem(html('<button>  Estou\n   com   sede </button>'))).toBe('Estou com sede');
  });

  it('um aria-label em branco cai no texto', () => {
    expect(rotuloDoItem(html('<button aria-label="  ">Sede</button>'))).toBe('Sede');
  });

  it('aria-labelledby aponta para o texto de outro elemento', () => {
    const raiz = html('<div><span id="nome-da-dor">Dor</span><button aria-labelledby="nome-da-dor"><svg></svg></button></div>');
    expect(rotuloDoItem(raiz.querySelector('button')!)).toBe('Dor');
  });

  it('sem texto, vale o title; depois o alt da imagem; depois o placeholder do campo', () => {
    expect(rotuloDoItem(html('<button title="Voltar"><svg></svg></button>'))).toBe('Voltar');
    expect(rotuloDoItem(html('<button><img alt="Cadeira" src=""></button>'))).toBe('Cadeira');
    expect(rotuloDoItem(html('<input placeholder="Escreva aqui">'))).toBe('Escreva aqui');
  });

  it('sem nome nenhum devolve vazio (quem anuncia diz "botão sem nome")', () => {
    expect(rotuloDoItem(html('<button><svg></svg></button>'))).toBe('');
  });

  // Os botões do app separam nomes com "·" ("Sim · Não", "Sede · Falar"). Lido
  // por uma voz de computador, o ponto médio pode virar "ponto", "ponto médio"
  // ou nada, conforme a voz; a vírgula vira sempre uma pausa curta.
  it('o "·" e outros separadores viram uma pausa (vírgula), não uma palavra', () => {
    expect(rotuloDoItem(html('<button aria-label="Sim · Não">x</button>'))).toBe('Sim, Não');
    expect(rotuloDoItem(html('<button>Sim · Não · Chamar</button>'))).toBe('Sim, Não, Chamar');
    expect(rotuloDoItem(html('<button aria-label="Sim•Não">x</button>'))).toBe('Sim, Não');
    expect(rotuloDoItem(html('<button aria-label="Sim | Não">x</button>'))).toBe('Sim, Não');
  });

  it('um separador solto nas pontas não deixa vírgula sobrando', () => {
    expect(rotuloDoItem(html('<button aria-label="· Sede ·">x</button>'))).toBe('Sede');
    expect(rotuloDoItem(html('<button aria-label="·">x</button>'))).toBe('');
  });

  it('um texto comprido é cortado numa palavra inteira, perto do limite', () => {
    const rotulo = rotuloDoItem(html(`<button>${'palavra '.repeat(40)}</button>`));
    expect(rotulo.length).toBeLessThanOrEqual(LIMITE_DO_ROTULO);
    expect(rotulo.length).toBeGreaterThan(LIMITE_DO_ROTULO / 2);
    expect(rotulo.endsWith('palavra')).toBe(true);
  });
});

describe('quemEstaFalando — quem a varredura não pode cortar', () => {
  beforeEach(() => {
    prioritaria = false;
    _reiniciarFalaEmCurso();
    _reiniciarParaTeste();
  });
  afterEach(() => {
    _reiniciarFalaEmCurso();
    _reiniciarParaTeste();
  });

  it('ninguém: pode falar', () => {
    expect(quemEstaFalando()).toBeNull();
  });

  it('o paciente falando (a frase dele, a mensagem guardada, a espera pela voz clonada)', () => {
    const soltar = marcarFalaDoPaciente();
    expect(quemEstaFalando()).toBe('paciente');
    soltar();
    expect(quemEstaFalando()).toBeNull();
  });

  it('a mensagem do cuidador sendo lida', () => {
    prioritaria = true;
    expect(quemEstaFalando()).toBe('cuidador');
  });

  it('o pedido de socorro em andamento (o alarme fala)', () => {
    definirEmergenciaAtiva(true, 'pedido');
    expect(quemEstaFalando()).toBe('socorro');
  });

  it('a contagem aberta e a tela de escolha da emergência NÃO calam a varredura: ouvir "CANCELAR" ajuda', () => {
    definirEmergenciaAtiva(true, 'confirmacao');
    definirEmergenciaAtiva(true, 'tela');
    expect(quemEstaFalando()).toBeNull();
  });
});

describe('o anunciador da varredura', () => {
  type Chamada = { texto: string; opcoes: OpcoesDaVozDoSistema; resolver: (d: DesfechoDaVozDoSistema) => void };

  function montar() {
    const chamadas: Chamada[] = [];
    const falar = vi.fn((texto: string, opcoes: OpcoesDaVozDoSistema = {}) =>
      new Promise<DesfechoDaVozDoSistema>((resolver) => { chamadas.push({ texto, opcoes, resolver }); }));
    const parar = vi.fn();
    const aoMudarSemSom = vi.fn();
    const anunciador = criarAnunciadorDaVarredura({ falar, parar, aoMudarSemSom });
    return { anunciador, falar, parar, aoMudarSemSom, chamadas };
  }
  /** Deixa as promessas resolvidas rodarem os `then` do anunciador. */
  const assentar = () => vi.advanceTimersByTimeAsync(0);
  const falou: DesfechoDaVozDoSistema = { falou: true };

  beforeEach(() => {
    vi.useFakeTimers();
    prioritaria = false;
    _reiniciarFalaEmCurso();
    _reiniciarParaTeste();
    _reiniciarAvisosDaVarreduraFalada();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    _reiniciarFalaEmCurso();
    _reiniciarParaTeste();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('o que anuncia', () => {
    it('o nome do botão destacado, em volume baixo', () => {
      const { anunciador, falar } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      expect(falar).toHaveBeenCalledTimes(1);
      expect(falar).toHaveBeenCalledWith('Sede', expect.objectContaining({ volume: VOLUME_DA_VARREDURA_FALADA }));
      // "baixo": bem abaixo do volume cheio da voz do paciente e do alarme.
      expect(VOLUME_DA_VARREDURA_FALADA).toBeGreaterThan(0);
      expect(VOLUME_DA_VARREDURA_FALADA).toBeLessThanOrEqual(0.5);
    });

    it('não repete enquanto o mesmo botão segue destacado (o tique chama a cada 100 ms)', () => {
      const { anunciador, falar } = montar();
      const sede = html('<button>Sede</button>');
      for (let i = 0; i < 20; i++) anunciador.destacar(sede);
      expect(falar).toHaveBeenCalledTimes(1);
    });

    it('ao avançar anuncia o seguinte (e a voz do sistema corta o anterior ao começar)', () => {
      const { anunciador, falar } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      anunciador.destacar(html('<button>Dor</button>'));
      anunciador.destacar(html('<button>Frio</button>'));
      expect(falar.mock.calls.map((c) => c[0])).toEqual(['Sede', 'Dor', 'Frio']);
    });

    it('depois de o destaque sumir (uma escolha, a pausa), o mesmo botão volta a ser anunciado', () => {
      const { anunciador, falar } = montar();
      const sede = html('<button>Sede</button>');
      anunciador.destacar(sede);
      anunciador.destacar(null);
      anunciador.destacar(sede);
      expect(falar).toHaveBeenCalledTimes(2);
    });

    it('botão sem nome: diz que não tem nome, em vez de ficar mudo (a volta não parece travada)', () => {
      const { anunciador, falar } = montar();
      anunciador.destacar(html('<button><svg></svg></button>'));
      expect(falar).toHaveBeenCalledWith(ROTULO_SEM_NOME, expect.anything());
    });

    it('a contagem da emergência aberta não cala o CANCELAR', () => {
      definirEmergenciaAtiva(true, 'confirmacao');
      const { anunciador, falar } = montar();
      anunciador.destacar(html('<button>CANCELAR</button>'));
      expect(falar).toHaveBeenCalledWith('CANCELAR', expect.anything());
    });
  });

  describe('quando o destaque some', () => {
    it('corta o anúncio que ainda toca', () => {
      const { anunciador, parar } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      anunciador.destacar(null);
      expect(parar).toHaveBeenCalledTimes(1);
    });

    it('sem anúncio nosso em curso, não corta nada (poderia ser a fala de outro)', async () => {
      const { anunciador, parar, chamadas } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      chamadas[0].resolver(falou);
      await assentar();
      anunciador.destacar(null);
      expect(parar).not.toHaveBeenCalled();
    });

    it('quem nunca anunciou nada não corta nada', () => {
      const { anunciador, parar } = montar();
      anunciador.destacar(null);
      expect(parar).not.toHaveBeenCalled();
    });
  });

  describe('nunca fala por cima do paciente', () => {
    it('com o paciente falando não anuncia, e não deixa o anúncio para depois (cortaria o fim da frase dele)', () => {
      const { anunciador, falar } = montar();
      const sede = html('<button>Sede</button>');
      const soltar = marcarFalaDoPaciente();
      anunciador.destacar(sede);
      expect(falar).not.toHaveBeenCalled();
      soltar();
      // O mesmo botão segue destacado: nenhum anúncio atrasado.
      anunciador.destacar(sede);
      expect(falar).not.toHaveBeenCalled();
      // O próximo passo volta a falar.
      anunciador.destacar(html('<button>Dor</button>'));
      expect(falar).toHaveBeenCalledWith('Dor', expect.anything());
    });

    it('o paciente começa a falar no meio do anúncio: o destaque que some NÃO corta a fala dele', () => {
      // A escolha e a fala acontecem no mesmo tique: o clique já mandou o
      // paciente falar quando o destaque é apagado logo depois.
      const { anunciador, parar } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      marcarFalaDoPaciente();
      anunciador.destacar(null);
      expect(parar).not.toHaveBeenCalled();
    });
  });

  describe('nunca fala por cima do alarme nem do cuidador', () => {
    it('lendo a mensagem do cuidador: não anuncia', () => {
      prioritaria = true;
      const { anunciador, falar } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      expect(falar).not.toHaveBeenCalled();
    });

    it('mensagem do cuidador começando no meio do anúncio: o destaque que some não a corta', () => {
      const { anunciador, parar } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      prioritaria = true;
      anunciador.destacar(null);
      expect(parar).not.toHaveBeenCalled();
    });

    it('pedido de socorro em andamento: não anuncia nem corta', () => {
      definirEmergenciaAtiva(true, 'pedido');
      const { anunciador, falar, parar } = montar();
      anunciador.destacar(html('<button>Sim, parar</button>'));
      anunciador.destacar(null);
      expect(falar).not.toHaveBeenCalled();
      expect(parar).not.toHaveBeenCalled();
    });
  });

  describe('quando a voz do computador não responde', () => {
    it('sem voz no computador: avisa na hora, e o console recebe uma linha', async () => {
      const { anunciador, aoMudarSemSom, chamadas } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      chamadas[0].resolver({ falou: false, motivo: 'sem_voz' });
      await assentar();
      expect(aoMudarSemSom).toHaveBeenCalledTimes(1);
      expect(aoMudarSemSom).toHaveBeenCalledWith(true, 'sem_voz');
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it(`defeitos esporádicos não avisam: só ${FALHAS_SEGUIDAS_PARA_AVISAR} seguidos`, async () => {
      const { anunciador, aoMudarSemSom, chamadas } = montar();
      const falhar = async (i: number, motivo: 'erro' | 'nao_comecou' = 'erro') => {
        anunciador.destacar(html(`<button>Item ${i}</button>`));
        chamadas[i].resolver({ falou: false, motivo });
        await assentar();
      };
      await falhar(0);
      await falhar(1);
      // Uma fala que saiu zera a contagem.
      anunciador.destacar(html('<button>Item 2</button>'));
      chamadas[2].resolver(falou);
      await assentar();
      await falhar(3);
      await falhar(4);
      expect(aoMudarSemSom).not.toHaveBeenCalled();
      await falhar(5, 'nao_comecou');
      expect(aoMudarSemSom).toHaveBeenCalledWith(true, 'nao_comecou');
    });

    it('anúncio cortado pelo seguinte não é defeito da voz', async () => {
      const { anunciador, aoMudarSemSom, chamadas } = montar();
      // Sem o relógio andar: o prazo de 2 s para o som começar é o teste de baixo.
      for (let i = 0; i < 6; i++) {
        anunciador.destacar(html(`<button>Item ${i}</button>`));
        chamadas[i].resolver({ falou: false, motivo: 'interrompida' });
        await assentar();
      }
      expect(aoMudarSemSom).not.toHaveBeenCalled();
    });

    it('um sintetizador travado (o som nunca começa) é pego pelo relógio, mesmo com o passo trocando o anúncio antes do prazo da voz', async () => {
      const { anunciador, aoMudarSemSom, chamadas } = montar();
      for (let i = 0; i < FALHAS_SEGUIDAS_PARA_AVISAR; i++) {
        anunciador.destacar(html(`<button>Item ${i}</button>`));
        // O passo seguinte chega e a voz do sistema corta este anúncio, sem ele ter começado.
        await vi.advanceTimersByTimeAsync(1_000);
        chamadas[i].resolver({ falou: false, motivo: 'interrompida' });
      }
      expect(aoMudarSemSom).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(ESPERA_PARA_COMECAR_MS);
      expect(aoMudarSemSom).toHaveBeenCalledWith(true, 'nao_comecou');
    });

    it('anúncio que começou a tempo não conta, ainda que o fim demore', async () => {
      const { anunciador, aoMudarSemSom, chamadas } = montar();
      for (let i = 0; i < 5; i++) {
        anunciador.destacar(html(`<button>Item ${i}</button>`));
        chamadas[i].opcoes.aoComecar?.();
      }
      await vi.advanceTimersByTimeAsync(ESPERA_PARA_COMECAR_MS * 2);
      expect(aoMudarSemSom).not.toHaveBeenCalled();
    });

    it('a voz volta a falar: o aviso some', async () => {
      const { anunciador, aoMudarSemSom, chamadas } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      chamadas[0].resolver({ falou: false, motivo: 'sem_voz' });
      await assentar();
      expect(aoMudarSemSom).toHaveBeenLastCalledWith(true, 'sem_voz');
      anunciador.destacar(html('<button>Dor</button>'));
      chamadas[1].opcoes.aoComecar?.();
      expect(aoMudarSemSom).toHaveBeenLastCalledWith(false);
    });

    it('o console recebe o aviso no máximo uma vez por minuto', async () => {
      const { anunciador, chamadas } = montar();
      const semVoz = async (i: number) => {
        anunciador.destacar(html(`<button>Item ${i}</button>`));
        chamadas[i].resolver({ falou: false, motivo: 'sem_voz' });
        await assentar();
      };
      await semVoz(0);
      // Voltou e caiu de novo, dentro do minuto.
      anunciador.destacar(html('<button>Item 1</button>'));
      chamadas[1].opcoes.aoComecar?.();
      await semVoz(2);
      expect(console.warn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(INTERVALO_DO_AVISO_NO_CONSOLE_MS);
      anunciador.destacar(html('<button>Item 3</button>'));
      chamadas[3].opcoes.aoComecar?.();
      await semVoz(4);
      expect(console.warn).toHaveBeenCalledTimes(2);
    });

    it('a voz do sistema que lança também vira aviso (nunca uma rejeição sem dono)', async () => {
      const falar = vi.fn(() => Promise.reject(new Error('o sintetizador caiu')));
      const aoMudarSemSom = vi.fn();
      const anunciador = criarAnunciadorDaVarredura({ falar, parar: vi.fn(), aoMudarSemSom });
      for (let i = 0; i < FALHAS_SEGUIDAS_PARA_AVISAR; i++) {
        anunciador.destacar(html(`<button>Item ${i}</button>`));
        await assentar();
      }
      expect(aoMudarSemSom).toHaveBeenCalledWith(true, 'erro');
    });
  });

  describe('encerrar', () => {
    it('corta o anúncio que ainda toca e não deixa relógio pendurado', () => {
      const { anunciador, parar } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      anunciador.encerrar();
      expect(parar).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('não corta a fala do paciente ao encerrar', () => {
      const { anunciador, parar } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      marcarFalaDoPaciente();
      anunciador.encerrar();
      expect(parar).not.toHaveBeenCalled();
    });

    it('depois de encerrado, nada mais é falado nem avisado', async () => {
      const { anunciador, falar, aoMudarSemSom, chamadas } = montar();
      anunciador.destacar(html('<button>Sede</button>'));
      anunciador.encerrar();
      anunciador.destacar(html('<button>Dor</button>'));
      expect(falar).toHaveBeenCalledTimes(1);
      chamadas[0].resolver({ falou: false, motivo: 'sem_voz' });
      await assentar();
      expect(aoMudarSemSom).not.toHaveBeenCalled();
    });
  });
});
