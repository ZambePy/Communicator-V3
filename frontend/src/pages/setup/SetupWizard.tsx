import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useGaze } from '../../context/GazeContext';
import { evaluateReadiness, type ReadinessCheck } from '@tracker/setupReadiness';
import { snapshotFromDiagnostics, lerViewport } from '@tracker/setupReadinessAdapter';
import {
  listarCameras,
  medirFps,
  lerCapacidade,
  type CameraCapacidade,
  type CameraDevice,
} from '../../services/camera/devices';
import { gravarPreparo } from '../../services/local/setupProfile';
import { PASSOS, indiceDoPasso, proximoPasso, passoAnterior, type PassoId } from './passos';
import {
  acumular,
  inicial,
  msEstavel,
  podeSeguir,
  liberadoPorEspera,
  type EstadoDeEstabilidade,
} from './estabilidade';
import { PermissaoCamera, type EstadoDaPermissao } from './steps/PermissaoCamera';
import { EscolhaDaCamera } from './steps/EscolhaDaCamera';
import { Posicionamento } from './steps/Posicionamento';
import { Iluminacao } from './steps/Iluminacao';
import { VerificacaoDoMonitor } from './steps/VerificacaoDoMonitor';

/**
 * Wizard de preparo do ambiente.
 *
 * **Uma rota só, passo no estado.** Os passos 2, 3 e 4 precisam da câmera viva;
 * cinco rotas separadas remontariam o componente e reiniciariam o stream a cada
 * transição — segundos de tela preta num fluxo cujo objetivo é justamente medir
 * estabilidade.
 *
 * O wizard é dono de três coisas: o passo atual, o stream de preview, e a
 * amostragem de prontidão. As telas de passo são puras sobre props, e é por
 * isso que dá para testá-las sem câmera.
 */

/** 2 Hz, como o `ReadinessPanel`: a 30 Hz os textos piscam e ninguém lê. */
const INTERVALO_DE_AMOSTRA_MS = 500;

const IDS_DE_POSICAO = ['face', 'distance', 'centering', 'headPose'];

export const SetupWizard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentProfile } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { getDiagnostics } = useGaze();

  const [passo, setPasso] = useState<PassoId>('permissao');

  // ── Permissão e stream ───────────────────────────────────────────────────
  const [permissao, setPermissao] = useState<EstadoDaPermissao>('explicando');
  const [erroDeCamera, setErroDeCamera] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ── Câmeras ──────────────────────────────────────────────────────────────
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraSelecionada, setCameraSelecionada] = useState<string | null>(null);
  const [capacidade, setCapacidade] = useState<CameraCapacidade | null>(null);
  const [medindo, setMedindo] = useState(false);

  // ── Prontidão ────────────────────────────────────────────────────────────
  const [checks, setChecks] = useState<ReadinessCheck[]>([]);
  const [distanciaCm, setDistanciaCm] = useState<number | null>(null);
  const [estabilidade, setEstabilidade] = useState<EstadoDeEstabilidade>(inicial());
  const [agora, setAgora] = useState(() => performance.now());

  // ── Coletados nos passos ─────────────────────────────────────────────────
  const [lux, setLux] = useState('');
  const [diagonal, setDiagonal] = useState<number | null>(null);
  const [origemDaDiagonal, setOrigemDaDiagonal] = useState<'edid' | 'manual'>('edid');

  /**
   * Geração da abertura de câmera em curso.
   *
   * Trocar de câmera enquanto a anterior ainda está abrindo é fácil: os botões
   * de escolha não se desabilitam durante o pedido, e `getUserMedia` demora.
   * Sem esta marca, as duas chamadas paravam o MESMO stream antigo, as duas
   * escreviam em `streamRef.current`, e o stream perdedor ficava órfão — com a
   * luz da webcam acesa pelo resto do processo, que é exatamente o que a
   * limpeza abaixo existe para evitar (ela só para o que estiver no ref).
   * A `setCameraSelecionada` atrasada também podia desfazer a escolha nova.
   */
  const geracaoDaCamera = useRef(0);

  const abrirStream = useCallback(async (deviceId?: string) => {
    const geracao = ++geracaoDaCamera.current;
    const atual = () => geracaoDaCamera.current === geracao;
    setPermissao('pedindo');
    setErroDeCamera(null);
    try {
      streamRef.current?.getTracks().forEach((tk) => tk.stop());
      streamRef.current = null;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      // Perdeu a corrida (ou o componente saiu): o stream é DESTE pedido, e
      // ninguém mais vai usá-lo. Fechar aqui é o único lugar que ainda o tem.
      if (!atual()) {
        stream.getTracks().forEach((tk) => tk.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setPermissao('concedida');

      // Os labels só aparecem depois da permissão concedida.
      const lista = await listarCameras();
      if (!atual()) return;
      setCameras(lista);
      const ativo =
        stream.getVideoTracks()[0]?.getSettings().deviceId ?? lista[0]?.deviceId ?? null;
      setCameraSelecionada(deviceId ?? ativo);
    } catch (e) {
      if (!atual()) return;
      setPermissao('negada');
      setErroDeCamera(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Fecha o stream ao sair. Sem isto a luz da webcam fica acesa depois do
  // preparo, e o usuário-alvo não tem como investigar por quê.
  useEffect(
    () => () => {
      // Invalida qualquer abertura em voo ANTES de parar o que existe: sem
      // isto, um `getUserMedia` que resolvesse depois do unmount escreveria no
      // ref já limpo e deixaria a câmera ligada.
      geracaoDaCamera.current++;
      streamRef.current?.getTracks().forEach((tk) => tk.stop());
      streamRef.current = null;
    },
    []
  );

  // Mede o que a câmera entrega quando o passo 2 abre com o vídeo tocando.
  useEffect(() => {
    if (passo !== 'camera' || !videoRef.current || permissao !== 'concedida') return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    let vivo = true;
    setMedindo(true);
    void medirFps(video).then((fps) => {
      if (!vivo) return;
      setCapacidade(lerCapacidade(video, fps));
      setMedindo(false);
    });
    return () => {
      vivo = false;
    };
  }, [passo, permissao, cameraSelecionada]);

  // Amostragem de prontidão. `getDiagnostics` numa ref, fora das deps: a
  // identidade dela é refeita a cada transição de estado do engine, e nas deps
  // cada transição destruiria e recriaria o intervalo — o mesmo defeito que o
  // `ReadinessPanel` documenta.
  const diagRef = useRef(getDiagnostics);
  diagRef.current = getDiagnostics;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (passo !== 'posicionamento' && passo !== 'iluminacao') return;
    const id = setInterval(() => {
      const t0 = performance.now();
      setAgora(t0);
      const d = diagRef.current();
      if (!d) return;
      const snap = snapshotFromDiagnostics(d, lerViewport());
      if (!snap) return;

      // O FOV precisa CHEGAR aqui, senao a checagem de distancia nao tem como
      // devolver centimetros e cai na fracao do frame — que foi o que escondeu
      // por tanto tempo que o alvo pedia 32 cm.
      const relatorio = evaluateReadiness(snap, {
        horizontalFovDeg: settingsRef.current.cameraHorizontalFovDeg,
      });
      setChecks(relatorio.checks);

      const posicao = relatorio.checks.filter((c) => IDS_DE_POSICAO.includes(c.id));
      const verde = posicao.length > 0 && posicao.every((c) => c.status === 'ok');
      setEstabilidade((e) => acumular(e, verde, t0));
    }, INTERVALO_DE_AMOSTRA_MS);
    return () => clearInterval(id);
  }, [passo]);

  // Distância ao vivo, do core.
  useEffect(() => {
    if (passo !== 'posicionamento') return;
    let vivo = true;
    // O id vive no escopo do EFEITO, não no do `.then`.
    //
    // Antes o `return () => clearInterval(id)` estava dentro do `.then`: era o
    // valor de retorno DAQUELE callback, que ninguém chama — o React só
    // enxerga o `return` do próprio efeito. O `if (!vivo) clearInterval(id)`
    // cobria só o caso de o import resolver DEPOIS do unmount; no caso normal
    // (import resolve antes) o intervalo de 500 ms ficava rodando para sempre,
    // e a trilha do assistente permite voltar a este passo quantas vezes o
    // cuidador quiser — um timer permanente por visita.
    let id: ReturnType<typeof setInterval> | null = null;
    void import('@tracker/calibration').then((m) => {
      if (!vivo) return;
      id = setInterval(() => {
        setDistanciaCm(m.getCurrentCameraDistanceCm());
      }, INTERVALO_DE_AMOSTRA_MS);
    });
    return () => {
      vivo = false;
      if (id !== null) clearInterval(id);
    };
  }, [passo]);

  const posicao = checks.filter((c) => IDS_DE_POSICAO.includes(c.id));
  const verde = posicao.length > 0 && posicao.every((c) => c.status === 'ok');

  /**
   * Só o posicionamento tem porta. Os outros passos informam: travar "Continuar"
   * por FPS baixo ou sala escura deixaria o paciente sem comunicação por uma
   * condição que talvez ele não consiga mudar.
   */
  // Instante em que a pessoa CHEGOU ao passo de posicionamento. É a base da
  // válvula de escape: depois de 45 s tentando, a porta abre com aviso, em vez
  // de deixar "Continuar" desabilitado para sempre.
  const chegouNoPosicionamentoRef = useRef<number | null>(null);
  useEffect(() => {
    if (passo === 'posicionamento') {
      if (chegouNoPosicionamentoRef.current === null) {
        chegouNoPosicionamentoRef.current = performance.now();
      }
    } else {
      chegouNoPosicionamentoRef.current = null;
    }
  }, [passo]);

  const desdeQuandoTenta = chegouNoPosicionamentoRef.current ?? agora;
  const podeAvancar =
    passo !== 'posicionamento' || podeSeguir(estabilidade, agora, desdeQuandoTenta);
  const seguiuSemEstabilizar =
    passo === 'posicionamento' && liberadoPorEspera(estabilidade, agora, desdeQuandoTenta);

  const concluir = () => {
    if (currentProfile) {
      gravarPreparo(currentProfile.id, {
        cameraDeviceId: cameraSelecionada,
        fpsMedido: capacidade?.fpsMedido ?? null,
        luxAmbiente: lux.trim() === '' ? null : Number(lux.trim().replace(',', '.')) || null,
        monitorDiagonalIn: diagonal,
        monitorOrigem: origemDaDiagonal,
      });
    }
    if (diagonal !== null && diagonal !== settings.screenDiagonalIn) {
      // Grava a origem junto: o `SettingsContext` documenta que o
      // preenchimento automatico pelo EDID nunca pode sobrescrever um valor que
      // o cuidador digitou — se ele mediu com fita, aquele numero vale mais que
      // um EDID arredondado a centimetro inteiro.
      updateSettings({
        screenDiagonalIn: diagonal,
        screenGeometrySource: origemDaDiagonal === 'manual' ? 'manual' : 'auto',
      });
    }
    navigate('/calibration-check', { replace: true });
  };

  const avancar = () => {
    const p = proximoPasso(passo);
    if (p) setPasso(p);
    else concluir();
  };

  const anterior = passoAnterior(passo);

  return (
    <main
      role="main"
      aria-labelledby="setup-title"
      style={{
        minHeight: '100vh',
        background: 'var(--settings-bg)',
        display: 'flex',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
      }}
    >
      <div
        className="coluna-livre-da-emergencia"
        style={{
          width: '100%',
          maxWidth: 640,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <h1
            id="setup-title"
            style={{
              margin: 0,
              fontSize: '1.15rem',
              fontWeight: 800,
              opacity: 0.75,
              color: 'var(--color-text-base)',
            }}
          >
            {t('setup.title')}
          </h1>
          <Trilha atual={passo} aoEscolher={setPasso} />
        </div>

        <div
          className="glass-card"
          style={{
            background: 'var(--color-card-bg)',
            border: '1px solid var(--color-card-border)',
            borderRadius: '1.5rem',
            padding: '1.75rem',
          }}
        >
          {passo === 'permissao' && (
            <PermissaoCamera
              estado={permissao}
              erro={erroDeCamera}
              aoPedir={() => void abrirStream()}
            />
          )}
          {passo === 'camera' && (
            <EscolhaDaCamera
              cameras={cameras}
              selecionada={cameraSelecionada}
              capacidade={capacidade}
              medindo={medindo}
              aoSelecionar={(id) => {
                setCameraSelecionada(id);
                setCapacidade(null);
                void abrirStream(id);
              }}
              aoRecarregar={() => void abrirStream(cameraSelecionada ?? undefined)}
              videoRef={videoRef}
            />
          )}
          {passo === 'posicionamento' && (
            <Posicionamento
              checks={checks}
              distanciaCm={distanciaCm}
              msEstavel={msEstavel(estabilidade, agora)}
              verde={verde}
            />
          )}
          {passo === 'iluminacao' && <Iluminacao checks={checks} lux={lux} aoMudarLux={setLux} />}
          {passo === 'monitor' && (
            <VerificacaoDoMonitor
              // `'auto'` e o valor vindo do EDID via IPC. `'default'` significa
              // que ninguem informou nada — e ai o campo tem de aparecer VAZIO,
              // em vez de exibir o chute inicial como se fosse medicao.
              diagonalDoEdid={
                settings.screenGeometrySource === 'auto' ? settings.screenDiagonalIn : null
              }
              diagonalAtual={settings.screenDiagonalIn}
              aoMudar={(d, o) => {
                setDiagonal(d);
                setOrigemDaDiagonal(o);
              }}
            />
          )}
        </div>

        {seguiuSemEstabilizar && (
          <p
            role="status"
            style={{
              margin: 0,
              padding: '0.9rem 1.1rem',
              borderRadius: '1rem',
              background: 'var(--tint-warn-bg)',
              border: '1px solid var(--tint-warn-border)',
              color: 'var(--tint-warn-text)',
              lineHeight: 1.5,
            }}
          >
            A posição não ficou estável por 3 segundos seguidos, mas você pode
            continuar. A calibração tende a ficar menos precisa — se puder,
            ajuste a cadeira, a luz ou o apoio de cabeça e tente de novo antes
            de seguir.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <PrimaryButton
            type="button"
            variant="ghost"
            disabled={anterior === null}
            onClick={() => anterior && setPasso(anterior)}
          >
            <ArrowLeft size={17} aria-hidden="true" /> {t('setup.back')}
          </PrimaryButton>

          <PrimaryButton type="button" disabled={!podeAvancar} onClick={avancar}>
            {proximoPasso(passo) === null ? (
              <>
                {t('setup.finish')} <Check size={17} aria-hidden="true" />
              </>
            ) : (
              <>
                {t('setup.next')} <ArrowRight size={17} aria-hidden="true" />
              </>
            )}
          </PrimaryButton>
        </div>
      </div>
    </main>
  );
};

/**
 * Trilha de passos — navegável, como a do tutorial.
 *
 * Era `div` + `span`, sem `onClick`, sem `role` e fora do `DWELL_SELECTOR`:
 * parecia um conjunto de abas e era inerte para mouse, teclado e olhar. Voltar
 * a um passo anterior só era possível pelo botão "Voltar", um de cada vez.
 *
 * Aqui, ao contrário do tutorial, só se anda para TRÁS pela trilha: o
 * posicionamento tem uma porta de verdade (a janela de estabilidade), e pular
 * por cima dela pela trilha esvaziaria a porta. Avançar continua sendo pelo
 * botão, que respeita a regra.
 */
const Trilha: React.FC<{ atual: PassoId; aoEscolher: (p: PassoId) => void }> = ({
  atual,
  aoEscolher,
}) => {
  const { t } = useTranslation();
  const i = indiceDoPasso(atual);
  return (
    <div
      role="tablist"
      style={{ display: 'flex', gap: '0.4rem' }}
      aria-label={t('setup.stepOf', { atual: i + 1, total: PASSOS.length })}
    >
      {PASSOS.map((p, n) => {
        const ehAtual = n === i;
        const alcancavel = n <= i;
        return (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={ehAtual}
            aria-current={ehAtual ? 'step' : undefined}
            disabled={!alcancavel}
            onClick={() => alcancavel && aoEscolher(p)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
              minHeight: 56,
              padding: '0.35rem 0.25rem',
              background: 'transparent',
              border: 'none',
              borderRadius: '0.6rem',
              cursor: alcancavel ? 'pointer' : 'default',
              textAlign: 'center',
              font: 'inherit',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'block',
                height: 4,
                borderRadius: 999,
                background: n <= i ? 'var(--color-primary)' : 'var(--color-card-border)',
              }}
            />
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: ehAtual ? 800 : 600,
                opacity: ehAtual ? 1 : 0.55,
                color: 'var(--color-text-base)',
              }}
            >
              {t(`setup.steps.${p}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
};
