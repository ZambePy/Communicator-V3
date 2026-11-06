// Decomposição do erro do teste de precisão (pesquisa e auditoria de 05/11/2026).
//
// O teste de precisão mede o MAPA em malha aberta: cursor escondido, sem a
// correção por dwell. Isso é o certo para medir o modelo, mas não é o erro que
// a pessoa sente depois de algumas seleções, nem diz quanto do erro é um
// deslocamento da sessão inteira (que uma correção remove) e quanto é erro de
// padrão de cada ponto (que nenhuma correção global remove). Nos 15 relatórios
// reais de 05/09 a 25/10/2026, o deslocamento foi 26 % do erro, a distorção
// linear 18 % e o resto 57 %; com a correção por dwell aprendendo um rótulo
// por alvo, o erro dos pontos seguintes caiu de 2,35° para 1,99° em média
// (docs/MEDICOES.md §14.8).
//
// Três camadas, todas sobre os pontos internos e em px:
//   erroPx               média de |eᵢ|, o mesmo número do teste;
//   semDeslocamentoPx    média de |eᵢ − ē|: o erro depois de tirar o deslocamento
//                        MÉDIO, medido sem ruído (o que nenhuma medida real faz).
//                        Não é o mínimo possível (a mediana geométrica pode dar
//                        menos), então a parcela do deslocamento pode sair um
//                        pouco negativa num conjunto torto;
//   emUsoPx              média de |eᵢ + cᵢ| nos pontos 2..n, com cᵢ a correção
//                        do Kalman de produção (`kalmanDoDwell.ts`) depois dos
//                        rótulos 1..i−1, na ordem do teste. Supõe rótulos
//                        certos: é otimista quando o dwell erra o alvo.
//
// O replay segue o `consolidarPendente` de `correcaoPorDwell.ts`: teste χ²,
// teto do ganho de Kalman, excitação do ganho só com os rótulos ACEITOS (os
// últimos 10) e o teto de 8 % da tela no deslocamento e na correção aplicada.
// Fica de fora a predição no tempo (o teste dura ~30 s; a meia-vida é de
// 10 min) e a injeção por mudança de postura.

import {
  ROTULOS_DO_ESPALHAMENTO,
  atualizarKalman,
  correcaoNoPonto,
  criarKalman,
  excitacaoDoGanho,
  ruidoDoRotulo,
  type EstadoDoKalman,
} from './interaction/kalmanDoDwell';
import { TETO_NORMALIZADO } from './interaction/correcaoPorDwell';

export interface PontoMedido {
  alvoX: number;
  alvoY: number;
  predX: number;
  predY: number;
  /** Dispersão da predição no ponto, px. Ausente: 25 px, o típico medido. */
  sdX?: number;
  sdY?: number;
  /** Amostras efetivas (AR(1)) no ponto. Ausente: 5, o típico medido. */
  nEfetivo?: number;
}

export interface OpcoesDaDecomposicao {
  larguraPx: number;
  alturaPx: number;
  /**
   * Lado do botão dos rótulos simulados: o alvo mínimo medido na sessão.
   * `null` (alvo mínimo não medido): o uso não é estimado.
   */
  ladoDoRotuloPx: number | null;
  /** Resíduo do mapa afim sobre os mesmos pontos (`affineErrorDecomposition`). */
  residuoAfimPx: number | null;
  /** Correção por dwell com ganho (M16), como no app. */
  afim: boolean;
}

export interface DecomposicaoDoErro {
  erroPx: number;
  deslocamentoPx: { x: number; y: number };
  semDeslocamentoPx: number;
  /** Frações do erro: deslocamento, distorção linear além dele, e o resto. */
  parcelas: { deslocamento: number; linear: number | null; resto: number };
  /** Erro dos pontos 2..n com a correção por dwell; `null` com menos de 2 pontos. */
  emUsoPx: number | null;
  /** Erro dos MESMOS pontos 2..n sem correção — a comparação justa do `emUsoPx`. */
  semCorrecaoNosMesmosPontosPx: number | null;
  ladoDoRotuloPx: number | null;
}

const DISPERSAO_PADRAO_PX = 25;
const N_EFETIVO_PADRAO = 5;

const media = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const ouPadrao = (v: number | undefined, padrao: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : padrao;

/** Fator que leva um vetor (px) para dentro da elipse do teto; 1 se já está. */
function fatorDoTeto(v: { x: number; y: number }, larguraPx: number, alturaPx: number): number {
  const n = Math.hypot(v.x / larguraPx, v.y / alturaPx);
  return n > TETO_NORMALIZADO ? TETO_NORMALIZADO / n : 1;
}

/** `aplicarTeto` de produção: encolhe o deslocamento aprendido, não a covariância. */
function comTeto(e: EstadoDoKalman, larguraPx: number, alturaPx: number): EstadoDoKalman {
  const f = fatorDoTeto({ x: e.x.o, y: e.y.o }, larguraPx, alturaPx);
  return f === 1 ? e : { ...e, x: { ...e.x, o: e.x.o * f }, y: { ...e.y, o: e.y.o * f } };
}

export function decomporErro(
  pontos: readonly PontoMedido[],
  opcoes: OpcoesDaDecomposicao,
): DecomposicaoDoErro | null {
  const validos = pontos.filter((p) =>
    [p.alvoX, p.alvoY, p.predX, p.predY].every(Number.isFinite));
  if (validos.length === 0 || !(opcoes.larguraPx > 0) || !(opcoes.alturaPx > 0)) return null;

  const erros = validos.map((p) => ({ x: p.predX - p.alvoX, y: p.predY - p.alvoY }));
  const erroPx = media(erros.map((e) => Math.hypot(e.x, e.y)));
  const deslocamentoPx = { x: media(erros.map((e) => e.x)), y: media(erros.map((e) => e.y)) };
  const semDeslocamentoPx = media(erros.map((e) => Math.hypot(e.x - deslocamentoPx.x, e.y - deslocamentoPx.y)));

  const fracao = (v: number) => (erroPx > 0 ? v / erroPx : 0);
  const residuo = opcoes.residuoAfimPx !== null && Number.isFinite(opcoes.residuoAfimPx)
    ? Math.min(Math.max(0, opcoes.residuoAfimPx), semDeslocamentoPx)
    : null;
  const parcelas = {
    deslocamento: fracao(erroPx - semDeslocamentoPx),
    linear: residuo === null ? null : fracao(semDeslocamentoPx - residuo),
    resto: fracao(residuo ?? semDeslocamentoPx),
  };

  let emUsoPx: number | null = null;
  let semCorrecaoNosMesmosPontosPx: number | null = null;
  const ladoPx = opcoes.ladoDoRotuloPx;
  if (validos.length >= 2 && ladoPx !== null && ladoPx > 0) {
    const centroDaTela = { x: opcoes.larguraPx / 2, y: opcoes.alturaPx / 2 };
    const lado = { largura: ladoPx, altura: ladoPx };
    const { larguraPx, alturaPx } = opcoes;
    let estado = criarKalman();
    /** Medianas dos rótulos ACEITOS, como `posicoesDosRotulos` de produção. */
    let aceitos: { x: number; y: number }[] = [];
    const comCorrecao: number[] = [];
    const semCorrecao: number[] = [];
    validos.forEach((p, i) => {
      const mediana = { x: p.predX, y: p.predY };
      if (i >= 1) {
        const bruta = correcaoNoPonto(estado, mediana, centroDaTela);
        const f = fatorDoTeto(bruta, larguraPx, alturaPx);
        comCorrecao.push(Math.hypot(p.predX + f * bruta.x - p.alvoX, p.predY + f * bruta.y - p.alvoY));
        semCorrecao.push(Math.hypot(p.predX - p.alvoX, p.predY - p.alvoY));
      }
      const posicoes = [...aceitos, mediana];
      const r = ruidoDoRotulo(
        lado,
        { x: ouPadrao(p.sdX, DISPERSAO_PADRAO_PX), y: ouPadrao(p.sdY, DISPERSAO_PADRAO_PX) },
        ouPadrao(p.nEfetivo, N_EFETIVO_PADRAO),
      );
      const resultado = atualizarKalman(estado, { centro: { x: p.alvoX, y: p.alvoY }, mediana, r }, {
        centroDaTela,
        afim: opcoes.afim,
        excitacao: opcoes.afim
          ? {
              x: excitacaoDoGanho(posicoes.map((q) => q.x), larguraPx),
              y: excitacaoDoGanho(posicoes.map((q) => q.y), alturaPx),
            }
          : undefined,
      });
      estado = resultado.estado;
      if (resultado.aceita) {
        estado = comTeto(estado, larguraPx, alturaPx);
        aceitos = posicoes.slice(-ROTULOS_DO_ESPALHAMENTO);
      }
    });
    emUsoPx = media(comCorrecao);
    semCorrecaoNosMesmosPontosPx = media(semCorrecao);
  }

  return {
    erroPx,
    deslocamentoPx,
    semDeslocamentoPx,
    parcelas,
    emUsoPx,
    semCorrecaoNosMesmosPontosPx,
    ladoDoRotuloPx: opcoes.ladoDoRotuloPx,
  };
}
