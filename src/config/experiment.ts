// Configuração do pipeline ajustável sem rebuild.
//
// Lida do localStorage (ou de variáveis de ambiente no Node) com fallback para
// o default de produção. Serve para as sessões de medição trocarem uma
// condição por vez sem recompilar. Em produção nenhuma chave está setada.
//
// Console:  __irisflowExp.set('filterMode', 'kalman')  → recarregue a página
//           __irisflowExp.reset()                       → volta aos defaults
//           __irisflowExp.dump()                        → estado atual (vai no relatório)
//
// A configuração é lida UMA vez, no boot. Trocar no meio da sessão mudaria o
// vetor de features ou o filtro sob um modelo já treinado.

export interface ExperimentConfig {
  /** Fator de expansão da bbox facial antes do recorte quadrado do L2CS. */
  expandFactor: number;
  /** Cadência mínima entre submissões ao worker L2CS, em ms. */
  l2csCadenceMs: number;
  /** Lado do recorte entregue ao L2CS (o ONNX aceita 224 e 448). */
  l2csInputSize: 224 | 448;
  /**
   * Onde o L2CS roda.
   *  - `auto`   tenta WebGPU e cai para WASM se a GPU não estiver disponível.
   *             O provider efetivo fica em `EngineDiagnostics.l2cs.executionProvider`
   *             e no relatório de precisão.
   *  - `webgpu` / `wasm`  forçam um provider (para medição). Sem fallback.
   *  - `off`    não inicia o worker; o modelo usa só as 4 features de íris.
   */
  l2cs: 'auto' | 'webgpu' | 'wasm' | 'off';
  /** Expansão polinomial de grau 2 das features antes do StandardScaler. */
  polynomialFeatures: boolean;
  /**
   * FORMA da expansão polinomial.
   *
   *  - `parcial` (DEFAULT): o bloco angular (`tan yaw`/`tan pitch`, do L2CS ou
   *    do ramo ocular) fica só no termo LINEAR. Ele já chega linearizado pela
   *    tangente — `x_tela ≈ x_olho + d·tan(yaw)` —, então o quadrado e o
   *    cruzado dessas dimensões capturam apenas curvatura residual.
   *  - `completa` (histórico): todas as dimensões entram nos termos
   *    quadráticos. Com o bloco de íris inteiro isso produzia 27 colunas para
   *    9 alvos distintos determinarem — três colunas por alvo.
   *
   * Entra na chave do perfil: os coeficientes do Ridge são posicionais, e um
   * perfil treinado numa forma prevê deslocado na outra.
   */
  formaDaExpansao: 'completa' | 'parcial';
  /**
   * Quais dimensões de íris entram no vetor.
   *
   * O vetor histórico leva as quatro: `offsetX`/`offsetY` (íris menos centro
   * do olho, em unidades de imagem) e `relX`/`relY` (as mesmas divididas pela
   * largura/altura do olho). As duas famílias diferem por um divisor que varia
   * pouco entre quadros — medido em simulação com ±5 % de variação de largura,
   * a correlação entre `offsetX` e `relX` é 0,9996. São duas dimensões
   * carregando um sinal, e depois da expansão viram três colunas quase
   * idênticas (`offsetX²`, `offsetX·relX`, `relX²`) que nenhum alvo separa.
   *
   *  - `absolutas` (DEFAULT): só `offsetX`/`offsetY`. Sem divisor nenhum.
   *  - `normalizadas`: só `relX`/`relY`. Perfeitamente imunes à escala do
   *    rosto no quadro, ao custo de herdar o ruído do divisor.
   *  - `ambas` (histórico): as quatro.
   *
   * Por que `absolutas` e não `normalizadas`, já que as duas empataram no
   * erro nominal: elas se separam nos dois modos de falha que importam aqui.
   *
   *  - PTOSE (pálpebra caída, comum em ELA) corrompe a ALTURA do olho, que é
   *    o divisor de `relY`. Em simulação com a altura oscilando, `absolutas`
   *    fica imune e `normalizadas` degrada. Nada no pipeline compensa isso.
   *  - DISTÂNCIA diferente da calibração escala `offsetX`/`offsetY` e não
   *    escala `relX`/`relY`. Aqui `normalizadas` fica perfeitamente plana e
   *    `absolutas` degrada um pouco — mas a distância JÁ tem compensação
   *    dedicada a jusante (`distanceCompensation.ts`), e a ptose não tem.
   *
   * Muda o `FEATURE_VECTOR_ID` e portanto invalida perfis salvos, por
   * construção — a troca deste default obriga todo mundo a recalibrar uma vez.
   */
  dimsDaIris: 'ambas' | 'normalizadas' | 'absolutas';
  /** Compensação geométrica de pose (d·tan Δ) na saída e nos alvos de treino. */
  geometricPoseCompensation: boolean;
  /**
   * Compensação de translação lateral da cabeça (nariz em unidades da
   * distância cantal — ver `translationCompensation.ts`).
   *
   * Ligada: só age quando os marcos 33/263 do quadro corrente são válidos
   * (`iodPx > 0`), zera o eixo cujo deslocamento é implausível e o clamp de
   * borda segura o resultado final.
   */
  lateralTranslationCompensation: boolean;
  /**
   * Referência geométrica LENTA para pose e centro facial (dois relógios).
   *
   * Ligada, a referência contra a qual `poseCompensation`/`translationCompensation`
   * medem o Δ deixa de ser a média congelada da calibração e passa a ser uma
   * EMA com constante de tempo de ~30 s, que nasce nela. Ver `referenciaLenta.ts`.
   *
   * DESLIGADA por padrão desde 23/09/2026. Na gravação daquele dia a cabeça
   * girou de verdade +2,1° de yaw e −1,8° de pitch entre a calibração e o
   * teste (a ponta do nariz andou 107 % e 72 % do que a pose previa: rotação,
   * não deriva do estimador), e a EMA absorveu 43–48 % do giro em ~35 s —
   * desfazendo uma compensação que estava CERTA. Replay pelo núcleo real:
   * erro médio no miolo 88 → 67 px com a referência fixa; o fator físico k = 1
   * da compensação continua sendo o melhor. A física não distingue "virada
   * rápida" de "postura que migrou": em ambas o olho gira na órbita o mesmo
   * tanto para olhar o mesmo ponto. O que sobra de deriva real é tratado pelo
   * que mede o ERRO, não a pose: a correção por dwell e o reajuste rápido
   * olhando o centro.
   */
  referenciaLenta: boolean;
  /**
   * Correção local nos alvos de calibração fora da grade interna — os cantos
   * da tela (ver `correcaoLocal.ts`). Ligada por padrão; a flag existe para a
   * medição A/B (URL `?cantos=0`).
   */
  correcaoLocal: boolean;
  /**
   * EMA curta (≤ 150 ms) dos ângulos do L2CS durante a FIXAÇÃO, solta pela
   * velocidade angular na sacada. Reduz o ruído de precisão sem atrasar a
   * sacada. Ver `l2cs/suavizacao.ts`.
   */
  suavizarL2csNaFixacao: boolean;
  /**
   * Correção contínua aprendida com os dwells concluídos (sprint S3).
   *
   * Ligada por padrão porque é o que segura a deriva no uso real. A flag existe
   * para a medição: comparar uma rodada com e outra sem, sob o MESMO modelo, é
   * o único jeito de saber quanto ela vale — e o protocolo de precisão, que
   * calibra e mede em seguida, não a exercita.
   */
  correcaoPorDwell: boolean;
  /**
   * Ramo ocular (V2): uma rede pequena lê cada olho num recorte 96×64 e
   * acrescenta `tan(yaw)`/`tan(pitch)` do olho ao vetor de features.
   *  - `off`   não roda nada; vetor idêntico ao de antes.
   *  - `onnx`  carrega `models/eyenet/eyenet.onnx` (+ meta) em dois workers.
   * Desligado por padrão: o modelo é treinado no Communicator V2 e só entra
   * depois do A/B no conjunto interno. Ligar muda o `FEATURE_VECTOR_ID`.
   */
  eyeNet: 'off' | 'onnx';
  /** Filtro temporal. `oneEuro` é o de produção; os outros existem para o benchmark. */
  filterMode: 'oneEuro' | 'kalman' | 'kalmanEma';
  /**
   * Estabilizador por estado do olho (sprint S5): durante a fixação a saída
   * vira a média da janela de 200 ms; na sacada, volta a ser a amostra
   * filtrada.
   *
   * Ligado por padrão porque a M1 mediu razão de filtro 0,99 — o One Euro em
   * produção quase não suaviza, e esse espaço estava inteiro vazio. A flag
   * existe para a medição comparar com e sem, sob o mesmo modelo.
   */
  estabilizarFixacao: boolean;
  /**
   * Cancela o roll da cabeça no recorte do L2CS (sprint S6).
   *
   * LIGADA por padrão desde 22/09 (Etapa 0 da compensação de cabeça). Ficou
   * desligada por uma cautela específica — "só ganha se for a mesma
   * normalização do treino" — que não se sustenta para o checkpoint
   * empacotado: ele foi treinado no Gaze360, cujos recortes vêm com toda
   * inclinação natural de cabeça, inclusive nivelada. Rosto nivelado está
   * DENTRO da distribuição de treino; a rede não vê nada estranho. E a saída
   * é contra-rotacionada pelo vetor 3D (`roll.ts`), então a geometria fecha
   * exatamente. Sem isto, cada grau de cabeça inclinada entrava no L2CS como
   * imagem torta e saía como erro de olhar — numa cadeira reclinável, o estado
   * normal. O roll que vai para o recorte é SUAVIZADO (`rollSuave.ts`, τ =
   * 150 ms) para o tremor do MediaPipe não virar tremor de imagem.
   *
   * O que ainda falta é a MEDIÇÃO em vídeo real: duas sessões, uma com e outra
   * sem, cabeça inclinada ~15°, comparando erro médio e BCEA no teste de
   * precisão. Desligar: `__irisflowExp.set('normalizarRollNoCrop', false)`.
   */
  normalizarRollNoCrop: boolean;
  /**
   * Usa as SETE dimensões do bloco angular do L2CS em vez de duas (sprint S7).
   *
   * Desligada por padrão: é uma ablação, e ela muda o `FEATURE_VECTOR_ID`, o
   * que invalida todo perfil salvo — proteção, não obstáculo, mas que precisa
   * de migração pensada antes de virar produção.
   */
  blocoL2csCompleto: boolean;
  /** Diâmetro do cursor de gaze, em px. */
  cursorSizePx: number;
  /** Anel de progresso do dwell desenhado ao redor do cursor. */
  dwellRingOnCursor: boolean;
  /**
   * Mantém o cursor visível DURANTE o teste de precisão.
   *
   * Desligada por default, e o default não é conservadorismo: vendo o cursor,
   * a pessoa tenta corrigi-lo e o número medido passa a ser o do loop de
   * perseguição, não o do modelo. Uma rodada com isto ligado **não é
   * comparável** com uma rodada sem — nem entre blocos da mesma sessão.
   *
   * Existe porque o operador precisa de um jeito de ver, ao vivo, se o cursor
   * acompanha o alvo: um erro de 3° e um mapeamento invertido produzem
   * relatórios parecidos e telas completamente diferentes. Use para
   * diagnóstico, não para medir; a flag vai no `pipeline.experiment` do
   * relatório, então a rodada fica marcada.
   */
  cursorNoTesteDePrecisao: boolean;
  /**
   * A calibração treinada é gravada no disco e recarregada na abertura?
   *
   * Ligada por default, e o default é o certo para o produto: um paciente com
   * ELA não pode refazer nove alvos toda vez que o computador liga — a
   * calibração é justamente o que custa caro para ele produzir.
   *
   * Desligar serve para DESENVOLVIMENTO. Testar o fluxo de calibração com um
   * perfil salvo é testar outra coisa: o app pula a coleta, carrega o modelo
   * de ontem e esconde qualquer regressão no caminho que se queria exercitar.
   * Com a flag desligada cada abertura começa sem modelo, como uma instalação
   * nova, e a única forma de ter cursor é calibrar.
   *
   * **Não apaga nada.** O que já está no disco continua lá e volta a valer
   * assim que a flag for religada — desligar é deixar de ler e de escrever,
   * não destruir. Um mecanismo de teste que apaga o perfil de um paciente por
   * engano é exatamente o acidente que este projeto não pode ter.
   *
   * Console: `__irisflowExp.set('persistirCalibracao', false)` + recarregar.
   * URL: `?calib=0` (uma rodada) ou `?calib=1` para religar.
   */
  persistirCalibracao: boolean;
  /** Piscada longa como clique. Desligado por default: piscar é involuntário. */
  blinkClick: boolean;
  /** Varredura automática após alguns segundos sem gaze. */
  scanningMode: boolean;
  /** Ao perder o gaze: segura 2 s, depois esconde o cursor e avisa. */
  gazeLostFallback: boolean;
}

export const DEFAULTS: ExperimentConfig = {
  expandFactor: 1.4,
  l2csCadenceMs: 100,
  l2csInputSize: 448,
  l2cs: 'auto',
  polynomialFeatures: true,
  formaDaExpansao: 'parcial',
  dimsDaIris: 'absolutas',
  geometricPoseCompensation: true,
  lateralTranslationCompensation: true,
  referenciaLenta: false,
  correcaoLocal: true,
  suavizarL2csNaFixacao: true,
  correcaoPorDwell: true,
  eyeNet: 'off',
  filterMode: 'oneEuro',
  estabilizarFixacao: true,
  normalizarRollNoCrop: true,
  blocoL2csCompleto: false,
  cursorSizePx: 48,
  dwellRingOnCursor: false,
  cursorNoTesteDePrecisao: false,
  persistirCalibracao: true,
  blinkClick: false,
  scanningMode: false,
  gazeLostFallback: true,
};

export const VALORES_ACEITOS = {
  l2cs: ['auto', 'webgpu', 'wasm', 'off'],
  eyeNet: ['off', 'onnx'],
  filterMode: ['oneEuro', 'kalman', 'kalmanEma'],
  formaDaExpansao: ['completa', 'parcial'],
  dimsDaIris: ['ambas', 'normalizadas', 'absolutas'],
} as const;

export const L2CS_INPUT_SIZES_ACEITOS = [224, 448] as const;

export const EXPERIMENT_RANGES = {
  cursorSizePx: { min: 24, max: 128 },
  expandFactor: { min: 1.0, max: 3.0 },
  l2csCadenceMs: { min: 33, max: 2000 },
} as const;

const STORAGE_KEY = 'irisflow.experiment';

type EnvLike = Record<string, string | undefined>;

function getProcessEnvOrEmpty(): EnvLike {
  const proc = (globalThis as { process?: { env?: EnvLike } }).process;
  return proc?.env ?? {};
}

// No Windows os nomes de variável de ambiente chegam em maiúsculas, então a
// busca é case-insensitive.
const CHAVES_POR_MAIUSCULA: ReadonlyMap<string, keyof ExperimentConfig> = new Map(
  Object.keys(DEFAULTS).map((k) => [k.toUpperCase(), k as keyof ExperimentConfig]),
);

/** Overrides `IRISFLOW_EXP_<chave>=<valor>` vindos do ambiente (Node). */
export function loadEnvOverrides(env: EnvLike = getProcessEnvOrEmpty()): Partial<ExperimentConfig> {
  if (!env) return {};
  const overrides: Partial<ExperimentConfig> = {};
  const prefix = 'IRISFLOW_EXP_';
  for (const [envKey, rawValue] of Object.entries(env)) {
    if (!envKey.startsWith(prefix) || rawValue === undefined) continue;
    const key = CHAVES_POR_MAIUSCULA.get(envKey.slice(prefix.length).toUpperCase());
    if (!key) {
      console.warn(
        `[exp] '${envKey}' tem o prefixo ${prefix} mas não corresponde a nenhuma flag — ignorada. ` +
        `Flags válidas: ${Object.keys(DEFAULTS).join(', ')}.`,
      );
      continue;
    }
    const defaultValue = DEFAULTS[key];
    if (typeof defaultValue === 'boolean') {
      const lower = rawValue.toLowerCase();
      (overrides as Record<string, unknown>)[key] = lower === 'true' || lower === '1';
    } else if (typeof defaultValue === 'number') {
      const n = Number(rawValue);
      if (!Number.isNaN(n)) (overrides as Record<string, unknown>)[key] = n;
    } else if (typeof defaultValue === 'string') {
      (overrides as Record<string, unknown>)[key] = rawValue;
    }
  }
  return overrides;
}

/**
 * Valida uma configuração parcial contra `DEFAULTS`. Tipo errado, valor
 * não-finito, fora da faixa ou fora da lista fechada cai no default, com
 * aviso. Cada chave é avaliada sozinha: um valor inválido não contamina os outros.
 */
export function sanitizeExperiment(bruto: unknown): ExperimentConfig {
  const out: ExperimentConfig = { ...DEFAULTS };
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return out;

  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (!(k in DEFAULTS)) {
      console.warn(`[exp] chave desconhecida '${k}' ignorada.`);
      continue;
    }
    const chave = k as keyof ExperimentConfig;
    const padrao = DEFAULTS[chave];

    if (typeof padrao === 'boolean') {
      if (typeof v === 'boolean') {
        (out as unknown as Record<string, unknown>)[chave] = v;
      } else {
        console.warn(`[exp] '${k}' esperava booleano, recebeu ${typeof v} — usando o default (${padrao}).`);
      }
      continue;
    }

    if (typeof padrao === 'string') {
      const aceitos = VALORES_ACEITOS[chave as keyof typeof VALORES_ACEITOS];
      if (aceitos && typeof v === 'string' && (aceitos as readonly string[]).includes(v)) {
        (out as unknown as Record<string, unknown>)[chave] = v;
      } else {
        console.warn(`[exp] '${k}' esperava um de [${aceitos?.join(', ')}], recebeu ${JSON.stringify(v)} — usando o default (${padrao}).`);
      }
      continue;
    }

    if (typeof padrao === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        console.warn(`[exp] '${k}' esperava número finito, recebeu ${JSON.stringify(v)} — usando o default (${padrao}).`);
        continue;
      }
      if (chave === 'l2csInputSize') {
        // Lista fechada, não faixa: a ResNet-50 reduz por 32, e um valor como
        // 244 rodaria sem erro medindo outra coisa.
        if (!(L2CS_INPUT_SIZES_ACEITOS as readonly number[]).includes(v)) {
          console.warn(
            `[exp] 'l2csInputSize' = ${v} não é um tamanho aceito ` +
            `(${L2CS_INPUT_SIZES_ACEITOS.join(', ')}) — usando o default (${padrao}).`,
          );
          continue;
        }
        (out as unknown as Record<string, unknown>)[chave] = v;
        continue;
      }
      const faixa = EXPERIMENT_RANGES[chave as keyof typeof EXPERIMENT_RANGES];
      if (faixa && (v < faixa.min || v > faixa.max)) {
        console.warn(`[exp] '${k}' = ${v} fora da faixa [${faixa.min}, ${faixa.max}] — usando o default (${padrao}).`);
        continue;
      }
      (out as unknown as Record<string, unknown>)[chave] = v;
    }
  }
  return out;
}

function load(): ExperimentConfig {
  const envOverrides = loadEnvOverrides();
  if (typeof localStorage === 'undefined') return sanitizeExperiment(envOverrides);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sanitizeExperiment(envOverrides);
    const doDisco = JSON.parse(raw) as unknown;
    return sanitizeExperiment({
      ...(doDisco && typeof doDisco === 'object' && !Array.isArray(doDisco) ? doDisco : {}),
      ...envOverrides,
    });
  } catch {
    return sanitizeExperiment(envOverrides);
  }
}

// Como `load()`, mas sem os overrides de ambiente — é o que `set()` persiste,
// para uma variável de ambiente usada uma vez não ficar gravada no disco.
function loadSemEnv(): ExperimentConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitizeExperiment(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULTS };
  }
}

export const EXPERIMENT: ExperimentConfig = load();

export function experimentSnapshot(): ExperimentConfig {
  return { ...EXPERIMENT };
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__irisflowExp = {
    dump: () => ({ ...EXPERIMENT }),
    defaults: () => ({ ...DEFAULTS }),
    set(key: keyof ExperimentConfig, value: number | boolean | string) {
      const next = sanitizeExperiment({ ...loadSemEnv(), [key]: value });
      // Grava só o que DIFERE do padrão. Gravar a configuração inteira
      // congelava no disco os padrões daquele dia: quando um padrão muda numa
      // versão nova (ex.: `referenciaLenta` em 23/09/2026), quem um dia usou o
      // console continuaria rodando o antigo sem saber.
      const diferencas = Object.fromEntries(
        Object.entries(next).filter(([k, v]) => DEFAULTS[k as keyof ExperimentConfig] !== v),
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(diferencas));
      console.warn('[exp] gravado. RECARREGUE a página para aplicar.', diferencas);
    },
    reset() {
      localStorage.removeItem(STORAGE_KEY);
      console.warn('[exp] limpo. RECARREGUE a página.');
    },
  };
}
