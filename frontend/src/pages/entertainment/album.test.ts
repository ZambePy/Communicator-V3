import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CHAVE_DO_ALBUM,
  LIMITE_DO_ALBUM,
  lerAlbum,
  removerDoAlbum,
  salvarNoAlbum,
} from './album';

/**
 * O álbum divide o `localStorage` com os perfis de calibração. Um álbum que
 * enche a cota faz a próxima calibração deixar de ser salva em silêncio.
 * Daí o teto baixo, e a falha DITA em vez de engolida.
 */
describe('álbum local', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('grava na mesma chave e forma das fotos da câmera', () => {
    const r = salvarNoAlbum('data:image/jpeg;base64,AAA', 'Desenho');
    expect(r).toEqual({ ok: true, total: 1 });
    const bruto = JSON.parse(localStorage.getItem(CHAVE_DO_ALBUM)!);
    expect(bruto[0]).toEqual({
      id: expect.stringMatching(/^photo_\d+_[a-z0-9]+$/),
      dataUrl: 'data:image/jpeg;base64,AAA',
      timestamp: expect.any(Number),
      filter: 'Desenho',
    });
  });

  it('a mais nova vem primeiro e o teto descarta as mais antigas', () => {
    for (let i = 0; i < LIMITE_DO_ALBUM + 3; i++) salvarNoAlbum(`data:${i}`, 'Normal');
    const lista = lerAlbum();
    expect(lista).toHaveLength(LIMITE_DO_ALBUM);
    expect(lista[0].dataUrl).toBe(`data:${LIMITE_DO_ALBUM + 2}`);
  });

  it('cota estourada é devolvida como "cheio", não engolida', () => {
    const erro = new DOMException('quota', 'QuotaExceededError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw erro;
    });
    expect(salvarNoAlbum('data:x', 'Normal')).toEqual({ ok: false, motivo: 'cheio' });
  });

  it('remover apaga só a imagem pedida', () => {
    salvarNoAlbum('data:1', 'Normal');
    const [primeira] = lerAlbum();
    salvarNoAlbum('data:2', 'Normal');
    const restante = removerDoAlbum(primeira.id);
    expect(restante.map((p) => p.dataUrl)).toEqual(['data:2']);
    expect(lerAlbum().map((p) => p.dataUrl)).toEqual(['data:2']);
  });

  it('registro ilegível vira álbum vazio', () => {
    localStorage.setItem(CHAVE_DO_ALBUM, '[{');
    expect(lerAlbum()).toEqual([]);
    localStorage.setItem(CHAVE_DO_ALBUM, JSON.stringify([{ id: 'x' }, { dataUrl: 'data:ok' }]));
    expect(lerAlbum()).toEqual([expect.objectContaining({ dataUrl: 'data:ok' })]);
  });
});
