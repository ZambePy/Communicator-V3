import { describe, it, expect, vi } from 'vitest';
import {
  COMANDO_SUBIR, FOLGA_PARA_DEVOLVER_MS, PRAZO_DE_SAIDA_MS, PRAZO_DO_POWERSHELL_MS, caminhoDoPowershell, comandoRestaurar,
  criarAlarmeDoSistema, lerEstadoAnterior,
} from '../electron/alarme';

// Alarme de emergência do lado do sistema (pedido de 18/10/2026): a janela vem
// para a frente e o volume do Windows sobe ao máximo — e é DEVOLVIDO quando o
// alarme para. O PowerShell não roda aqui; o executor é injetado.

function janelaFalsa(o: { minimizada?: boolean; visivel?: boolean } = {}) {
  return {
    isDestroyed: () => false,
    isMinimized: vi.fn(() => o.minimizada ?? false),
    isVisible: vi.fn(() => o.visivel ?? true),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    flashFrame: vi.fn(),
  };
}

describe('alarme do sistema', () => {
  it('liga: janela restaurada, mostrada, por cima, focada e piscando; volume ao máximo', async () => {
    const w = janelaFalsa({ minimizada: true, visivel: false });
    const executar = vi.fn(async () => '{"volume":0.3,"mudo":true}');
    const alarme = criarAlarmeDoSistema({ janela: () => w as never, plataforma: 'win32', executar });

    await alarme.ligar({ volumeMaximo: true });
    expect(w.restore).toHaveBeenCalled();
    expect(w.show).toHaveBeenCalled();
    expect(w.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(w.focus).toHaveBeenCalled();
    expect(w.flashFrame).toHaveBeenCalledWith(true);
    expect(executar).toHaveBeenCalledWith(COMANDO_SUBIR);
    expect(alarme.ligado).toBe(true);

    await alarme.desligar();
    expect(w.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(w.flashFrame).toHaveBeenLastCalledWith(false);
    // Devolve o volume e o mudo de antes.
    expect(executar).toHaveBeenLastCalledWith(comandoRestaurar(0.3, true));
    expect(alarme.ligado).toBe(false);
  });

  it('desligar logo depois de ligar espera a subida e devolve o volume certo', async () => {
    const w = janelaFalsa();
    let terminarSubida: (s: string) => void = () => {};
    const executar = vi.fn((cmd: string) =>
      cmd === COMANDO_SUBIR ? new Promise<string>((r) => { terminarSubida = r; }) : Promise.resolve(''),
    );
    const alarme = criarAlarmeDoSistema({ janela: () => w as never, plataforma: 'win32', executar });
    await alarme.ligar();
    const desligando = alarme.desligar();
    terminarSubida('{"volume":0.55,"mudo":false}');
    await desligando;
    expect(executar).toHaveBeenLastCalledWith(comandoRestaurar(0.55, false));
  });

  it('sem o ajuste de volume, ou fora do Windows, não mexe no volume', async () => {
    const executar = vi.fn(async () => '{"volume":0.3,"mudo":false}');
    const a = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'win32', executar });
    await a.ligar({ volumeMaximo: false });
    await a.desligar();
    const b = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'linux', executar });
    await b.ligar({ volumeMaximo: true });
    await b.desligar();
    expect(executar).not.toHaveBeenCalled();
  });

  it('PowerShell falhou: avisa no log uma vez, segue com a janela, e não tenta "devolver" um volume que não leu', async () => {
    const log = vi.fn();
    const executar = vi.fn(async () => { throw new Error('powershell.exe não encontrado'); });
    const w = janelaFalsa();
    const alarme = criarAlarmeDoSistema({ janela: () => w as never, plataforma: 'win32', executar, log });
    await alarme.ligar();
    await alarme.desligar();
    await alarme.ligar();
    await alarme.desligar();
    expect(w.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(executar).toHaveBeenCalledTimes(2); // só as subidas
    expect(log.mock.calls.filter((c) => c[0] === 'aviso')).toHaveLength(1);
  });

  it('ligar duas vezes não sobe o volume duas vezes (a segunda leria o máximo como "volume de antes")', async () => {
    const executar = vi.fn(async () => '{"volume":0.2,"mudo":false}');
    const alarme = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'win32', executar });
    await alarme.ligar();
    await alarme.ligar();
    await alarme.desligar();
    expect(executar).toHaveBeenCalledTimes(2);
    expect(executar).toHaveBeenLastCalledWith(comandoRestaurar(0.2, false));
  });

  it('lê só o JSON esperado e limita o volume a 0–1 no comando de devolução', () => {
    expect(lerEstadoAnterior('aviso qualquer\r\n{"volume":0.42,"mudo":true}\r\n')).toEqual({ volume: 0.42, mudo: true });
    expect(lerEstadoAnterior('{"volume":"x"}')).toBeNull();
    expect(lerEstadoAnterior('{"volume":3}')).toBeNull();
    expect(lerEstadoAnterior('')).toBeNull();
    expect(comandoRestaurar(7, false)).toContain('[IrisFlowAudio]::Volume = 1.0000');
    expect(comandoRestaurar(-1, true)).toContain('[IrisFlowAudio]::Volume = 0.0000');
    expect(comandoRestaurar(0.5, true)).toContain('[IrisFlowAudio]::Mute = $true');
  });
});

// Revisão de segurança de 19/10/2026: ligar/desligar/ligar em sequência abria
// dois PowerShell em paralelo, e o segundo alarme podia tocar com o Windows
// MUDO (ou o volume ficava no máximo depois de parar). Aqui, um Windows falso:
// o volume começa em 20%, mudo; cada PowerShell demora o que o teste manda.
function windowsFalso(atrasosDaSubidaMs: number[]) {
  const s = { volume: 0.2, mudo: true, rodando: 0, maxSimultaneos: 0, chamadas: 0 };
  let n = 0;
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const executar = async (c: string) => {
    s.chamadas += 1;
    s.rodando += 1;
    s.maxSimultaneos = Math.max(s.maxSimultaneos, s.rodando);
    try {
      if (c === COMANDO_SUBIR) {
        await esperar(atrasosDaSubidaMs[Math.min(n++, atrasosDaSubidaMs.length - 1)]);
        const antes = { volume: s.volume, mudo: s.mudo };
        s.volume = 1;
        s.mudo = false;
        return JSON.stringify(antes);
      }
      await esperar(5);
      s.volume = Number(/::Volume = ([0-9.]+)/.exec(c)![1]);
      s.mudo = /::Mute = \$true/.test(c);
      return '';
    } finally {
      s.rodando -= 1;
    }
  };
  return { s, executar };
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('alarme do sistema: uma operação de volume de cada vez', () => {
  it.each([[10], [40], [60], [120]])(
    'ligar, desligar e religar com a 1ª subida lenta: o 2º alarme toca alto e, no fim, o volume volta (2ª subida em %i ms)',
    async (atraso2) => {
      const { s, executar } = windowsFalso([80, atraso2]);
      const alarme = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'win32', executar });
      void alarme.ligar();
      await pausa(10);
      const desligando = alarme.desligar();
      await pausa(10);
      void alarme.ligar();
      await desligando;
      await pausa(250);
      // O 2º alarme está tocando: volume no máximo, sem mudo.
      expect(alarme.ligado).toBe(true);
      expect(s).toMatchObject({ volume: 1, mudo: false });
      await alarme.desligar();
      // Parou: o volume e o mudo de ANTES do episódio, não o máximo.
      expect(s).toMatchObject({ volume: 0.2, mudo: true });
      expect(s.maxSimultaneos).toBe(1);
    },
  );

  it('alternar 50 vezes não abre 50 PowerShell, e o volume termina como estava', async () => {
    const { s, executar } = windowsFalso([30]);
    const alarme = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'win32', executar });
    const pedidos: Promise<boolean>[] = [];
    for (let i = 0; i < 50; i++) pedidos.push(i % 2 === 0 ? alarme.ligar() : alarme.desligar());
    await Promise.all(pedidos);
    await pausa(100);
    expect(alarme.ligado).toBe(false);
    // Cada operação confere, na vez dela, o último pedido: como o último foi
    // "desligar", nenhuma subida chega a rodar.
    expect(s.maxSimultaneos).toBeLessThanOrEqual(1);
    expect(s.chamadas).toBeLessThanOrEqual(2);
    expect(s).toMatchObject({ volume: 0.2, mudo: true });
    expect(alarme.precisaDesligarAoSair).toBe(false);
  });

  it('desligar antes de a subida começar não sobe o volume', async () => {
    const { s, executar } = windowsFalso([20]);
    const alarme = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'win32', executar });
    const a = alarme.ligar();
    const b = alarme.desligar();
    await Promise.all([a, b]);
    await pausa(50);
    expect(s.chamadas).toBe(0);
    expect(s).toMatchObject({ volume: 0.2, mudo: true });
  });

  it('ao sair, espera o volume voltar (com prazo) e diz se ainda há algo a desfazer', async () => {
    const { s, executar } = windowsFalso([40]);
    const alarme = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'win32', executar });
    expect(alarme.precisaDesligarAoSair).toBe(false);
    await alarme.ligar();
    expect(alarme.precisaDesligarAoSair).toBe(true);
    await alarme.encerrar(2_000);
    expect(s).toMatchObject({ volume: 0.2, mudo: true });
    expect(alarme.ligado).toBe(false);
    expect(alarme.precisaDesligarAoSair).toBe(false);
  });

  it('o prazo de saída vale mesmo com um PowerShell que não termina', async () => {
    const alarme = criarAlarmeDoSistema({
      janela: () => janelaFalsa() as never, plataforma: 'win32', executar: () => new Promise<string>(() => {}),
    });
    await alarme.ligar();
    const t0 = Date.now();
    await alarme.encerrar(60);
    expect(Date.now() - t0).toBeLessThan(1_000);
  });
});

// Revisão de segurança de 20/10/2026: o will-quit esperava 8 s, mas a subida
// do volume pelo PowerShell pode levar até o prazo dele (15 s: o Add-Type
// compilando devagar, o antivírus examinando). Com uma subida lenta, o app saía
// antes de ela terminar — e ela terminava depois, pondo o Windows em 100% sem
// ninguém para devolver.
describe('alarme do sistema: a espera ao sair cobre uma subida lenta', () => {
  it('diz quando há subida em curso; só nela a espera da saída cobre o prazo do PowerShell e a devolução', async () => {
    let terminarSubida: (s: string) => void = () => {};
    const executar = vi.fn((c: string) => (c === COMANDO_SUBIR ? new Promise<string>((r) => { terminarSubida = r; }) : Promise.resolve('')));
    const alarme = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'win32', executar });
    expect(alarme.subidaEmCurso).toBe(false);
    expect(alarme.prazoParaSairMs).toBe(PRAZO_DE_SAIDA_MS);
    await alarme.ligar();
    await pausa(0);
    expect(alarme.subidaEmCurso).toBe(true);
    expect(alarme.prazoParaSairMs).toBe(PRAZO_DO_POWERSHELL_MS + FOLGA_PARA_DEVOLVER_MS);
    expect(alarme.prazoParaSairMs).toBeGreaterThan(PRAZO_DO_POWERSHELL_MS);
    terminarSubida('{"volume":0.3,"mudo":false}');
    await pausa(0);
    // Volume no máximo e nada rodando: falta só devolver — a espera volta a ser curta.
    expect(alarme.subidaEmCurso).toBe(false);
    expect(alarme.prazoParaSairMs).toBe(PRAZO_DE_SAIDA_MS);
    expect(PRAZO_DE_SAIDA_MS).toBeLessThan(PRAZO_DO_POWERSHELL_MS);
  });

  it('uma subida que falha também deixa de estar em curso', async () => {
    let falhar: (e: Error) => void = () => {};
    const executar = vi.fn((c: string) => (c === COMANDO_SUBIR ? new Promise<string>((_r, rej) => { falhar = rej; }) : Promise.resolve('')));
    const alarme = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'win32', executar });
    await alarme.ligar();
    await pausa(0);
    expect(alarme.subidaEmCurso).toBe(true);
    falhar(new Error('o prazo do PowerShell acabou'));
    await pausa(0);
    expect(alarme.subidaEmCurso).toBe(false);
    expect(alarme.prazoParaSairMs).toBe(PRAZO_DE_SAIDA_MS);
  });

  it.each([[3_000], [9_000], [14_000]])(
    'sair com uma subida de %i ms em curso (o caso do revisor): espera ela, devolve o volume e só então sai',
    async (atrasoDaSubida) => {
      vi.useFakeTimers();
      try {
        const { s, executar } = windowsFalso([atrasoDaSubida]);
        const alarme = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'win32', executar });
        void alarme.ligar();
        await vi.advanceTimersByTimeAsync(100);
        // O will-quit: `encerrar()` sem prazo usa o da hora (o que o main.ts faz).
        let saiu = false;
        const saindo = alarme.encerrar().then(() => { saiu = true; });
        // Os 8 s de antes não bastam para a subida lenta...
        await vi.advanceTimersByTimeAsync(Math.min(8_000, atrasoDaSubida - 200));
        expect(saiu).toBe(false);
        // ...a espera vai até ela terminar e o volume voltar.
        await vi.advanceTimersByTimeAsync(atrasoDaSubida);
        await saindo;
        expect(saiu).toBe(true);
        // Na hora de sair, o volume e o mudo de antes, e nenhum PowerShell rodando
        // (um que terminasse depois poria o Windows em 100%).
        expect(s).toMatchObject({ volume: 0.2, mudo: true, rodando: 0 });
        expect(alarme.precisaDesligarAoSair).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('sem subida em curso, a saída continua curta, mesmo com a devolução presa', async () => {
    vi.useFakeTimers();
    try {
      // A subida responde na hora; a devolução nunca termina.
      const executar = vi.fn((c: string) => (c === COMANDO_SUBIR ? Promise.resolve('{"volume":0.3,"mudo":false}') : new Promise<string>(() => {})));
      const alarme = criarAlarmeDoSistema({ janela: () => janelaFalsa() as never, plataforma: 'win32', executar });
      await alarme.ligar();
      await vi.advanceTimersByTimeAsync(10);
      expect(alarme.subidaEmCurso).toBe(false);
      let saiu = false;
      void alarme.encerrar().then(() => { saiu = true; });
      await vi.advanceTimersByTimeAsync(PRAZO_DE_SAIDA_MS - 100);
      expect(saiu).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(saiu).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('caminho do PowerShell', () => {
  it('é o do sistema, nunca só o nome (o Windows procuraria antes na pasta do programa)', () => {
    expect(caminhoDoPowershell({ SystemRoot: 'D:\\Win' })).toBe('D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(caminhoDoPowershell({})).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  });
});
