import { describe, it, expect, vi, afterEach } from 'vitest';
import { listarSaidas, aplicarSaida, saidaDaVozValida, ehRotuloGenerico } from './saida';

// -----------------------------------------------------------------------------
// Saída da voz para chamadas (roadmap 3, de 19/10/2026; rodada 3, 21/10/2026).
//
// Numa chamada de WhatsApp ou Meet, a voz do paciente precisa chegar ao outro
// lado. O caminho é um cabo de áudio virtual (VB-CABLE: "CABLE Input" recebe o
// som do IrisFlow, "CABLE Output" é o microfone do aplicativo da chamada), e
// quem manda o som para lá é o `setSinkId` do Chromium.
//
// Aqui, o `setSinkId` é simulado: o que importa é o que o IrisFlow faz com cada
// resposta dele — e que NENHUMA delas derrube a fala do paciente.
// -----------------------------------------------------------------------------

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Um `<audio>` de mentira: só o que o `aplicarSaida` toca. */
const elementoCom = (setSinkId?: (id: string) => Promise<void>) =>
  ({ setSinkId }) as unknown as HTMLMediaElement;
const contextoCom = (setSinkId?: (id: string) => Promise<void>) =>
  ({ setSinkId }) as unknown as AudioContext;

const enumerar = (dispositivos: Array<Partial<MediaDeviceInfo>>) =>
  vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: () => Promise.resolve(dispositivos) } });

describe('listarSaidas', () => {
  it('devolve só as saídas de áudio, com o nome que o sistema dá (inclui o CABLE Input)', async () => {
    // `enumerateDevices` mistura microfone, câmera e alto-falante na mesma lista.
    enumerar([
      { kind: 'audioinput', deviceId: 'mic1', label: 'Microfone' },
      { kind: 'videoinput', deviceId: 'cam1', label: 'Webcam' },
      { kind: 'audiooutput', deviceId: 'spk1', label: 'Alto-falantes (Realtek)' },
      { kind: 'audiooutput', deviceId: 'cabo1', label: 'CABLE Input (VB-Audio Virtual Cable)' },
    ]);
    await expect(listarSaidas()).resolves.toEqual([
      { id: 'spk1', rotulo: 'Alto-falantes (Realtek)' },
      { id: 'cabo1', rotulo: 'CABLE Input (VB-Audio Virtual Cable)' },
    ]);
  });

  it('sem permissão de mídia o nome vem vazio: dá um nome genérico em vez de sumir com o item', async () => {
    // Antes de o navegador liberar os nomes, o rótulo é "". Uma linha em branco
    // na lista é pior que "Saída 2"; e sumir com o item deixaria a pessoa sem
    // poder escolher o cabo.
    enumerar([
      { kind: 'audiooutput', deviceId: 'spk1', label: 'Alto-falantes' },
      { kind: 'audiooutput', deviceId: 'cabo1', label: '' },
      { kind: 'audiooutput', deviceId: 'fone1', label: '   ' },
    ]);
    const saidas = await listarSaidas();
    expect(saidas).toHaveLength(3);
    expect(saidas.map((s) => s.id)).toEqual(['spk1', 'cabo1', 'fone1']);
    expect(saidas[1].rotulo).toBe('Saída 2');
    expect(saidas[2].rotulo).toBe('Saída 3');
  });

  it('tira da lista os atalhos "default" e "communications" do Chromium e o item sem identificação', async () => {
    // O Chromium repete o aparelho padrão como "default" (e o de chamadas como
    // "communications"). Eles já estão na opção "Saída padrão do computador" e
    // só confundiriam: um item sem `deviceId` nem dá para escolher.
    enumerar([
      { kind: 'audiooutput', deviceId: 'default', label: 'Default - Alto-falantes (Realtek)' },
      { kind: 'audiooutput', deviceId: 'communications', label: 'Communications - Alto-falantes' },
      { kind: 'audiooutput', deviceId: '', label: '' },
      { kind: 'audiooutput', deviceId: 'spk1', label: 'Alto-falantes (Realtek)' },
    ]);
    await expect(listarSaidas()).resolves.toEqual([{ id: 'spk1', rotulo: 'Alto-falantes (Realtek)' }]);
  });

  it('o navegador não expõe mediaDevices: lista vazia, sem lançar', async () => {
    vi.stubGlobal('navigator', {});
    await expect(listarSaidas()).resolves.toEqual([]);
  });

  it('enumerateDevices rejeita: lista vazia, sem lançar', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: () => Promise.reject(new Error('bloqueado')) } });
    await expect(listarSaidas()).resolves.toEqual([]);
  });

  it('enumerateDevices lança direto (sem promessa): lista vazia, sem lançar', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: () => {
          throw new Error('boom');
        },
      },
    });
    await expect(listarSaidas()).resolves.toEqual([]);
  });
});

describe('ehRotuloGenerico (o nome que a lista inventa quando o sistema não informa)', () => {
  it('reconhece o nome genérico de listarSaidas, e só ele', async () => {
    enumerar([
      { kind: 'audiooutput', deviceId: 'spk1', label: 'Alto-falantes (Realtek)' },
      { kind: 'audiooutput', deviceId: 'cabo1', label: '' },
      { kind: 'audiooutput', deviceId: 'fone1', label: '   ' },
    ]);
    const saidas = await listarSaidas();
    expect(saidas.map((s) => ehRotuloGenerico(s.rotulo))).toEqual([false, true, true]);
  });

  it.each([
    ['Saída 2', true],
    ['Saída 12', true],
    ['Saída', false],
    ['Saída padrão do computador', false],
    ['CABLE Input (VB-Audio Virtual Cable)', false],
    ['Saída 2 (HDMI)', false],
    ['', false],
  ])('%s → %s', (rotulo, esperado) => {
    expect(ehRotuloGenerico(rotulo)).toBe(esperado);
  });
});

describe('aplicarSaida (setSinkId simulado)', () => {
  it('sucesso: manda o som para o dispositivo e devolve true', async () => {
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    await expect(aplicarSaida(elementoCom(setSinkId), 'cabo1')).resolves.toBe(true);
    expect(setSinkId).toHaveBeenCalledTimes(1);
    expect(setSinkId).toHaveBeenCalledWith('cabo1');
  });

  it('o mesmo vale para um AudioContext (a voz clonada e a guardada tocam por ele)', async () => {
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    await expect(aplicarSaida(contextoCom(setSinkId), 'cabo1')).resolves.toBe(true);
    expect(setSinkId).toHaveBeenCalledWith('cabo1');
  });

  it('chama o setSinkId como método do alvo (o de verdade exige o this: sem ele, "Illegal invocation")', async () => {
    const alvo = {
      aberto: true,
      setSinkId(this: { aberto?: boolean } | undefined, _id: string) {
        if (!this || this.aberto !== true) return Promise.reject(new TypeError('Illegal invocation'));
        return Promise.resolve();
      },
    };
    await expect(aplicarSaida(alvo as unknown as AudioContext, 'cabo1')).resolves.toBe(true);
    await expect(aplicarSaida(alvo as unknown as HTMLMediaElement, null)).resolves.toBe(true);
  });

  it('null volta para a saída padrão do sistema (setSinkId com texto vazio)', async () => {
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    await expect(aplicarSaida(contextoCom(setSinkId), null)).resolves.toBe(true);
    expect(setSinkId).toHaveBeenCalledWith('');
  });

  it('falha: o setSinkId recusa (permissão negada, aparelho ocupado) → false, sem lançar', async () => {
    const setSinkId = vi.fn().mockRejectedValue(new DOMException('não deixaram', 'NotAllowedError'));
    await expect(aplicarSaida(contextoCom(setSinkId), 'cabo1')).resolves.toBe(false);
    expect(setSinkId).toHaveBeenCalledTimes(1);
  });

  it('dispositivo ausente (cabo desinstalado): NotFoundError → false, sem lançar', async () => {
    const setSinkId = vi.fn().mockRejectedValue(new DOMException('Requested device not found', 'NotFoundError'));
    await expect(aplicarSaida(elementoCom(setSinkId), 'cabo-que-sumiu')).resolves.toBe(false);
  });

  it('um setSinkId que lança direto, em vez de devolver uma promessa, também vira false', async () => {
    const setSinkId = vi.fn(() => {
      throw new TypeError('setSinkId is not a function');
    });
    await expect(aplicarSaida(contextoCom(setSinkId as never), 'cabo1')).resolves.toBe(false);
  });

  it('sem suporte (o alvo não tem setSinkId): false para um dispositivo, sem lançar', async () => {
    await expect(aplicarSaida(contextoCom(undefined), 'cabo1')).resolves.toBe(false);
    await expect(aplicarSaida(elementoCom(undefined), 'cabo1')).resolves.toBe(false);
  });

  it('sem suporte e pedindo a saída padrão: true — ela já é a padrão, não há o que trocar', async () => {
    await expect(aplicarSaida(contextoCom(undefined), null)).resolves.toBe(true);
  });

  it('alvo ausente: false, sem lançar', async () => {
    await expect(aplicarSaida(null as never, 'cabo1')).resolves.toBe(false);
    await expect(aplicarSaida(undefined as never, null)).resolves.toBe(false);
  });
});

describe('saidaDaVozValida (o que volta do disco)', () => {
  it('aceita o código de um aparelho', () => {
    expect(saidaDaVozValida('3f9a1c')).toBe('3f9a1c');
    expect(saidaDaVozValida('  3f9a1c  ')).toBe('3f9a1c');
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['número', 5],
    ['booleano', true],
    ['objeto', { id: 'x' }],
    ['lista', ['x']],
    ['nulo', null],
    ['ausente', undefined],
    ['enorme (editado à mão)', 'x'.repeat(513)],
  ])('%s vira null (a saída padrão)', (_nome, valor) => {
    expect(saidaDaVozValida(valor)).toBeNull();
  });
});
