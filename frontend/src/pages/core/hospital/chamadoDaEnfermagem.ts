import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emitirPedidoDeAjuda, entregaDoPedido, ouvirEntrega, TEXTO_CURTO_DO_LIMITE_DE_CHAMADOS, TEXTO_DO_LIMITE_DE_CHAMADOS, type EntregaDoPedido,
} from '../../../cloud/eventos';
import { novoIdDePedido } from '../../../cloud/desktopSync';
import { falarDoPaciente } from '../../../services/voz/falaDoPaciente';
import { playTone } from '../../../utils/emergencyAudio';
import { FRASE_DO_CHAMADO } from './frasesDoHospital';

/**
 * O "Chamar a enfermagem" do modo hospital (rodada 3, 21/10/2026).
 *
 * É o mesmo gesto do "Chamar atenção" da tela Sim · Não: toca um chamado aqui,
 * fala e manda um pedido de AJUDA ao celular — não é a Emergência (sem contagem
 * e sem alarme contínuo). O que muda é a frase falada e o texto do pedido.
 *
 * A lógica mora aqui, e não na tela, para a tela só desenhar. Ela repete a da
 * `SimNaoScreen` de propósito, e não a importa: aquela tela está sendo mexida
 * por outra frente (modo só horizontal), e o modo hospital não pode depender de
 * um componente que ainda vai mudar. Quando as duas se assentarem, vale unir.
 *
 * O ÚLTIMO CHAMADO MORA FORA DA TELA (revisão da Task 6, menor 1): abrir a Dor
 * ou o Sim · Não e voltar remonta a tela, e a trava de 20 s e o "o celular foi
 * avisado" moravam na montagem — o toque seguinte mandava OUTRO pedido ao
 * celular do cuidador e o "você já chamou há N s" sumia.
 */

/** Não repete antes disto: um olhar que fica no botão não pode inundar o celular do cuidador. */
export const INTERVALO_DO_CHAMADO_MS = 20_000;
/** "CHAMANDO…" enquanto o chamado toca e a voz fala. */
export const CHAMANDO_MS = 2500;
/** Quanto tempo fica o "você já chamou há X s" do segundo toque. */
export const AVISO_DO_SEGUNDO_TOQUE_MS = 4000;
/** A voz espera as três notas do chamado terminarem de tocar. */
export const ESPERA_DA_VOZ_MS = 1100;

/** O que o celular do cuidador recebe junto com o pedido (a frase falada está em `frasesDoHospital.ts`). */
export const MENSAGEM_DO_PEDIDO = 'Está chamando a enfermagem (modo hospital)';

/**
 * O que aconteceu com o pedido ao celular, em palavras simples. Sem isto o
 * paciente não tem como saber se alguém fora do quarto foi avisado: sem celular
 * ligado, sem internet e sem push são três coisas diferentes (revisão de UX de
 * 19/10/2026, achado 14, na tela Sim · Não).
 */
export function textoDaEntrega(entrega: EntregaDoPedido | null): string {
  switch (entrega) {
    case 'enviado': return 'O celular do cuidador foi avisado.';
    case 'na_fila': return 'Sem internet agora: o celular do cuidador será avisado quando a internet voltar.';
    case 'sem_nuvem': return 'Nenhum celular de cuidador está ligado a este computador. O chamado tocou só aqui.';
    case 'sem_push': return 'Nenhum celular de cuidador foi avisado. O chamado tocou só aqui.';
    case 'limitado': return TEXTO_DO_LIMITE_DE_CHAMADOS;
    case 'push_incerto': return 'O pedido chegou, mas não deu para confirmar se o celular do cuidador recebeu o aviso.';
    case 'falhou': return 'Não deu para avisar o celular do cuidador. O chamado tocou só aqui.';
    case 'ensaio': return 'Modo apresentação: nada foi enviado ao celular do cuidador.';
    default: return 'Avisando o celular do cuidador…';
  }
}

/**
 * O mesmo, em uma linha, para o BOTÃO. Numa célula de ~200 px a frase inteira
 * passava de cinco linhas e empurrava o título para fora do cartão; estas cabem
 * em duas (até 32 caracteres: uma célula no piso de 5° deixa uns 174 px de
 * texto, cerca de 18 caracteres por linha a 16 px). A frase inteira vai para a
 * região de aviso (`linhaCompleta`), para o leitor de tela.
 *
 * Nenhuma diz que "a enfermagem" foi avisada: quem recebe é o celular do cuidador.
 */
export function textoCurtoDaEntrega(entrega: EntregaDoPedido | null): string {
  switch (entrega) {
    case 'enviado': return 'Cuidador avisado.';
    case 'na_fila': return 'Sem internet. Avisa ao voltar.';
    case 'sem_nuvem': return 'Sem celular: tocou só aqui.';
    case 'sem_push': return 'Ninguém avisado. Tocou só aqui.';
    case 'limitado': return TEXTO_CURTO_DO_LIMITE_DE_CHAMADOS;
    case 'push_incerto': return 'Enviado. Aviso não confirmado.';
    case 'falhou': return 'Não avisou. Tocou só aqui.';
    case 'ensaio': return 'Apresentação: nada enviado.';
    default: return 'Avisando o celular…';
  }
}

interface Chamado {
  id: string;
  /** `Date.now()` do chamado. */
  em: number;
  entrega: EntregaDoPedido | null;
}

/** O último chamado, fora da tela: a tela volta a ele quando é montada de novo. */
let ultimoChamado: Chamado | null = null;

/** Só para testes. */
export function _reiniciarChamadoDaEnfermagem(): void {
  ultimoChamado = null;
}

/**
 * O chamado guardado, se ainda vale (menos de 20 s). Um relógio que andou para
 * trás também o solta: sem isto ele travaria novos chamados pelo tempo do salto.
 * A entrega é a mais recente que o barramento sabe — pode ter chegado com a tela fechada.
 */
function retomarChamado(): Chamado | null {
  const c = ultimoChamado;
  const agora = Date.now();
  if (!c || agora < c.em || agora - c.em >= INTERVALO_DO_CHAMADO_MS) {
    ultimoChamado = null;
    return null;
  }
  const entrega = entregaDoPedido(c.id) ?? c.entrega;
  return entrega === c.entrega ? c : { ...c, entrega };
}

type Cronometro = 'chamando' | 'janela' | 'segundoToque';

export interface ChamadoDaEnfermagem {
  /** O chamado acabou de ser feito (o botão diz "CHAMANDO…"). */
  chamando: boolean;
  /** O estado do chamado em curso (até 20 s), em uma linha curta para o botão; `null` quando não há. */
  linha: string | null;
  /** O mesmo, por extenso, para a região de aviso do leitor de tela. */
  linhaCompleta: string | null;
  /** Chama; dentro dos 20 s do chamado anterior não manda outro. */
  chamar: () => void;
}

export function useChamadoDaEnfermagem(): ChamadoDaEnfermagem {
  // Voltar à tela retoma o chamado que ainda vale (ver `ultimoChamado`).
  const retomado = useRef<Chamado | null | undefined>(undefined);
  if (retomado.current === undefined) retomado.current = retomarChamado();
  const inicial: Chamado | null = retomado.current;
  const [chamado, setChamado] = useState<Chamado | null>(inicial);
  const chamadoRef = useRef<Chamado | null>(inicial);
  const [chamando, setChamando] = useState(() => inicial !== null && Date.now() - inicial.em < CHAMANDO_MS);
  /** Segundo toque dentro dos 20 s: há quantos segundos foi o chamado. */
  const [segundoToqueHaS, setSegundoToqueHaS] = useState<number | null>(null);
  const cronometros = useRef<Record<Cronometro, ReturnType<typeof setTimeout> | null>>({
    chamando: null, janela: null, segundoToque: null,
  });

  const agendar = useCallback((qual: Cronometro, fn: () => void, ms: number) => {
    const t = cronometros.current;
    if (t[qual]) clearTimeout(t[qual]!);
    t[qual] = setTimeout(() => { t[qual] = null; fn(); }, ms);
  }, []);

  const atualizar = useCallback((c: Chamado | null) => {
    chamadoRef.current = c;
    ultimoChamado = c;
    setChamado(c);
  }, []);

  /** Os relógios do chamado `c`, que já tem `jaPassouMs` de idade (0 no chamado novo, mais ao voltar à tela). */
  const armar = useCallback((c: Chamado, jaPassouMs: number) => {
    if (jaPassouMs < CHAMANDO_MS) agendar('chamando', () => setChamando(false), CHAMANDO_MS - jaPassouMs);
    agendar('janela', () => {
      if (chamadoRef.current?.id !== c.id) return;
      atualizar(null);
      setSegundoToqueHaS(null);
    }, Math.max(0, INTERVALO_DO_CHAMADO_MS - jaPassouMs));
  }, [agendar, atualizar]);

  // Ao voltar à tela com um chamado vivo, os relógios dele recomeçam de onde estavam.
  useEffect(() => {
    const c = chamadoRef.current;
    if (c) armar(c, Date.now() - c.em);
  }, [armar]);

  // O que aconteceu com o pedido do chamado em curso (a resposta da nuvem).
  useEffect(() => ouvirEntrega((id, entrega) => {
    const c = chamadoRef.current;
    if (!c || c.id !== id || c.entrega === entrega) return;
    atualizar({ ...c, entrega });
  }), [atualizar]);

  useEffect(() => () => {
    for (const t of Object.values(cronometros.current)) if (t) clearTimeout(t);
  }, []);

  const chamar = useCallback(() => {
    const agora = Date.now();
    const anterior = chamadoRef.current;
    if (anterior && agora - anterior.em < INTERVALO_DO_CHAMADO_MS) {
      // Dentro dos 20 s não sai outro pedido, e o botão diz há quanto tempo foi
      // o chamado, em vez de um "CHAMANDO…" que não fazia nada.
      setSegundoToqueHaS(Math.max(1, Math.round((agora - anterior.em) / 1000)));
      agendar('segundoToque', () => setSegundoToqueHaS(null), AVISO_DO_SEGUNDO_TOQUE_MS);
      return;
    }
    const c: Chamado = { id: novoIdDePedido(), em: agora, entrega: null };
    atualizar(c);
    setSegundoToqueHaS(null);
    setChamando(true);
    armar(c, 0);
    // Chamado de três notas, alto o bastante para o corredor.
    playTone(660, 0, 0.25, 0.5);
    playTone(880, 0.3, 0.25, 0.5);
    playTone(1100, 0.6, 0.4, 0.5);
    // A voz não é cancelada se a tela fechar nesse meio-tempo: o pedido já saiu.
    setTimeout(() => { void falarDoPaciente(FRASE_DO_CHAMADO, { rate: 0.9 }); }, ESPERA_DA_VOZ_MS);
    emitirPedidoDeAjuda('ajuda', MENSAGEM_DO_PEDIDO, c.id);
    // O barramento pode ter respondido na hora (sem nuvem, modo apresentação).
    const ja = entregaDoPedido(c.id);
    const atual = chamadoRef.current;
    if (ja && atual?.id === c.id && atual.entrega !== ja) atualizar({ ...atual, entrega: ja });
  }, [agendar, armar, atualizar]);

  // No botão cabe uma frase só: durante o aviso do segundo toque, a resposta ao
  // toque ("você já chamou há N s"); depois, o estado da entrega. O leitor de
  // tela ouve as duas, por extenso.
  const aviso = segundoToqueHaS !== null ? `Você já chamou há ${segundoToqueHaS} s.` : null;
  const linha = chamado ? (aviso ?? textoCurtoDaEntrega(chamado.entrega)) : null;
  const linhaCompleta = chamado ? `${aviso ? `${aviso} ` : ''}${textoDaEntrega(chamado.entrega)}` : null;

  return { chamando, linha, linhaCompleta, chamar };
}
