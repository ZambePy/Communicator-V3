/**
 * Abertura da câmera do RASTREADOR: qual câmera, e em que resolução.
 *
 * ## Qual câmera (relato de 18/10/2026, auditoria de falhas silenciosas, item 3)
 *
 * O Preparo pede "escolha a câmera que fica de frente para o paciente" — e a
 * escolha nunca chegava aqui: o rastreador pedia `facingMode: 'user'`, que no
 * Chromium favorece a câmera INTEGRADA do notebook (ela se declara "user"; uma
 * webcam USB não declara nada). Na montagem típica — notebook com a webcam USB
 * de frente para o paciente — calibração e rastreamento rodavam na câmera
 * errada, sem aviso, enquanto o Preparo mostrava a outra.
 *
 * Agora, com uma câmera escolhida:
 *   1. `deviceId: { exact }` — ela, e só ela;
 *   2. `deviceId: { ideal }` — ela se der, senão o navegador escolhe;
 *   3. sem `deviceId` — a câmera padrão do sistema.
 * Cair do passo 1 é cair para OUTRA câmera, e quem abre avisa
 * (`caiuParaOutra`). Sem câmera escolhida, a última câmera aberta é preferida
 * (`ideal`): é com ela que a calibração em uso foi feita, e tirar o
 * `facingMode` não pode trocar a câmera de quem já usa o app.
 *
 * ## Que resolução: uma escada, não um pedido só
 *
 * O pipeline quer 1080p: o sinal útil é o deslocamento da íris no frame, e ele
 * escala com a densidade de pixels sobre o olho (ver o comentário de
 * `cameraTuner.ts`). Mas pedir 1080p e desistir se falhar deixa o usuário sem
 * rastreamento nenhum — e para software assistivo isso é pior que rastrear com
 * menos precisão.
 *
 * Duas armadilhas que a escada evita:
 *
 *   • `min` é constraint DURA. `width: { min: 640 }` faz o browser recusar a
 *     câmera inteira se ela não puder garantir o mínimo, com
 *     OverconstrainedError. Aqui só há `ideal`, que negocia em vez de falhar.
 *   • Alguns drivers do Windows anunciam 1080p mas não conseguem INICIAR nesse
 *     modo, e o Chrome reporta isso como `NotReadableError` — o mesmo erro de
 *     "câmera em uso por outro app". Sem tentar uma resolução menor não dá para
 *     distinguir os dois casos.
 */

export interface PreferenciaDeCamera {
  /** `deviceId` escolhido no Preparo (ajustes); `null` = ninguém escolheu. */
  escolhida: string | null;
  /** `deviceId` da última câmera aberta (continuidade quando ninguém escolheu). */
  ultima: string | null;
}

/** De que passo veio a câmera aberta. */
export type PassoDaCamera = 'escolhida' | 'preferida' | 'ultima' | 'padrao';

export interface TentativaDeAbertura {
  passo: PassoDaCamera;
  rotulo: string;
  constraints: MediaStreamConstraints;
}

export interface CameraAberta {
  stream: MediaStream;
  passo: PassoDaCamera;
  /** `deviceId` da câmera que abriu de fato (`null` se o navegador não informou). */
  deviceIdAberto: string | null;
  /** Havia câmera escolhida e abriu OUTRA. */
  caiuParaOutra: boolean;
}

/** O que a tela diz quando a câmera escolhida não abriu e o rastreador usa outra. */
export const MENSAGEM_DE_CAMERA_DE_RESERVA =
  'A câmera escolhida no Preparo não está disponível agora, e o IrisFlow está usando outra câmera. ' +
  'Confira se a webcam está ligada no computador — quando ela voltar, o IrisFlow troca sozinho.';

const RESOLUCOES: readonly { rotulo: string; video: MediaTrackConstraints | null }[] = [
  { rotulo: '1920×1080', video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } },
  { rotulo: '1280×720', video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } },
  // Última tentativa sem preferência de formato: se a câmera abrir de algum
  // jeito, o rastreamento roda (pior, mas roda). O ajuste automático tenta
  // subir a resolução depois, já com as capabilities em mãos.
  { rotulo: 'padrão da câmera', video: null },
];

function limpar(id: string | null | undefined): string | null {
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/** O `deviceId` guardado numa chave de câmera (`id:<deviceId>`, ver `fovPorCamera.ts`). */
export function deviceIdDaChave(chave: string | null | undefined): string | null {
  if (typeof chave !== 'string' || !chave.startsWith('id:')) return null;
  return limpar(chave.slice(3));
}

/** A lista de pedidos, na ordem em que são tentados. */
export function tentativasDeAbertura(p: PreferenciaDeCamera): TentativaDeAbertura[] {
  const escolhida = limpar(p.escolhida);
  const ultima = limpar(p.ultima);
  const passos: { passo: PassoDaCamera; dispositivo: MediaTrackConstraints }[] = escolhida
    ? [
        { passo: 'escolhida', dispositivo: { deviceId: { exact: escolhida } } },
        { passo: 'preferida', dispositivo: { deviceId: { ideal: escolhida } } },
        { passo: 'padrao', dispositivo: {} },
      ]
    : ultima
      ? // Só a preferência: `ideal` já deixa o navegador abrir outra câmera
        // quando a última sumiu. Um passo "padrão" a mais trocaria a câmera de
        // quem a tem ocupada por outro programa — e aí a calibração em uso,
        // feita na outra câmera, apontaria o cursor para lugares errados.
        [{ passo: 'ultima', dispositivo: { deviceId: { ideal: ultima } } }]
      : [{ passo: 'padrao', dispositivo: {} }];
  const tentativas: TentativaDeAbertura[] = [];
  for (const { passo, dispositivo } of passos) {
    for (const r of RESOLUCOES) {
      const video: MediaTrackConstraints = { ...dispositivo, ...(r.video ?? {}) };
      tentativas.push({
        passo,
        rotulo: passo === 'padrao' ? r.rotulo : `${r.rotulo}, câmera ${passo}`,
        constraints: { video: Object.keys(video).length > 0 ? video : true },
      });
    }
  }
  return tentativas;
}

/** Sem câmera com este id (ou ela sumiu): não adianta tentar outra resolução nela. */
const DISPOSITIVO_AUSENTE = new Set(['OverconstrainedError', 'NotFoundError', 'DevicesNotFoundError']);

function causaDoErro(nome: string): string {
  // Sem "recarregue": o app empacotado bloqueia F5/Ctrl+R, e o provider tenta
  // abrir a câmera de novo sozinho (com espera crescente e a cada câmera
  // conectada). A frase diz o que a pessoa pode resolver — em tom calmo, sem
  // maiúsculas de bronca nem ordem seca (pedido do dono, 19/10/2026).
  return nome === 'NotAllowedError' || nome === 'SecurityError'
    ? 'O IrisFlow não tem permissão para usar a câmera. Nas configurações de privacidade do sistema ' +
        'dá para liberar o acesso dos aplicativos à câmera.'
    : nome === 'NotFoundError' || nome === 'DevicesNotFoundError'
      ? 'Não encontrei nenhuma câmera. Se a webcam estiver desconectada, é só conectar de novo.'
      : nome === 'NotReadableError' || nome === 'TrackStartError'
        ? 'A câmera está ocupada — quase sempre outro programa está usando ela (Teams, Zoom, Meet, ' +
          'OBS ou outra aba do navegador). Fechar esse programa libera a câmera.'
        : nome === 'OverconstrainedError'
          ? 'Esta câmera não aceitou nenhum dos formatos de imagem que o IrisFlow pede.'
          : `Não consegui abrir a câmera (${nome}).`;
}

/**
 * Abre a câmera do rastreador seguindo a preferência. Lança com uma mensagem
 * para a pessoa quando nenhuma tentativa deu certo.
 */
export async function abrirCameraDoRastreador(
  preferencia: PreferenciaDeCamera,
  pedir: (c: MediaStreamConstraints) => Promise<MediaStream> = (c) => navigator.mediaDevices.getUserMedia(c),
): Promise<CameraAberta> {
  const escolhida = limpar(preferencia.escolhida);
  let ultimoErro: unknown = null;
  let pularPasso: PassoDaCamera | null = null;
  for (const { passo, rotulo, constraints } of tentativasDeAbertura(preferencia)) {
    if (passo === pularPasso) continue;
    try {
      const stream = await pedir(constraints);
      const t = stream.getVideoTracks?.()[0]?.getSettings?.();
      console.log(
        `[IrisFlow] câmera aberta (pedido: ${rotulo}) → ${t?.width}×${t?.height} @ ${t?.frameRate ?? '?'}fps`
      );
      const deviceIdAberto = limpar(t?.deviceId);
      const caiuParaOutra = escolhida !== null && passo !== 'escolhida' && deviceIdAberto !== escolhida;
      return { stream, passo, deviceIdAberto, caiuParaOutra };
    } catch (e) {
      ultimoErro = e;
      const nome = (e as DOMException)?.name ?? 'Error';
      // Permissão negada não melhora tentando outra resolução nem outra
      // câmera — abortar já evita diálogos seguidos na cara do usuário.
      if (nome === 'NotAllowedError' || nome === 'SecurityError') break;
      // A câmera escolhida não está ligada: as outras resoluções dela também
      // não vão abrir. Vai direto para o passo seguinte.
      if (passo === 'escolhida' && DISPOSITIVO_AUSENTE.has(nome)) pularPasso = 'escolhida';
      console.warn(`[IrisFlow] tentativa "${rotulo}" falhou (${nome}); tentando a próxima…`);
    }
  }

  const nome = (ultimoErro as DOMException)?.name ?? 'Error';
  const causa = causaDoErro(nome);
  console.error(`[IrisFlow] ${causa}`);
  throw new Error(causa, { cause: ultimoErro });
}
