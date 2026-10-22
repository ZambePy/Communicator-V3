// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -----------------------------------------------------------------------------
// Backup completo (rodada 3, 21/10/2026): as gravações da voz guardada entram no
// arquivo de backup e voltam num computador novo. O que se testa aqui é o lado
// do processo principal, com arquivos de verdade numa pasta temporária:
//   - o que SAI (`arquivosParaBackup` / `lerArquivoDoBackup`);
//   - o que ENTRA (`restaurarDoBackup`): somando ao que já existe, nunca
//     apagando — as gravações são a voz de quem talvez não possa gravar de novo;
//   - os canais (só a janela do app) e a porta estreita: nomes, nunca caminhos.
// -----------------------------------------------------------------------------

let userData = '';
const handlers = new Map<string, (...a: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { getPath: () => userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  ipcMain: { handle: (canal: string, fn: (...a: unknown[]) => unknown) => handlers.set(canal, fn) },
}));

import { criarArmazemDeGravacoes, type ArmazemDeGravacoes } from '../../electron/voz/gravacoes';
import { registrarVozGuardada } from '../../electron/voz/guardadas';
import {
  CANAIS_VOZ_GUARDADA, LIMITES_DA_VOZ_GUARDADA, LIMITES_DO_BACKUP_DA_VOZ, NOME_DO_INDICE, NOME_DOS_TERMOS, consentimentoDoPerfil,
  ehIdDeGravacao, ehNomeDeArquivoDoBackup, type ArquivoParaRestaurar, type GravacaoGuardada,
} from './vozGuardada';

/** WAV PCM 16 bits mono; `semente` muda o conteúdo para dois áudios nunca serem iguais por acaso. */
function wav(semente = 1, n = 800, taxa = 16000): ArrayBuffer {
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const txt = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((i + semente) / 7) * 6000 * semente), true);
  return buf;
}

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';
const TERMO = 'Concordo em gravar a minha própria voz nesta tela, guardada só neste computador.';
const termoDe = (perfilId: string | null, aceitoEm = '2026-10-19T09:00:00Z') => ({ texto: TERMO, aceitoEm, perfilId });
const pedido = (o: Partial<{ id: string; texto: string; wav: ArrayBuffer; perfilId: string | null }> = {}) => ({
  id: ID1, texto: 'Estou com dor.', wav: wav(), duracaoS: 1.2, qualidade: 'boa', perfilId: 'p1', ...o,
});

let base = '';
let pastaA = '';
let pastaB = '';
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'irisflow-bkvoz-'));
  pastaA = path.join(base, 'a', 'voz', 'guardadas');
  pastaB = path.join(base, 'b', 'voz', 'guardadas');
  userData = path.join(base, 'a');
  handlers.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(base, { recursive: true, force: true });
});

/** Tudo o que a lista do backup oferece, lido pelo mesmo caminho que o app usa. */
function levar(de: ArmazemDeGravacoes): ArquivoParaRestaurar[] {
  const lista = de.arquivosParaBackup();
  if (!lista.ok) throw new Error(lista.erro);
  return lista.arquivos.map((a) => {
    const lido = de.lerArquivoDoBackup(a.nome);
    if (!lido.ok) throw new Error(lido.erro);
    return { nome: a.nome, bytes: lido.bytes };
  });
}

/** Os nomes que estão numa pasta (vazia se a pasta nem existe) — para provar que uma recusa não escreveu nada. */
const listaDaPasta = (p: string) => (fs.existsSync(p) ? fs.readdirSync(p).sort() : []);

/** O computador de origem: dois pacientes, três gravações, um termo para cada. */
function origemComDoisPacientes(): ArmazemDeGravacoes {
  const a = criarArmazemDeGravacoes(pastaA);
  a.consentir(termoDe('p1', '2026-10-19T09:00:00Z'));
  a.consentir(termoDe('p2', '2026-10-20T11:00:00Z'));
  expect(a.salvar(pedido({ id: ID1, texto: 'Estou com dor.', wav: wav(1), perfilId: 'p1' })).ok).toBe(true);
  expect(a.salvar(pedido({ id: ID2, texto: 'Eu te amo.', wav: wav(2), perfilId: 'p1' })).ok).toBe(true);
  expect(a.salvar(pedido({ id: ID3, texto: 'Boa noite.', wav: wav(3), perfilId: 'p2' })).ok).toBe(true);
  return a;
}

describe('o que sai: a lista e a leitura por nome', () => {
  it('oferece o índice, o termo e cada áudio — e só isso (nada de .bak, .tmp nem arquivo solto)', () => {
    const a = origemComDoisPacientes();
    // Restos que existem de verdade numa pasta usada: cópia do arquivo seguro,
    // temporário de uma gravação interrompida, e um arquivo qualquer.
    fs.writeFileSync(path.join(pastaA, 'indice.json.bak'), '{}');
    fs.writeFileSync(path.join(pastaA, `${ID1}.wav.tmp`), 'meio');
    fs.writeFileSync(path.join(pastaA, 'anotacao.txt'), 'não é da voz');

    const lista = a.arquivosParaBackup();
    expect(lista.ok).toBe(true);
    const nomes = lista.ok ? lista.arquivos.map((x) => x.nome).sort() : [];
    expect(nomes).toEqual([NOME_DOS_TERMOS, `${ID1}.wav`, `${ID2}.wav`, `${ID3}.wav`, NOME_DO_INDICE].sort());
  });

  it('o tamanho da lista é o tamanho real do que a leitura devolve (a conta do limite não mente)', () => {
    const a = origemComDoisPacientes();
    const lista = a.arquivosParaBackup();
    expect(lista.ok).toBe(true);
    for (const item of lista.ok ? lista.arquivos : []) {
      const lido = a.lerArquivoDoBackup(item.nome);
      expect(lido.ok && lido.bytes.byteLength, item.nome).toBe(item.bytes);
    }
  });

  it('o áudio sai byte a byte igual ao que foi gravado', () => {
    const a = origemComDoisPacientes();
    const lido = a.lerArquivoDoBackup(`${ID2}.wav`);
    expect(lido.ok && Buffer.from(lido.bytes).equals(Buffer.from(wav(2)))).toBe(true);
  });

  it('gravação cujo áudio sumiu não é oferecida (nem no índice que sai)', () => {
    const a = origemComDoisPacientes();
    fs.rmSync(path.join(pastaA, `${ID3}.wav`));
    const lista = a.arquivosParaBackup();
    expect(lista.ok && lista.arquivos.map((x) => x.nome)).not.toContain(`${ID3}.wav`);
    const indice = a.lerArquivoDoBackup(NOME_DO_INDICE);
    const ids = indice.ok ? (JSON.parse(Buffer.from(indice.bytes).toString('utf8')).gravacoes as GravacaoGuardada[]).map((g) => g.id).sort() : [];
    expect(ids).toEqual([ID1, ID2]);
  });

  it('sem gravação nem termo, não há o que oferecer', () => {
    const a = criarArmazemDeGravacoes(pastaA);
    expect(a.arquivosParaBackup()).toEqual({ ok: true, arquivos: [] });
  });

  it('índice ilegível agora (arquivo preso): não entrega backup pela metade', () => {
    const a = origemComDoisPacientes();
    const lerDeVerdade = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation(((arquivo: fs.PathOrFileDescriptor, ...resto: unknown[]) => {
      if (String(arquivo).endsWith('indice.json')) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return (lerDeVerdade as (...x: unknown[]) => unknown)(arquivo, ...resto);
    }) as typeof fs.readFileSync);
    const r = a.arquivosParaBackup();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/Tente de novo/);
  });

  it('só os nomes do backup são lidos: caminho, nome estranho e id em maiúsculas são recusados', () => {
    const a = origemComDoisPacientes();
    // O id em maiúsculas só vale como caso se tiver letras (o `ID1` é só dígitos).
    for (const nome of ['../indice.json', '..\\consentimento.json', 'C:\\x.wav', 'indice.json.bak', 'anotacao.txt', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA.wav', `${ID1}.wav.tmp`, '', 42, null]) {
      const r = a.lerArquivoDoBackup(nome as never);
      expect(r.ok, String(nome)).toBe(false);
    }
  });

  it('ehNomeDeArquivoDoBackup aceita exatamente o índice, o termo e <uuid>.wav', () => {
    expect([NOME_DO_INDICE, NOME_DOS_TERMOS, `${ID1}.wav`].every(ehNomeDeArquivoDoBackup)).toBe(true);
    expect(['', 'x.wav', '../x', `${ID1}.WAV`, `${ID1}.wav/`, `/${ID1}.wav`, 'referencia.wav', 'estado.json'].some(ehNomeDeArquivoDoBackup)).toBe(false);
  });
});

describe('o que entra: restauração soma, não apaga', () => {
  it('ida e volta: o computador novo fica com as mesmas gravações, o mesmo áudio e os mesmos termos', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    const r = await b.restaurarDoBackup(levar(a));
    expect(r).toEqual({ ok: true, gravacoes: 3, termos: 2, ignoradas: 0, copiadas: 0 });

    const la = a.listar();
    const lb = b.listar();
    expect(la.ok && lb.ok).toBe(true);
    if (!la.ok || !lb.ok) return;
    const resumo = (g: GravacaoGuardada) => [g.id, g.texto, g.perfilId, g.qualidade, g.duracaoS, g.criadaEm, g.bytes];
    expect(lb.gravacoes.map(resumo).sort()).toEqual(la.gravacoes.map(resumo).sort());
    for (const id of [ID1, ID2, ID3]) {
      const x = a.ler(id);
      const y = b.ler(id);
      expect(x.ok && y.ok && Buffer.from(x.wav).equals(Buffer.from((y as { wav: ArrayBuffer }).wav)), id).toBe(true);
    }
    expect(lb.consentimentos.map((c) => [c.perfilId, c.aceitoEm, c.texto]).sort())
      .toEqual(la.consentimentos.map((c) => [c.perfilId, c.aceitoEm, c.texto]).sort());
  });

  it('o termo restaurado vale: o paciente grava no computador novo sem aceitar de novo, e o de outro paciente continua exigindo o próprio', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    await b.restaurarDoBackup(levar(a));
    expect(b.salvar(pedido({ id: '44444444-4444-4444-8444-444444444444', perfilId: 'p1' })).ok).toBe(true);
    expect(b.salvar(pedido({ id: '55555555-5555-4555-8555-555555555555', perfilId: 'p3' })).ok).toBe(false);
  });

  it('o hash do termo é refeito a partir do texto: um hash vindo do arquivo não é confiado', async () => {
    const a = origemComDoisPacientes();
    const arquivos = levar(a).map((f) => {
      if (f.nome !== NOME_DOS_TERMOS) return f;
      const obj = JSON.parse(Buffer.from(f.bytes as ArrayBuffer).toString('utf8'));
      for (const c of obj.consentimentos) c.hash = 'f'.repeat(64);
      return { nome: f.nome, bytes: Buffer.from(JSON.stringify(obj)) };
    });
    const b = criarArmazemDeGravacoes(pastaB);
    expect((await b.restaurarDoBackup(arquivos)).ok).toBe(true);
    const gravado = JSON.parse(fs.readFileSync(path.join(pastaB, 'consentimento.json'), 'utf8'));
    for (const c of gravado.consentimentos) expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(gravado.consentimentos.every((c: { hash: string }) => c.hash !== 'f'.repeat(64))).toBe(true);
  });

  it('NUNCA apaga o que já está no computador: gravação própria e termo de outro paciente sobrevivem', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    b.consentir(termoDe('p9', '2026-10-21T08:00:00Z'));
    const IDPROPRIO = '99999999-9999-4999-8999-999999999999';
    b.salvar(pedido({ id: IDPROPRIO, texto: 'Gravada só aqui.', perfilId: 'p9', wav: wav(9) }));

    expect((await b.restaurarDoBackup(levar(a))).ok).toBe(true);

    const l = b.listar();
    expect(l.ok && l.gravacoes.map((g) => g.id).sort()).toEqual([ID1, ID2, ID3, IDPROPRIO].sort());
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'p9')?.aceitoEm).toBe('2026-10-21T08:00:00Z');
    const propria = b.ler(IDPROPRIO);
    expect(propria.ok && Buffer.from(propria.wav).equals(Buffer.from(wav(9)))).toBe(true);
  });

  it('a mesma gravação (mesmo id) com OUTRO áudio NÃO é sobrescrita: a de cá fica, a do backup entra com id novo; o termo do mesmo paciente fica o mais recente', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    // Local: o termo de p1 é MAIS NOVO que o do backup; a gravação ID1 é outra (outro áudio, outra frase).
    b.consentir(termoDe('p1', '2026-10-25T10:00:00Z'));
    b.salvar(pedido({ id: ID1, texto: 'Versão local.', wav: wav(7), perfilId: 'p1' }));

    expect((await b.restaurarDoBackup(levar(a))).ok).toBe(true);

    const l = b.listar();
    // A de cá continua sendo a ID1, com a frase e o áudio de cá — byte a byte.
    expect(l.ok && l.gravacoes.find((g) => g.id === ID1)?.texto).toBe('Versão local.');
    expect(Buffer.from(fs.readFileSync(path.join(pastaB, `${ID1}.wav`))).equals(Buffer.from(wav(7)))).toBe(true);
    // A do backup entrou, com outro id.
    const copia = l.ok ? l.gravacoes.find((g) => g.texto === 'Estou com dor.') : undefined;
    expect(copia).toBeDefined();
    expect(copia?.id).not.toBe(ID1);
    expect(Buffer.from(fs.readFileSync(path.join(pastaB, `${copia?.id}.wav`))).equals(Buffer.from(wav(1)))).toBe(true);
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'p1')?.aceitoEm).toBe('2026-10-25T10:00:00Z');
    // E o de p2, que só existia no backup, entrou.
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'p2')?.aceitoEm).toBe('2026-10-20T11:00:00Z');
  });

  it('restaurar duas vezes não duplica nada', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    await b.restaurarDoBackup(levar(a));
    await b.restaurarDoBackup(levar(a));
    const l = b.listar();
    expect(l.ok && l.gravacoes).toHaveLength(3);
    expect(l.ok && l.consentimentos).toHaveLength(2);
  });

  it('só de um paciente: entram as gravações e o termo dele — as do outro paciente ficam de fora', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    const r = await b.restaurarDoBackup(levar(a), { perfil: 'p2' });
    expect(r).toEqual({ ok: true, gravacoes: 1, termos: 1, ignoradas: 0, copiadas: 0 });
    const l = b.listar();
    expect(l.ok && l.gravacoes.map((g) => g.id)).toEqual([ID3]);
    expect(l.ok && l.consentimentos.map((c) => c.perfilId)).toEqual(['p2']);
    expect(fs.existsSync(path.join(pastaB, `${ID1}.wav`))).toBe(false);
    expect(fs.existsSync(path.join(pastaB, `${ID2}.wav`))).toBe(false);
  });

  /** Restaura o pacote de `a` depois de `trocar` mexer nos áudios — e confere que SÓ a gravação ID2 ficou de fora. */
  async function esperaSoAIdDoisFora(trocar: (arquivos: ArquivoParaRestaurar[]) => unknown[]) {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    const r = await b.restaurarDoBackup(trocar(levar(a)));
    expect(r).toEqual({ ok: true, gravacoes: 2, termos: 2, ignoradas: 1, copiadas: 0 });
    const l = b.listar();
    expect(l.ok && l.gravacoes.map((g) => g.id).sort()).toEqual([ID1, ID3].sort());
    expect(fs.existsSync(path.join(pastaB, `${ID2}.wav`))).toBe(false);
  }

  it('áudio que não é WAV não entra: é contado, e as outras gravações entram', async () => {
    await esperaSoAIdDoisFora((arquivos) => arquivos.map((f) => (f.nome === `${ID2}.wav`
      ? { nome: f.nome, bytes: new TextEncoder().encode('isto não é áudio, só um texto comprido o bastante para ter o tamanho de um cabeçalho') }
      : f)));
  });

  it('áudio que falta no pacote não entra: é contado, e as outras gravações entram', async () => {
    await esperaSoAIdDoisFora((arquivos) => arquivos.filter((f) => f.nome !== `${ID2}.wav`));
  });

  it('áudio maior que o limite de UMA gravação não entra, mesmo sendo WAV e cabendo no total do backup', async () => {
    const grande = new Uint8Array(wav(1, LIMITES_DA_VOZ_GUARDADA.bytesMax / 2 + 100)); // 2 bytes por amostra: passa de 8 MiB
    expect(grande.byteLength).toBeGreaterThan(LIMITES_DA_VOZ_GUARDADA.bytesMax);
    expect(grande.byteLength).toBeLessThan(LIMITES_DO_BACKUP_DA_VOZ.bytesMax);
    await esperaSoAIdDoisFora((arquivos) => arquivos.map((f) => (f.nome === `${ID2}.wav` ? { nome: f.nome, bytes: grande } : f)));
  });

  /** O pacote de `a` com o índice trocado por quem o `mexer` devolver — um arquivo de backup adulterado ou estragado. */
  function comIndiceMexido(a: ArmazemDeGravacoes, mexer: (indice: { gravacoes: Record<string, unknown>[] }) => void): ArquivoParaRestaurar[] {
    return levar(a).map((f) => {
      if (f.nome !== NOME_DO_INDICE) return f;
      const obj = JSON.parse(Buffer.from(f.bytes as ArrayBuffer).toString('utf8'));
      mexer(obj);
      return { nome: f.nome, bytes: Buffer.from(JSON.stringify(obj)) };
    });
  }

  it('o índice do backup não manda no resto: o tamanho vale o do áudio de verdade e campos soltos não entram', async () => {
    const a = origemComDoisPacientes();
    const arquivos = comIndiceMexido(a, (indice) => {
      indice.gravacoes[0].bytes = 1;
      indice.gravacoes[0].extra = 'lixo';
    });
    const b = criarArmazemDeGravacoes(pastaB);
    expect((await b.restaurarDoBackup(arquivos)).ok).toBe(true);
    const gravado = JSON.parse(fs.readFileSync(path.join(pastaB, 'indice.json'), 'utf8'));
    const primeira = gravado.gravacoes.find((g: GravacaoGuardada) => g.id === ID1);
    expect(primeira.bytes).toBe(wav(1).byteLength);
    expect(primeira.extra).toBeUndefined();
  });

  it('gravação com dono ilegível (perfilId que não é texto nem vazio) não entra — e não vira "sem perfil", que aparece para todos', async () => {
    const a = origemComDoisPacientes();
    const arquivos = comIndiceMexido(a, (indice) => { indice.gravacoes[0].perfilId = 12345; });
    const b = criarArmazemDeGravacoes(pastaB);
    const r = await b.restaurarDoBackup(arquivos);
    expect(r).toEqual({ ok: true, gravacoes: 2, termos: 2, ignoradas: 1, copiadas: 0 });
    const l = b.listar();
    expect(l.ok && l.gravacoes.map((g) => g.id).sort()).toEqual([ID2, ID3].sort());
    expect(fs.existsSync(path.join(pastaB, `${ID1}.wav`))).toBe(false);
  });

  it('gravação com a frase em branco não entra (não há o que mostrar nem o que tocar): é contada, e as outras entram', async () => {
    const a = origemComDoisPacientes();
    const arquivos = comIndiceMexido(a, (indice) => { indice.gravacoes[0].texto = ' \n\t  '; });
    const b = criarArmazemDeGravacoes(pastaB);
    expect(await b.restaurarDoBackup(arquivos)).toEqual({ ok: true, gravacoes: 2, termos: 2, ignoradas: 1, copiadas: 0 });
    const l = b.listar();
    expect(l.ok && l.gravacoes.map((g) => g.id).sort()).toEqual([ID2, ID3].sort());
    expect(fs.existsSync(path.join(pastaB, `${ID1}.wav`))).toBe(false);
  });

  it('a duração do arquivo de backup volta para dentro do que uma gravação aceita: de 0 a 600 s, com duas casas', async () => {
    const a = origemComDoisPacientes();
    const duracoes = [9999, -5, 1.23456]; // uma de cada gravação, na ordem do índice: ID1, ID2, ID3
    const arquivos = comIndiceMexido(a, (indice) => { duracoes.forEach((d, i) => { indice.gravacoes[i].duracaoS = d; }); });
    const b = criarArmazemDeGravacoes(pastaB);
    expect((await b.restaurarDoBackup(arquivos)).ok).toBe(true);
    const l = b.listar();
    const duracaoDe = (id: string) => (l.ok ? l.gravacoes.find((g) => g.id === id)?.duracaoS : undefined);
    expect([ID1, ID2, ID3].map(duracaoDe)).toEqual([600, 0, 1.23]);
  });

  it('termo do backup com texto curto demais (um "ok" no lugar do termo) não vale: o paciente aceita de novo', async () => {
    const a = origemComDoisPacientes();
    const arquivos = levar(a).map((f) => {
      if (f.nome !== NOME_DOS_TERMOS) return f;
      const obj = JSON.parse(Buffer.from(f.bytes as ArrayBuffer).toString('utf8'));
      obj.consentimentos.find((c: { perfilId: string }) => c.perfilId === 'p2').texto = 'ok';
      return { nome: f.nome, bytes: Buffer.from(JSON.stringify(obj)) };
    });
    const b = criarArmazemDeGravacoes(pastaB);
    const r = await b.restaurarDoBackup(arquivos);
    expect(r.ok && r.termos).toBe(1);
    const l = b.listar();
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'p1')).not.toBeNull();
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'p2')).toBeNull();
  });

  it('o recorte por paciente exige um paciente de verdade: valor que não é texto é recusado, não vira "todos"', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    for (const perfil of [123, '', null, {}]) {
      const r = await b.restaurarDoBackup(levar(a), { perfil });
      expect(r.ok, String(perfil)).toBe(false);
    }
    expect(listaDaPasta(pastaB)).toEqual([]);
  });

  it('só termos, sem nenhuma gravação: o termo sai e volta, e o computador novo já sabe quem aceitou', async () => {
    const a = criarArmazemDeGravacoes(pastaA);
    a.consentir(termoDe('p1'));
    const lista = a.arquivosParaBackup();
    expect(lista.ok && lista.arquivos.map((x) => x.nome)).toEqual([NOME_DOS_TERMOS]);
    const b = criarArmazemDeGravacoes(pastaB);
    expect(await b.restaurarDoBackup(levar(a))).toEqual({ ok: true, gravacoes: 0, termos: 1, ignoradas: 0, copiadas: 0 });
    const l = b.listar();
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'p1')?.aceitoEm).toBe('2026-10-19T09:00:00Z');
    expect(fs.existsSync(path.join(pastaB, 'indice.json'))).toBe(false);
  });

  it('o termo no formato antigo (um registro solto) sai no formato novo, com o mesmo texto e o mesmo perfil', () => {
    fs.mkdirSync(pastaA, { recursive: true });
    fs.writeFileSync(path.join(pastaA, 'consentimento.json'), JSON.stringify({ texto: TERMO, hash: 'x', aceitoEm: '2026-09-01T10:00:00Z', perfilId: 'p7' }));
    const a = criarArmazemDeGravacoes(pastaA);
    const lido = a.lerArquivoDoBackup(NOME_DOS_TERMOS);
    const obj = lido.ok ? JSON.parse(Buffer.from(lido.bytes).toString('utf8')) : null;
    expect(obj).toMatchObject({ versao: 2, consentimentos: [{ texto: TERMO, aceitoEm: '2026-09-01T10:00:00Z', perfilId: 'p7' }] });
  });
});

describe('o que entra: recusas que não escrevem nada', () => {
  it('nome com caminho, duplicado ou fora do formato: recusa o pedido inteiro, sem tocar na pasta', async () => {
    const a = origemComDoisPacientes();
    const bons = levar(a);
    const b = criarArmazemDeGravacoes(pastaB);
    const ruins: Array<[string, unknown]> = [
      ['caminho', [...bons, { nome: '../../referencia.wav', bytes: new Uint8Array(wav()) }]],
      ['duplicado', [...bons, bons[0]]],
      ['arquivo solto', [...bons, { nome: 'estado.json', bytes: new Uint8Array(4) }]],
      ['sem bytes', [...bons, { nome: `${'4'.repeat(8)}-4444-4444-8444-444444444444.wav` }]],
      ['não é lista', { nome: NOME_DO_INDICE }],
    ];
    for (const [rotulo, pedidoRuim] of ruins) {
      const r = await b.restaurarDoBackup(pedidoRuim);
      expect(r.ok, rotulo).toBe(false);
      expect(listaDaPasta(pastaB), rotulo).toEqual([]);
    }
  });

  it('mais do que o limite de bytes: recusa antes de gravar qualquer coisa', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    const enorme = { nome: `${ID3}.wav`, bytes: new Uint8Array(LIMITES_DO_BACKUP_DA_VOZ.bytesMax + 1) };
    const r = await b.restaurarDoBackup([...levar(a).filter((f) => f.nome !== enorme.nome), enorme]);
    expect(r.ok).toBe(false);
    expect(listaDaPasta(pastaB)).toEqual([]);
  });

  it('o pedido tem um teto de arquivos: o máximo que o app oferece (300 gravações, o índice e o termo) entra; um arquivo a mais recusa o pedido inteiro', async () => {
    const id = (i: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`;
    const audio = new Uint8Array(wav(1, 1));
    const gravacoes = Array.from({ length: LIMITES_DA_VOZ_GUARDADA.gravacoesMax }, (_, i) => ({
      id: id(i), texto: `frase ${i}`, criadaEm: '2026-10-01T00:00:00Z', duracaoS: 1, qualidade: 'boa', perfilId: 'p1', bytes: audio.byteLength,
    }));
    const cheio: ArquivoParaRestaurar[] = [
      { nome: NOME_DO_INDICE, bytes: Buffer.from(JSON.stringify({ versao: 1, gravacoes })) },
      { nome: NOME_DOS_TERMOS, bytes: Buffer.from(JSON.stringify({ versao: 2, consentimentos: [{ texto: TERMO, aceitoEm: '2026-10-19T09:00:00Z', perfilId: 'p1' }] })) },
      ...gravacoes.map((g) => ({ nome: `${g.id}.wav`, bytes: audio })),
    ];
    expect(cheio).toHaveLength(LIMITES_DA_VOZ_GUARDADA.gravacoesMax + 2);
    const b = criarArmazemDeGravacoes(pastaB);

    // Um áudio a mais, que nem está no índice: só o tamanho do pedido o denuncia.
    const r = await b.restaurarDoBackup([...cheio, { nome: `${id(LIMITES_DA_VOZ_GUARDADA.gravacoesMax)}.wav`, bytes: audio }]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/formato esperado/);
    expect(listaDaPasta(pastaB)).toEqual([]);

    expect(await b.restaurarDoBackup(cheio)).toEqual({ ok: true, gravacoes: LIMITES_DA_VOZ_GUARDADA.gravacoesMax, termos: 1, ignoradas: 0, copiadas: 0 });
    const l = b.listar();
    expect(l.ok && l.gravacoes).toHaveLength(LIMITES_DA_VOZ_GUARDADA.gravacoesMax);
  }, 30_000); // 300 áudios de verdade no disco (cada um com fsync): ~2 s numa máquina folgada, bem mais com a suíte inteira rodando

  it('passaria do máximo de gravações guardadas: recusa e avisa, sem gravar nada', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    fs.mkdirSync(pastaB, { recursive: true });
    const cheias = Array.from({ length: 299 }, (_, i) => ({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`, texto: `frase ${i}`, criadaEm: '2026-10-01T00:00:00Z',
      duracaoS: 1, qualidade: 'boa', perfilId: 'p1', bytes: 10,
    }));
    fs.writeFileSync(path.join(pastaB, 'indice.json'), JSON.stringify({ versao: 1, gravacoes: cheias }));
    const antes = listaDaPasta(pastaB);

    const r = await b.restaurarDoBackup(levar(a));

    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/300/);
    expect(listaDaPasta(pastaB)).toEqual(antes);
    const indice = JSON.parse(fs.readFileSync(path.join(pastaB, 'indice.json'), 'utf8'));
    expect(indice.gravacoes).toHaveLength(299);
  });

  it('índice local ilegível agora (arquivo preso): não grava por cima do que não leu', async () => {
    const pacote = levar(origemComDoisPacientes()); // lido ANTES de o arquivo "prender"
    const b = criarArmazemDeGravacoes(pastaB);
    b.consentir(termoDe('p9'));
    b.salvar(pedido({ id: ID1, texto: 'Local.', perfilId: 'p9', wav: wav(5) }));
    const lerDeVerdade = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation(((arquivo: fs.PathOrFileDescriptor, ...resto: unknown[]) => {
      if (String(arquivo).endsWith('indice.json')) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return (lerDeVerdade as (...x: unknown[]) => unknown)(arquivo, ...resto);
    }) as typeof fs.readFileSync);

    const r = await b.restaurarDoBackup(pacote);
    vi.restoreAllMocks();

    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/Tente de novo/);
    expect(fs.existsSync(path.join(pastaB, `${ID2}.wav`))).toBe(false);
    const preservado = JSON.parse(fs.readFileSync(path.join(pastaB, 'indice.json'), 'utf8'));
    expect(preservado.gravacoes.map((g: GravacaoGuardada) => g.texto)).toEqual(['Local.']);
  });

  it('termos locais ilegíveis agora (arquivo preso): não grava por cima do que não leu, e nada do backup entra', async () => {
    const pacote = levar(origemComDoisPacientes()); // lido ANTES de o arquivo "prender"
    const b = criarArmazemDeGravacoes(pastaB);
    b.consentir(termoDe('p9'));
    const antes = listaDaPasta(pastaB);
    const termosAntes = fs.readFileSync(path.join(pastaB, NOME_DOS_TERMOS), 'utf8');
    const lerDeVerdade = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation(((arquivo: fs.PathOrFileDescriptor, ...resto: unknown[]) => {
      if (String(arquivo).endsWith(NOME_DOS_TERMOS)) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return (lerDeVerdade as (...x: unknown[]) => unknown)(arquivo, ...resto);
    }) as typeof fs.readFileSync);

    const r = await b.restaurarDoBackup(pacote);
    vi.restoreAllMocks();

    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/Tente de novo/);
    expect(listaDaPasta(pastaB)).toEqual(antes); // nem áudio, nem índice, nem termo novo
    expect(fs.readFileSync(path.join(pastaB, NOME_DOS_TERMOS), 'utf8')).toBe(termosAntes); // o termo do p9 segue como estava
  });

  it('falha no meio dos áudios com uma gravação que JÁ estava aqui: desfaz só o que veio novo — a que já estava continua, com os MESMOS bytes', async () => {
    const pacote = levar(origemComDoisPacientes()); // ID1, ID2 e ID3, nessa ordem
    const b = criarArmazemDeGravacoes(pastaB);
    b.consentir(termoDe('p1'));
    expect(b.salvar(pedido({ id: ID1, texto: 'Local.', wav: wav(5), perfilId: 'p1' })).ok).toBe(true);
    const termosAntes = fs.readFileSync(path.join(pastaB, NOME_DOS_TERMOS));
    const renomearDeVerdade = fs.promises.rename;
    vi.spyOn(fs.promises, 'rename').mockImplementation((async (de: fs.PathLike, para: fs.PathLike) => {
      if (String(para).endsWith(`${ID3}.wav`)) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      return renomearDeVerdade(de, para);
    }) as typeof fs.promises.rename);

    const r = await b.restaurarDoBackup(pacote);
    vi.restoreAllMocks();

    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/Não foi possível guardar as gravações do backup/);
    // O ID2 e a cópia do ID1 já tinham sido escritos quando o ID3 falhou: saem. O ID1 de cá fica, no disco e no índice.
    expect(listaDaPasta(pastaB).filter((n) => n.includes('.wav'))).toEqual([`${ID1}.wav`]);
    expect(fs.readFileSync(path.join(pastaB, `${ID1}.wav`)).equals(Buffer.from(wav(5)))).toBe(true);
    const l = b.listar();
    expect(l.ok && l.gravacoes.map((g) => [g.id, g.texto])).toEqual([[ID1, 'Local.']]);
    // Os termos só mudam depois dos áudios: uma falha neles não os toca.
    expect(fs.readFileSync(path.join(pastaB, NOME_DOS_TERMOS)).equals(termosAntes)).toBe(true);
  });

  it('falha no meio dos áudios (disco cheio, antivírus): desfaz o que já gravou — nada de áudio órfão nem de índice pela metade', async () => {
    const pacote = levar(origemComDoisPacientes());
    const b = criarArmazemDeGravacoes(pastaB);
    const renomearDeVerdade = fs.promises.rename;
    let audios = 0;
    vi.spyOn(fs.promises, 'rename').mockImplementation((async (de: fs.PathLike, para: fs.PathLike) => {
      if (String(para).endsWith('.wav') && ++audios === 2) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      return renomearDeVerdade(de, para);
    }) as typeof fs.promises.rename);

    const r = await b.restaurarDoBackup(pacote);
    vi.restoreAllMocks();

    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/Não foi possível guardar as gravações do backup/);
    expect(listaDaPasta(pastaB).filter((n) => n.includes('.wav'))).toEqual([]); // nem áudio inteiro, nem .tmp
    expect(fs.existsSync(path.join(pastaB, 'indice.json'))).toBe(false);
  });

  it('JSON do índice quebrado no pacote: nada entra (um índice torto não vira "sem gravações" em silêncio)', async () => {
    const a = origemComDoisPacientes();
    const quebrado = levar(a).map((f) => (f.nome === NOME_DO_INDICE ? { nome: f.nome, bytes: Buffer.from('{"gravacoes": [') } : f));
    const b = criarArmazemDeGravacoes(pastaB);
    const r = await b.restaurarDoBackup(quebrado);
    expect(r.ok).toBe(false);
    expect(listaDaPasta(pastaB)).toEqual([]);
  });

  it('índice ou termos do backup que são JSON mas não têm a forma esperada: recusa com aviso, sem gravar nada — não um erro de programa', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    const com = (nome: string, texto: string) => levar(a).map((f) => (f.nome === nome ? { nome, bytes: Buffer.from(texto) } : f));
    const casos = [
      { nome: NOME_DO_INDICE, aviso: /lista de gravações.*ilegível/ },
      { nome: NOME_DOS_TERMOS, aviso: /termos aceitos.*ilegíveis/ },
    ];
    for (const { nome, aviso } of casos) {
      for (const texto of ['{"versao":1}', '{"versao":2}', '{"gravacoes":"nao-e-lista"}', '[]', '"x"', 'null']) {
        const rotulo = `${nome} = ${texto}`;
        const r = await b.restaurarDoBackup(com(nome, texto));
        expect(r.ok, rotulo).toBe(false);
        expect(!r.ok && r.erro, rotulo).toMatch(aviso);
        expect(listaDaPasta(pastaB), rotulo).toEqual([]);
      }
    }
  });
});

describe('o que entra: NUNCA sobrescreve a voz que já está aqui (rodada de correção 1, 21/10/2026)', () => {
  const caminhoDoWav = (id: string) => path.join(pastaB, `${id}.wav`);
  const bytesDoWavAqui = (id: string) => fs.readFileSync(caminhoDoWav(id));
  const mesmosBytes = (x: Buffer, y: ArrayBuffer) => x.equals(Buffer.from(y));
  const IDNOVO = '77777777-7777-4777-8777-777777777777';
  const IDNOVO2 = '88888888-8888-4888-8888-888888888888';
  const IDORFAO = '66666666-6666-4666-8666-666666666666';
  const umaVez = () => new Promise<void>((resolve) => setImmediate(resolve));

  /** Quantas vezes um áudio foi renomeado para o lugar definitivo (uma restauração sem escrita não renomeia nenhum). */
  function contarRenomeacoesDeAudio(): { nomes: () => string[] } {
    const renomearDeVerdade = fs.promises.rename;
    const nomes: string[] = [];
    vi.spyOn(fs.promises, 'rename').mockImplementation((async (de: fs.PathLike, para: fs.PathLike) => {
      if (String(para).endsWith('.wav')) nomes.push(path.basename(String(para)));
      return renomearDeVerdade(de, para);
    }) as typeof fs.promises.rename);
    return { nomes: () => nomes };
  }

  /** O computador de cá já tem a ID1 — com OUTRO áudio (do mesmo tamanho: só os bytes denunciam) e outra frase. */
  function destinoComAID1Diferente(): ArmazemDeGravacoes {
    const b = criarArmazemDeGravacoes(pastaB);
    b.consentir(termoDe('p1'));
    expect(b.salvar(pedido({ id: ID1, texto: 'Versão local.', wav: wav(7), perfilId: 'p1' })).ok).toBe(true);
    return b;
  }

  it('mesmo id com OUTRO áudio: a gravação de cá fica byte a byte, com a própria linha; a do backup entra com id novo e o áudio dela', async () => {
    const a = origemComDoisPacientes();
    const b = destinoComAID1Diferente();
    const lAntes = b.listar();
    const linhaLocalAntes = lAntes.ok ? lAntes.gravacoes.find((g) => g.id === ID1) : undefined;
    expect(linhaLocalAntes).toBeDefined();

    const r = await b.restaurarDoBackup(levar(a));

    expect(r).toEqual({ ok: true, gravacoes: 3, termos: 2, ignoradas: 0, copiadas: 1 });
    const l = b.listar();
    if (!l.ok) throw new Error(l.erro);
    expect(l.gravacoes).toHaveLength(4);
    // A de cá: mesma linha (frase, data, tamanho) e os mesmos bytes no disco.
    expect(l.gravacoes.find((g) => g.id === ID1)).toEqual(linhaLocalAntes);
    expect(mesmosBytes(bytesDoWavAqui(ID1), wav(7))).toBe(true);
    // A do backup: uma cópia, com id novo, a frase e o áudio do backup.
    const copias = l.gravacoes.filter((g) => g.texto === 'Estou com dor.');
    expect(copias).toHaveLength(1);
    expect(ehIdDeGravacao(copias[0].id)).toBe(true);
    expect([ID1, ID2, ID3]).not.toContain(copias[0].id);
    expect(copias[0]).toMatchObject({ perfilId: 'p1', bytes: wav(1).byteLength });
    expect(mesmosBytes(bytesDoWavAqui(copias[0].id), wav(1))).toBe(true);
    const lida = b.ler(copias[0].id);
    expect(lida.ok && mesmosBytes(Buffer.from(lida.wav), wav(1))).toBe(true);
  });

  it('mesmo id com um áudio de OUTRO tamanho (mais curto ou mais longo): também é outra gravação — a de cá fica e a do backup entra como cópia', async () => {
    const a = origemComDoisPacientes(); // ID1 do backup: 800 amostras
    const b = criarArmazemDeGravacoes(pastaB);
    b.consentir(termoDe('p1'));
    expect(b.salvar(pedido({ id: ID1, texto: 'Versão local, mais curta.', wav: wav(1, 400), perfilId: 'p1' })).ok).toBe(true);

    const r = await b.restaurarDoBackup(levar(a));

    expect(r).toEqual({ ok: true, gravacoes: 3, termos: 2, ignoradas: 0, copiadas: 1 });
    expect(mesmosBytes(bytesDoWavAqui(ID1), wav(1, 400))).toBe(true);
    const l = b.listar();
    const copia = l.ok ? l.gravacoes.find((g) => g.texto === 'Estou com dor.') : undefined;
    expect(copia && mesmosBytes(bytesDoWavAqui(copia.id), wav(1))).toBe(true);
  });

  it('a cópia que já está aqui só é reconhecida se a frase E o paciente forem os mesmos: igual no áudio mas de outra frase ou de outro paciente, não vale', async () => {
    for (const outraLinha of [{ texto: 'Outra frase.', perfilId: 'p1' }, { texto: 'Estou com dor.', perfilId: 'p2' }]) {
      fs.rmSync(path.join(base, 'b'), { recursive: true, force: true });
      const a = origemComDoisPacientes();
      const b = destinoComAID1Diferente();
      // Aqui já existe, com OUTRO id, um áudio idêntico ao da ID1 do backup — mas de outra frase, ou de outro paciente.
      b.consentir(termoDe(outraLinha.perfilId));
      expect(b.salvar(pedido({ id: IDNOVO, texto: outraLinha.texto, wav: wav(1), perfilId: outraLinha.perfilId })).ok).toBe(true);

      const r = await b.restaurarDoBackup(levar(a));

      expect(r, JSON.stringify(outraLinha)).toEqual({ ok: true, gravacoes: 3, termos: 2, ignoradas: 0, copiadas: 1 });
    }
  });

  it('cada áudio é forçado ao disco (fsync) antes de ganhar o nome definitivo', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    const abrirDeVerdade = fs.promises.open;
    let sincronizados = 0;
    vi.spyOn(fs.promises, 'open').mockImplementation((async (...args: Parameters<typeof fs.promises.open>) => {
      const arquivo = await abrirDeVerdade(...args);
      const sincronizar = arquivo.sync.bind(arquivo);
      arquivo.sync = async () => { sincronizados++; return sincronizar(); };
      return arquivo;
    }) as typeof fs.promises.open);

    expect((await b.restaurarDoBackup(levar(a))).ok).toBe(true);
    vi.restoreAllMocks();

    expect(sincronizados).toBe(3);
  });

  it('pacote estragado (cabeçalho bom, dados trocados) com o id de uma gravação de cá: a de cá segue intacta', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    b.consentir(termoDe('p1'));
    expect(b.salvar(pedido({ id: ID1, texto: 'Estou com dor.', wav: wav(1), perfilId: 'p1' })).ok).toBe(true); // a MESMA que o backup traz — íntegra aqui
    const estragado = levar(a).map((f) => {
      if (f.nome !== `${ID1}.wav`) return f;
      const copia = new Uint8Array(f.bytes.slice(0));
      copia.fill(0xff, 44); // o cabeçalho continua WAV; o áudio virou ruído
      return { nome: f.nome, bytes: copia };
    });

    const r = await b.restaurarDoBackup(estragado);

    expect(r.ok).toBe(true);
    expect(mesmosBytes(bytesDoWavAqui(ID1), wav(1))).toBe(true); // a voz íntegra de cá não foi trocada pela estragada
  });

  it('restaurar o mesmo backup de novo não faz outra cópia: a cópia que já entrou é reconhecida pelo conteúdo', async () => {
    const a = origemComDoisPacientes();
    const b = destinoComAID1Diferente();
    expect((await b.restaurarDoBackup(levar(a))).ok).toBe(true);
    const aoRestaurarDeNovo = contarRenomeacoesDeAudio();

    const r2 = await b.restaurarDoBackup(levar(a));
    vi.restoreAllMocks();

    expect(r2).toEqual({ ok: true, gravacoes: 3, termos: 2, ignoradas: 0, copiadas: 0 });
    expect(aoRestaurarDeNovo.nomes()).toEqual([]);
    const l = b.listar();
    expect(l.ok && l.gravacoes).toHaveLength(4); // a de cá, a cópia, ID2 e ID3 — não cinco
  });

  it('mesmo id e MESMOS bytes: não escreve nada (nem áudio, nem índice, nem termos) — a de cá já é essa gravação', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    expect((await b.restaurarDoBackup(levar(a))).ok).toBe(true);
    const indiceAntes = fs.readFileSync(path.join(pastaB, NOME_DO_INDICE));
    const termosAntes = fs.readFileSync(path.join(pastaB, NOME_DOS_TERMOS));
    const audios = contarRenomeacoesDeAudio();
    const jsons = vi.spyOn(fs, 'renameSync');

    const r = await b.restaurarDoBackup(levar(a));

    expect(r).toEqual({ ok: true, gravacoes: 3, termos: 2, ignoradas: 0, copiadas: 0 });
    expect(audios.nomes()).toEqual([]);
    expect(jsons).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(pastaB, NOME_DO_INDICE)).equals(indiceAntes)).toBe(true);
    expect(fs.readFileSync(path.join(pastaB, NOME_DOS_TERMOS)).equals(termosAntes)).toBe(true);
  });

  it('áudio solto aqui (sem linha no índice) IGUAL ao do backup: a linha do backup o torna visível, sem reescrever o arquivo', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    fs.mkdirSync(pastaB, { recursive: true });
    fs.writeFileSync(caminhoDoWav(ID2), Buffer.from(wav(2)));
    const audios = contarRenomeacoesDeAudio();

    const r = await b.restaurarDoBackup(levar(a));
    vi.restoreAllMocks();

    expect(r).toEqual({ ok: true, gravacoes: 3, termos: 2, ignoradas: 0, copiadas: 0 });
    expect(audios.nomes().sort()).toEqual([`${ID1}.wav`, `${ID3}.wav`]); // o ID2 não foi escrito de novo
    const l = b.listar();
    expect(l.ok && l.gravacoes.find((g) => g.id === ID2)?.texto).toBe('Eu te amo.');
  });

  it('áudio solto aqui (sem linha no índice) DIFERENTE do backup: fica como está; a gravação do backup entra com id novo', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    fs.mkdirSync(pastaB, { recursive: true });
    fs.writeFileSync(caminhoDoWav(ID2), Buffer.from(wav(9)));

    const r = await b.restaurarDoBackup(levar(a));

    expect(r).toEqual({ ok: true, gravacoes: 3, termos: 2, ignoradas: 0, copiadas: 1 });
    expect(mesmosBytes(bytesDoWavAqui(ID2), wav(9))).toBe(true); // o solto, intacto
    const l = b.listar();
    if (!l.ok) throw new Error(l.erro);
    expect(l.gravacoes.find((g) => g.id === ID2)).toBeUndefined(); // o solto continua sem linha: não vira "gravação do paciente" sem ninguém ter dito
    const copia = l.gravacoes.find((g) => g.texto === 'Eu te amo.');
    expect(copia && copia.id !== ID2 && mesmosBytes(bytesDoWavAqui(copia.id), wav(2))).toBe(true);
  });

  it('linha de cá sem áudio (o arquivo sumiu): o backup repõe o áudio e a linha, sem cópia nenhuma — não havia voz a proteger', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB);
    b.consentir(termoDe('p2'));
    expect(b.salvar(pedido({ id: ID3, texto: 'Fantasma.', wav: wav(4), perfilId: 'p2' })).ok).toBe(true);
    fs.rmSync(caminhoDoWav(ID3)); // antivírus, limpeza manual…

    const r = await b.restaurarDoBackup(levar(a));

    expect(r).toEqual({ ok: true, gravacoes: 3, termos: 2, ignoradas: 0, copiadas: 0 });
    const l = b.listar();
    if (!l.ok) throw new Error(l.erro);
    expect(l.gravacoes.filter((g) => g.id === ID3).map((g) => g.texto)).toEqual(['Boa noite.']);
    expect(l.gravacoes).toHaveLength(3);
    expect(mesmosBytes(bytesDoWavAqui(ID3), wav(3))).toBe(true);
  });

  it('o id novo da cópia nunca bate com nada: id de cá, id do backup, áudio solto na pasta, nem id já sorteado nesta restauração', async () => {
    const a = origemComDoisPacientes();
    const fila = [ID1, ID3, IDORFAO, IDNOVO, IDNOVO, IDNOVO2]; // 1º e 2º: ids em uso; 3º: áudio solto; 5º: repetido
    const b = criarArmazemDeGravacoes(pastaB, undefined, { gerarId: () => fila.shift() ?? '' });
    b.consentir(termoDe('p1'));
    expect(b.salvar(pedido({ id: ID1, texto: 'Local 1.', wav: wav(7), perfilId: 'p1' })).ok).toBe(true);
    expect(b.salvar(pedido({ id: ID2, texto: 'Local 2.', wav: wav(8), perfilId: 'p1' })).ok).toBe(true);
    fs.writeFileSync(caminhoDoWav(IDORFAO), 'solto');

    const r = await b.restaurarDoBackup(levar(a));

    expect(r).toEqual({ ok: true, gravacoes: 3, termos: 2, ignoradas: 0, copiadas: 2 });
    expect(fila).toEqual([]);
    const l = b.listar();
    expect(l.ok && l.gravacoes.map((g) => g.id).sort()).toEqual([ID1, ID2, ID3, IDNOVO, IDNOVO2].sort());
    expect(mesmosBytes(bytesDoWavAqui(ID1), wav(7))).toBe(true);
    expect(mesmosBytes(bytesDoWavAqui(ID2), wav(8))).toBe(true);
    expect(fs.readFileSync(caminhoDoWav(IDORFAO), 'utf8')).toBe('solto');
  });

  it('sem conseguir um id livre: recusa antes de escrever qualquer coisa', async () => {
    const a = origemComDoisPacientes();
    const b = criarArmazemDeGravacoes(pastaB, undefined, { gerarId: () => ID1 });
    b.consentir(termoDe('p1'));
    expect(b.salvar(pedido({ id: ID1, texto: 'Local.', wav: wav(7), perfilId: 'p1' })).ok).toBe(true);
    const antes = listaDaPasta(pastaB);
    const indiceAntes = fs.readFileSync(path.join(pastaB, NOME_DO_INDICE));

    const r = await b.restaurarDoBackup(levar(a));

    expect(r.ok).toBe(false);
    expect(listaDaPasta(pastaB)).toEqual(antes);
    expect(fs.readFileSync(path.join(pastaB, NOME_DO_INDICE)).equals(indiceAntes)).toBe(true);
  });

  /** Acrescenta ao índice de cá linhas de enchimento (sem áudio) até ele ter `total` linhas. */
  function encherOIndiceAte(total: number): void {
    const caminho = path.join(pastaB, NOME_DO_INDICE);
    const indice = JSON.parse(fs.readFileSync(caminho, 'utf8')) as { versao: 1; gravacoes: Record<string, unknown>[] };
    for (let i = 0; indice.gravacoes.length < total; i++) {
      indice.gravacoes.push({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`, texto: `frase ${i}`, criadaEm: '2026-10-01T00:00:00Z',
        duracaoS: 1, qualidade: 'boa', perfilId: 'p1', bytes: 10,
      });
    }
    fs.writeFileSync(caminho, JSON.stringify(indice));
  }

  it('a cópia conta no limite de gravações: com 299 de cá, uma cópia cabe (300)', async () => {
    const origem = criarArmazemDeGravacoes(pastaA);
    origem.consentir(termoDe('p1'));
    expect(origem.salvar(pedido({ id: ID1, texto: 'Estou com dor.', wav: wav(1), perfilId: 'p1' })).ok).toBe(true);
    const b = destinoComAID1Diferente();
    encherOIndiceAte(299);

    expect(await b.restaurarDoBackup(levar(origem))).toEqual({ ok: true, gravacoes: 1, termos: 1, ignoradas: 0, copiadas: 1 });

    expect(mesmosBytes(bytesDoWavAqui(ID1), wav(7))).toBe(true);
    const indice = JSON.parse(fs.readFileSync(path.join(pastaB, NOME_DO_INDICE), 'utf8')) as { gravacoes: unknown[] };
    expect(indice.gravacoes).toHaveLength(300);
  });

  it('uma cópia MAIS uma gravação nova passariam de 300: recusa tudo, sem gravar nada (antes a mesma id substituía e não somava)', async () => {
    const origem = criarArmazemDeGravacoes(pastaA);
    origem.consentir(termoDe('p1'));
    expect(origem.salvar(pedido({ id: ID1, texto: 'Estou com dor.', wav: wav(1), perfilId: 'p1' })).ok).toBe(true);
    expect(origem.salvar(pedido({ id: ID2, texto: 'Eu te amo.', wav: wav(2), perfilId: 'p1' })).ok).toBe(true);
    const b = destinoComAID1Diferente();
    encherOIndiceAte(299);
    const antes = listaDaPasta(pastaB);
    const indiceAntes = fs.readFileSync(path.join(pastaB, NOME_DO_INDICE));
    const audios = contarRenomeacoesDeAudio();

    const r = await b.restaurarDoBackup(levar(origem));
    vi.restoreAllMocks();

    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/300/);
    expect(audios.nomes()).toEqual([]); // recusou ANTES de escrever: nem escreveu para desfazer depois
    expect(listaDaPasta(pastaB)).toEqual(antes);
    expect(fs.readFileSync(path.join(pastaB, NOME_DO_INDICE)).equals(indiceAntes)).toBe(true);
    expect(mesmosBytes(bytesDoWavAqui(ID1), wav(7))).toBe(true);
  });

  it('o espaço que sobrava acaba DURANTE a restauração (uma gravação nova ocupa a vaga): a junção confere de novo, recusa e desfaz os áudios', async () => {
    const IDDURANTE = '99999999-9999-4999-8999-999999999999';
    const pacote = levar(origemComDoisPacientes()); // 3 gravações novas
    let b!: ArmazemDeGravacoes;
    let vezes = 0;
    b = criarArmazemDeGravacoes(pastaB, undefined, {
      ceder: async () => {
        if (++vezes === 1) expect(b.salvar(pedido({ id: IDDURANTE, texto: 'Durante.', wav: wav(4), perfilId: 'p1' })).ok).toBe(true);
        await umaVez();
      },
    });
    b.consentir(termoDe('p1'));
    fs.writeFileSync(path.join(pastaB, NOME_DO_INDICE), JSON.stringify({ versao: 1, gravacoes: [] }));
    encherOIndiceAte(297); // 297 + as 3 do backup = 300: cabe, na hora de conferir

    const r = await b.restaurarDoBackup(pacote);

    expect(vezes).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/300/);
    expect(listaDaPasta(pastaB).filter((n) => n.endsWith('.wav'))).toEqual([`${IDDURANTE}.wav`]); // os 3 áudios do backup saíram; o gravado durante a restauração ficou
    const indice = JSON.parse(fs.readFileSync(path.join(pastaB, NOME_DO_INDICE), 'utf8')) as { gravacoes: { id: string }[] };
    expect(indice.gravacoes).toHaveLength(298);
    expect(indice.gravacoes.some((g) => g.id === IDDURANTE)).toBe(true);
  });

  it('falha ao gravar o índice (depois dos termos): o desfazer cobre TUDO — termos de volta byte a byte, áudios novos fora, índice como estava', async () => {
    const pacote = levar(origemComDoisPacientes());
    const b = criarArmazemDeGravacoes(pastaB);
    b.consentir(termoDe('p1', '2026-10-01T00:00:00Z')); // o do backup (19/10) é mais novo: os termos MUDAM na restauração
    expect(b.salvar(pedido({ id: ID1, texto: 'Local.', wav: wav(5), perfilId: 'p1' })).ok).toBe(true);
    const termosAntes = fs.readFileSync(path.join(pastaB, NOME_DOS_TERMOS));
    const indiceAntes = fs.readFileSync(path.join(pastaB, NOME_DO_INDICE));
    const renomearDeVerdade = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation(((de: fs.PathLike, para: fs.PathLike) => {
      if (String(para).endsWith(NOME_DO_INDICE)) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      return renomearDeVerdade(de, para);
    }) as typeof fs.renameSync);

    const r = await b.restaurarDoBackup(pacote);
    vi.restoreAllMocks();

    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/Não foi possível guardar as gravações do backup/);
    expect(fs.readFileSync(path.join(pastaB, NOME_DOS_TERMOS)).equals(termosAntes)).toBe(true);
    expect(fs.readFileSync(path.join(pastaB, NOME_DO_INDICE)).equals(indiceAntes)).toBe(true);
    expect(listaDaPasta(pastaB).filter((n) => n.endsWith('.wav'))).toEqual([`${ID1}.wav`]);
    expect(listaDaPasta(pastaB).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    const l = b.listar();
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'p1')?.aceitoEm).toBe('2026-10-01T00:00:00Z');
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'p2')).toBeNull();
  });

  it('o mesmo, quando o computador ainda não tinha arquivo de termos: o arquivo criado pela restauração é removido', async () => {
    const pacote = levar(origemComDoisPacientes());
    const b = criarArmazemDeGravacoes(pastaB);
    const renomearDeVerdade = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation(((de: fs.PathLike, para: fs.PathLike) => {
      if (String(para).endsWith(NOME_DO_INDICE)) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      return renomearDeVerdade(de, para);
    }) as typeof fs.renameSync);

    const r = await b.restaurarDoBackup(pacote);
    vi.restoreAllMocks();

    expect(r.ok).toBe(false);
    expect(listaDaPasta(pastaB)).toEqual([]); // nem termos, nem áudio, nem índice, nem temporário
  });

  it('falha ao gravar os termos: os áudios que já estavam escritos saem e o índice nem é tocado', async () => {
    const pacote = levar(origemComDoisPacientes());
    const b = criarArmazemDeGravacoes(pastaB);
    b.consentir(termoDe('p1', '2026-10-01T00:00:00Z'));
    expect(b.salvar(pedido({ id: ID1, texto: 'Local.', wav: wav(5), perfilId: 'p1' })).ok).toBe(true);
    const indiceAntes = fs.readFileSync(path.join(pastaB, NOME_DO_INDICE));
    const termosAntes = fs.readFileSync(path.join(pastaB, NOME_DOS_TERMOS));
    const renomearDeVerdade = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation(((de: fs.PathLike, para: fs.PathLike) => {
      if (String(para).endsWith(NOME_DOS_TERMOS)) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      return renomearDeVerdade(de, para);
    }) as typeof fs.renameSync);

    const r = await b.restaurarDoBackup(pacote);
    vi.restoreAllMocks();

    expect(r.ok).toBe(false);
    expect(listaDaPasta(pastaB).filter((n) => n.endsWith('.wav'))).toEqual([`${ID1}.wav`]);
    expect(fs.readFileSync(path.join(pastaB, NOME_DO_INDICE)).equals(indiceAntes)).toBe(true);
    expect(fs.readFileSync(path.join(pastaB, NOME_DOS_TERMOS)).equals(termosAntes)).toBe(true);
    expect(listaDaPasta(pastaB).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('uma restauração por vez: a segunda, enquanto a primeira ainda escreve, é recusada — e depois que a primeira acaba (ou falha) a trava solta', async () => {
    const pacote = levar(origemComDoisPacientes());
    const b = criarArmazemDeGravacoes(pastaB);

    const primeira = b.restaurarDoBackup(pacote);
    const segunda = await b.restaurarDoBackup(pacote);

    expect(segunda).toEqual({ ok: false, erro: 'Já há uma restauração em andamento.' });
    expect((await primeira).ok).toBe(true);
    expect(b.listar().ok && (b.listar() as { gravacoes: unknown[] }).gravacoes).toHaveLength(3);
    expect((await b.restaurarDoBackup('lixo')).ok).toBe(false); // falhou cedo…
    expect((await b.restaurarDoBackup(pacote)).ok).toBe(true); // …e a trava soltou
  });

  it('uma gravação feita DURANTE a restauração não se perde: o índice é lido de novo na hora de juntar', async () => {
    const pacote = levar(origemComDoisPacientes());
    const IDDURANTE = '99999999-9999-4999-8999-999999999999';
    let b!: ArmazemDeGravacoes;
    let vezes = 0;
    b = criarArmazemDeGravacoes(pastaB, undefined, {
      ceder: async () => {
        if (++vezes === 1) expect(b.salvar(pedido({ id: IDDURANTE, texto: 'Durante.', wav: wav(4), perfilId: 'p1' })).ok).toBe(true);
        await umaVez();
      },
    });
    b.consentir(termoDe('p1'));

    const r = await b.restaurarDoBackup(pacote);

    expect(vezes).toBeGreaterThan(0);
    expect(r).toMatchObject({ ok: true, gravacoes: 3 });
    const l = b.listar();
    expect(l.ok && l.gravacoes.map((g) => g.id).sort()).toEqual([ID1, ID2, ID3, IDDURANTE].sort());
    expect(mesmosBytes(bytesDoWavAqui(IDDURANTE), wav(4))).toBe(true);
  });

  it('o áudio igual que sumiu entre a conferência e a junção (apagado durante a restauração) não volta para a lista: é contado como ignorado', async () => {
    const pacote = levar(origemComDoisPacientes());
    const b = criarArmazemDeGravacoes(pastaB, undefined, {
      ceder: async () => {
        fs.rmSync(caminhoDoWav(ID2), { force: true }); // o cuidador apagou o arquivo enquanto isso
        await umaVez();
      },
    });
    fs.mkdirSync(pastaB, { recursive: true });
    fs.writeFileSync(caminhoDoWav(ID2), Buffer.from(wav(2))); // solto e igual ao do backup

    const r = await b.restaurarDoBackup(pacote);

    expect(r).toEqual({ ok: true, gravacoes: 2, termos: 2, ignoradas: 1, copiadas: 0 });
    const l = b.listar();
    expect(l.ok && l.gravacoes.map((g) => g.id).sort()).toEqual([ID1, ID3].sort());
    expect(fs.existsSync(caminhoDoWav(ID2))).toBe(false);
  });

  it('não prende o laço de eventos: com dezenas de áudios, o app segue respondendo durante a restauração', async () => {
    const id = (i: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`;
    const N = 60;
    const audio = new Uint8Array(wav(1, 50));
    const gravacoes = Array.from({ length: N }, (_, i) => ({
      id: id(i), texto: `frase ${i}`, criadaEm: '2026-10-01T00:00:00Z', duracaoS: 1, qualidade: 'boa', perfilId: 'p1', bytes: audio.byteLength,
    }));
    const pacote: ArquivoParaRestaurar[] = [
      { nome: NOME_DO_INDICE, bytes: Buffer.from(JSON.stringify({ versao: 1, gravacoes })) },
      ...gravacoes.map((g) => ({ nome: `${g.id}.wav`, bytes: audio })),
    ];
    const b = criarArmazemDeGravacoes(pastaB);
    let batidas = 0;
    let rodando = true;
    const batida = () => { if (!rodando) return; batidas++; setImmediate(batida); };
    setImmediate(batida);

    const r = await b.restaurarDoBackup(pacote);
    rodando = false;

    expect(r).toMatchObject({ ok: true, gravacoes: N });
    // Um laço de eventos livre bate pelo menos uma vez por áudio escrito (a restauração cede a vez entre eles).
    expect(batidas).toBeGreaterThanOrEqual(N);
  }, 30_000);
});

describe('canais do backup da voz', () => {
  const SENDER = { id: 1 };
  const janela = () => ({ isDestroyed: () => false, webContents: SENDER }) as never;
  const chamar = <T,>(canal: string, ...args: unknown[]) => handlers.get(canal)!({ sender: SENDER }, ...args) as Promise<T> | T;

  function montar() {
    // `userData` aponta para `a`: a pasta dos canais é a `pastaA`.
    registrarVozGuardada({ janelaPrincipal: janela, importarDeArquivo: async () => ({ ok: false, erro: 'não usado aqui' }) });
  }

  it('lista, lê e restaura pelos canais — o mesmo caminho do app, com o remetente certo', async () => {
    const a = origemComDoisPacientes();
    const pacote = levar(a);
    fs.rmSync(pastaA, { recursive: true, force: true }); // o app "novo" começa vazio
    montar();

    expect(await chamar(CANAIS_VOZ_GUARDADA.backupListar)).toEqual({ ok: true, arquivos: [] });
    const r = await chamar<{ ok: boolean; gravacoes: number }>(CANAIS_VOZ_GUARDADA.backupRestaurar, pacote, {});
    expect(r).toMatchObject({ ok: true, gravacoes: 3, copiadas: 0 });

    const lista = await chamar<{ ok: boolean; arquivos: { nome: string }[] }>(CANAIS_VOZ_GUARDADA.backupListar);
    expect(lista.arquivos.map((x) => x.nome)).toContain(`${ID1}.wav`);
    const lido = await chamar<{ ok: boolean; bytes: ArrayBuffer }>(CANAIS_VOZ_GUARDADA.backupLer, `${ID1}.wav`);
    expect(lido.ok && Buffer.from(lido.bytes).equals(Buffer.from(wav(1)))).toBe(true);
  });

  it('só a janela do app fala com os canais: outra página não lê nem escreve', async () => {
    const a = origemComDoisPacientes();
    const pacote = levar(a);
    fs.rmSync(pastaA, { recursive: true, force: true });
    montar();
    const deFora = { sender: { id: 99 } };
    for (const canal of [CANAIS_VOZ_GUARDADA.backupListar, CANAIS_VOZ_GUARDADA.backupLer, CANAIS_VOZ_GUARDADA.backupRestaurar]) {
      const r = (await handlers.get(canal)!(deFora, canal === CANAIS_VOZ_GUARDADA.backupLer ? `${ID1}.wav` : pacote, {})) as { ok: boolean };
      expect(r.ok, canal).toBe(false);
    }
    expect(fs.existsSync(pastaA)).toBe(false);
  });
});
