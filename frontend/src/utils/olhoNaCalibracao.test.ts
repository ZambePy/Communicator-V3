import { describe, it, expect } from 'vitest';
import { olhoNaCalibracao } from './olhoNaCalibracao';

describe('olhoNaCalibracao', () => {
  it('com a flag desligada, o ramo ocular nunca segura a calibração', () => {
    expect(olhoNaCalibracao('off', null)).toBe('livre');
    expect(olhoNaCalibracao('off', 'erro')).toBe('livre');
  });

  it('com a EyeNet ligada, a calibração espera o modelo dos olhos', () => {
    // `desligado` com a flag ligada = engine ainda não iniciou o ramo.
    expect(olhoNaCalibracao('onnx', null)).toBe('aguardando');
    expect(olhoNaCalibracao('onnx', 'desligado')).toBe('aguardando');
    expect(olhoNaCalibracao('onnx', 'carregando')).toBe('aguardando');
    expect(olhoNaCalibracao('onnx', 'pronto')).toBe('livre');
    expect(olhoNaCalibracao('onnx', 'erro')).toBe('falhou');
  });
});
