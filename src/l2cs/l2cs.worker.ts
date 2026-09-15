// Web Worker do L2CS-Net.
//
// Carrega o ONNX via onnxruntime-web e roda a inferência a pedido do client.
// Existe para a ResNet-50 nunca bloquear o loop principal.
//
// Os artefatos do ORT ficam em frontend/public/ort/ e são importados por URL,
// o que evita a resolução de módulos do Vite dentro de Workers. O bundle
// wasm-only serve o provider `wasm`; o bundle "all" traz o JSEP necessário
// para `webgpu`.

/// <reference lib="webworker" />

import { decodeAngleWithConfidence, degToRad, modoDeDecodificacao, type ModoDeDecodificacao } from './decode';
import { tamanhoDoTensor } from './crop';
import { validarMeta } from './proveniencia';
import type { L2CSModelMeta, L2CSWorkerRequest, L2CSWorkerResponse, VerificacaoDoModelo } from './types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let session: any = null;
let meta: L2CSModelMeta | null = null;
let modo: ModoDeDecodificacao = 'circular';
let ortApi: any = null;
/** Comprimento de saída já conferido contra `outputBins` (uma vez basta). */
let saidaConferida = false;

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

async function init(
  modelUrl: string,
  metaUrl: string,
  pedido: 'auto' | 'webgpu' | 'wasm',
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
      `[L2CS] SHA-256 do ONNX não confere com a meta — declarado ${declarado}, ` +
      `calculado ${sha256Calculado}. A ficha de proveniência não descreve este arquivo.`,
    );
  } else if (declarado === null && sha256Calculado) {
    console.warn(`[L2CS] meta sem sha256; o arquivo carregado tem ${sha256Calculado}.`);
  }

  let ativo: 'webgpu' | 'wasm';
  let fallback = false;
  if (pedido === 'auto') {
    if (await webgpuDisponivel()) {
      try {
        await criarSessao(modelBuf, 'webgpu');
        ativo = 'webgpu';
      } catch (e) {
        console.warn('[L2CS] sessão WebGPU falhou, caindo para WASM:', e);
        await criarSessao(modelBuf, 'wasm');
        ativo = 'wasm';
        fallback = true;
      }
    } else {
      await criarSessao(modelBuf, 'wasm');
      ativo = 'wasm';
      fallback = true;
    }
  } else {
    await criarSessao(modelBuf, pedido);
    ativo = pedido;
  }

  meta = rawMeta;
  modo = modoDeDecodificacao(rawMeta);
  saidaConferida = false;
  console.log(
    `[L2CS] sessão criada com executionProvider='${ativo}' (pedido: '${pedido}'), ` +
    `${rawMeta.outputBins} bins × ${rawMeta.binWidth}° desde ${rawMeta.binOffset}°, decodificação ${modo}`,
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
    shape = [1, 3, size, size];
  }
  const input = new ortApi.Tensor('float32', tensor, shape);
  const t0 = performance.now();
  const out = await session.run({ [meta.inputTensorName]: input });
  const dt = performance.now() - t0;

  const yawOut = out[meta.outputTensorNames.yaw];
  const pitchOut = out[meta.outputTensorNames.pitch];
  if (!yawOut || !pitchOut) {
    throw new Error(
      `saídas '${meta.outputTensorNames.yaw}'/'${meta.outputTensorNames.pitch}' ausentes; ` +
      `o modelo expõe [${Object.keys(out).join(', ')}].`,
    );
  }
  // Um modelo com outra grade de bins e uma meta antiga decodificariam ângulos
  // errados com toda a confiança do mundo. Conferir uma vez por sessão.
  if (!saidaConferida) {
    const nYaw = (yawOut.data as Float32Array).length;
    const nPitch = (pitchOut.data as Float32Array).length;
    if (nYaw !== meta.outputBins || nPitch !== meta.outputBins) {
      throw new Error(
        `a meta declara ${meta.outputBins} bins, mas o modelo devolveu ${nYaw} (yaw) e ${nPitch} (pitch). ` +
        `Atualize l2cs.meta.json para o modelo carregado.`,
      );
    }
    saidaConferida = true;
  }
  const yaw = decodeAngleWithConfidence(yawOut.data as Float32Array, meta.binWidth, meta.binOffset, modo);
  const pitch = decodeAngleWithConfidence(pitchOut.data as Float32Array, meta.binWidth, meta.binOffset, modo);

  post({
    type: 'result',
    id,
    yaw: degToRad(yaw.deg),
    pitch: degToRad(pitch.deg),
    // O eixo pior é o gargalo, por isso min e não média.
    confidence: Math.min(yaw.confidence, pitch.confidence),
    inferenceMs: dt,
  });
}

ctx.addEventListener('message', async (ev: MessageEvent<L2CSWorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      if (msg.ortBaseUrl) ortDir = msg.ortBaseUrl.endsWith('/') ? msg.ortBaseUrl : `${msg.ortBaseUrl}/`;
      await init(msg.modelUrl, msg.metaUrl, msg.provider);
    } else if (msg.type === 'infer') {
      await infer(msg.id, msg.tensor, msg.dims);
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (msg.type === 'init') post({ type: 'init_error', error });
    else if (msg.type === 'infer') post({ type: 'infer_error', id: msg.id, error });
  }
});
