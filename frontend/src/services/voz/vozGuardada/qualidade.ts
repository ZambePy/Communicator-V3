/**
 * Checagem de qualidade de uma gravação da voz guardada (pedido de 19/10/2026).
 *
 * Função pura sobre as amostras (mono, -1..1): diz em linguagem simples o que
 * atrapalha — voz baixa, som estourado, barulho de fundo, gravação curta ou
 * sem voz — para a pessoa decidir gravar de novo enquanto ainda consegue. Na
 * ELA a voz muda com o tempo; uma frase mal gravada hoje pode não ter segunda
 * chance daqui a alguns meses. Por isso a checagem NUNCA impede de guardar:
 * ela aconselha.
 *
 * Como mede, em quadros de 20 ms:
 *   - ruído de fundo: a energia média dos 10 % de quadros mais quietos
 *     (sempre há silêncio antes e depois da frase — o olhar leva um tempo
 *     até "Parar");
 *   - fala: os quadros pelo menos 10 dB acima do ruído (e acima de -55 dBFS);
 *     o nível dela é a energia média desses quadros;
 *   - relação sinal/ruído: fala − ruído, em dB (as mesmas faixas da voz
 *     clonada: abaixo de 12 dB é fraca, de 12 a 20 é aceitável — ver
 *     `classificarReferencia`);
 *   - estouro: amostras no topo da escala (|x| ≥ 0,985), em trechos de 3 ou
 *     mais seguidas — um pico isolado não é estouro, um topo achatado é;
 *   - curta: menos fala do que a frase pede (a partir do número de letras, a
 *     ~14 por segundo, com folga: quem tem disartria fala mais devagar, nunca
 *     mais depressa, então a folga só protege de falso aviso).
 */

import type { QualidadeDaGravacao } from '@tracker/voz/vozGuardada';

export type ProblemaDaGravacao = 'silencio' | 'estourada' | 'curta' | 'baixa' | 'ruido';

export interface ProblemaEncontrado {
  tipo: ProblemaDaGravacao;
  /** Grave: vale gravar de novo. Leve: dá para guardar, com uma dica. */
  grave: boolean;
}

export interface AnaliseDaGravacao {
  qualidade: QualidadeDaGravacao;
  /** Do mais importante para o menos. */
  problemas: ProblemaEncontrado[];
  duracaoS: number;
  /** Tempo com voz (soma dos quadros de fala). */
  falaS: number;
  /** Onde a voz começa e termina (para aparar o silêncio). `null` sem voz. */
  inicioDaFalaS: number | null;
  fimDaFalaS: number | null;
  picoDbfs: number;
  falaDbfs: number | null;
  ruidoDbfs: number;
  snrDb: number | null;
  /** Fração das amostras no topo da escala. */
  fracaoEstourada: number;
}

export const LIMIARES = {
  quadroMs: 20,
  topoDaEscala: 0.985,
  estouroTrechoMin: 3,
  estouroTrechosGrave: 3,
  estouroFracaoGrave: 0.001,
  silencioPicoDbfs: -45,
  falaAcimaDoRuidoDb: 10,
  falaMinimaDbfs: -55,
  baixaGraveDbfs: -42,
  baixaDbfs: -33,
  snrGraveDb: 12,
  snrDb: 20,
  ruidoAltoDbfs: -38,
  letrasPorSegundo: 14,
  fracaoDaDuracaoEsperada: 0.4,
  falaMinimaS: 0.2,
} as const;

const PRIORIDADE: readonly ProblemaDaGravacao[] = ['silencio', 'estourada', 'curta', 'baixa', 'ruido'];

const db = (energiaMedia: number) => 10 * Math.log10(energiaMedia + 1e-12);

/** Quanto de fala a frase pede, no mínimo, em segundos. */
export function falaMinimaParaOTexto(texto: string): number {
  const letras = (texto.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const esperada = Math.max(0.25, letras / LIMIARES.letrasPorSegundo);
  return Math.max(LIMIARES.falaMinimaS, esperada * LIMIARES.fracaoDaDuracaoEsperada);
}

export function analisarGravacao(amostras: Float32Array, taxa: number, texto = ''): AnaliseDaGravacao {
  const n = amostras.length;
  const duracaoS = taxa > 0 ? n / taxa : 0;
  const vazia: AnaliseDaGravacao = {
    qualidade: 'refazer', problemas: [{ tipo: 'silencio', grave: true }], duracaoS, falaS: 0,
    inicioDaFalaS: null, fimDaFalaS: null, picoDbfs: -Infinity, falaDbfs: null, ruidoDbfs: -Infinity, snrDb: null, fracaoEstourada: 0,
  };
  if (n === 0 || !(taxa > 0)) return vazia;

  // Pico e estouro numa passada só.
  let pico = 0;
  let noTopo = 0;
  let trechoAtual = 0;
  let trechos = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(amostras[i]);
    if (!Number.isFinite(a)) continue;
    if (a > pico) pico = a;
    if (a >= LIMIARES.topoDaEscala) {
      noTopo++;
      trechoAtual++;
      if (trechoAtual === LIMIARES.estouroTrechoMin) trechos++;
    } else {
      trechoAtual = 0;
    }
  }
  const picoDbfs = 20 * Math.log10(pico + 1e-12);
  const fracaoEstourada = noTopo / n;

  // Energia por quadro.
  const tamanho = Math.max(1, Math.round((taxa * LIMIARES.quadroMs) / 1000));
  const quadros = Math.max(1, Math.floor(n / tamanho));
  const energias = new Float64Array(quadros);
  for (let q = 0; q < quadros; q++) {
    let soma = 0;
    const fim = q === quadros - 1 ? n : (q + 1) * tamanho;
    for (let i = q * tamanho; i < fim; i++) {
      const x = amostras[i];
      if (Number.isFinite(x)) soma += x * x;
    }
    energias[q] = soma / (fim - q * tamanho);
  }

  const ordenadas = Array.from(energias).sort((a, b) => a - b);
  const quietos = Math.max(1, Math.floor(quadros * 0.1));
  let somaQuieta = 0;
  for (let i = 0; i < quietos; i++) somaQuieta += ordenadas[i];
  const ruidoDbfs = db(somaQuieta / quietos);

  const limiar = Math.max(ruidoDbfs + LIMIARES.falaAcimaDoRuidoDb, LIMIARES.falaMinimaDbfs);
  let primeiro = -1;
  let ultimo = -1;
  let deFala = 0;
  let energiaDaFala = 0;
  for (let q = 0; q < quadros; q++) {
    if (db(energias[q]) >= limiar) {
      if (primeiro < 0) primeiro = q;
      ultimo = q;
      deFala++;
      energiaDaFala += energias[q];
    }
  }
  const quadroS = tamanho / taxa;

  if (picoDbfs < LIMIARES.silencioPicoDbfs || deFala === 0) {
    return { ...vazia, picoDbfs, ruidoDbfs, fracaoEstourada };
  }

  const falaDbfs = db(energiaDaFala / deFala);
  const snrDb = falaDbfs - ruidoDbfs;
  const falaS = deFala * quadroS;
  const problemas: ProblemaEncontrado[] = [];

  if (trechos >= 1) {
    problemas.push({ tipo: 'estourada', grave: trechos >= LIMIARES.estouroTrechosGrave || fracaoEstourada >= LIMIARES.estouroFracaoGrave });
  }
  // Com barulho forte, a fala "some" no ruído e a medida do tempo de fala não
  // vale: dizer "ficou cortada" mandaria a pessoa fazer a coisa errada.
  if (snrDb >= LIMIARES.snrGraveDb && falaS < falaMinimaParaOTexto(texto)) problemas.push({ tipo: 'curta', grave: true });
  if (falaDbfs < LIMIARES.baixaGraveDbfs) problemas.push({ tipo: 'baixa', grave: true });
  else if (falaDbfs < LIMIARES.baixaDbfs) problemas.push({ tipo: 'baixa', grave: false });
  if (snrDb < LIMIARES.snrGraveDb) problemas.push({ tipo: 'ruido', grave: true });
  else if (snrDb < LIMIARES.snrDb || ruidoDbfs > LIMIARES.ruidoAltoDbfs) problemas.push({ tipo: 'ruido', grave: false });

  problemas.sort((a, b) => PRIORIDADE.indexOf(a.tipo) - PRIORIDADE.indexOf(b.tipo));
  const qualidade: QualidadeDaGravacao = problemas.some((p) => p.grave) ? 'refazer' : problemas.length > 0 ? 'aceitavel' : 'boa';

  return {
    qualidade, problemas, duracaoS, falaS,
    inicioDaFalaS: primeiro * quadroS,
    fimDaFalaS: (ultimo + 1) * quadroS,
    picoDbfs, falaDbfs, ruidoDbfs, snrDb, fracaoEstourada,
  };
}

/** Folga mantida antes e depois da voz ao aparar o silêncio. */
export const FOLGA_AO_APARAR_S = 0.15;

/**
 * A gravação sem o silêncio comprido das pontas (o tempo do olhar até
 * "Parar"): a mensagem guardada começa a tocar na hora. Sem voz detectada,
 * devolve a gravação inteira — aparar "nada" seria apagar a gravação.
 */
export function apararSilencio(amostras: Float32Array, taxa: number, analise: AnaliseDaGravacao): Float32Array {
  if (analise.inicioDaFalaS === null || analise.fimDaFalaS === null || !(taxa > 0)) return amostras;
  const inicio = Math.max(0, Math.floor((analise.inicioDaFalaS - FOLGA_AO_APARAR_S) * taxa));
  const fim = Math.min(amostras.length, Math.ceil((analise.fimDaFalaS + FOLGA_AO_APARAR_S) * taxa));
  return fim > inicio ? amostras.slice(inicio, fim) : amostras;
}

// ── O que a tela diz ───────────────────────────────────────────────────────

export const MENSAGENS: Readonly<Record<ProblemaDaGravacao, { titulo: string; dica: string }>> = {
  silencio: {
    titulo: 'Não ouvi a sua voz.',
    dica: 'Confira se o microfone está ligado e perto da boca, e fale depois de começar a gravar.',
  },
  estourada: {
    titulo: 'O som estourou em alguns trechos.',
    dica: 'Afaste um pouco o microfone ou fale um pouco mais baixo.',
  },
  curta: {
    titulo: 'A gravação ficou curta.',
    dica: 'Parece que a frase foi cortada. Fale a frase inteira, com calma, antes de parar.',
  },
  baixa: {
    titulo: 'Ficou baixinho.',
    dica: 'Chegue o microfone mais perto ou fale um pouco mais alto.',
  },
  ruido: {
    titulo: 'Tem barulho de fundo.',
    dica: 'Se der, desligue a TV ou o ventilador e feche a janela.',
  },
};

/** A frase principal do resultado, calma, para cada veredito. */
export function resumoDaQualidade(a: AnaliseDaGravacao): string {
  if (a.qualidade === 'boa') return 'Ficou boa! Dá para ouvir e guardar.';
  if (a.qualidade === 'aceitavel') return 'Dá para guardar assim. Se quiser, grave de novo.';
  return 'Vale gravar de novo.';
}
