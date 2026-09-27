/**
 * Telas órfãs (FE-23): rotas que existiam no App sem nenhum caminho pela
 * interface — só digitando a URL. Teste de CONVENÇÃO: lê o texto dos arquivos
 * (a navegação acontece em telas que exigem câmera, nuvem e PIN para montar).
 * O que ele garante é que cada uma delas tem ao menos um `navigate()` fora do
 * App e dos testes; se alguém remover o último caminho, ele falha aqui.
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

const fontes = arquivosDoApp(RAIZ).map((p) => readFileSync(p, 'utf8'));
const app = readFileSync(join(RAIZ, 'App.tsx'), 'utf8');

const temCaminho = (rota: string) =>
  fontes.some((f) => new RegExp(`navigate\\(\\s*['"\`]${rota.replace('/', '\\/')}['"\`?]`).test(f));

describe('telas que tinham ficado sem caminho pela interface', () => {
  for (const rota of ['/pictograms', '/options', '/relatorio']) {
    it(`${rota} existe no App e tem um caminho pela interface`, () => {
      expect(app).toContain(`path="${rota}"`);
      expect(temCaminho(rota)).toBe(true);
    });
  }

  it('"Estou bem" é resposta da Conversa, sem a antiga tela /iamok', () => {
    expect(app).not.toContain('path="/iamok"');
    const conversa = readFileSync(join(RAIZ, 'pages/caregiver/ConversationScreen.tsx'), 'utf8');
    expect(conversa).toContain("'Estou bem'");
  });
});
