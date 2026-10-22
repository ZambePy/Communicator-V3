import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registrarSemDerrubar } from './electronInicio';

// -----------------------------------------------------------------------------
// Revisão final de 22/10/2026 (R3): um recurso opcional (voz, Modo Computador,
// backup, impressão, atualização) que lança ao registrar não pode impedir a
// janela do comunicador de abrir. Antes, a exceção rejeitava o `whenReady` e
// `createWindow()` nunca rodava: o app ficava vivo, invisível, e a instância
// única impedia abrir outro.
// -----------------------------------------------------------------------------

describe('registrarSemDerrubar', () => {
  it('devolve o que o registro devolveu, sem avisar ninguém', () => {
    const aoFalhar = vi.fn();
    expect(registrarSemDerrubar('voz', () => 42, aoFalhar)).toBe(42);
    expect(aoFalhar).not.toHaveBeenCalled();
  });

  it('um registro que lança vira aviso com o nome e o erro, e devolve undefined', () => {
    const erro = new Error('EPERM: mkdir');
    const aoFalhar = vi.fn();
    expect(registrarSemDerrubar('voz', () => { throw erro; }, aoFalhar)).toBeUndefined();
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoFalhar).toHaveBeenCalledWith('voz', erro);
  });

  it('o aviso que também falha não vira a nova exceção', () => {
    expect(() => registrarSemDerrubar('voz', () => { throw new Error('a'); }, () => { throw new Error('b'); })).not.toThrow();
  });
});

describe('o main abre a janela mesmo que um recurso opcional não registre', () => {
  const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const main = readFileSync(resolve(RAIZ, 'electron/main.ts'), 'utf8');
  const pronto = main.slice(main.indexOf('app.whenReady().then('));

  it.each([
    'registrarModoComputador',
    'registrarVoz',
    'registrarVozGuardada',
    'registrarCopiaDeSeguranca',
    'registrarPranchaEmPdf',
    'registrarAtualizacao',
    'segurarSaidaAteOMotorSair',
  ])('%s roda dentro de registrarOpcional', (nome) => {
    const chamadas = pronto.match(new RegExp(`\\b${nome}\\(`, 'g')) ?? [];
    const protegidas = pronto.match(new RegExp(`registrarOpcional\\('[^']+',\\s*\\(\\)\\s*=>\\s*(?:\\{[^}]*?)?\\b${nome}\\(`, 'g')) ?? [];
    expect(chamadas).toHaveLength(1);
    expect(protegidas).toHaveLength(1);
  });

  it('a janela é criada depois dos registros e o cuidador é avisado do que não iniciou', () => {
    expect(pronto.indexOf('createWindow();')).toBeGreaterThan(pronto.indexOf('segurarSaidaAteOMotorSair'));
    expect(pronto).toMatch(/recursosQueNaoIniciaram/);
    expect(pronto).toMatch(/avisarRecursosQueNaoIniciaram\(/);
  });
});
