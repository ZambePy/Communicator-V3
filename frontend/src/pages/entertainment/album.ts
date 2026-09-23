/**
 * Álbum local — a única forma de guardar imagens que o paciente cria.
 *
 * Um módulo só, e não três cópias da mesma leitura de `localStorage`: a
 * câmera grava, a galeria lê e apaga, e o desenho agora também grava. Chave
 * e forma são as de sempre (`irisflow_captured_photos`, `{id, dataUrl,
 * timestamp, filter}`), então fotos já salvas continuam aparecendo.
 *
 * ## Por que o teto é baixo e a imagem é pequena
 *
 * O `localStorage` é UM por origem, e é onde vivem os perfis de calibração —
 * `src/calibration.ts` engole `QuotaExceededError` ao gravar. Quarenta fotos
 * de 1280×720 a 92% (~8–13 MB) enchiam a cota e a próxima calibração deixava
 * de ser salva em silêncio: o paciente perdia o rastreamento por causa de um
 * álbum de fotos. Com 640×360 a 70% (~40–60 KB cada) e quinze imagens o
 * álbum fica em ~1 MB, longe de encostar em qualquer cota.
 *
 * E quando a cota estoura mesmo assim, a falha É DITA: `salvarNoAlbum`
 * devolve `'cheio'` e a tela mostra. Um `console.error` não chega a quem está
 * na frente da tela.
 */

export const CHAVE_DO_ALBUM = 'irisflow_captured_photos';

/** Quantas imagens o álbum guarda. Acima disso as mais antigas saem. */
export const LIMITE_DO_ALBUM = 15;

/** Tamanho máximo, em px, de uma imagem guardada. */
export const LARGURA_MAXIMA = 640;
export const ALTURA_MAXIMA = 360;

/** Qualidade JPEG das imagens guardadas. */
export const QUALIDADE_JPEG = 0.7;

export interface ImagemDoAlbum {
  id: string;
  dataUrl: string;
  timestamp: number;
  /** Nome do filtro da câmera, ou `'Desenho'` para o que veio do desenho. */
  filter: string;
}

export type ResultadoDeSalvar =
  | { ok: true; total: number }
  | { ok: false; motivo: 'cheio' | 'indisponivel' };

function ehImagem(v: unknown): v is ImagemDoAlbum {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.dataUrl === 'string' && o.dataUrl.length > 0;
}

/** Lê o álbum. Registro ilegível vira álbum vazio, nunca uma tela quebrada. */
export function lerAlbum(): ImagemDoAlbum[] {
  try {
    const raw = localStorage.getItem(CHAVE_DO_ALBUM);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(ehImagem).map((item, i) => ({
      id: typeof item.id === 'string' && item.id ? item.id : `photo_${item.timestamp ?? i}`,
      dataUrl: item.dataUrl,
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      filter: typeof item.filter === 'string' ? item.filter : '',
    }));
  } catch {
    return [];
  }
}

function ehEstouroDeCota(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; code?: number };
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

function gravar(lista: ImagemDoAlbum[]): ResultadoDeSalvar {
  try {
    localStorage.setItem(CHAVE_DO_ALBUM, JSON.stringify(lista));
    return { ok: true, total: lista.length };
  } catch (e) {
    return { ok: false, motivo: ehEstouroDeCota(e) ? 'cheio' : 'indisponivel' };
  }
}

/**
 * Guarda uma imagem no início do álbum, respeitando o teto.
 *
 * Se a cota estourar mesmo dentro do teto (outra coisa encheu o storage), a
 * função tenta UMA vez abrindo espaço — tira a mais antiga — e, se ainda
 * assim não couber, devolve `'cheio'` para a tela avisar.
 */
export function salvarNoAlbum(dataUrl: string, filter: string): ResultadoDeSalvar {
  const nova: ImagemDoAlbum = {
    // Sufixo aleatório: duas gravações no mesmo milissegundo (desenho e foto
    // em sequência rápida) teriam o mesmo id, e apagar uma apagaria as duas.
    id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dataUrl,
    timestamp: Date.now(),
    filter,
  };
  let lista = [nova, ...lerAlbum()].slice(0, LIMITE_DO_ALBUM);
  let r = gravar(lista);
  if (!r.ok && r.motivo === 'cheio' && lista.length > 1) {
    lista = lista.slice(0, -1);
    r = gravar(lista);
  }
  return r;
}

export function removerDoAlbum(id: string): ImagemDoAlbum[] {
  const lista = lerAlbum().filter((p) => p.id !== id);
  gravar(lista);
  return lista;
}

/**
 * Reduz um canvas ao tamanho do álbum e devolve o JPEG.
 *
 * Compõe sobre FUNDO BRANCO antes de codificar: JPEG não tem transparência, e
 * um canvas transparente (o do desenho) viraria um retângulo preto com os
 * traços em cima — irreconhecível para quem desenhou em fundo claro.
 */
export function canvasParaAlbum(origem: HTMLCanvasElement, fundo = '#ffffff'): string | null {
  const largura = origem.width;
  const altura = origem.height;
  if (!largura || !altura) return null;
  const escala = Math.min(1, LARGURA_MAXIMA / largura, ALTURA_MAXIMA / altura);
  const destino = document.createElement('canvas');
  destino.width = Math.max(1, Math.round(largura * escala));
  destino.height = Math.max(1, Math.round(altura * escala));
  const ctx = destino.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, destino.width, destino.height);
  ctx.drawImage(origem, 0, 0, destino.width, destino.height);
  try {
    return destino.toDataURL('image/jpeg', QUALIDADE_JPEG);
  } catch {
    return null;
  }
}
