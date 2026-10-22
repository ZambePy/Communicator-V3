// Web Worker do L2CS-Net.
//
// Carrega o ONNX via onnxruntime-web e roda a inferência a pedido do client.
// Existe para a ResNet-50 nunca bloquear o loop principal. O ramo ocular
// reusa este mesmo worker para a EyeNet (uma instância por olho): por isso as
// mensagens do console levam o `rotulo` que o client manda no `init`, e não
// `[L2CS]` fixo.
//
// Os artefatos do ORT ficam em frontend/public/ort/ e são importados por URL,
// o que evita a resolução de módulos do Vite dentro de Workers. O bundle
// wasm-only serve o provider `wasm`; o bundle "all" traz o JSEP necessário
// para `webgpu`.

/// <reference lib="webworker" />

import { decodeAngleWithConfidence, degToRad, modoDeDecodificacao, sinaisDaMeta, type ModoDeDecodificacao } from './decode';
import { tamanhoDoTensor } from './crop';
import { validarMeta } from './proveniencia';
import { conferirLadoAceito, conferirSaidas, formaDaEntradaDeTeste } from './conferenciaDoModelo';
import { abrirSessaoComFallback } from './aberturaDaSessao';
import type { EntradaDeTeste, L2CSModelMeta, L2CSWorkerRequest, L2CSWorkerResponse, VerificacaoDoModelo } from './types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let session: any = null;
let meta: L2CSModelMeta | null = null;
let modo: ModoDeDecodificacao = 'circular';
let ortApi: any = null;
/** Comprimento de saída já conferido contra `outputBins` (uma vez basta). */
let saidaConferida = false;
/** Multiplicadores de sinal da meta (`sinais`); +1/+1 no checkpoint Gaze360. */
let sinais: { yaw: 1 | -1; pitch: 1 | -1 } = { yaw: 1, pitch: 1 };
/** Prefixo das mensagens no console (vem no `init`; ver `L2CSWorkerRequest`). */
let rotulo = '[L2CS]';

function post(msg: L2CSWorkerResponse, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) ctx.postMessage(msg, transfer);
  else ctx.postMessage(msg);
}

// Diretório dos artefatos do ORT. Vem do client, resolvido contra a PÁGINA:
// aqui dentro `location.href` é a URL do próprio script do worker (em
// `assets/` no build, em `/@fs/...` no dev-server), e `ort/` relativo a ela
// apontaria para um lugar onde não há nada. O fallback contra a origem cobre
// um client antigo que não mande o campo (só vale em http, não em file://).
let ortDir = new URL('/ort/', location.href).href;
const BUNDLES = {
  wasm: 'ort.wasm.bundle.min.mjs',
  webgpu: 'ort.all.bundle.min.mjs',
} as const;

async function carregarOrt(provider: 'wasm' | 'webgpu'): Promise<any> {
  const m = await import(/* @vite-ignore */ ortDir + BUNDLES[provider]);
  const api = m.default || m;
  api.env.wasm.wasmPaths = ortDir;
  // Uma thread: evita SharedArrayBuffer, que exige cabeçalhos COOP/COEP.
  api.env.wasm.numThreads = 1;
  return api;
}

async function webgpuDisponivel(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

/** Solta a sessão aberta (memória do ORT, da GPU no WebGPU) e a esquece. */
async function liberarSessao(): Promise<void> {
  const s = session;
  session = null;
  if (!s) return;
  try {
    await s.release?.();
  } catch (e) {
    console.warn(`${rotulo} não foi possível liberar a sessão anterior:`, e);
  }
}

async function criarSessao(modelBuf: Uint8Array, provider: 'wasm' | 'webgpu'): Promise<void> {
  ortApi = await carregarOrt(provider);
  // Um provider só na lista: o ORT cai para o próximo em silêncio quando o
  // primeiro falha, e aqui o fallback precisa ser explícito e registrado.
  session = await ortApi.InferenceSession.create(modelBuf, {
    executionProviders: [provider],
    graphOptimizationLevel: 'all',
  });
}

/** SHA-256 do arquivo, em hex. `null` quando o contexto não tem `crypto.subtle`
 *  (http sem TLS fora de localhost) — aí a ficha diz "não calculado", nunca
 *  "confere". */
async function sha256Hex(buf: Uint8Array): Promise<string | null> {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (!subtle) return null;
  // O buffer vem de `Response.arrayBuffer()`, nunca de um SharedArrayBuffer;
  // a asserção só informa isso ao tipo da lib DOM mais estrita do frontend.
  const digest = await subtle.digest('SHA-256', buf as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Inferência de TESTE sobre um tensor de zeros, logo depois de a sessão subir
 * (relato de 19/10/2026). Confere o que a meta promete — o lado do recorte que
 * o ONNX aceita, os nomes das saídas e a grade de bins — ANTES do `ready`.
 * Antes isso só era conferido na primeira inferência real: o status já estava
 * `ready`, a calibração liberada, e cada inferência virava `infer_error` com o
 * bloco angular zerado. A calibração terminava em "features mortas" e a tela
 * culpava o reflexo dos óculos.
 *
 * Também aquece a sessão: no WebGPU a primeira execução compila os shaders, e
 * ela deixa de cair sobre o primeiro quadro do paciente.
 */
async function testarSaida(teste: EntradaDeTeste, ativo: 'webgpu' | 'wasm', m: L2CSModelMeta): Promise<void> {
  const forma = formaDaEntradaDeTeste(teste, ativo, m);
  const n = forma[1] * forma[2] * forma[3];
  const input = new ortApi.Tensor('float32', new Float32Array(n), forma);
  let out: Record<string, { data: ArrayLike<number> }>;
  try {
    out = await session.run({ [m.inputTensorName]: input });
  } catch (e) {
    // Pode ser o provider (um operador que o WebGPU não tem) ou o modelo (um
    // ONNX de entrada fixa noutro lado): quem chama decide se tenta o WASM.
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `a inferência de teste com a entrada ${forma.join('×')} falhou em '${ativo}': ${msg}`,
      { cause: e },
    );
  }
  conferirSaidas(out, m);
}

/** Cria a sessão no provider pedido e, com `teste`, roda a inferência de teste. */
async function criarSessaoConferida(
  modelBuf: Uint8Array,
  provider: 'wasm' | 'webgpu',
  m: L2CSModelMeta,
  teste: EntradaDeTeste | undefined,
): Promise<void> {
  // O lado é conferido contra a meta ANTES de pagar a criação da sessão: é
  // erro de configuração, e nenhum provider o resolve.
  if (teste && 'porProvider' in teste) conferirLadoAceito(m, teste.porProvider[provider]);
  await criarSessao(modelBuf, provider);
  if (teste) await testarSaida(teste, provider, m);
}

async function init(
  modelUrl: string,
  metaUrl: string,
  pedido: 'auto' | 'webgpu' | 'wasm',
  teste: EntradaDeTeste | undefined,
): Promise<void> {
  const [metaResp, modelResp] = await Promise.all([fetch(metaUrl), fetch(modelUrl)]);
  if (!metaResp.ok) throw new Error(`meta HTTP ${metaResp.status}`);
  if (!modelResp.ok) throw new Error(`model HTTP ${modelResp.status}`);
  const rawMeta = (await metaResp.json()) as L2CSModelMeta;
  const problema = validarMeta(rawMeta);
  if (problema) throw new Error(`meta inválida: ${problema}`);
  const modelBuf = new Uint8Array(await modelResp.arrayBuffer());

  // A ficha de proveniência só vale se o arquivo for o que ela descreve.
  const sha256Calculado = await sha256Hex(modelBuf);
  const declarado = typeof rawMeta.sha256 === 'string' && rawMeta.sha256.length > 0
    ? rawMeta.sha256.toLowerCase()
    : null;
  const verificacao: VerificacaoDoModelo = {
    sha256Calculado,
    hashConfere: declarado && sha256Calculado ? declarado === sha256Calculado : null,
  };
  if (verificacao.hashConfere === false) {
    // Não é fatal: o produto continua funcionando. Mas a ficha do relatório
    // passa a dizer que os pesos NÃO são os descritos, e isso é um alarme.
    console.error(
      `${rotulo} SHA-256 do ONNX não confere com a meta — declarado ${declarado}, ` +
      `calculado ${sha256Calculado}. A ficha de proveniência não descreve este arquivo.`,
    );
  } else if (declarado === null && sha256Calculado) {
    console.warn(`${rotulo} meta sem sha256; o arquivo carregado tem ${sha256Calculado}.`);
  }

  // A ordem (WebGPU, queda para WASM, o que soltar antes) está em
  // `aberturaDaSessao.ts`, testada fora do worker. Revisão do pipeline de
  // 19/10/2026: a sessão WebGPU que subia e falhava na inferência de teste não
  // era liberada, e a WASM nascia por cima dela (~95 MB presos).
  const { ativo, fallback } = await abrirSessaoComFallback(pedido, {
    webgpuDisponivel,
    abrir: (p) => criarSessaoConferida(modelBuf, p, rawMeta, teste),
    liberar: liberarSessao,
    avisar: (mensagem, e) => console.warn(`${rotulo} ${mensagem}`, e),
  });

  meta = rawMeta;
  modo = modoDeDecodificacao(rawMeta);
  sinais = sinaisDaMeta(rawMeta);
  // Com a inferência de teste, a forma da saída já foi conferida; sem ela
  // (cliente antigo), a primeira inferência real confere, como antes.
  saidaConferida = teste !== undefined;
  console.log(
    `${rotulo} sessão criada com executionProvider='${ativo}' (pedido: '${pedido}'), ` +
    `${rawMeta.outputBins} bins × ${rawMeta.binWidth}° desde ${rawMeta.binOffset}°, decodificação ${modo}` +
    (teste ? ' — inferência de teste conferida' : ''),
  );
  post({ type: 'ready', meta: rawMeta, executionProvider: ativo, requested: pedido, fallback, verificacao });
}

async function infer(id: number, tensor: Float32Array, dims?: [number, number]): Promise<void> {
  if (!session || !meta || !ortApi) throw new Error('worker not initialized');

  // Quadrado: o lado vem do próprio tensor (um buffer de 3·N² floats admite um
  // único N). Retangular (ramo ocular): o chamador declara, e o comprimento
  // precisa bater.
  let shape: [number, number, number, number];
  if (dims) {
    const [h, w] = dims;
    if (tensor.length !== 3 * h * w) {
      throw new Error(`tensor de ${tensor.length} floats não é 3×${h}×${w}.`);
    }
    shape = [1, 3, h, w];
  } else {
    const size = tamanhoDoTensor(tensor);
    // ONNX de entrada fixa (o do GazeGene só aceita 224): sem esta conferência o
    // erro do ONNX Runtime chega como uma mensagem críptica a cada inferência.
    conferirLadoAceito(meta, size);
    shape = [1, 3, size, size];
  }
  const input = new ortApi.Tensor('float32', tensor, shape);
  const t0 = performance.now();
  const out = await session.run({ [meta.inputTensorName]: input });
  const dt = performance.now() - t0;

  // Um modelo com outra grade de bins e uma meta antiga decodificariam ângulos
  // errados com toda a confiança do mundo. Conferido uma vez por sessão — em
  // geral já no `init`, pela inferência de teste.
  if (!saidaConferida) {
    conferirSaidas(out, meta);
    saidaConferida = true;
  }
  const yawOut = out[meta.outputTensorNames.yaw];
  const pitchOut = out[meta.outputTensorNames.pitch];
  if (!yawOut || !pitchOut) {
    throw new Error(
      `saídas '${meta.outputTensorNames.yaw}'/'${meta.outputTensorNames.pitch}' ausentes; ` +
      `o modelo expõe [${Object.keys(out).join(', ')}].`,
    );
  }
  const yaw = decodeAngleWithConfidence(yawOut.data as Float32Array, meta.binWidth, meta.binOffset, modo);
  const pitch = decodeAngleWithConfidence(pitchOut.data as Float32Array, meta.binWidth, meta.binOffset, modo);

  // Devolve o buffer de entrada ao client (falha #13, 18/10/2026): depois do
  // `run` o ONNX Runtime já copiou os dados (WASM) ou subiu para a GPU, e o
  // buffer é só nosso. Transferido, sem cópia; o client o reaproveita no
  // próximo recorte em vez de alocar outro.
  post(
    {
      type: 'result',
      id,
      // `sinais` leva a saída à convenção do app (ver `sinaisDaMeta`).
      yaw: degToRad(sinais.yaw * yaw.deg),
      pitch: degToRad(sinais.pitch * pitch.deg),
      // O eixo pior é o gargalo, por isso min e não média.
      confidence: Math.min(yaw.confidence, pitch.confidence),
      inferenceMs: dt,
      devolvido: tensor,
    },
    [tensor.buffer],
  );
}

ctx.addEventListener('message', async (ev: MessageEvent<L2CSWorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      if (msg.ortBaseUrl) ortDir = msg.ortBaseUrl.endsWith('/') ? msg.ortBaseUrl : `${msg.ortBaseUrl}/`;
      if (msg.rotulo) rotulo = msg.rotulo;
      await init(msg.modelUrl, msg.metaUrl, msg.provider, msg.teste);
    } else if (msg.type === 'infer') {
      await infer(msg.id, msg.tensor, msg.dims);
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (msg.type === 'init') post({ type: 'init_error', error });
    else if (msg.type === 'infer') {
      // O buffer volta também na falha, se ainda for nosso (não destacado).
      const devolver = msg.tensor instanceof Float32Array && msg.tensor.byteLength > 0;
      if (devolver) post({ type: 'infer_error', id: msg.id, error, devolvido: msg.tensor }, [msg.tensor.buffer]);
      else post({ type: 'infer_error', id: msg.id, error });
    }
  }
});
