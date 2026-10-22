import type { CalibrationFitDiagnostics } from '@tracker/calibration';
import { palavraDoResultado, type PalavraDoResultado } from '@tracker/resultadoSimples';

/**
 * Traduz o diagnóstico de ajuste da calibração para linguagem de cuidador.
 *
 * ## Quem decide
 *
 * O **veredito da grade** (`gridDiagnosis`), que já é do core e já é testado.
 * Ele distingue "a periferia saiu do alcance" de "a sessão inteira está ruim" —
 * exatamente a distinção que o cuidador precisa. Um segundo classificador aqui
 * divergiria dele no primeiro ajuste de limiar, e a tela diria "bom" sobre uma
 * calibração que o core reprova.
 *
 * O LOO **rebaixa** de bom para aceitável; não reprova sozinho. A deriva
 * postural escolhe o **motivo**; também não reprova sozinha.
 *
 * O LOO usado é o da grade INTERNA (`looGradeInternaPx`): os limiares abaixo
 * vieram de calibrações de 9 alvos, e o LOO dos cantos da tela é extrapolação
 * por construção — com eles na média, a mesma sessão ia de ~83 para ~150 px
 * (replay de 23/09) e toda calibração de 13 alvos saía "aceitável, erro alto".
 * Sem o número interno (diagnóstico antigo), vale o LOO de todos os alvos.
 *
 * ## De onde vêm os números
 *
 * Das seis sessões reais em `docs/medicoes/historico/`:
 *
 *     LOO:    68 (melhor) · 170 (mediana) · 252 (pior)
 *     deriva: 1,7° a 3,5°
 *
 * A sessão com deriva de 3,47° foi classificada pelo core como
 * `periferia_fora_de_alcance`, e não como sessão ruim. Um limiar de deriva que
 * reprovasse por conta própria contradiria o core em dado medido — daí ela só
 * escolher o motivo.
 *
 * ⚠️ Seis sessões, um setup só. Os limiares vão precisar de revisão quando
 * houver dados de outras máquinas; estão em constantes nomeadas para isso.
 */

/** Até aqui o ajuste é bom. A melhor sessão medida deu 68 px. */
export const LOO_BOM_PX = 110;

/** Acima disto a cabeça migrou entre alvos o bastante para virar o motivo. */
export const DERIVA_ALTA_GRAUS = 3;

export type VeredictoDaCalibracao = 'bom' | 'aceitavel' | 'refazer';

export interface LeituraDaCalibracao {
  veredicto: VeredictoDaCalibracao;
  /** Sufixo da chave i18n do motivo. `null` quando não há o que explicar. */
  motivo: string | null;
  looErrorPx: number | null;
  /**
   * O `looErrorPx` é o da grade interna (sem os cantos da tela)? A tela diz
   * isso junto do número: "erro médio da calibração" sem ressalva leria como a
   * média de todos os alvos.
   */
  semOsCantos: boolean;
  /** Maior deriva entre os eixos, em graus. */
  derivaGraus: number | null;
}

export function lerCalibracao(
  diag: CalibrationFitDiagnostics | null
): LeituraDaCalibracao {
  // Sem diagnóstico não há o que julgar. `aceitavel` e não `refazer`: reprovar
  // por ausência de medição faria o paciente repetir a calibração inteira sem
  // que nada estivesse errado.
  if (!diag) {
    return { veredicto: 'aceitavel', motivo: null, looErrorPx: null, semOsCantos: false, derivaGraus: null };
  }

  const d = diag.poseDrift;
  const derivaGraus = d
    ? Math.max(Math.abs(d.yawDeg), Math.abs(d.pitchDeg), Math.abs(d.rollDeg))
    : null;

  const semOsCantos = diag.looGradeInternaPx !== undefined && Number.isFinite(diag.looGradeInternaPx);
  const looErrorPx = semOsCantos
    ? (diag.looGradeInternaPx as number)
    : Number.isFinite(diag.looErrorPx) ? diag.looErrorPx : null;
  const grade = diag.gridDiagnosis?.veredicto;

  let veredicto: VeredictoDaCalibracao;
  let motivo: string | null = null;

  if (grade === 'sessao_ruim') {
    veredicto = 'refazer';
    motivo = 'sessaoRuim';
  } else if (grade === 'alvo_inaprendivel') {
    // O core registra por quê: um único alvo inaprendível não move muito a
    // média, mas está DENTRO do treino dos outros e corrompe o ajuste todo.
    veredicto = 'refazer';
    motivo = 'alvoInaprendivel';
  } else if (grade === 'periferia_fora_de_alcance') {
    // Problema específico e parcial — o centro da tela continua utilizável.
    veredicto = 'aceitavel';
    motivo = 'periferia';
  } else if (looErrorPx !== null && looErrorPx > LOO_BOM_PX) {
    // Rebaixa, não reprova: LOO alto com grade ok pode ser distância ou luz, e
    // refazer a calibração não corrige nenhuma das duas.
    veredicto = 'aceitavel';
    motivo = 'erroAlto';
  } else {
    veredicto = 'bom';
  }

  // A deriva postural VENCE o motivo quando é alta e o veredito não é bom:
  // "você se mexeu entre os alvos" é acionável, e recalibrar sem corrigir a
  // posição repete o resultado.
  if (veredicto !== 'bom' && derivaGraus !== null && derivaGraus > DERIVA_ALTA_GRAUS) {
    motivo = 'derivaPostural';
  }

  return { veredicto, motivo, looErrorPx, semOsCantos, derivaGraus };
}

/**
 * A PALAVRA do resultado (pedido de 19/10/2026): "Ótima", "Boa" ou
 * "Refazer…", e a chave da frase do que fazer. É o que a tela mostra primeiro,
 * em linguagem simples E na técnica — a mesma calibração não pode ser "Boa"
 * num modo e "aceitável" no outro.
 *
 * Os limiares são os do teste de precisão (`@tracker/resultadoSimples`, a
 * mesma função que dá Excelente/Bom/Regular/Ruim): Excelente e Bom → Ótima,
 * Regular → Boa, Ruim → refazer. O erro é o do teste de precisão quando ele
 * mediu ESTE modelo (o painel do teste, que acabou de aparecer, disse a mesma
 * palavra); senão, o LOTO da grade interna da calibração — as duas medidas
 * estimam o erro num lugar em que o modelo não treinou, e a classe das duas
 * bateu em 8 das 9 sessões de `docs/medicoes/historico/`.
 *
 * Os pontos ruins vêm de `alvosParaRecoletar` (o teste, quando existe; senão a
 * qualidade de cada alvo da calibração): são exatamente os que o botão "Refazer
 * só…" refaz. Sem como refazer (flag desligada, calibração carregada do disco),
 * a lista vem vazia — e então, com o teste medido contra este modelo, valem os
 * cantos que ELE mediu como "Ruim" (`validacao.cantosRuins`): o painel do
 * teste, que acabou de aparecer, disse "Refazer os cantos", e a tela não pode
 * dizer "Ótima" logo depois (revisão do pipeline de 19/10/2026). Nesse caso a
 * frase é a sem o botão (`…SemBotao`): a tela não promete o que não pode fazer.
 */
export interface PalavraDaCalibracao {
  palavra: PalavraDoResultado;
  /** Sufixo das chaves `calib.resultado.palavra.*` e `.frase.*`. */
  titulo: string;
  frase: string;
  /** Os pontos ruins são todos de canto (o texto diz "os cantos", não "as bordas"). */
  soCantos: boolean;
  /** De onde veio o erro interior. */
  fonte: 'teste' | 'calibracao' | 'nenhuma';
}

/** Um canto da tela (e não o meio de uma borda): longe do centro nos dois eixos. */
export function ehCanto(p: { x: number; y: number }): boolean {
  return Math.abs(p.x - 0.5) > 0.4 && Math.abs(p.y - 0.5) > 0.4;
}

export function palavraDaCalibracao(
  leitura: LeituraDaCalibracao,
  diag: CalibrationFitDiagnostics | null,
  entrada: {
    validacao: {
      erroInternoPx: number | null;
      /** Os cantos que o teste mediu como "Ruim" (`getValidacaoDoModelo`). */
      cantosRuins?: readonly { x: number; y: number }[];
    } | null;
    pontosRuins: readonly { x: number; y: number; borda: boolean }[];
  },
): PalavraDaCalibracao {
  const doTeste = entrada.validacao?.erroInternoPx ?? null;
  const erroInternoPx = doTeste ?? leitura.looErrorPx;
  const fonte = doTeste !== null ? 'teste' : erroInternoPx !== null ? 'calibracao' : 'nenhuma';
  // Sem o botão, os cantos ruins do TESTE entram na palavra (ver acima).
  const semBotao = entrada.pontosRuins.length === 0 && (entrada.validacao?.cantosRuins?.length ?? 0) > 0;
  const pontosDaPalavra: readonly { x: number; y: number; borda: boolean }[] = semBotao
    ? (entrada.validacao?.cantosRuins ?? []).map((p) => ({ x: p.x, y: p.y, borda: true }))
    : entrada.pontosRuins;
  const borda = pontosDaPalavra.filter((p) => p.borda);
  const grade = diag?.gridDiagnosis?.veredicto;
  const palavra = palavraDoResultado({
    erroInternoPx,
    pontosRuins: { borda: borda.length, interno: pontosDaPalavra.length - borda.length },
    // Com o teste medido, a classe dele já diz se o miolo ficou ruim; o
    // veredito da grade é da calibração e só decide sem o teste. O alvo
    // inaprendível também reprova — o core diz que ele corrompe o ajuste dos
    // outros —, a não ser que esteja na lista para refazer: aí refazer SÓ ele
    // é a resposta certa, e a palavra vira "Refazer alguns pontos".
    sessaoRuim:
      fonte !== 'teste' &&
      (grade === 'sessao_ruim' || (grade === 'alvo_inaprendivel' && entrada.pontosRuins.length === 0)),
  });
  // TODOS os pontos da lista, não só os de borda: com um ponto do miolo junto,
  // o botão não pode dizer "só os cantos".
  const soCantos = pontosDaPalavra.length > 0 && pontosDaPalavra.every((p) => p.borda && ehCanto(p));

  let titulo: string = palavra;
  let frase: string = palavra;
  if (palavra === 'refazerCantos' && !soCantos) {
    titulo = 'refazerBordas';
    frase = 'refazerBordas';
  }
  if (semBotao && palavra === 'refazerCantos') {
    // A mesma palavra do painel do teste, sem prometer o botão que não existe
    // (`refazerCantosSemBotao` ou `refazerBordasSemBotao`).
    frase = `${frase}SemBotao`;
  } else if (palavra === 'refazerTudo') {
    frase =
      leitura.motivo === 'derivaPostural'
        ? 'refazerTudoDeriva'
        : leitura.motivo === 'sessaoRuim'
          ? 'refazerTudoLuz'
          : leitura.motivo === 'alvoInaprendivel'
            ? 'refazerTudoPonto'
            : leitura.motivo === 'periferia'
              ? 'refazerTudoDistancia'
              : 'refazerTudo';
  }
  return { palavra, titulo, frase, soCantos, fonte };
}

/** Onde fica um ponto, em palavras (chave `calib.resultado.lugar.<v>.<h>`). */
export function lugarDoPonto(p: { x: number; y: number }): string {
  const v = p.y < 1 / 3 ? 'cima' : p.y > 2 / 3 ? 'baixo' : 'meio';
  const h = p.x < 1 / 3 ? 'esquerda' : p.x > 2 / 3 ? 'direita' : 'centro';
  return `${v}.${h}`;
}
