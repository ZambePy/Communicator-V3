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
   * O cursor anda por transição CSS, animada pelo compositor (ver
   * `interaction/cursorNoCompositor.ts`), em vez de ser reescrito a cada
   * quadro pelo laço de rAF.
   *
   * Ligada por padrão: o laço de rAF roda na mesma thread do MediaPipe, e com
   * ela ocupada 70–100 % do tempo o cursor andava aos degraus (gravação de
   * 30/09). A flag existe como volta segura se alguma placa de vídeo animar
   * mal a transição: `__irisflowExp.set('cursorPeloCompositor', false)` e
   * recarregar devolve o seguidor por rAF de antes.
   */
  cursorPeloCompositor: boolean;
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

  // ── V3: matemática do rastreamento e adaptações para ELA ─────────────────
  //
  // Cada mudança tem a sua flag e o número M1…M21 da tabela de decisão de
  // docs/PESQUISA.md §5. Desligada, o comportamento é o de antes, bit a bit.
  // Ligadas por padrão, menos cinco que ficam desligadas e fora do
  // interruptor: M2 e M10 (pioraram o replay da gravação real de 23/09), M7
  // (troca erro de lugar quando a pálpebra satura as features embaixo) — ver
  // cada uma —, M12 e M13. O interruptor `pipeline` desliga todas de uma vez.

  /**
   * Interruptor único do V3 (URL `?pipeline=v3` / `?pipeline=base`).
   *
   *  - `v3` (padrão): cada flag abaixo vale o seu próprio valor.
   *  - `base`: todas as flags do V3 ficam desligadas, inclusive as que estão
   *    fora do interruptor — é o pipeline anterior, para o A/B da medição.
   */
  pipeline: 'v3' | 'base';
  /** M1 — ordem dos alvos calculada para não correlacionar com a deriva da cabeça. */
  ordemDescorrelacionada: boolean;
  /**
   * M2 — referencial da cabeça montado em pixels isotrópicos (muda as features).
   *
   * DESLIGADA por padrão e fora do interruptor. Em simulação ela tira o
   * vazamento do olhar vertical para o `offsetX` com a cabeça inclinada
   * (docs/PESQUISA.md §1.8, F3). Na gravação real de 23/09 ela piorou tudo: o
   * eixo vertical da base, montado em pixels, inclina 14° para a profundidade
   * (8° na base antiga), o `offsetY` passa a carregar mais do z do MediaPipe,
   * que é ruidoso, e perde 1,5–2,4× de sinal por ruído nos alvos da
   * calibração; o replay foi de 67 para 176 px com 9 alvos e de 64 para 115 px
   * com 13. Fica para a sessão com a cabeça inclinada decidir
   * (docs/ROTEIRO_DE_MEDICAO.md).
   */
  referencialIsotropico: boolean;
  /** M3 — contra-rotação do roll com o sinal de yaw do L2CS (direita da pessoa). */
  desrolarComSinalDoL2cs: boolean;
  /** M4 — ângulos do L2CS girados para o referencial da cabeça antes das features. */
  l2csNaCabeca: boolean;
  /** M5 — pose da matriz facial suavizada, com rampa contínua, na compensação e na rotação. */
  poseSuavizada: boolean;
  /** M6 — calibração robusta: peso por quadro, centro robusto por alvo, Huber entre alvos. */
  calibracaoRobusta: boolean;
  /**
   * M7 — 14º alvo no meio da borda de baixo, no perfil padrão completo.
   *
   * DESLIGADA por padrão e fora do interruptor. O ganho de 9 para 14 pontos
   * (Blignaut 2014) é de rastreador infravermelho. Com webcam, abaixo de
   * y ≈ 810–900 px a pálpebra desce com o olhar e as features param de andar
   * (`correcaoLocal.ts`): o alvo em 95 % da altura tem as features do alvo do
   * meio da linha de baixo da grade (83,75 %) e um rótulo 11 % da tela mais
   * baixo. No olho sintético que satura como o real
   * (`calibration.correcaoLocal.test.ts`), ligar M7 levou o meio da faixa de
   * baixo de 111 para 48 px e o meio da linha de baixo da grade de 23 para
   * 71 px — troca erro de lugar, e para a região que mais tem botões. A
   * gravação de 23/09 não tem o 14º alvo, então o replay não mede isso: fica
   * para a sessão do roteiro (docs/ROTEIRO_DE_MEDICAO.md).
   */
  alvoInferiorCentral: boolean;
  /** M8 — assentamento de cada alvo contado da chegada da bola. */
  assentamentoPelaChegada: boolean;
  /** M9 — estimador de fixação com portão de Mahalanobis no lugar de One Euro + estabilizador. */
  estimadorDeFixacao: boolean;
  /**
   * M10 — fusão binocular por variância mínima com a covariância entre os olhos.
   *
   * DESLIGADA por padrão e fora do interruptor. No replay da gravação de
   * 23/09 ela baixou o erro fora da amostra DA CALIBRAÇÃO (LOO 83 → 64 px com
   * 9 alvos) e piorou o teste feito minutos depois (67 → 91 px; 64 → 68 px com
   * 13 alvos): os pesos aprendidos na calibração não valeram para o teste,
   * mesmo encolhidos pela incerteza (`fusaoBinocular.ts`) — e saem dos mesmos
   * resíduos LOO que depois os avaliam, o que deixa o LOO otimista por
   * construção. Fica para a sessão com um olho semicerrado decidir
   * (docs/ROTEIRO_DE_MEDICAO.md).
   */
  fusaoPorCovariancia: boolean;
  /**
   * M12 — saída 6DoF: interseção do raio de olhar com o plano da tela.
   * DESLIGADA por padrão e fora do interruptor: `pipeline=v3` não a liga.
   */
  saida6DoF: boolean;
  /**
   * M13 — passa ao recorte do L2CS o roll no sinal que o recorte espera.
   *
   * DESLIGADA por padrão e fora do interruptor. Hoje o recorte DOBRA a
   * inclinação da cabeça em vez de cancelá-la (docs/PESQUISA.md §1.8, F1).
   * Corrigir muda a imagem que a rede vê, e a regra do projeto é não mexer no
   * L2CS sem decisão do responsável: a flag existe para essa decisão ser
   * tomada com medição.
   */
  nivelarRecorteCorrigido: boolean;
  /**
   * M14 — suavização interna do FaceLandmarker.
   *
   *  - `mediapipe` (padrão, igual a antes): modo VIDEO, com o One Euro interno
   *    do MediaPipe nos landmarks (min_cutoff 0,05, beta 80).
   *  - `desligada`: modo IMAGE, sem o filtro interno e com o detector a cada
   *    quadro. Serve para MEDIR quanto do ruído chega pré-filtrado.
   */
  suavizacaoDoLandmarker: 'mediapipe' | 'desligada';
  /** M15 — correção por dwell como filtro de Kalman (Ornstein–Uhlenbeck) por eixo. */
  correcaoPorDwellKalman: boolean;
  /** M16 — ganho (afim) na correção por dwell, com prior e só com excitação. */
  correcaoPorDwellAfim: boolean;
  /** M17 — dwell em cascata no teclado, guiado pela previsão de letras. */
  dwellEmCascata: boolean;
  /** M18 — alvo mínimo dos botões calculado pela acurácia medida. */
  alvoMinimoMedido: boolean;
  /** M19 — memória de dwell de 400 ms e área de acerto maior depois que o dwell começa. */
  toleranciaIntrusoes: boolean;
  /** M20 — correção rápida afim com 5 pontos, sem retreinar o modelo. */
  recalibracaoRapidaAfim: boolean;
  /** M21 — perda curta de rosto pausa o dwell em vez de zerar. */
  pausaNaPerdaCurta: boolean;
}

/** Os padrões do código. `DEFAULTS` (abaixo) é isto com os padrões de build aplicados. */
const DEFAULTS_DO_CODIGO: ExperimentConfig = {
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
  cursorPeloCompositor: true,
  cursorNoTesteDePrecisao: false,
  persistirCalibracao: true,
  blinkClick: false,
  scanningMode: false,
  gazeLostFallback: true,
  pipeline: 'v3',
  ordemDescorrelacionada: true,
  referencialIsotropico: false,
  desrolarComSinalDoL2cs: true,
  l2csNaCabeca: true,
  poseSuavizada: true,
  calibracaoRobusta: true,
  alvoInferiorCentral: false,
  assentamentoPelaChegada: true,
  estimadorDeFixacao: true,
  fusaoPorCovariancia: false,
  saida6DoF: false,
  nivelarRecorteCorrigido: false,
  suavizacaoDoLandmarker: 'mediapipe',
  correcaoPorDwellKalman: true,
  correcaoPorDwellAfim: true,
  dwellEmCascata: true,
  alvoMinimoMedido: true,
  toleranciaIntrusoes: true,
  recalibracaoRapidaAfim: true,
  pausaNaPerdaCurta: true,
};

export const VALORES_ACEITOS = {
  l2cs: ['auto', 'webgpu', 'wasm', 'off'],
  eyeNet: ['off', 'onnx'],
  filterMode: ['oneEuro', 'kalman', 'kalmanEma'],
  formaDaExpansao: ['completa', 'parcial'],
  dimsDaIris: ['ambas', 'normalizadas', 'absolutas'],
  pipeline: ['v3', 'base'],
  suavizacaoDoLandmarker: ['mediapipe', 'desligada'],
} as const;

/**
 * As flags do V3 e o valor que cada uma tem no pipeline anterior.
 *
 * `pipeline: 'base'` aplica estes valores por cima de tudo — inclusive das
 * cinco flags fora do interruptor (`referencialIsotropico`,
 * `alvoInferiorCentral`, `fusaoPorCovariancia`, `saida6DoF`,
 * `nivelarRecorteCorrigido`) e de `suavizacaoDoLandmarker`, cujo padrão já é o
 * de antes — que o `v3` deixa como estão.
 */
export const VALORES_DA_BASE = {
  ordemDescorrelacionada: false,
  referencialIsotropico: false,
  desrolarComSinalDoL2cs: false,
  l2csNaCabeca: false,
  poseSuavizada: false,
  calibracaoRobusta: false,
  alvoInferiorCentral: false,
  assentamentoPelaChegada: false,
  estimadorDeFixacao: false,
  fusaoPorCovariancia: false,
  saida6DoF: false,
  nivelarRecorteCorrigido: false,
  suavizacaoDoLandmarker: 'mediapipe',
  correcaoPorDwellKalman: false,
  correcaoPorDwellAfim: false,
  dwellEmCascata: false,
  alvoMinimoMedido: false,
  toleranciaIntrusoes: false,
  recalibracaoRapidaAfim: false,
  pausaNaPerdaCurta: false,
} as const satisfies Partial<ExperimentConfig>;

/** Aplica o interruptor único: com `base`, todas as flags do V3 voltam ao valor anterior. */
export function resolverPipeline(cfg: ExperimentConfig): ExperimentConfig {
  if (cfg.pipeline !== 'base') return { ...cfg };
  return { ...cfg, ...VALORES_DA_BASE };
}

/**
 * Padrões decididos por quem EMPACOTA, não por quem usa.
 *
 * O `vite build` do frontend troca `__IRISFLOW_PADROES_DE_BUILD__` por um
 * objeto (frontend/vite.config.ts, `define`) montado de variáveis de ambiente
 * do build. Hoje há uma só, `IRISFLOW_BUILD_L2CS`: o release.yml passa `auto`
 * desde a 1.0.0-beta.10 — a beta, acadêmica e não comercial, leva os pesos do
 * L2CS (Gaze360, research-only) — e `off` quando a variável de repositório
 * pede um instalador sem eles, com o rastreamento pelas features de íris. O
 * caminho `l2cs: 'off'` existe inteiro: o engine marca o status `disabled`, a
 * pré-calibração libera o início, e o modelo treina sem o bloco angular (é a
 * condição B da M-ablação em docs/MEDICOES.md).
 *
 * Fora de um build do Vite (testes do núcleo, Node) o identificador não existe
 * e nada muda. Valores fora da lista fechada são ignorados. Uma escolha feita
 * depois, pelo console ou pela URL, continua valendo por cima.
 */
declare const __IRISFLOW_PADROES_DE_BUILD__: unknown;

export function aplicarPadroesDeBuild(base: ExperimentConfig, padroes: unknown): ExperimentConfig {
  if (!padroes || typeof padroes !== 'object' || Array.isArray(padroes)) return { ...base };
  const out: ExperimentConfig = { ...base };
  const l2cs = (padroes as Record<string, unknown>).l2cs;
  if (typeof l2cs === 'string' && (VALORES_ACEITOS.l2cs as readonly string[]).includes(l2cs)) {
    out.l2cs = l2cs as ExperimentConfig['l2cs'];
  }
  return out;
}

export const DEFAULTS: ExperimentConfig = aplicarPadroesDeBuild(
  DEFAULTS_DO_CODIGO,
  typeof __IRISFLOW_PADROES_DE_BUILD__ !== 'undefined' ? __IRISFLOW_PADROES_DE_BUILD__ : undefined,
);

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

// O interruptor é aplicado DEPOIS de ler o disco e o ambiente: uma flag do V3
// ligada à mão não sobrevive a `pipeline: 'base'`, senão a rodada "base" de
// uma medição A/B carregaria, sem aviso, uma mudança da rodada nova.
export const EXPERIMENT: ExperimentConfig = resolverPipeline(load());

export function experimentSnapshot(): ExperimentConfig {
  return { ...EXPERIMENT };
}

/**
 * Grava uma escolha de experimento para a PRÓXIMA carga da página — a mesma
 * gravação do `__irisflowExp.set` do console e do `?ep=` da URL. Não muda o
 * `EXPERIMENT` em vigor: quem chama recarrega.
 *
 * Devolve se gravou. Com o armazenamento cheio (ou bloqueado) o `setItem`
 * lança, e quem chama precisa saber: recarregar sem a escolha gravada volta à
 * mesma tela — o botão "Calibrar só com a íris" parecia não fazer nada.
 */
export function gravarExperimento(key: keyof ExperimentConfig, value: number | boolean | string): boolean {
  const next = sanitizeExperiment({ ...loadSemEnv(), [key]: value });
  // Grava só o que DIFERE do padrão. Gravar a configuração inteira congelava
  // no disco os padrões daquele dia: quando um padrão muda numa versão nova
  // (ex.: `referenciaLenta` em 23/09/2026), quem um dia usou o console
  // continuaria rodando o antigo sem saber.
  const diferencas = Object.fromEntries(
    Object.entries(next).filter(([k, v]) => DEFAULTS[k as keyof ExperimentConfig] !== v),
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diferencas));
    return true;
  } catch (e) {
    console.warn('[exp] não foi possível gravar a escolha de experimento:', e);
    return false;
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__irisflowExp = {
    dump: () => ({ ...EXPERIMENT }),
    defaults: () => ({ ...DEFAULTS }),
    set(key: keyof ExperimentConfig, value: number | boolean | string) {
      if (gravarExperimento(key, value)) {
        console.warn('[exp] gravado. RECARREGUE a página para aplicar.', localStorage.getItem(STORAGE_KEY));
      }
    },
    reset() {
      localStorage.removeItem(STORAGE_KEY);
      console.warn('[exp] limpo. RECARREGUE a página.');
    },
  };
}
