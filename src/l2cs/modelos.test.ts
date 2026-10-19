import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MODELOS_DO_ROSTO,
  MODELO_DO_ROSTO_PADRAO,
  PASTAS_FORA_DO_INSTALADOR,
  descricaoDoModelo,
  ladoAceito,
} from './modelos';
import { validarMeta } from './proveniencia';
import { VALORES_ACEITOS, DEFAULTS } from '../config/experiment';
import type { L2CSModelMeta } from './types';

// O catálogo dos modelos do rosto é o que liga a flag `modeloDoRosto` aos
// arquivos. O que este teste guarda: cada modelo do catálogo tem a meta na
// pasta pública e ela passa na validação do worker; o lado de recorte do
// catálogo bate com o que a meta declara; e os modelos só de pesquisa estão
// fora do instalador nos TRÊS lugares que precisam andar juntos (catálogo,
// `build.files` do package.json e scripts/conferir-pacote.mjs).

const RAIZ = resolve(__dirname, '../..');
const lerMeta = (caminho: string): L2CSModelMeta =>
  JSON.parse(readFileSync(resolve(RAIZ, 'frontend/public', caminho), 'utf8')) as L2CSModelMeta;

describe('catálogo dos modelos do rosto', () => {
  it('a flag aceita exatamente os modelos do catálogo, e o padrão é o da beta', () => {
    expect([...VALORES_ACEITOS.modeloDoRosto].sort()).toEqual(Object.keys(MODELOS_DO_ROSTO).sort());
    expect(DEFAULTS.modeloDoRosto).toBe(MODELO_DO_ROSTO_PADRAO);
    expect(MODELO_DO_ROSTO_PADRAO).toBe('gaze360');
  });

  it.each(Object.values(MODELOS_DO_ROSTO))('$id: a meta existe, é válida e descreve o arquivo do catálogo', (m) => {
    const meta = lerMeta(m.meta);
    expect(validarMeta(meta)).toBeNull();
    expect(meta.file).toBe(m.modelo.slice(m.modelo.lastIndexOf('/') + 1));
    if (meta.supportedInputSizes) {
      // ONNX de entrada fixa: o catálogo só pode pedir os lados que ele aceita.
      for (const lado of m.lados) expect(meta.supportedInputSizes).toContain(lado);
    }
  });

  it('o GazeGene: 224 fixo, decodificação linear em 120 bins de 2°, uso comercial proibido', () => {
    const m = MODELOS_DO_ROSTO.gazegene;
    const meta = lerMeta(m.meta);
    expect(m.lados).toEqual([224]);
    expect(meta.supportedInputSizes).toEqual([224]);
    expect(meta.decoding).toBe('linear');
    expect([meta.outputBins, meta.binWidth, meta.binOffset]).toEqual([120, 2, -119]);
    expect(meta.proveniencia?.usoComercial).toBe('proibido');
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(m.vaiNoInstalador).toBe(false);
  });

  it('id desconhecido cai no padrão em vez de quebrar o boot', () => {
    expect(descricaoDoModelo('xyz').id).toBe('gaze360');
    expect(descricaoDoModelo(undefined).id).toBe('gaze360');
    expect(descricaoDoModelo('gazegene').id).toBe('gazegene');
  });
});

describe('ladoAceito', () => {
  it('mantém o pedido quando o ONNX aceita', () => {
    expect(ladoAceito([448, 224], 224)).toBe(224);
    expect(ladoAceito([448, 224], 448)).toBe(448);
  });

  it('troca pelo primeiro aceito quando o ONNX é de entrada fixa', () => {
    expect(ladoAceito([224], 448)).toBe(224);
  });
});

describe('modelos só de pesquisa ficam fora do instalador', () => {
  const pkg = JSON.parse(readFileSync(resolve(RAIZ, 'package.json'), 'utf8')) as { build: { files: string[] } };
  const conferir = readFileSync(resolve(RAIZ, 'scripts/conferir-pacote.mjs'), 'utf8');
  const gitignore = readFileSync(resolve(RAIZ, '.gitignore'), 'utf8');

  it('o catálogo tem pelo menos o GazeGene na lista', () => {
    expect(PASTAS_FORA_DO_INSTALADOR).toContain('models/l2cs-gazegene/');
  });

  it.each([...PASTAS_FORA_DO_INSTALADOR])('%s: excluída no build.files e conferida no pacote', (pasta) => {
    expect(pkg.build.files).toContain(`!frontend/dist/${pasta}**`);
    expect(conferir).toContain(`'/frontend/dist/${pasta}'`);
  });

  it('o ONNX não entra no git', () => {
    expect(gitignore).toMatch(/^frontend\/public\/models\/\*\*\/\*\.onnx$/m);
  });
});
