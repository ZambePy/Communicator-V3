/**
 * Seguidor de cursor: separa a TAXA DE RENDER da TAXA DE INFERÊNCIA.
 *
 * ## O problema que este módulo existe para resolver
 *
 * Até aqui a posição do cursor era escrita no DOM uma única vez por quadro de
 * câmera, de forma síncrona, dentro do callback de rAF do engine. Isso é
 * *zero-order hold* puro: entre duas amostras o cursor fica literalmente
 * imóvel, e quando uma amostra chega ele salta a distância inteira percorrida
 * no intervalo. A taxa de atualização visual passa a ser idêntica à taxa da
 * câmera, não à do display.
 *
 * A medição em duas gravações de tela (30 fps, mesma máquina) mostra o efeito,
 * e ele NÃO é o que se esperaria:
 *
 * | | build antiga | build atual |
 * |---|---|---|
 * | taxa efetiva durante movimento | 19,3 Hz | 21,2 Hz |
 * | deslocamento mediano por quadro | 0,77 px | 1,63 px |
 * | **quadros com salto > 30 px** | **0,9 %** | **11,8 %** |
 * | quadros com salto > 60 px | 0,4 % | 4,9 % |
 *
 * Ou seja: a taxa praticamente não mudou. O que mudou foi a DISTRIBUIÇÃO DO
 * TAMANHO DO PASSO — saltos grandes ficaram ~13× mais frequentes. O que o
 * usuário descreve como "travada" não é o cursor parar: é o padrão
 * **para-e-teleporta**. Um cursor que fica 2–3 quadros imóvel e então pula 60 px
 * é lido como "travou e pulou"; um cursor que anda 1 px por quadro na mesma
 * taxa é lido como contínuo. Foi exatamente essa a diferença entre as duas
 * gravações.
 *
 * ## A estratégia: interpolação de alcance, não suavização
 *
 * Este módulo NÃO é um filtro e não reduz ruído — quem faz isso é o One Euro,
 * a montante. Ele apenas distribui, pelos quadros de display, o passo que já
 * foi decidido pelo pipeline.
 *
 * Quando uma amostra nova chega, o seguidor estima quando a PRÓXIMA deve
 * chegar (mediana móvel do intervalo observado) e planeja chegar ao alvo
 * exatamente nesse instante. O cursor percorre a mesma distância no mesmo
 * tempo; só que em 3 passos de 20 px em vez de 1 de 60 px.
 *
 * **Custo em latência: meio intervalo de amostra em média (~24 ms a 21 Hz).**
 * Isso é deliberado e está dentro do orçamento medido na literatura de
 * apontamento: até ~58 ms de latência não produz efeito significativo em
 * throughput, enquanto o jitter tem custo superlinear — e num alvo pequeno,
 * dobrar o jitter chega a dobrar a taxa de erro. Trocar ~24 ms de latência por
 * uma redução de ~13× na frequência de saltos grandes é um bom negócio para
 * uma interface de dwell, em que a latência é um atraso aditivo constante
 * enquanto o jitter tira o olhar da célula e ZERA o acumulador.
 *
 * ## O que o seguidor NÃO faz
 *
 * 1. **Não segura predição velha indefinidamente.** Passado `IDADE_MAXIMA_MS`
 *    sem amostra nova, ele para de se mover e passa a reportar `parado: true`.
 *    Um cursor que continua deslizando suavemente sobre dados de 1 s atrás é
 *    pior que um cursor parado: parece que funciona.
 * 2. **Não extrapola.** Prever para onde o olhar vai eliminaria a latência
 *    residual, mas erra exatamente no fim da sacada — que é quando a pessoa
 *    está pousando no alvo e o erro custa uma seleção errada.
 * 3. **Não atrasa sacada.** Acima de `DISTANCIA_DE_SALTO_PX` o passo é
 *    majoritariamente aplicado de uma vez (ver `FRACAO_IMEDIATA_NO_SALTO`): o
 *    olho já está no destino, e arrastar o cursor por 50 ms até lá é
 *    exatamente a lentidão que se quer evitar. A interpolação serve para os
 *    passos pequenos e médios, que são a esmagadora maioria e os únicos em que
 *    ela é perceptível como fluidez.
 */

/** Intervalo assumido antes de haver medição (≈30 Hz). */
export const INTERVALO_PADRAO_MS = 33;

/**
 * Teto do intervalo planejado. Acima disto o seguidor prefere chegar antes e
 * esperar do que planejar uma travessia longa sobre uma taxa que caiu.
 */
export const INTERVALO_MAXIMO_MS = 120;

/**
 * Sem amostra nova por mais que isto, o seguidor congela onde está.
 *
 * Generoso o bastante para atravessar uma piscada ou um quadro perdido sem
 * piscar o cursor, curto o bastante para que ninguém opere sobre dado velho.
 */
export const IDADE_MAXIMA_MS = 300;

/**
 * Acima desta distância o passo é tratado como sacada e vai quase inteiro de
 * uma vez. ~2,5° na geometria de referência (38,5 px/grau).
 */
export const DISTANCIA_DE_SALTO_PX = 96;

/** Fração do passo aplicada imediatamente quando ele é uma sacada. */
export const FRACAO_IMEDIATA_NO_SALTO = 0.8;

export interface AmostraDeCursor {
  x: number;
  y: number;
  /** Instante em que a amostra foi produzida, em ms de relógio monotônico. */
  tMs: number;
}

export interface PosicaoRenderizada {
  x: number;
  y: number;
  /**
   * `true` quando a fonte secou (sem amostra nova há mais de
   * `IDADE_MAXIMA_MS`). Quem desenha deve sinalizar isso ao usuário em vez de
   * continuar mostrando um cursor que parece saudável.
   */
  parado: boolean;
  /** Idade da amostra mais recente, em ms. */
  idadeMs: number;
}

/** Mediana de até 5 intervalos — robusta a um quadro perdido isolado. */
function mediana(v: readonly number[]): number {
  if (v.length === 0) return INTERVALO_PADRAO_MS;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
}

export class SeguidorDeCursor {
  private alvo: AmostraDeCursor | null = null;
  private atualX = 0;
  private atualY = 0;
  /** Instante do último `render`, para integrar o movimento por tempo real. */
  private ultimoRenderMs: number | null = null;
  private tChegadaMs = 0;
  private intervalos: number[] = [];
  private ultimaAmostraMs: number | null = null;

  /**
   * Registra uma amostra nova do pipeline. Chamar no callback do engine.
   *
   * Amostras com o mesmo `tMs` da anterior são ignoradas: o rAF do engine lê o
   * mesmo cache várias vezes entre inferências, e contar isso como intervalo
   * zero destruiria a estimativa de cadência.
   */
  aoReceberAmostra(a: AmostraDeCursor): void {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.tMs)) return;

    if (this.ultimaAmostraMs !== null) {
      const dt = a.tMs - this.ultimaAmostraMs;
      if (dt <= 0) return; // mesma amostra relida
      this.intervalos.push(dt);
      if (this.intervalos.length > 5) this.intervalos.shift();
    }
    this.ultimaAmostraMs = a.tMs;

    // Primeira amostra: aparece onde está, sem travessia.
    if (this.alvo === null) {
      this.alvo = { ...a };
      this.atualX = a.x;
      this.atualY = a.y;
      this.tChegadaMs = a.tMs;
      return;
    }

    const dist = Math.hypot(a.x - this.atualX, a.y - this.atualY);

    // Sacada: o olho já está lá. Aplica a maior parte agora e interpola só o
    // resto, para não transformar responsividade em arrasto.
    if (dist > DISTANCIA_DE_SALTO_PX) {
      this.atualX += (a.x - this.atualX) * FRACAO_IMEDIATA_NO_SALTO;
      this.atualY += (a.y - this.atualY) * FRACAO_IMEDIATA_NO_SALTO;
    }

    this.alvo = { ...a };
    const intervalo = Math.min(INTERVALO_MAXIMO_MS, mediana(this.intervalos));
    this.tChegadaMs = a.tMs + intervalo;
  }

  /**
   * Posição a desenhar AGORA. Chamar uma vez por quadro de display (rAF).
   *
   * `agoraMs` é passado pelo chamador (o timestamp do rAF) para o módulo
   * permanecer puro e testável sem relógio global.
   */
  render(agoraMs: number): PosicaoRenderizada | null {
    if (this.alvo === null) return null;

    const idadeMs = Math.max(0, agoraMs - this.alvo.tMs);
    const anteriorMs = this.ultimoRenderMs;
    this.ultimoRenderMs = agoraMs;

    if (idadeMs > IDADE_MAXIMA_MS) {
      // Fonte seca: congela e avisa. Não continua deslizando para o alvo.
      return { x: this.atualX, y: this.atualY, parado: true, idadeMs };
    }

    const restanteMs = this.tChegadaMs - agoraMs;
    if (restanteMs <= 0) {
      // Prazo vencido: já devíamos estar no alvo. Chega e espera ali — é o que
      // mantém o cursor exatamente sobre a última medida enquanto a pessoa
      // fixa, que é a condição em que o dwell precisa de estabilidade.
      this.atualX = this.alvo.x;
      this.atualY = this.alvo.y;
      return { x: this.atualX, y: this.atualY, parado: false, idadeMs };
    }

    // Sem quadro anterior (primeiro render após a amostra) não há dt para
    // integrar; espera o próximo. Evita um passo gigante no primeiro quadro.
    if (anteriorMs === null) {
      return { x: this.atualX, y: this.atualY, parado: false, idadeMs };
    }
    const dtMs = agoraMs - anteriorMs;
    if (!(dtMs > 0)) {
      return { x: this.atualX, y: this.atualY, parado: false, idadeMs };
    }

    // Fração do caminho restante a cobrir neste quadro, para chegar no prazo.
    // É linear no tempo: a 60 Hz com 48 ms restantes, ~20 % por quadro.
    const fracao = Math.min(1, dtMs / (restanteMs + dtMs));
    this.atualX += (this.alvo.x - this.atualX) * fracao;
    this.atualY += (this.alvo.y - this.atualY) * fracao;
    return { x: this.atualX, y: this.atualY, parado: false, idadeMs };
  }

  /** Posição corrente sem avançar o tempo. Para quem precisa só ler. */
  posicaoAtual(): { x: number; y: number } | null {
    return this.alvo === null ? null : { x: this.atualX, y: this.atualY };
  }

  /**
   * Teleporta para uma posição, sem travessia.
   *
   * Existe para as descontinuidades LEGÍTIMAS — o cursor reaparecer depois de
   * escondido, uma reancoragem, uma troca de perfil. Interpolar por cima
   * dessas desenharia o cursor atravessando a tela.
   */
  fixarEm(x: number, y: number, tMs: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.alvo = { x, y, tMs };
    this.atualX = x;
    this.atualY = y;
    this.tChegadaMs = tMs;
    this.ultimaAmostraMs = tMs;
  }

  reiniciar(): void {
    this.alvo = null;
    this.ultimoRenderMs = null;
    this.ultimaAmostraMs = null;
    this.intervalos = [];
  }
}
