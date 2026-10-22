/**
 * A porta única entre as telas e o assistente.
 *
 * Nenhuma tela conhece o motor, o modelo ou o armazenamento — elas pedem
 * sugestão e avisam quando o paciente falou. Isso é o que torna a rota de
 * nuvem futura uma troca aqui dentro, e não uma varredura por dez telas.
 */

import {
  assistenteAtivo,
  MAXIMO_DE_RESPOSTAS,
  palavraConhecida as palavraConhecidaNoNucleo,
  sugerirFrases as sugerirFrasesNoNucleo,
  sugerirPalavras as sugerirPalavrasNoNucleo,
  sugerirRespostas as sugerirRespostasNoNucleo,
  type EstadoDoAssistente,
  type ModoDoAssistente,
  type SugestaoDeFrase,
} from '@tracker/assistente';
import { LICENSE_KEY } from '../../context/LicenseContext';
import type { Plan } from '../license/types';
import { carregarModelo, registrarFala } from './armazenamento';

export {
  apagarModelo,
  carregarModelo,
  descarregar,
  esquecerSemGravar,
  registrarBigrama,
  registrarFala,
  registrarPalavra,
  resumoDoModelo,
  CHAVE_DO_MODELO,
} from './armazenamento';
export type { SugestaoDeFrase, ModoDoAssistente } from '@tracker/assistente';

/** O paciente pode desligar as sugestões; a preferência é local. */
export const CHAVE_DESLIGADO = 'irisflow.assistente.desligado';

export function assistenteDesligadoPeloUsuario(): boolean {
  try {
    return localStorage.getItem(CHAVE_DESLIGADO) === '1';
  } catch {
    return false;
  }
}

export function definirAssistenteDesligado(desligado: boolean): void {
  try {
    if (desligado) localStorage.setItem(CHAVE_DESLIGADO, '1');
    else localStorage.removeItem(CHAVE_DESLIGADO);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

/**
 * O plano libera o assistente? Mesma regra da voz clonada: sem o campo
 * `features` (licença em cache antigo, modo de demonstração) trata como
 * liberado — negar um recurso por falta de metadado puniria o paciente por um
 * detalhe de servidor.
 */
export function assistenteLiberadoPelaLicenca(): boolean {
  try {
    const raw = localStorage.getItem(LICENSE_KEY);
    if (!raw) return true;
    const plan = (JSON.parse(raw) as { plan?: Plan }).plan;
    const assistente = plan?.features?.assistente;
    return assistente === undefined ? true : assistente === true;
  } catch {
    return true;
  }
}

/**
 * Onde a sugestão é calculada hoje. `'nuvem'` está previsto no tipo e exigirá
 * autorização explícita por funcionalidade — enquanto não existir, o único modo
 * é o local, e ele não fala com a rede.
 */
export function modoDoAssistente(): ModoDoAssistente {
  return 'local';
}

export function estadoDoAssistente(): EstadoDoAssistente {
  return {
    liberado: assistenteLiberadoPelaLicenca(),
    modo: modoDoAssistente(),
    desligadoPeloUsuario: assistenteDesligadoPeloUsuario(),
  };
}

export function assistenteEstaAtivo(): boolean {
  return assistenteAtivo(estadoDoAssistente());
}

/** Palavras sugeridas para o texto em composição. Lista vazia se desligado. */
export function sugerirPalavras(texto: string, maximo = 4): string[] {
  if (!assistenteEstaAtivo()) return [];
  return sugerirPalavrasNoNucleo({ texto, modelo: carregarModelo(), maximo });
}

/** A palavra é conhecida (dicionário ou vocabulário do paciente)? Para o dwell em cascata. */
export function palavraConhecida(palavra: string): boolean {
  return palavraConhecidaNoNucleo(palavra, carregarModelo());
}

/** Frases sugeridas. `mensagemDoCuidador` é a última mensagem recebida, se houver. */
export function sugerirFrases(
  opcoes: { mensagemDoCuidador?: string; textoAtual?: string; maximo?: number } = {},
): SugestaoDeFrase[] {
  if (!assistenteEstaAtivo()) return [];
  return sugerirFrasesNoNucleo({
    mensagemDoCuidador: opcoes.mensagemDoCuidador,
    textoAtual: opcoes.textoAtual,
    modelo: carregarModelo(),
    maximo: opcoes.maximo ?? 4,
  });
}

/**
 * Respostas curtas para o que o cuidador acabou de perguntar (a faixa
 * "Respostas sugeridas", roadmap 1 da rodada 3). As que o paciente já deu a
 * essa pergunta vêm na frente; completam as respostas-padrão da intenção. Lista
 * vazia com o assistente desligado, e quando não há o que sugerir.
 *
 * Sugerir não aprende nem fala: quem aprende é `registrarFalaDoPaciente`, e só
 * quando o paciente ESCOLHE uma resposta.
 */
export function sugerirRespostas(pergunta: string, maximo: number = MAXIMO_DE_RESPOSTAS): string[] {
  if (!assistenteEstaAtivo()) return [];
  return sugerirRespostasNoNucleo(pergunta, carregarModelo(), { maximo });
}

/**
 * A última coisa que o cuidador disse — é o contexto que transforma predição
 * de palavra em resposta. Uma mensagem do próprio paciente depois dela encerra
 * o assunto: responder de novo à mesma pergunta seria repetir a conversa.
 *
 * Devolve a mensagem inteira (e não só o texto) porque a faixa de respostas
 * precisa do `id` para contar uma vez por mensagem e do `kind` para saber se
 * cabe sugestão. As mensagens do sistema (`kind: 'sistema'`) vêm do servidor,
 * não de uma pessoa esperando resposta: são puladas, e a pergunta anterior do
 * cuidador continua no ar.
 */
export function ultimaMensagemDoCuidador<M extends { sender: string; text: string; kind?: string }>(
  mensagens: readonly M[],
): M | undefined {
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (m.sender === 'paciente') return undefined;
    if (m.sender === 'cuidador' && m.kind !== 'sistema') return m;
  }
  return undefined;
}

/** O texto da pergunta no ar (ver `ultimaMensagemDoCuidador`). */
export function ultimaPerguntaDoCuidador(
  mensagens: readonly { sender: string; text: string; kind?: string }[],
): string | undefined {
  return ultimaMensagemDoCuidador(mensagens)?.text;
}

/**
 * O paciente falou. Aprender acontece mesmo com o assistente desligado nas
 * sugestões: desligar é sobre o que aparece na tela, não sobre esquecer o que
 * a pessoa diz — e religar depois com o modelo vazio seria uma regressão
 * invisível para o cuidador.
 */
export function registrarFalaDoPaciente(texto: string, respondendoA?: string): void {
  registrarFala(texto, respondendoA);
}
