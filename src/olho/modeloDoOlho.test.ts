import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validarMeta } from '../l2cs/proveniencia';
import type { L2CSModelMeta } from '../l2cs/types';
import { ALTURA_DO_OLHO, LARGURA_DO_OLHO } from './recorte';

// A ficha do modelo do olho (frontend/public/models/eyenet/eyenet.meta.json) é
// o que o worker confere antes de rodar a EyeNet: grade de bins, nomes dos
// tensores e o sha256 do .onnx. O .onnx não vai para o git; a ficha vai, e é
// ela que este teste guarda, junto com a regra de que um modelo sem uso
// comercial autorizado fica fora do instalador.

const RAIZ = resolve(__dirname, '../..');
const ler = (caminho: string): string => readFileSync(resolve(RAIZ, caminho), 'utf8');
const meta = JSON.parse(ler('frontend/public/models/eyenet/eyenet.meta.json')) as L2CSModelMeta & {
  inputShape?: number[];
};

describe('ficha do modelo do olho (EyeNet)', () => {
  it('passa na validação do worker e descreve o eyenet.onnx', () => {
    expect(validarMeta(meta)).toBeNull();
    expect(meta.file).toBe('eyenet.onnx');
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a entrada é o recorte do app: 3×64×96, com decodificação linear', () => {
    expect(meta.inputShape).toEqual([1, 3, ALTURA_DO_OLHO, LARGURA_DO_OLHO]);
    expect(meta.decoding).toBe('linear');
  });

  it('sem uso comercial autorizado, a pasta fica fora do instalador', () => {
    if (meta.proveniencia?.usoComercial === 'permitido') return;
    const pkg = JSON.parse(ler('package.json')) as { build: { files: string[] } };
    expect(pkg.build.files).toContain('!frontend/dist/models/eyenet/**');
    expect(ler('scripts/conferir-pacote.mjs')).toContain("'/frontend/dist/models/eyenet/'");
  });
});
