// Cliente do worker L2CS.
//
// Instancia o Web Worker uma única vez, limita a cadência de submissão, guarda
// o último resultado com a hora da CAPTURA e degrada de forma explícita: se o
// último resultado envelheceu demais, `valid` cai para false e o extractor
// recebe o bloco angular zerado. O loop rAF nunca espera pelo worker.

import type { EntradaDeTeste, L2CSGaze, L2CSModelMeta, L2CSWorkerRequest, L2CSWorkerResponse, VerificacaoDoModelo } from './types';
import { fichaDoModelo, type FichaDoModelo } from './proveniencia';
import { EXPERIMENT, type ExperimentConfig } from '../config/experiment';
import { descricaoDoModelo, ladoAceito, type LadoDoRecorte } from './modelos';

export type L2CSProviderRequest = 'auto' | 'webgpu' | 'wasm';

/** Tamanho do recorte e cadência EM VIGOR — decididos pelo provider efetivo. */
export interface PoliticaL2cs {
  inputSize: 224 | 448;
  cadenceMs: number;
}

/**
 * Política por provider.
 *
 * A ResNet-50 em 448² custa ~4× o de 224². Com WebGPU (~50 ms por inferência)
 * o custo cabe a 10 Hz e o recorte maior dá mais pixels por olho; em WASM
 * single-thread a mesma rede leva centenas de ms, o resultado chega velho e o
 * bloco angular passa a vida em `stale`. Em WASM, 224² a 160 ms entrega ângulo
 * FRESCO — e um ângulo fresco de 224² vale mais que um ângulo de 448² de meio
 * segundo atrás. Nunca se zera o bloco por causa disto: ele só muda de tamanho.
 *
 * Com o provider FORÇADO (`l2cs = 'webgpu' | 'wasm'`, condição de medição) a
 * política não se aplica: o operador escolheu tamanho e cadência de propósito,
 * e o relatório precisa refletir o que ele pediu.
 *
 * `lados`: os lados que o ONNX aceita (catálogo em `modelos.ts`). Por cima de
 * tudo, o lado sai sempre desta lista — um ONNX de entrada fixa (o do GazeGene
 * só aceita 224) não recebe 448 nem com WebGPU nem com a flag pedindo.
 * Ausente = qualquer lado (ramo ocular, que passa as dimensões à parte).
 */
export function politicaPorProvider(
  provider: 'webgpu' | 'wasm' | null,
  config: Pick<ExperimentConfig, 'l2cs' | 'l2csInputSize' | 'l2csCadenceMs'> = EXPERIMENT,
  lados?: readonly LadoDoRecorte[],
): PoliticaL2cs {
  const pedida: PoliticaL2cs = { inputSize: config.l2csInputSize, cadenceMs: config.l2csCadenceMs };
  const politica: PoliticaL2cs = config.l2cs !== 'auto' || provider === null
    ? pedida
    : provider === 'webgpu'
      ? { inputSize: 448, cadenceMs: 100 }
      : { inputSize: 224, cadenceMs: 160 };
  return lados && lados.length > 0
    ? { ...politica, inputSize: ladoAceito(lados, politica.inputSize) }
    : politica;
}

export interface L2CSClientOptions {
  /** Sem `modelUrl`/`metaUrl`, vale o modelo do rosto escolhido em
   *  `EXPERIMENT.modeloDoRosto` (catálogo em `modelos.ts`). */
  modelUrl?: string;
  metaUrl?: string;
  /** Lados de recorte que o ONNX aceita. Sem valor: os do catálogo quando o
   *  modelo é o do rosto; nenhuma restrição quando a URL vem de quem chama. */
  lados?: readonly LadoDoRecorte[];
  cadenceMs?: number;
  /** Idade máxima de um resultado, em ms. Sem valor, é derivada da latência medida. */
  staleMs?: number;
  provider?: L2CSProviderRequest;
  /** Prefixo das mensagens no console, daqui e do worker. Padrão `[L2CS]` (a
   *  rede do rosto); o ramo ocular passa `[olho esquerdo]`/`[olho direito]`,
   *  para o console não anunciar uma L2CS-Net que não está rodando. */
  rotulo?: string;
  /**
   * Tensor retangular `[altura, largura]` que este cliente vai submeter (ramo
   * ocular, 64×96). Vai para a inferência de teste do `init`. Ausente = recorte
   * quadrado do rosto, com o lado da política por provider.
   */
  dimsDoTensor?: [number, number];
  /**
   * Chamado UMA vez quando o worker, depois do `ready`, deixou de servir: morreu
   * (`error`), errou `INFERENCIAS_FALHAS_PARA_DESISTIR` inferências seguidas ou
   * ficou sem responder duas vezes seguidas. O worker já foi encerrado; quem
   * chama decide reiniciar (relato de 19/10/2026). Antes nada disso chegava ao
   * engine: o status seguia `ready` com o bloco angular zerado para sempre.
   */
  aoFalhar?: (motivo: MotivoDaFalhaDoWorker, detalhe: string) => void;
  /**
   * Lado do recorte FIXO, qualquer que seja o provider que subir (revisão do
   * pipeline de 19/10/2026). O engine passa no REINÍCIO do worker do rosto com
   * uma calibração em uso (ou uma coleta em curso): o modelo dela foi treinado
   * num lado, e 224² e 448² dão ângulos diferentes para o mesmo olhar. Antes o
   * reinício que subia em WASM trocava para 224² e a calibração de 448² era
   * apagada — sem calibração nada aciona pelo olhar, nem a Emergência. O ONNX
   * aceita os dois lados; em WASM a 448² só a latência muda (medida no
   * comentário de `iniciarClienteDoRosto`, no engine).
   *
   * A cadência continua a do provider (a política). Um lado que o modelo não
   * aceita (o GazeGene só aceita 224) cai no aceito, como sempre — aí o lado
   * muda e a calibração fica suspensa (`setL2csInputSizeEfetivo`). Ausente, a
   * política por provider decide o lado, como antes.
   */
  ladoFixo?: LadoDoRecorte;
  /**
   * Vigia das PRIMEIRAS respostas (revisão do pipeline de 20/10/2026). O engine
   * liga no reinício com `ladoFixo`: a 448² o WASM é ~3,2× mais lento que a 224²
   * (medido em 20/10/2026), e uma resposta que chega mais velha que a tolerância
   * de idade (no máximo `MAX_STALE_MS`) é descartada — o bloco angular vai
   * zerado com o status em `ready`, e ninguém fica sabendo.
   *
   * Conta a idade de cada resposta (da captura até a chegada, a mesma régua do
   * `getLatestGaze`). Duas das três primeiras acima de `limiteMs` = lento: chama
   * `aoPassar` UMA vez, com a mediana das idades medidas. Duas abaixo = rápido:
   * a vigia acaba sem chamar nada. Uma resposta lenta isolada (uma pausa do
   * coletor de lixo) não decide sozinha. Ausente = nenhuma vigia, como antes.
   */
  vigiaDaLatencia?: {
    limiteMs: number;
    aoPassar: (latenciaMs: number) => void;
  };
}

/** Por que um worker que já estava pronto deixou de servir. */
export type MotivoDaFalhaDoWorker = 'inferencia' | 'worker_morreu' | 'sem_resposta';

/**
 * Inferências com erro, SEGUIDAS (sem um resultado no meio), a partir das quais
 * o worker é dado como perdido. Perder o dispositivo WebGPU (sono e volta do
 * notebook, reinício do driver) faz TODO `session.run` falhar; um erro isolado
 * (um tensor ruim) não. Oito seguidos são ~1 s na cadência do rosto e ~0,3 s na
 * do olho — longe de um soluço, perto o bastante para o paciente não ficar
 * minutos com a mira piorada sem ninguém saber.
 */
export const INFERENCIAS_FALHAS_PARA_DESISTIR = 8;

/** Intervalo mínimo entre dois avisos de erro de inferência no console. */
const INTERVALO_DO_LOG_DE_ERRO_MS = 5000;

export interface L2CSClient {
  start(): Promise<void>;
  stop(): void;
  /** `dims = [altura, largura]` só para tensor não quadrado (ramo ocular). */
  submitTensor(tensor: Float32Array, dims?: [number, number]): boolean;
  /**
   * Um buffer de `comprimento` floats devolvido pelo worker, para o próximo
   * recorte escrever no lugar de alocar (falha #13, 18/10/2026). `undefined`
   * quando não há nenhum guardado — aí o recorte aloca, como antes.
   */
  emprestarTensor(comprimento: number): Float32Array | undefined;
  /** true se um `submitTensor` agora seria aceito (worker pronto, slot livre e
   *  cadência satisfeita). Permite ao engine pular o crop quando não vai adiantar. */
  canSubmit(nowMs?: number): boolean;
  getLatestGaze(nowMs?: number): L2CSGaze;
  getMeta(): L2CSModelMeta | null;
  /** O que o worker apurou sobre o arquivo (hash); `null` antes do `ready`. */
  getVerificacao(): VerificacaoDoModelo | null;
  /** Ficha achatada para relatório e tela; `null` antes do `ready`. */
  getFicha(): FichaDoModelo | null;
  getAverageLatencyMs(): number;
  /** Provider efetivamente ativo no worker; `null` antes do `ready`. */
  getExecutionProvider(): string | null;
  /** true quando o provider ativo não é o que foi pedido (fallback do modo `auto`). */
  houveFallback(): boolean;
  /** Tamanho do recorte e cadência em vigor. Antes do `ready` é o pedido em
   *  `EXPERIMENT`; no `ready`, o que a política por provider decidiu. */
  getPolitica(): PoliticaL2cs;
  /** Tolerância de idade em vigor, em ms. */
  getStaleMs(): number;
  getAverageConfidence(): number;
  /** Inferências submetidas e ainda sem resposta (0 ou 1). */
  getPendingCount(): number;
  /** Por que o worker deixou de servir depois do `ready` (`null` = não deixou). */
  getFalha(): { motivo: MotivoDaFalhaDoWorker; detalhe: string } | null;
}

// Resolvidos contra a página, não contra a origem: sob `file://` no Electron
// empacotado, `/models/...` apontaria para a raiz do disco.
export function urlRelativa(caminho: string): string {
  if (typeof location === 'undefined') return caminho;
  return new URL(caminho, location.href).href;
}

/** Artefatos do ORT (frontend/public/ort/). Resolvido AQUI, na página: dentro
 *  do worker `location.href` é a URL do script do worker, não a do app. */
const DEFAULT_ORT_PATH = 'ort/';

/**
 * Tolerância de idade mínima. Com WebGPU (~50 ms por inferência) o resultado
 * chega bem dentro dela. Em WASM a inferência leva centenas de ms, então a
 * tolerância cresce com a latência medida (ver `staleMsParaLatencia`) — melhor
 * um ângulo de 1 s atrás que um zero no lugar dele.
 */
export const DEFAULT_STALE_MS = 400;
export const MAX_STALE_MS = 2500;

/**
 * Demora máxima de uma resposta no REINÍCIO com o lado da calibração mantido
 * (`ladoFixo` + `vigiaDaLatencia`; revisão do pipeline de 20/10/2026): metade
 * do teto de idade de uma leitura (`MAX_STALE_MS`, 2,5 s), ou seja 1,25 s.
 *
 * A conta, sem fórmula: com uma inferência por vez, a leitura que chegou com L
 * de atraso só é trocada pela próxima L depois — no fim ela tem 2·L de idade.
 * Se 2·L cabe nos 2,5 s (L até 1,25 s), há sempre uma leitura valendo. Acima
 * disso, parte do tempo fica sem ângulo (a 1,8 s, 62 % do tempo, na simulação
 * da revisão); acima de 2,5 s, o tempo todo. Medido em 20/10/2026 num
 * contêiner de 2 CPUs: 448² em WASM levou 2,74–2,75 s; 224², 0,74–0,96 s.
 */
export const LATENCIA_MAXIMA_DO_LADO_FIXO_MS = MAX_STALE_MS / 2;

/** Tolerância de idade derivada da latência média: 3 inferências mais a cadência. */
export function staleMsParaLatencia(latenciaMs: number, cadenceMs: number): number {
  if (!Number.isFinite(latenciaMs) || latenciaMs <= 0) return DEFAULT_STALE_MS;
  return Math.min(MAX_STALE_MS, Math.max(DEFAULT_STALE_MS, 3 * latenciaMs + cadenceMs));
}

/** Tempo máximo que uma submissão pode ficar sem resposta antes de o slot ser
 *  liberado. Um worker morto sem `error` prenderia o L2CS pelo resto da sessão. */
export const IN_FLIGHT_TIMEOUT_MS = 8000;

export function createL2CSClient(opts: L2CSClientOptions = {}): L2CSClient {
  // O modelo do rosto vem do catálogo (`EXPERIMENT.modeloDoRosto`); quem passa
  // a URL (ramo ocular, testes) escolhe o próprio arquivo.
  const doRosto = descricaoDoModelo(EXPERIMENT.modeloDoRosto);
  const modelUrl = opts.modelUrl ?? urlRelativa(doRosto.modelo);
  const metaUrl = opts.metaUrl ?? urlRelativa(doRosto.meta);
  const lados = opts.lados ?? (opts.modelUrl === undefined ? doRosto.lados : undefined);
  const ortBaseUrl = urlRelativa(DEFAULT_ORT_PATH);
  const rotulo = opts.rotulo ?? '[L2CS]';
  // Cadência explícita (testes, harness) vence a política; sem ela, a
  // cadência nasce em `EXPERIMENT` e é trocada no `ready` pelo provider.
  const cadenciaFixa = opts.cadenceMs;
  // A política por provider, com o lado fixo de quem chama por cima (o
  // reinício com calibração em uso; ver `ladoFixo`).
  const ladoFixo = opts.ladoFixo;
  const politicaDe = (p: 'webgpu' | 'wasm' | null): PoliticaL2cs => {
    const base = politicaPorProvider(p, EXPERIMENT, lados);
    if (ladoFixo === undefined) return base;
    return { ...base, inputSize: lados && lados.length > 0 ? ladoAceito(lados, ladoFixo) : ladoFixo };
  };
  let politica: PoliticaL2cs = politicaDe(null);
  let cadenceMs = cadenciaFixa ?? politica.cadenceMs;
  const staleFixo = opts.staleMs;
  const provider: L2CSProviderRequest =
    opts.provider ?? (EXPERIMENT.l2cs === 'off' ? 'auto' : EXPERIMENT.l2cs);
  // O que a inferência de teste do `init` vai rodar: o tensor do olho, ou o
  // recorte do rosto no lado que a política escolheria para cada provider (o
  // lado fixo, quando há, para os dois). Com a cadência fixa de quem chama
  // (testes, harness) a política não muda o lado, e o pedido vale para os dois.
  const testeDoInit: EntradaDeTeste = opts.dimsDoTensor
    ? { dims: opts.dimsDoTensor }
    : {
        porProvider: {
          webgpu: politicaDe('webgpu').inputSize,
          wasm: politicaDe('wasm').inputSize,
        },
      };
  // ── Saúde do worker depois do `ready` (relato de 19/10/2026) ──────────────
  let inferenciasFalhasSeguidas = 0;
  let semRespostaSeguidas = 0;
  let falha: { motivo: MotivoDaFalhaDoWorker; detalhe: string } | null = null;
  /** Erros de inferência ainda não contados num aviso do console. */
  let errosNaoAvisados = 0;
  let ultimoLogDeErroMs = -Infinity;
  // ── Vigia das primeiras respostas (ver `vigiaDaLatencia`) ─────────────────
  const vigia = opts.vigiaDaLatencia ?? null;
  /** Idades (ms) das respostas medidas pela vigia; `null` = vigia encerrada. */
  let idadesDaVigia: number[] | null = vigia ? [] : null;

  /** Uma resposta chegou com `idadeMs`: a vigia decide quando der. */
  function vigiar(idadeMs: number): void {
    if (!vigia || idadesDaVigia === null) return;
    idadesDaVigia.push(idadeMs);
    const lentas = idadesDaVigia.filter((t) => t > vigia.limiteMs).length;
    const rapidas = idadesDaVigia.length - lentas;
    if (lentas < 2 && rapidas < 2) return;
    const ordenadas = idadesDaVigia.slice().sort((a, b) => a - b);
    const meio = ordenadas.length >> 1;
    const mediana = ordenadas.length % 2 ? ordenadas[meio] : (ordenadas[meio - 1] + ordenadas[meio]) / 2;
    idadesDaVigia = null;
    if (lentas >= 2) vigia.aoPassar(mediana);
  }

  /**
   * O worker deixou de servir: encerra a thread (ela não vai mais responder
   * nada útil, e cada submissão custaria ~5 ms de `getImageData` à toa) e
   * avisa quem pode reiniciar. Uma vez por cliente — o engine cria outro.
   */
  function falhar(motivo: MotivoDaFalhaDoWorker, detalhe: string): void {
    if (falha) return;
    falha = { motivo, detalhe };
    derrubarWorker();
    latest = { yaw: 0, pitch: 0, timestamp: latest.timestamp, valid: false };
    opts.aoFalhar?.(motivo, detalhe);
  }

  let worker: Worker | null = null;
  let ready = false;
  let meta: L2CSModelMeta | null = null;
  let verificacao: VerificacaoDoModelo | null = null;
  let executionProviderAtivo: string | null = null;
  let fallback = false;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((e: Error) => void) | null = null;
  let readyPromise: Promise<void> | null = null;

  let lastSubmitMs = 0;
  let pendingId = 0;
  // id → hora da captura. O resultado é carimbado com essa hora, e não com a
  // hora em que a resposta chegou: é o que faz o staleness medir a idade real
  // do dado. A presença da chave é o backpressure (uma inferência em voo).
  const inFlight = new Map<number, number>();
  const MAX_IN_FLIGHT = 1;
  let latest: L2CSGaze = { yaw: 0, pitch: 0, timestamp: 0, valid: false };
  let recentLatencies: number[] = [];
  let recentConfidences: number[] = [];

  function staleMsAtual(): number {
    if (staleFixo !== undefined) return staleFixo;
    return staleMsParaLatencia(mediaLatencia(), cadenceMs);
  }

  function mediaLatencia(): number {
    if (recentLatencies.length === 0) return 0;
    let sum = 0;
    for (const t of recentLatencies) sum += t;
    return sum / recentLatencies.length;
  }

  /**
   * Encerra o worker de vez.
   *
   * Chamado quando a inicialização falha (modelo ausente, WebGPU perdido, OOM
   * do WASM) e quando o worker morre por erro de execução. Antes, esses dois
   * caminhos apenas rejeitavam a promessa de `ready`: o `engine` marcava
   * `l2csStatus = 'error'`, o bloco angular passava a sair zerado — e o worker
   * continuava vivo, com o runtime ONNX inteiro carregado na memória, até o
   * provider desmontar. Uma falha de modelo custava uma thread e dezenas de MB
   * pela sessão inteira, sem nada em troca: aquele worker nunca mais serviria.
   *
   * Não reseta o resto do estado — quem faz isso é `stop()`. Aqui só se derruba
   * o que não tem mais função.
   */
  function derrubarWorker(): void {
    if (!worker) return;
    worker.terminate();
    worker = null;
    ready = false;
    inFlight.clear();
  }

  function post(msg: L2CSWorkerRequest, transfer?: Transferable[]): void {
    if (!worker) return;
    if (transfer && transfer.length > 0) worker.postMessage(msg, transfer);
    else worker.postMessage(msg);
  }

  function liberarSlotsPresos(now: number): void {
    for (const [id, capturaMs] of inFlight) {
      if (now - capturaMs > IN_FLIGHT_TIMEOUT_MS) {
        inFlight.delete(id);
        console.warn(`${rotulo} inferência ${id} sem resposta há ${((now - capturaMs) / 1000).toFixed(1)} s — slot liberado.`);
        // Um worker travado sem `error` nunca mais responde: liberar o slot só
        // adiava em 8 s a próxima espera. Duas seguidas = worker perdido.
        semRespostaSeguidas++;
        if (semRespostaSeguidas >= 2) {
          falhar('sem_resposta', `${semRespostaSeguidas} inferências seguidas sem resposta em ${IN_FLIGHT_TIMEOUT_MS / 1000} s`);
          return;
        }
      }
    }
  }

  /** Erro de inferência no console: o primeiro na hora, depois um resumo a cada 5 s. */
  function avisarErroDeInferencia(erro: string): void {
    errosNaoAvisados++;
    const agora = performance.now();
    if (agora - ultimoLogDeErroMs < INTERVALO_DO_LOG_DE_ERRO_MS) return;
    ultimoLogDeErroMs = agora;
    console.warn(
      `${rotulo} erro de inferência` +
      (errosNaoAvisados > 1 ? ` (${errosNaoAvisados} desde o último aviso; ${inferenciasFalhasSeguidas} seguidos)` : '') +
      ':',
      erro,
    );
    errosNaoAvisados = 0;
  }

  /**
   * Buffers de tensor devolvidos pelo worker, por comprimento (falha #13,
   * 18/10/2026). Até dois por tamanho: com uma inferência em voo, um está no
   * worker e outro espera o próximo recorte — mais que isso seria memória
   * parada.
   */
  const reserva = new Map<number, Float32Array[]>();
  const RESERVA_POR_TAMANHO = 2;
  function guardarDevolvido(buf: Float32Array | undefined): void {
    if (!(buf instanceof Float32Array) || buf.byteLength === 0) return;
    const lista = reserva.get(buf.length) ?? [];
    if (lista.length >= RESERVA_POR_TAMANHO) return;
    lista.push(buf);
    reserva.set(buf.length, lista);
  }

  function handleMessage(ev: MessageEvent<L2CSWorkerResponse>): void {
    const msg = ev.data;
    if (msg.type === 'ready') {
      ready = true;
      meta = msg.meta;
      // Worker antigo (sem o campo) → `null`, que a ficha lê como "não calculado".
      verificacao = msg.verificacao ?? null;
      executionProviderAtivo = msg.executionProvider;
      fallback = msg.fallback;
      // Primeiro status com provider: a política entra AQUI, antes de
      // `readyResolve`, para quem ouve o `ready` já ler o valor em vigor.
      politica = politicaDe(msg.executionProvider);
      if (cadenciaFixa === undefined) cadenceMs = politica.cadenceMs;
      if (fallback) {
        console.warn(`${rotulo} WebGPU indisponível — rodando em '${msg.executionProvider}'. Latência e staleness maiores; o relatório registra o provider.`);
      }
      readyResolve?.();
      readyResolve = null;
      readyReject = null;
    } else if (msg.type === 'init_error') {
      const err = new Error(`init de ${modelUrl}: ${msg.error}`);
      console.error(rotulo, err);
      readyReject?.(err);
      readyResolve = null;
      readyReject = null;
      // Um worker que não conseguiu criar a sessão não vai responder a
      // inferência nenhuma; segurá-lo só custa memória. Ver `derrubarWorker`.
      derrubarWorker();
    } else if (msg.type === 'result') {
      guardarDevolvido(msg.devolvido);
      const capturaMs = inFlight.get(msg.id);
      inFlight.delete(msg.id);
      if (capturaMs === undefined) {
        // id de uma sessão anterior ou resposta duplicada: sem hora de captura
        // não dá para julgar a idade do dado.
        console.warn(`${rotulo} resultado com id desconhecido (${msg.id}) descartado.`);
        return;
      }
      latest = {
        yaw: msg.yaw,
        pitch: msg.pitch,
        timestamp: capturaMs,
        valid: true,
        confidence: msg.confidence,
      };
      recentLatencies.push(msg.inferenceMs);
      if (recentLatencies.length > 20) recentLatencies.shift();
      recentConfidences.push(msg.confidence);
      if (recentConfidences.length > 20) recentConfidences.shift();
      // Um resultado bom encerra qualquer sequência de falhas.
      inferenciasFalhasSeguidas = 0;
      semRespostaSeguidas = 0;
      // Por último: quem ouve a vigia pode encerrar este cliente (o engine
      // refaz o worker em outro lado), e nada aqui roda depois disso.
      vigiar(performance.now() - capturaMs);
    } else if (msg.type === 'infer_error') {
      guardarDevolvido(msg.devolvido);
      inFlight.delete(msg.id);
      inferenciasFalhasSeguidas++;
      // Antes: um aviso por inferência (~70/s com a EyeNet) e nada mais.
      avisarErroDeInferencia(msg.error);
      if (inferenciasFalhasSeguidas >= INFERENCIAS_FALHAS_PARA_DESISTIR) {
        falhar('inferencia', `${inferenciasFalhasSeguidas} inferências seguidas falharam; a última: ${msg.error}`);
      }
    }
  }

  return {
    async start(): Promise<void> {
      if (worker) return readyPromise ?? Promise.resolve();
      worker = new Worker(new URL('./l2cs.worker.ts', import.meta.url), { type: 'module' });
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', (e) => {
        console.error(`${rotulo} Worker execution error:`, e.message, e.filename, e.lineno);
        const estavaPronto = ready;
        readyReject?.(new Error('Worker execution error: ' + e.message));
        // Um worker que morreu depois do `ready` nunca vai responder o que
        // está em voo; `derrubarWorker` libera os slots e ainda termina a
        // thread, que antes ficava viva com o runtime ONNX carregado.
        derrubarWorker();
        // Depois do `ready`, ninguém mais esperava pela promessa: sem este
        // aviso o engine seguia em `ready` com o bloco angular zerado.
        if (estavaPronto) falhar('worker_morreu', e.message || 'o worker encerrou com erro');
      });

      readyPromise = new Promise<void>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      });
      post({ type: 'init', modelUrl, metaUrl, provider, ortBaseUrl, rotulo, teste: testeDoInit });
      return readyPromise;
    },

    stop(): void {
      derrubarWorker();
      ready = false;
      meta = null;
      verificacao = null;
      executionProviderAtivo = null;
      fallback = false;
      readyPromise = null;
      readyResolve = null;
      readyReject = null;
      politica = politicaDe(null);
      cadenceMs = cadenciaFixa ?? politica.cadenceMs;
      lastSubmitMs = 0;
      latest = { yaw: 0, pitch: 0, timestamp: 0, valid: false };
      recentLatencies = [];
      recentConfidences = [];
      inFlight.clear();
      reserva.clear();
      inferenciasFalhasSeguidas = 0;
      semRespostaSeguidas = 0;
      falha = null;
      errosNaoAvisados = 0;
      ultimoLogDeErroMs = -Infinity;
      idadesDaVigia = vigia ? [] : null;
    },

    canSubmit(nowMs?: number): boolean {
      if (!ready || !worker) return false;
      const now = nowMs ?? performance.now();
      liberarSlotsPresos(now);
      // A liberação pode ter dado o worker por perdido (`falhar`).
      if (!worker) return false;
      if (inFlight.size >= MAX_IN_FLIGHT) return false;
      return now - lastSubmitMs >= cadenceMs;
    },

    submitTensor(tensor: Float32Array, dims?: [number, number]): boolean {
      if (!ready || !worker) return false;
      const now = performance.now();
      liberarSlotsPresos(now);
      if (!worker) return false;
      if (inFlight.size >= MAX_IN_FLIGHT) return false;
      if (now - lastSubmitMs < cadenceMs) return false;
      const id = ++pendingId;
      try {
        // O buffer é transferido, não copiado; o worker o devolve com o
        // resultado e ele volta à `reserva` (ver `emprestarTensor`).
        post(dims ? { type: 'infer', id, tensor, dims } : { type: 'infer', id, tensor }, [tensor.buffer]);
      } catch (e) {
        // Buffer já destacado ou worker indisponível: nada foi enviado, então o
        // slot não pode ficar ocupado.
        console.warn(`${rotulo} submissão falhou:`, e);
        return false;
      }
      lastSubmitMs = now;
      inFlight.set(id, now);
      return true;
    },

    emprestarTensor(comprimento: number): Float32Array | undefined {
      const lista = reserva.get(comprimento);
      return lista && lista.length > 0 ? lista.pop() : undefined;
    },

    getLatestGaze(nowMs?: number): L2CSGaze {
      const now = nowMs ?? performance.now();
      if (!latest.valid) return latest;
      if (now - latest.timestamp > staleMsAtual()) {
        return { yaw: 0, pitch: 0, timestamp: latest.timestamp, valid: false };
      }
      return latest;
    },

    getMeta(): L2CSModelMeta | null {
      return meta;
    },

    getVerificacao(): VerificacaoDoModelo | null {
      return verificacao;
    },

    getFicha(): FichaDoModelo | null {
      return meta ? fichaDoModelo(meta, verificacao) : null;
    },

    getExecutionProvider(): string | null {
      return executionProviderAtivo;
    },

    houveFallback(): boolean {
      return fallback;
    },

    getPolitica(): PoliticaL2cs {
      return { ...politica, cadenceMs };
    },

    getStaleMs(): number {
      return staleMsAtual();
    },

    getAverageLatencyMs(): number {
      return mediaLatencia();
    },

    getAverageConfidence(): number {
      if (recentConfidences.length === 0) return 0;
      let sum = 0;
      for (const c of recentConfidences) sum += c;
      return sum / recentConfidences.length;
    },

    getPendingCount(): number {
      return inFlight.size;
    },

    getFalha() {
      return falha;
    },
  };
}
