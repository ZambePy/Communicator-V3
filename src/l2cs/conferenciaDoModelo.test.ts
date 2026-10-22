import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { conferirLadoAceito, conferirSaidas, ErroDeCompatibilidade, formaDaEntradaDeTeste } from './conferenciaDoModelo';
import type { L2CSModelMeta } from './types';

// Inferência de teste do `init` (relato de 19/10/2026, auditoria A3): a meta
// que não combina com o modelo agora falha ANTES do `ready`, com a frase que
// diz o que mudar — e a tela de calibração mostra "o modelo não carregou", em
// vez de deixar calibrar com o bloco angular zerado e culpar os óculos.

const META = JSON.parse(
  readFileSync(resolve(__dirname, '../../frontend/public/models/l2cs/l2cs.meta.json'), 'utf8'),
) as L2CSModelMeta;

const saida = (n: number) => ({ data: new Float32Array(n) });

describe('conferirSaidas', () => {
  it('aceita a saída que a meta descreve', () => {
    expect(() => conferirSaidas({
      [META.outputTensorNames.yaw]: saida(META.outputBins),
      [META.outputTensorNames.pitch]: saida(META.outputBins),
    }, META)).not.toThrow();
  });

  it('grade de bins diferente: erro de compatibilidade com os números', () => {
    const f = () => conferirSaidas({
      [META.outputTensorNames.yaw]: saida(28),
      [META.outputTensorNames.pitch]: saida(28),
    }, META);
    expect(f).toThrow(ErroDeCompatibilidade);
    expect(f).toThrow(new RegExp(`declara ${META.outputBins} bins, mas o modelo devolveu 28`));
  });

  it('nome de saída que o modelo não tem: diz quais ele tem', () => {
    const f = () => conferirSaidas({ outra: saida(META.outputBins) }, META);
    expect(f).toThrow(ErroDeCompatibilidade);
    expect(f).toThrow(/expõe \[outra\]/);
  });
});

describe('lado do recorte', () => {
  it('ONNX de entrada fixa recusa outro lado, com a mensagem do catálogo', () => {
    const fixo = { supportedInputSizes: [224] };
    expect(() => conferirLadoAceito(fixo, 224)).not.toThrow();
    expect(() => conferirLadoAceito(fixo, 448)).toThrow(/aceita recorte de 224 px, mas recebeu 448/);
    // Sem a lista, qualquer lado (eixos dinâmicos).
    expect(() => conferirLadoAceito({}, 448)).not.toThrow();
  });

  it('a forma do teste segue o provider ativo (a política por provider escolhe o lado)', () => {
    const teste = { porProvider: { webgpu: 448, wasm: 224 } };
    expect(formaDaEntradaDeTeste(teste, 'webgpu', {})).toEqual([1, 3, 448, 448]);
    expect(formaDaEntradaDeTeste(teste, 'wasm', {})).toEqual([1, 3, 224, 224]);
    expect(() => formaDaEntradaDeTeste(teste, 'webgpu', { supportedInputSizes: [224] })).toThrow(ErroDeCompatibilidade);
  });

  it('o ramo ocular testa o tensor retangular do olho', () => {
    expect(formaDaEntradaDeTeste({ dims: [64, 96] }, 'wasm', {})).toEqual([1, 3, 64, 96]);
    expect(() => formaDaEntradaDeTeste({ dims: [0, 96] }, 'wasm', {})).toThrow(ErroDeCompatibilidade);
  });
});
