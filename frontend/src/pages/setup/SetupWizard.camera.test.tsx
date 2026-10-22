import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import i18n from '../../i18n';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 3): o Preparo
// abria uma SEGUNDA captura da câmera escolhida, enquanto o rastreador — que
// mede os checks de posição e depois calibra — seguia em outra câmera. Agora o
// preview é a stream do rastreador, e escolher a câmera reabre a do rastreador.
// -----------------------------------------------------------------------------

class TrackFalsa {
  readyState: 'live' | 'ended' = 'live';
  stopped = false;
  constructor(public deviceId: string) {}
  stop() { this.stopped = true; this.readyState = 'ended'; }
  getSettings() { return { deviceId: this.deviceId }; }
}
const streamDa = (deviceId: string) => {
  const t = new TrackFalsa(deviceId);
  return { t, s: { getTracks: () => [t], getVideoTracks: () => [t] } as unknown as MediaStream };
};

const gaze = vi.hoisted(() => ({
  stream: null as MediaStream | null,
  deviceId: 'cam1' as string | null,
  versao: 0,
  trocarCamera: vi.fn(),
}));
vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({
    getDiagnostics: () => null,
    getCameraStream: () => gaze.stream,
    getCameraAtual: () => ({ chave: null, rotulo: '', deviceId: gaze.deviceId }),
    trocarCamera: gaze.trocarCamera,
    versaoDaCamera: gaze.versao,
  }),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: 'p1' } }) }));
const ajustes = vi.hoisted(() => ({
  settings: {
    cameraDeviceId: null as string | null, posicaoDaCamera: null, screenDiagonalIn: 23.6,
    screenGeometrySource: 'default', cameraHorizontalFovDeg: 62,
  },
  updateSettings: vi.fn(),
}));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ajustes }));

import { SetupWizard } from './SetupWizard';

const montar = () =>
  render(
    <MemoryRouter>
      <SetupWizard />
    </MemoryRouter>,
  );

const getUserMedia = vi.fn();

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  const { s } = streamDa('cam1');
  gaze.stream = s;
  gaze.deviceId = 'cam1';
  gaze.trocarCamera.mockReset();
  ajustes.updateSettings.mockClear();
  ajustes.settings.cameraDeviceId = null;
  getUserMedia.mockReset();
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => [
        { kind: 'videoinput', deviceId: 'cam1', label: 'Webcam integrada' },
        { kind: 'videoinput', deviceId: 'cam2', label: 'Logitech C920' },
      ]),
    },
  });
});
afterEach(() => vi.restoreAllMocks());

async function irParaACamera() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /permitir|câmera/i })); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /próximo|continuar|avançar/i })); });
}

describe('Preparo: a câmera é a do rastreador', () => {
  it('com a câmera do rastreador viva, "permitir" não abre outra captura', async () => {
    montar();
    await irParaACamera();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(gaze.trocarCamera).not.toHaveBeenCalled();
    // A lista mostra a câmera em que o rastreador está como a escolhida.
    expect(screen.getByRole('radio', { name: /Webcam integrada/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('o preview aponta para a MESMA stream do rastreador', async () => {
    const { container } = montar();
    await irParaACamera();
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.srcObject).toBe(gaze.stream);
  });

  it('escolher outra câmera reabre a câmera do RASTREADOR com ela', async () => {
    gaze.trocarCamera.mockResolvedValue({ ok: true, deviceId: 'cam2', caiuParaOutra: false });
    montar();
    await irParaACamera();
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /Logitech C920/ })); });
    expect(gaze.trocarCamera).toHaveBeenCalledWith('cam2');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /Logitech C920/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('aviso-da-camera')).toBeNull();
  });

  it('a escolhida não abriu e o rastreador ficou em outra: a tela diz', async () => {
    gaze.trocarCamera.mockResolvedValue({ ok: true, deviceId: 'cam1', caiuParaOutra: true });
    montar();
    await irParaACamera();
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /Logitech C920/ })); });
    expect(screen.getByTestId('aviso-da-camera').textContent).toMatch(/não abriu agora/);
  });

  it('sair do Preparo não para a câmera do rastreador', async () => {
    const { t, s } = streamDa('cam1');
    gaze.stream = s;
    const { unmount } = montar();
    await irParaACamera();
    unmount();
    expect(t.stopped).toBe(false);
  });

  it('câmera do rastreador fora do ar: "permitir" pede ao rastreador para abrir agora, e mostra o erro dele', async () => {
    gaze.stream = null;
    gaze.trocarCamera.mockResolvedValue({ ok: false, deviceId: null, caiuParaOutra: false, erro: 'Nenhuma câmera encontrada. Conecte a webcam.' });
    montar();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /permitir|câmera/i })); });
    expect(gaze.trocarCamera).toHaveBeenCalledWith(null);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByText(/Nenhuma câmera encontrada/)).toBeInTheDocument();
  });
});
