import { describe, it, expect } from 'vitest';
import { abrirSessaoComFallback, type PassosDaAbertura, type ProviderDaSessao } from './aberturaDaSessao';
import { ErroDeCompatibilidade } from './conferenciaDoModelo';

// Revisão do pipeline de 19/10/2026: a sessão WebGPU que subia e falhava na
// inferência de teste ficava presa (~95 MB) — o fallback criava a sessão WASM
// por cima sem `release()`. Os passos falsos guardam a sessão "aberta" como o
// worker guarda (`session`), e o teste confere que nenhuma fica pendurada.

function passosFalsos(opcoes: { webgpu: boolean; falhaNoTeste?: Partial<Record<ProviderDaSessao, Error>> }) {
  const abertas: ProviderDaSessao[] = [];
  const eventos: string[] = [];
  let sessao: ProviderDaSessao | null = null;
  const passos: PassosDaAbertura = {
    webgpuDisponivel: async () => opcoes.webgpu,
    abrir: async (p) => {
      // A sessão sobe; a inferência de teste é que pode falhar depois.
      sessao = p;
      abertas.push(p);
      eventos.push(`abrir:${p}`);
      const falha = opcoes.falhaNoTeste?.[p];
      if (falha) throw falha;
    },
    liberar: async () => {
      eventos.push(`liberar:${sessao ?? '-'}`);
      if (sessao) abertas.splice(abertas.indexOf(sessao), 1);
      sessao = null;
    },
    avisar: () => {},
  };
  return { passos, abertas, eventos };
}

describe('abertura da sessão com fallback', () => {
  it('a WebGPU que sobe e falha na inferência de teste é liberada ANTES de abrir a WASM', async () => {
    const f = passosFalsos({ webgpu: true, falhaNoTeste: { webgpu: new Error('operador sem suporte no WebGPU') } });
    await expect(abrirSessaoComFallback('auto', f.passos)).resolves.toEqual({ ativo: 'wasm', fallback: true });
    expect(f.eventos).toEqual(['abrir:webgpu', 'liberar:webgpu', 'abrir:wasm']);
    // Só a sessão em uso fica aberta.
    expect(f.abertas).toEqual(['wasm']);
  });

  it('erro de compatibilidade (meta × modelo): libera a WebGPU e falha, sem tentar o WASM', async () => {
    const f = passosFalsos({ webgpu: true, falhaNoTeste: { webgpu: new ErroDeCompatibilidade('a meta declara 90 bins') } });
    await expect(abrirSessaoComFallback('auto', f.passos)).rejects.toBeInstanceOf(ErroDeCompatibilidade);
    expect(f.eventos).toEqual(['abrir:webgpu', 'liberar:webgpu']);
    expect(f.abertas).toEqual([]);
  });

  it('caminho feliz: WebGPU sobe e fica, nada é liberado', async () => {
    const f = passosFalsos({ webgpu: true });
    await expect(abrirSessaoComFallback('auto', f.passos)).resolves.toEqual({ ativo: 'webgpu', fallback: false });
    expect(f.eventos).toEqual(['abrir:webgpu']);
  });

  it('sem WebGPU, direto para o WASM (fallback marcado, como antes)', async () => {
    const f = passosFalsos({ webgpu: false });
    await expect(abrirSessaoComFallback('auto', f.passos)).resolves.toEqual({ ativo: 'wasm', fallback: true });
    expect(f.eventos).toEqual(['abrir:wasm']);
  });

  it('provider forçado: um só, sem fallback', async () => {
    const f = passosFalsos({ webgpu: true, falhaNoTeste: { wasm: new Error('sem memória') } });
    await expect(abrirSessaoComFallback('wasm', f.passos)).rejects.toThrow('sem memória');
    expect(f.eventos).toEqual(['abrir:wasm']);
  });
});
