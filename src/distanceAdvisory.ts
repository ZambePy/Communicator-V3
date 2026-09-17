// Aviso de distância fora da faixa de calibração.
//
// `distanceCompensation.ts` CORRIGE a predição quando a distância muda. Este
// módulo INFORMA que a posição mudou — a correção continua aplicada em
// qualquer estado, e a saída para um desvio grande é reancorar as referências
// olhando o centro (`reancorarReferencias`), não voltar à cadeira. A compensação usa
// limiares ABSOLUTOS em cm (a física da correção é aditiva); o aviso usa
// PERCENTUAL da distância de calibração, porque 10 cm a 40 cm é um quarto do
// caminho e a 100 cm é um décimo.
//
// A faixa de ±15% é palpite, não medição, até haver dado de degradação do
// erro por desvio de distância — por isso o texto do aviso não traz número.
//
// Histerese: sem ela, alguém parado no limiar veria o banner piscar a cada
// respiração, e um aviso que pisca ensina o cuidador a ignorá-lo. Sair da
// faixa exige cruzar 15%; voltar exige retornar a 12%.

/**
 * Desvio relativo tolerado antes de avisar. PROVISÓRIO: enquanto não houver
 * medição de quanto o erro cresce por unidade de desvio, 15% é uma escolha
 * defensável e nada mais.
 */
export const FAIXA_PROVISORIA_PCT = 0.15;

/**
 * Margem de histerese, em pontos percentuais.
 *
 * Sair exige cruzar `FAIXA`; voltar exige retornar a `FAIXA − HISTERESE`. Os
 * 3 pontos correspondem a ~2 cm a 60 cm — maior que a oscilação de respiração
 * e postura, menor que um movimento deliberado.
 */
export const HISTERESE_PCT = 0.03;

export type EstadoDistancia =
  /** Dentro da faixa; nada a fazer. */
  | 'dentro'
  /** Perto demais: precisa AFASTAR. */
  | 'perto'
  /** Longe demais: precisa APROXIMAR. */
  | 'longe'
  /** Falta medição — não se afirma nada. */
  | 'desconhecido';

export interface AvaliacaoDistancia {
  estado: EstadoDistancia;
  /** Desvio relativo assinado: negativo = mais perto que na calibração. */
  desvioRelativo: number | null;
  /** Mensagem acionável, ou `null` quando não há nada a dizer. */
  mensagem: string | null;
  /** O estado MUDOU nesta avaliação. É o gatilho de UI: só reanimar o banner
   *  quando isto for `true` evita o efeito de "piscar" que a histerese já
   *  reduz. */
  mudou: boolean;
}

export interface OpcoesAviso {
  faixaPct?: number;
  histerresePct?: number;
}

/**
 * Avaliador com estado — a histerese exige lembrar onde estávamos.
 *
 * Puro em relação ao tempo: não consulta relógio. Quem chama decide a cadência.
 */
export class AvisoDeDistancia {
  private readonly faixa: number;
  private readonly histerese: number;
  private estadoAtual: EstadoDistancia = 'desconhecido';

  constructor(opts: OpcoesAviso = {}) {
    this.faixa = opts.faixaPct ?? FAIXA_PROVISORIA_PCT;
    this.histerese = Math.min(opts.histerresePct ?? HISTERESE_PCT, this.faixa);
  }

  get estado(): EstadoDistancia {
    return this.estadoAtual;
  }

  avaliar(
    distanciaAgoraCm: number | null | undefined,
    distanciaCalibracaoCm: number | null | undefined,
  ): AvaliacaoDistancia {
    const anterior = this.estadoAtual;

    if (
      distanciaAgoraCm == null || distanciaCalibracaoCm == null ||
      !Number.isFinite(distanciaAgoraCm) || !Number.isFinite(distanciaCalibracaoCm) ||
      distanciaCalibracaoCm <= 0 || distanciaAgoraCm <= 0
    ) {
      // Sem medição não se afirma nada. Um "você está bem" sem base seria pior
      // que silêncio: o cuidador confiaria nele.
      this.estadoAtual = 'desconhecido';
      return {
        estado: 'desconhecido',
        desvioRelativo: null,
        mensagem: null,
        mudou: anterior !== 'desconhecido',
      };
    }

    const desvio = (distanciaAgoraCm - distanciaCalibracaoCm) / distanciaCalibracaoCm;

    // O limiar depende de onde estávamos: mais largo para SAIR, mais estreito
    // para VOLTAR. É isso que impede o banner de piscar no limiar exato.
    const jaAvisando = anterior === 'perto' || anterior === 'longe';
    const limiar = jaAvisando ? this.faixa - this.histerese : this.faixa;

    let estado: EstadoDistancia;
    if (desvio < -limiar) estado = 'perto';
    else if (desvio > limiar) estado = 'longe';
    else estado = 'dentro';

    this.estadoAtual = estado;
    return {
      estado,
      desvioRelativo: desvio,
      mensagem: mensagemPara(estado),
      mudou: estado !== anterior,
    };
  }

  reset(): void {
    this.estadoAtual = 'desconhecido';
  }
}

/**
 * Texto do aviso.
 *
 * INFORMA, não manda de volta à cadeira: a compensação de distância continua
 * ativa em qualquer estado (fator clampado), e exigir que alguém com ELA
 * reproduza a posição da cadeira não é um requisito razoável. O que a pessoa
 * pode fazer, se a precisão cair, é reancorar olhando o centro — e é isso que
 * o texto oferece.
 *
 * E não traz números: o percentual é provisório, e comunicar um número
 * provisório ao cuidador transmite uma precisão que não existe.
 */
export function mensagemPara(estado: EstadoDistancia): string | null {
  switch (estado) {
    case 'perto':
      return 'Você está mais perto da tela do que quando calibrou. A correção automática está compensando; ' +
        'se a precisão cair nas bordas, reancore olhando o centro da tela.';
    case 'longe':
      return 'Você está mais longe da tela do que quando calibrou. A correção automática está compensando; ' +
        'se a precisão cair nas bordas, reancore olhando o centro da tela.';
    case 'dentro':
    case 'desconhecido':
      return null;
  }
}
