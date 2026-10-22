/**
 * A evolução semanal e a consulta no App (21/10/2026). Teste de CONVENÇÃO, no
 * estilo de `rotasOrfas.test.ts`: lê o texto dos arquivos, porque montar o App
 * inteiro exige câmera, nuvem e PIN. Garante que a coleta do uso está ligada
 * (sem ela a tela de evolução fica sem números e ninguém percebe) e que cada
 * tela nova tem rota e um caminho pela interface.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = __dirname;

function arquivosDoApp(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...arquivosDoApp(p));
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome) && nome !== 'App.tsx') saida.push(p);
  }
  return saida;
}

const app = readFileSync(join(RAIZ, 'App.tsx'), 'utf8');

describe('coleta do uso', () => {
  it('o App monta o RegistroDeUso (uma vez, dentro dos provedores)', () => {
    expect(app).toMatch(/import \{ RegistroDeUso \} from '\.\/components\/RegistroDeUso'/);
    expect(app.match(/<RegistroDeUso \/>/g)).toHaveLength(1);
    // Fica ao lado do indicador de fadiga: os dois dependem dos mesmos provedores.
    expect(app.indexOf('<RegistroDeUso />')).toBeGreaterThan(app.indexOf('<GazeProvider'));
  });

  it('o aviso de fadiga é contado no próprio indicador, não em outro lugar', () => {
    const fontes = arquivosDoApp(RAIZ).filter((p) => /registrarAvisoDeFadiga\(/.test(readFileSync(p, 'utf8')));
    const nomes = fontes.map((p) => p.slice(RAIZ.length + 1).replace(/\\/g, '/')).sort();
    expect(nomes).toEqual(['components/FatigueIndicator.tsx', 'services/evolucao/registroDeUso.ts']);
  });
});

const fontesFora = arquivosDoApp(RAIZ).map((p) => readFileSync(p, 'utf8'));
const temCaminho = (rota: string) =>
  fontesFora.some((f) => new RegExp(`navigate\\(\\s*['"\`]${rota.replace('/', '\\/')}['"\`?]`).test(f));

describe('as duas telas novas', () => {
  it('/evolucao é do cuidador (dado clínico) e /consulta é do paciente (o diário se faz pelo olhar)', () => {
    expect(app).toMatch(/path="\/evolucao"\s+element=\{\s*<ProtectedRoute requireCaregiver>\s*<EvolucaoScreen \/>/);
    expect(app).toMatch(/path="\/consulta"\s+element=\{\s*<ProtectedRoute>\s*<ConsultaScreen \/>/);
  });

  it('as telas entram sob demanda (lazy), como as outras do cuidador', () => {
    expect(app).toMatch(/const EvolucaoScreen = lazyNamed\(\s*\(\) => import\('\.\/pages\/evolucao\/EvolucaoScreen'\),\s*'EvolucaoScreen'/);
    expect(app).toMatch(/const ConsultaScreen = lazyNamed\(\s*\(\) => import\('\.\/pages\/consulta\/ConsultaScreen'\),\s*'ConsultaScreen'/);
  });

  for (const rota of ['/evolucao', '/consulta']) {
    it(`${rota} tem um caminho pela interface (nenhuma tela órfã)`, () => {
      expect(temCaminho(rota)).toBe(true);
    });
  }

  it('o caminho é uma seção das Configurações, e só uma', () => {
    const ajustes = readFileSync(join(RAIZ, 'pages/SettingsScreen.tsx'), 'utf8');
    expect(ajustes).toMatch(/import \{ AtalhoDeEvolucaoEConsulta \} from '\.\/evolucao\/AtalhoDeEvolucaoEConsulta'/);
    expect(ajustes.match(/<AtalhoDeEvolucaoEConsulta \/>/g)).toHaveLength(1);
  });

  it('o menu do paciente (nove cartões) e o hub da Comunicação (seis) continuam como estavam', () => {
    for (const rel of ['pages/MainMenu.tsx', 'pages/core/ComunicacaoScreen.tsx']) {
      const f = readFileSync(join(RAIZ, rel), 'utf8');
      expect(f, rel).not.toMatch(/['"`]\/(evolucao|consulta)\b/);
    }
  });
});

/**
 * Tema escuro: nenhuma tela nova crava cor de tema claro. É o mesmo teste de
 * `pages/temaEscuro.test.tsx`, aplicado às telas desta entrega (a folha em
 * papel é a exceção de propósito: o branco do papel está no CSS dela, não no
 * TSX).
 */
describe('as telas novas seguem o tema escuro', () => {
  const COR_SO_CLARA =
    /(rgba?\(\s*255\s*,\s*255\s*,\s*255)|#ffffff\b|#fff\b|#f0f4ff|#e8f0fb|#f1f5f9|#f8fafc|#fef2f2|#fecaca|#f0fdf4|#bbf7d0|#eff6ff|#bfdbfe|#fffbeb|#fde68a|#e2e8f0/gi;
  const ARQUIVOS = [
    'pages/evolucao/EvolucaoScreen.tsx',
    'pages/evolucao/AtalhoDeEvolucaoEConsulta.tsx',
    'pages/consulta/ConsultaScreen.tsx',
    'pages/consulta/DiarioRapido.tsx',
    'pages/consulta/PerguntasDaConsulta.tsx',
    'pages/consulta/FolhaDaConsulta.tsx',
    'pages/consulta/VistaDaFolha.tsx',
    'pages/consulta/RostoDeHumor.tsx',
  ];
  const ehComentario = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);
  for (const rel of ARQUIVOS) {
    it(`${rel.split('/').pop()} usa tokens do tema`, () => {
      const achados = readFileSync(join(RAIZ, rel), 'utf8')
        .split('\n')
        .map((linha, i) => ({ linha, n: i + 1 }))
        .filter(({ linha }) => !ehComentario(linha))
        .flatMap(({ linha, n }) => (linha.match(COR_SO_CLARA) ?? []).map((cor) => `linha ${n}: ${cor}`));
      expect(achados, achados.join('\n')).toEqual([]);
    });
  }
});
