import type { EngineDiagnostics, EngineState } from '@tracker/tracker/engine';

/**
 * Tempo de rastreamento com rosto, com o modelo do rosto em `ready`, sem
 * nenhuma leitura dele valer, a partir do qual o aviso aparece (revisão do
 * pipeline de 20/10/2026). 10 s: bem acima do que uma resposta normal leva
 * para chegar (em WASM, ~1 s no contêiner de testes, bem menos num PC) e do
 * buraco de um reinício que vai dar certo; curto o bastante para o paciente não
 * passar minutos com a mira deslocada sem ninguém saber.
 */
export const SEM_LEITURA_VALIDA_PARA_AVISAR_MS = 10_000;

/**
 * O aviso visível quando um modelo do olhar — a L2CS-Net do rosto ou a EyeNet
 * dos olhos — parou ou não carregou (relato de 19/10/2026).
 *
 * Antes, com o worker morto ou errando toda inferência, o status seguia
 * `ready`, o bloco angular saía zerado e a mira piorava sem nada na tela: só o
 * HUD do desenvolvedor mostrava "stale 100 %". O cursor continua funcionando
 * com a íris; o aviso diz isso, diz que o IrisFlow está reiniciando o modelo e,
 * quando as tentativas acabam, o que fazer.
 *
 * Também com o status em `ready` (revisão do pipeline de 20/10/2026): um modelo
 * vivo mas lento demais — toda resposta chegando vencida, por mais de
 * `SEM_LEITURA_VALIDA_PARA_AVISAR_MS` — dava o mesmo bloco zerado sem nada na
 * tela. O aviso passa pelo mesmo caminho (`modelo_do_olhar`), e o cuidador é
 * avisado se durar.
 *
 * Só aparece com o olhar EM USO (rastreando, degradado, sem rosto): na
 * calibração a própria tela fala do modelo, e nas telas de configuração um
 * banner por isso seria ruído.
 */
export function avisoDoModeloDoOlhar(
  d: Pick<EngineDiagnostics, 'l2cs' | 'olho'> | null | undefined,
  estado: EngineState | string,
): { titulo: string; detalhe: string } | null {
  if (!d) return null;
  if (estado !== 'tracking' && estado !== 'degraded' && estado !== 'no_face') return null;

  const l2cs = d.l2cs;
  if (l2cs?.status === 'error') {
    return texto('O modelo do olhar', l2cs.motivoDoErro ?? null, l2cs.reinicio?.desistiu === true);
  }
  const olho = d.olho;
  if (olho?.ativo && olho.status === 'erro') {
    return texto('O modelo dos olhos (EyeNet)', olho.motivoDoErro ?? null, olho.reinicio?.desistiu === true);
  }
  if (l2cs?.status === 'ready' && (l2cs.semLeituraValidaMs ?? 0) >= SEM_LEITURA_VALIDA_PARA_AVISAR_MS) {
    return {
      titulo: 'O modelo do olhar está lento neste computador',
      detalhe:
        'As respostas dele estão chegando atrasadas, e a mira fica pior. O cursor continua com a ' +
        'íris; fechar outros programas abertos costuma ajudar.',
    };
  }
  return null;
}

function texto(
  nome: string,
  motivo: 'carga' | 'saida_travada' | 'falha_do_worker' | null,
  desistiu: boolean,
): { titulo: string; detalhe: string } {
  if (motivo === 'carga') {
    return {
      titulo: `${nome} não carregou`,
      detalhe:
        'O cursor continua com a íris, mas a mira fica pior. Na tela de calibração dá para ' +
        'calibrar só com a íris, que é o jeito certo de seguir sem esse modelo.',
    };
  }
  if (motivo === 'saida_travada') {
    return {
      titulo: `${nome} está esperando a imagem`,
      detalhe:
        'A imagem da câmera ficou parada ou escura. Ele volta sozinho quando a imagem voltar; ' +
        'enquanto isso, o cursor continua com a íris.',
    };
  }
  if (desistiu) {
    return {
      titulo: `${nome} parou e não voltou`,
      detalhe:
        'Tentei reiniciar algumas vezes, sem sucesso. O cursor continua com a íris, com a mira ' +
        'pior; fechar e abrir o IrisFlow costuma resolver.',
    };
  }
  return {
    titulo: `${nome} parou de responder`,
    detalhe:
      'Estou reiniciando ele sozinho — leva alguns segundos. Enquanto isso, o cursor continua ' +
      'com a íris, e a mira pode ficar um pouco pior.',
  };
}
