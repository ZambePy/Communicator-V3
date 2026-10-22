import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import qrcode from 'qrcode-generator';
import { decodificarQr, matrizDoSvg } from '../test/decodificarQr';

/**
 * O QR que o computador do paciente mostra, LIDO DE VOLTA (rodada 3, tarefa 10,
 * 21/10/2026). O teste de ParearCelular.test.tsx só confere o texto entregue ao
 * gerador de QR (com o gerador trocado por um falso). Aqui o gerador é o de
 * verdade e o que se confere é o QR desenhado na tela: lê-se o SVG módulo a
 * módulo, com um leitor independente (test/decodificarQr.ts), e o texto que sai
 * tem de ser exatamente o endereço que a página /parear do site espera.
 *
 * Por que não o `jsqr`: ele não está nas dependências do projeto, e este
 * ambiente não instala pacote. O leitor próprio decodifica o que o gerador
 * escreveu (máscara, ordem dos bits, blocos) sem usar o gerador para isso — se
 * o desenho no SVG saísse deslocado ou espelhado, a leitura falharia. A leitura
 * por câmera de verdade (rasterizado + OpenCV) está no relatório da tarefa.
 */

const { nuvem } = vi.hoisted(() => ({
  nuvem: { configurada: true, vinculo: { device_key: 'chave-do-pc' } as { device_key: string } | null },
}));

vi.mock('../cloud/CloudContext', () => ({ useCloud: () => nuvem }));
vi.mock('../cloud/config', () => ({
  cloudConfig: {
    url: 'https://abc.supabase.co',
    anonKey: 'anon-123',
    desktopSyncUrl: 'https://abc.supabase.co/functions/v1/desktop-sync',
    siteUrl: 'https://irisflow.ia.br',
  },
  nuvemConfigurada: true,
}));

import { CodigoQr, ParearCelular } from './ParearCelular';

const CODIGO = 'Qx7_-k2LmN0pRsTuVwXyZ1a2b3c4d5e6f7g8h9i0jAB';
const ENDERECO_ESPERADO = /^https:\/\/irisflow\.ia\.br\/parear#t=[A-Za-z0-9_-]{43}$/;

const fetchFalso = vi.fn(async (_url: string, init?: RequestInit) => {
  const corpo = JSON.parse(String(init?.body)) as { action: string };
  const resposta: Record<string, unknown> =
    corpo.action === 'pairing.create'
      ? { ok: true, id: 'id-1', codigo: CODIGO, expira_em: 'x', restante_s: 180, validade_s: 180 }
      : corpo.action === 'pairing.status'
        ? { ok: true, estado: 'aguardando', restante_s: 170 }
        : { ok: true };
  return { ok: true, status: 200, json: async () => resposta } as unknown as Response;
});

beforeEach(() => {
  fetchFalso.mockClear();
  vi.stubGlobal('fetch', fetchFalso);
  nuvem.configurada = true;
  nuvem.vinculo = { device_key: 'chave-do-pc' };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('o QR do computador, lido de volta', () => {
  it('a seção desenha um QR que, lido, é exatamente https://irisflow.ia.br/parear#t=<43 caracteres>', async () => {
    render(<ParearCelular />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar o código' }));
    const svg = await screen.findByTestId('qr-do-celular');

    const lido = decodificarQr(matrizDoSvg(svg));

    // Exatamente o endereço, sem espaço, quebra de linha ou parâmetro a mais.
    expect(lido).toBe(`https://irisflow.ia.br/parear#t=${CODIGO}`);
    expect(lido).toMatch(ENDERECO_ESPERADO);
    // O código vai no fragmento (#t=), nunca na busca (?t=): o servidor do
    // site e o Referer não o veem.
    expect(lido).not.toContain('?');
    expect(lido.split('#t=')[1]).toHaveLength(43);
  });

  it('o QR da seção cabe numa versão que as câmeras leem fácil (até a 5, 37 x 37 módulos)', async () => {
    render(<ParearCelular />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar o código' }));
    const svg = await screen.findByTestId('qr-do-celular');
    const matriz = matrizDoSvg(svg);
    // 75 caracteres no nível M: versão 5. Se o endereço crescesse (outro domínio
    // longo, parâmetro novo), o QR ficaria mais denso e mais difícil de ler a
    // distância; o teste avisa antes de isso chegar à câmera do cuidador.
    expect(matriz.length).toBeLessThanOrEqual(37);
  });

  it('o desenho tem a margem de 4 módulos em branco que as câmeras exigem', async () => {
    render(<ParearCelular />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar o código' }));
    const svg = await screen.findByTestId('qr-do-celular');
    const [, , largura] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    const matriz = matrizDoSvg(svg);
    expect(largura).toBe(matriz.length + 8);
    // Todo módulo escuro do caminho começa em 4 (margem) e termina antes da margem direita.
    const inicios = [...(svg.querySelector('path')?.getAttribute('d') ?? '').matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(inicios.length).toBeGreaterThan(0);
    for (const [x, y] of inicios) {
      expect(x).toBeGreaterThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThan(largura - 4);
      expect(y).toBeLessThan(largura - 4);
    }
  });

  it('o leitor é independente do gerador: lê QRs de vários tamanhos e recusa o que não é QR', () => {
    // Tamanhos que passam pelas versões 1, 2, 5, 8 (blocos de tamanhos diferentes),
    // 9 e 10 (contagem de 16 bits).
    const textos = [
      'oi',
      'https://irisflow.ia.br/parear',
      `https://irisflow.ia.br/parear#t=${CODIGO}`,
      'x'.repeat(140),
      'y'.repeat(170),
      'z'.repeat(200),
    ];
    for (const texto of textos) {
      const qr = qrcode(0, 'M');
      qr.addData(texto);
      qr.make();
      const n = qr.getModuleCount();
      const matriz = Array.from({ length: n }, (_, l) => Array.from({ length: n }, (_, c) => qr.isDark(l, c)));
      expect(decodificarQr(matriz)).toBe(texto);
    }
    const branca = Array.from({ length: 37 }, () => Array.from({ length: 37 }, () => false));
    expect(() => decodificarQr(branca)).toThrow(/formato/i);
  });

  it('um QR com um endereço diferente é lido diferente (o teste não aceita qualquer coisa)', () => {
    const { container } = render(<CodigoQr valor={`https://irisflow.ia.br/parear?t=${CODIGO}`} rotulo="x" />);
    const svg = container.querySelector('svg') as SVGElement;
    const lido = decodificarQr(matrizDoSvg(svg));
    expect(lido).not.toMatch(ENDERECO_ESPERADO);
    expect(lido).toContain('?t=');
  });
});
