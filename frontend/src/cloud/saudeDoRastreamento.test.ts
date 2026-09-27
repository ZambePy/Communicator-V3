import { describe, it, expect } from 'vitest';
import { saudeDoRastreamento } from './saudeDoRastreamento';

// O heartbeat é o que o celular do cuidador usa para saber se o paciente está
// com o sistema funcionando. Com a câmera desconectada no meio da sessão, o
// critério antigo ("existe um MediaStream" + "estado tracking") seguia dizendo
// "tudo ok".

const stream = {} as MediaStream;

describe('saúde do rastreamento no heartbeat', () => {
  it('câmera sem imagem (desconectada, muda, sem quadros): camera_ok e tracker_ok falsos, mesmo com a stream aberta', () => {
    expect(saudeDoRastreamento({
      state: 'tracking', cameraError: null, getCameraStream: () => stream, cameraAtiva: () => false,
    })).toEqual({ camera_ok: false, tracker_ok: false });
  });

  it('engine em sem_camera ou error: tracker_ok falso', () => {
    for (const state of ['sem_camera', 'error', 'idle', 'loading']) {
      expect(saudeDoRastreamento({
        state, cameraError: null, getCameraStream: () => stream, cameraAtiva: () => true,
      }).tracker_ok).toBe(false);
    }
  });

  it('câmera com imagem e engine rastreando: ok', () => {
    for (const state of ['tracking', 'calibrating', 'uncalibrated']) {
      expect(saudeDoRastreamento({
        state, cameraError: null, getCameraStream: () => stream, cameraAtiva: () => true,
      })).toEqual({ camera_ok: true, tracker_ok: true });
    }
  });

  it('erro de câmera vence tudo', () => {
    expect(saudeDoRastreamento({
      state: 'tracking', cameraError: 'Nenhuma câmera encontrada.', getCameraStream: () => stream, cameraAtiva: () => true,
    })).toEqual({ camera_ok: false, tracker_ok: false });
  });

  it('sem `cameraAtiva` (provider antigo), cai no critério da stream', () => {
    expect(saudeDoRastreamento({ state: 'tracking', cameraError: null, getCameraStream: () => stream }).camera_ok).toBe(true);
    expect(saudeDoRastreamento({ state: 'tracking', cameraError: null, getCameraStream: () => null }).camera_ok).toBe(false);
  });

  it('uma consulta que lança não vira "ok"', () => {
    expect(saudeDoRastreamento({
      state: 'tracking', cameraError: null, getCameraStream: () => stream, cameraAtiva: () => { throw new Error('x'); },
    }).camera_ok).toBe(false);
  });
});
