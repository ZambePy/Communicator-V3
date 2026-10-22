/**
 * Aviso automático ao cuidador quando o olhar para de funcionar e o problema
 * DURA (pedido do dono, 18/10/2026: "mensagens de erro calmas e aviso
 * automático ao cuidador quando o problema persiste").
 *
 * O paciente com ELA que está sozinho não consegue ajeitar a webcam, fechar a
 * cortina nem reabrir o programa. O aviso na tela do computador resolve quando
 * há alguém perto; quando não há, ele pode passar minutos sem se comunicar.
 * `problemaDoRastreamento.ts` diz quando um problema durou (45 s); este módulo
 * decide se isso vira um aviso no celular e o manda pelo barramento da nuvem,
 * como um pedido do tipo `dispositivo` (o servidor manda push desse tipo).
 *
 * A calibração que deixou de valer (`calibracao_perdida`, revisão de UX de
 * 19/10/2026) avisa SEM exigir uso recente: ela só conta com o rosto na câmera
 * e de olhos abertos (`problemaPersistenteDoOlhar`), ou seja, com o paciente
 * acordado na frente do computador sem conseguir acionar nada — mesmo que a
 * calibração tenha caído de madrugada, com ele dormindo.
 *
 * O que NÃO vira aviso, de propósito:
 *  - olhos fechados: é descanso ou sono, e o socorro tem caminho próprio;
 *  - rosto fora da câmera ou quarto escuro quando o olhar não estava
 *    funcionando antes (o computador ligado sem ninguém na frente, de
 *    madrugada, acordaria a casa por nada): só avisa se houve rastreamento bom
 *    nos 10 min anteriores;
 *  - o mesmo problema de novo em menos de 15 min (sem enxurrada de avisos).
 *
 * Quando o problema que foi avisado se resolve, a conversa recebe uma nota
 * ("O olhar voltou a funcionar…"), sem push: o cuidador que estava a caminho
 * sabe que pode ir com calma. A nota só sai quando o olhar volta DE FATO — com
 * rastreamento bom depois do aviso (revisão de segurança de 19/10/2026): antes,
 * a câmera que voltava com o rosto fora do quadro (o paciente caiu de lado)
 * contava como "resolvido", e o cuidador lia que podia ir com calma enquanto o
 * paciente seguia sem o olhar — e sem a Emergência pelo olhar.
 */
import { emitirFalaDoPaciente, emitirPedidoDeAjuda } from './eventos';
import { novoIdDePedido } from './desktopSync';
import {
  ouvirProblemaPersistente,
  ultimoRastreamentoOk,
  type ProblemaPersistente,
  type TipoDeProblemaDoRastreamento,
} from '../services/problemaDoRastreamento';

/** Intervalo mínimo entre dois avisos do mesmo tipo. */
export const ESPERA_ENTRE_AVISOS_MS = 15 * 60_000;
/** "Rosto fora da câmera" só avisa se o olhar funcionou há no máximo isto antes do problema. */
export const USO_RECENTE_MS = 10 * 60_000;
/** Depois de um "resolvido" sem o olhar de volta, de quanto em quanto tempo confere se ele voltou. */
export const CONFERIR_A_VOLTA_MS = 5_000;

/** O que o cuidador lê no celular — em terceira pessoa, sem jargão, com o que fazer. */
const TEXTO_PARA_O_CUIDADOR: Record<TipoDeProblemaDoRastreamento, string | null> = {
  camera: 'A câmera do computador parou há quase um minuto, e o olhar não está acionando os botões. Pode ser o cabo da webcam ou outro programa usando a câmera.',
  rastreamento_parado: 'O rastreamento do olhar parou no computador há quase um minuto. Se não voltar sozinho, feche e abra o IrisFlow.',
  acionamento_falhou: 'O acionamento pelo olhar está falhando no computador há quase um minuto. Se não voltar sozinho, feche e abra o IrisFlow.',
  contraluz: 'Há luz forte atrás do paciente e o computador não está lendo o olhar há quase um minuto. Fechar a cortina ou acender uma luz de frente resolve.',
  rosto_perdido: 'O computador não está vendo o rosto do paciente há quase um minuto. Pode ser preciso ajeitar a posição da cabeça ou da webcam.',
  olhos_fechados: null,
  // "Ou está lento" (revisão do pipeline de 20/10/2026): o mesmo tipo passou a
  // cobrir o modelo vivo cujas respostas chegam vencidas, e aí ninguém está
  // "tentando voltar sozinho" — o texto antigo prometia isso.
  modelo_do_olhar: 'O modelo do olhar parou ou está lento no computador há quase um minuto, e a mira do olhar fica pior. Se não voltar sozinho, feche e abra o IrisFlow.',
  pouca_luz: 'Está escuro demais para o computador ver o rosto do paciente há quase um minuto, e assim o olhar não aciona os botões (nem o socorro). Acender uma luz de frente resolve.',
  calibracao_perdida: 'A calibração do olhar deixou de valer no computador, e o olhar não aciona os botões (nem o socorro). É preciso calibrar de novo, com alguém junto: leva cerca de um minuto.',
  olhar_reduzido: 'O olhar está em modo reduzido no computador há quase um minuto: o IrisFlow reiniciou a leitura do rosto e, por enquanto, o olhar só aciona o socorro, não escreve. Se não voltar sozinho, é preciso calibrar de novo, com alguém junto.',
};

export const TEXTO_DE_VOLTA = 'O olhar voltou a funcionar no computador.';

export interface EstadoDosAvisos {
  /** Último aviso de cada tipo (ms). */
  ultimoAvisoPorTipo: Partial<Record<TipoDeProblemaDoRastreamento, number>>;
}

/** O texto do aviso para este problema, ou `null` quando ele não deve virar aviso. Pura. */
export function avisoParaOCuidador(
  p: ProblemaPersistente,
  ctx: { agoraMs: number; ultimoRastreamentoOkMs: number | null; estado: EstadoDosAvisos },
): string | null {
  const texto = TEXTO_PARA_O_CUIDADOR[p.tipo];
  if (!texto) return null;
  const ultimo = ctx.estado.ultimoAvisoPorTipo[p.tipo];
  if (ultimo !== undefined && ctx.agoraMs - ultimo < ESPERA_ENTRE_AVISOS_MS) return null;
  // Rosto perdido e escuro: só depois de uso de verdade. O computador ligado
  // sem ninguém na frente, ou o quarto que apagou a luz para dormir sem o
  // paciente estar usando, não pode acordar a casa.
  if (p.tipo === 'rosto_perdido' || p.tipo === 'pouca_luz') {
    const ok = ctx.ultimoRastreamentoOkMs;
    if (ok === null || p.desdeMs - ok > USO_RECENTE_MS) return null;
  }
  return texto;
}

interface Dependencias {
  ouvir: typeof ouvirProblemaPersistente;
  ultimoOk: typeof ultimoRastreamentoOk;
  pedir: (mensagem: string, id: string) => void;
  nota: (texto: string) => void;
  agora: () => number;
  novoId: () => string;
}

const PADRAO: Dependencias = {
  ouvir: ouvirProblemaPersistente,
  ultimoOk: ultimoRastreamentoOk,
  pedir: (mensagem, id) => emitirPedidoDeAjuda('dispositivo', mensagem, id),
  nota: (texto) => emitirFalaDoPaciente(texto, 'sistema'),
  agora: () => Date.now(),
  novoId: novoIdDePedido,
};

/**
 * Liga o aviso. Devolve a função que desliga. Chamado uma vez pelo
 * `CloudProvider` (é o barramento dele que leva o aviso ao servidor).
 */
export function ligarAvisoDoProblemaAoCuidador(deps: Partial<Dependencias> = {}): () => void {
  const d = { ...PADRAO, ...deps };
  const estado: EstadoDosAvisos = { ultimoAvisoPorTipo: {} };
  /** O problema que gerou aviso e ainda não voltou. */
  let avisado: TipoDeProblemaDoRastreamento | null = null;
  let avisadoEmMs = 0;
  let conferindo: ReturnType<typeof setInterval> | null = null;

  const pararDeConferir = () => {
    if (conferindo !== null) clearInterval(conferindo);
    conferindo = null;
  };
  /** Houve rastreamento bom DEPOIS do aviso? Um "resolvido" que é só troca de problema não conta. */
  const voltou = () => {
    const ok = d.ultimoOk();
    return ok !== null && ok > avisadoEmMs;
  };
  const notaDeVolta = () => {
    pararDeConferir();
    avisado = null;
    d.nota(TEXTO_DE_VOLTA);
  };

  const soltar = d.ouvir((p) => {
    if (p === null) {
      if (avisado === null) return;
      if (voltou()) notaDeVolta();
      else if (conferindo === null) {
        conferindo = setInterval(() => {
          if (avisado !== null && voltou()) notaDeVolta();
        }, CONFERIR_A_VOLTA_MS);
      }
      return;
    }
    const agoraMs = d.agora();
    const texto = avisoParaOCuidador(p, { agoraMs, ultimoRastreamentoOkMs: d.ultimoOk(), estado });
    if (!texto) return;
    estado.ultimoAvisoPorTipo[p.tipo] = agoraMs;
    avisado = p.tipo;
    avisadoEmMs = agoraMs;
    console.info(`[cloud] problema persistente (${p.tipo}): o cuidador foi avisado.`);
    d.pedir(texto, d.novoId());
  });
  return () => {
    soltar();
    pararDeConferir();
  };
}
