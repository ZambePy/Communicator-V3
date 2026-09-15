import { describe, expect, it } from 'vitest';
import {
  FOV_PADRAO_DEG,
  chaveDaCamera,
  registrarFov,
  resolverFovParaCamera,
  sanitizarMapaDeFov,
} from './fovPorCamera';

describe('chaveDaCamera', () => {
  it('prefere o deviceId e cai para o rótulo', () => {
    expect(chaveDaCamera({ deviceId: 'abc', label: 'HD Webcam' })).toBe('id:abc');
    expect(chaveDaCamera({ deviceId: '', label: 'HD Webcam' })).toBe('rotulo:HD Webcam');
    expect(chaveDaCamera({ deviceId: '  ', label: ' ' })).toBeNull();
    expect(chaveDaCamera(null)).toBeNull();
  });
});

describe('resolverFovParaCamera', () => {
  const mapa = registrarFov({}, 'id:usb', 78.2, 'Logitech C920', new Date('2026-09-15T00:00:00Z'));

  it('câmera conhecida restaura o FOV medido dela', () => {
    const r = resolverFovParaCamera(mapa, 'id:usb', 'id:interna', 69.7);
    expect(r.fovDeg).toBeCloseTo(78.2, 9);
    expect(r.origem).toBe('medido');
    expect(r.aviso).toMatch(/reconhecida/);
  });

  it('mesma câmera de sempre, mesmo FOV: nada a avisar', () => {
    const r = resolverFovParaCamera(mapa, 'id:usb', 'id:usb', 78.2);
    expect(r.aviso).toBeNull();
  });

  it('câmera nova depois de uma medida: volta ao padrão E avisa', () => {
    // É o caso que este módulo existe para pegar: o FOV de 78,2° era da
    // Logitech; na integrada ele daria toda distância errada em silêncio.
    const r = resolverFovParaCamera(mapa, 'id:interna', 'id:usb', 78.2);
    expect(r.fovDeg).toBe(FOV_PADRAO_DEG);
    expect(r.origem).toBe('padrao');
    expect(r.aviso).toMatch(/voltou ao padrão/);
  });

  it('primeiro boot (sem histórico): padrão, sem alarde', () => {
    const r = resolverFovParaCamera({}, 'id:interna', null, FOV_PADRAO_DEG);
    expect(r.fovDeg).toBe(FOV_PADRAO_DEG);
    expect(r.aviso).toBeNull();
  });

  it('sem identidade da câmera, mantém o que está', () => {
    const r = resolverFovParaCamera(mapa, null, 'id:usb', 78.2);
    expect(r.fovDeg).toBeCloseTo(78.2, 9);
    expect(r.aviso).toBeNull();
  });
});

describe('registrarFov / sanitizarMapaDeFov', () => {
  it('registrar não muta o mapa original e recusa FOV implausível', () => {
    const a = {};
    const b = registrarFov(a, 'id:x', 70, 'X');
    expect(Object.keys(a)).toHaveLength(0);
    expect(b['id:x'].fovDeg).toBe(70);
    expect(() => registrarFov(a, 'id:x', 0, 'X')).toThrow(RangeError);
    expect(() => registrarFov(a, 'id:x', 200, 'X')).toThrow(RangeError);
  });

  it('sanitizar descarta entradas quebradas e mantém as boas', () => {
    const m = sanitizarMapaDeFov({
      'id:ok': { fovDeg: 70.5, rotulo: 'A', medidoEm: '2026-01-01' },
      'id:nan': { fovDeg: NaN },
      'id:neg': { fovDeg: -5 },
      'id:str': 'x',
      'id:semRotulo': { fovDeg: 60 },
    });
    expect(Object.keys(m).sort()).toEqual(['id:ok', 'id:semRotulo']);
    expect(m['id:semRotulo'].rotulo).toBe('');
    expect(sanitizarMapaDeFov(null)).toEqual({});
    expect(sanitizarMapaDeFov([1])).toEqual({});
  });
});
