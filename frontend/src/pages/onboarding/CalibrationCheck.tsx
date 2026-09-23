import React, { useRef, useState, useEffect, useMemo } from 'react';
import { buildRuntimeInfo } from '../../utils/runtimeInfo';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useGaze } from '../../context/GazeContext';
import { useSettings } from '../../context/SettingsContext';
import { BackButton } from '../../components/ui/BackButton';
import { hoverAndFocus, hoverAndFocusBackground } from '../../components/ui/hoverFocus';
import { startAccuracyTest } from '@tracker/accuracy';
import { montarMetaDeMedicao } from '../../utils/autoTestMeta';
import { emitirResultadoDeCalibracao } from '../../cloud/eventos';
import { getCalibrationTimestampMs } from '@tracker/calibration';
import { idadeEmTexto } from '../../idadeEmTexto';
import type { OpticalCondition } from '@tracker/calibrationProfiles';
import type { VeredictoDeriva } from '@tracker/calibration';
import { resolveCalibrationDistances } from '@tracker/calibrationDistances';
import { getResumoDoPonto } from '@tracker/calibration';
import { esperarPintura } from '@tracker/aguardarPintura';
import { ReadinessPanel } from '../../components/ui/ReadinessPanel';
import { ChecksDaCamera } from '../../components/ui/ChecksDaCamera';
import { ProgressoDoOnboarding } from '../../components/ui/ProgressoDoOnboarding';
import { IlustracaoDoRosto } from '../../components/ui/IlustracaoDoRosto';
import { isDevMode } from '../../devMode';
import { PreparoDaCalibracao } from '../calibration/PreparoDaCalibracao';
import { ordemDaGrade } from '../calibration/ordemDaGrade';
import { tutorialConcluido } from '../../services/local/tutorialProfile';
import { useAuth } from '../../context/AuthContext';

interface CalibrationPointUI {
  x: number;
  y: number;
  name: string;
}
const POINT_NAME: Record<string, string> = {
  '0.1,0.1': 'Superior Esquerdo',
  '0.5,0.1': 'Superior Central',
  '0.9,0.1': 'Superior Direito',
  '0.1,0.5': 'Meio Esquerdo',
  '0.5,0.5': 'Centro',
  '0.9,0.5': 'Meio Direito',
  '0.1,0.9': 'Inferior Esquerdo',
  '0.5,0.9': 'Inferior Central',
  '0.9,0.9': 'Inferior Direito',
};

const OPTICAL_LABELS: Record<OpticalCondition, string> = {
  sem_oculos: 'Sem óculos',
  oculos_simples: 'Óculos comuns (leitura, míopia)',
  oculos_progressivo: 'Óculos progressivos (multifocais)',
  lentes_contato: 'Lentes de contato',
  desconhecido: 'Prefiro não dizer',
};
const OPTICAL_OPTIONS: OpticalCondition[] = [
  'sem_oculos',
  'oculos_simples',
  'oculos_progressivo',
  'lentes_contato',
  'desconhecido',
];

// ─── Paleta CAA — escura em todas as etapas ────────────────────────────────
// fundo preto reduz fadiga ocular e força menos a piscada, permitindo fixações
// mais longas e estáveis. Contraste alto (branco/âmbar sobre preto) é o padrão CAA.
const BG = '#000000';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_DIM = 'rgba(255,255,255,0.65)';
const ACCENT = '#1B54A8'; // IrisFlow Azul

const SUCCESS = '#22C55E';
const DANGER = '#EF4444';

/** Diâmetro da bola que percorre a grade. */
const TAMANHO_DA_BOLA_PX = 36;
/**
 * Duração do deslocamento entre dois alvos.
 *
 * Cabe com folga na pausa de confirmação de 1200 ms — a bola chega, para, e só
 * então a coleta do alvo seguinte abre. Mais rápido que isso o olho perde a
 * perseguição e volta a saltar; mais lento, a calibração inteira estica.
 */
const DESLOCAMENTO_DA_BOLA_MS = 620;

const humanMessage: Record<string, string> = {
  singular_matrix:
    'Não foi possível treinar o modelo (matriz singular). A causa mais comum é reflexo constante nos óculos ou desvio extremo do olhar.',
  insufficient_samples:
    'Amostras insuficientes coletadas. Certifique-se de que seu rosto está visível e centralizado durante toda a calibração.',
  degenerate_features:
    'Os dados coletados não variaram o suficiente. A causa mais comum é reflexo nos óculos travando a detecção ou olhar fixo fora dos pontos.',
  engine_indisponivel: 'O rastreamento não está ativo. Volte ao menu e entre de novo nesta tela.',
  unknown: 'Erro desconhecido durante o treinamento do modelo. Por favor, tente novamente.',
};

const AUTO_RECORD_STORAGE_KEY = 'irisflow.autoRecordOnCalibrate';

export const CalibrationCheck: React.FC = () => {
  const navigate = useNavigate();
  const { currentProfile: perfilAtual, isCaregiver } = useAuth();
  // Os três checks do paciente liberam o início; o painel detalhado (onze
  // checks, viewport, cintilação) é do cuidador e do modo desenvolvedor.
  const [checksProntos, setChecksProntos] = useState(true);
  const mostrarDetalhes = isCaregiver || isDevMode();
  const { calibration, l2csStatus, getSessionUptimeMs, recording, getDiagnostics } = useGaze();
  // Geometria física do posto de uso. Fonte ÚNICA para (a) o erro angular do
  // relatório e (b) o posicionamento dos alvos pelo orçamento de
  // excentricidade. Antes eram dois hardcodes de 15,6"/60 cm em arquivos
  // diferentes, e numa tela de 23,6" o erro angular saía 34% menor que o real.
  const { settings } = useSettings();

  // 2.5 — `disabled` libera a calibração tanto quanto `ready`.
  //
  // Este booleano destrava o botão de começar. Quando o caminho do L2CS passou
  // a ser opcional (default desligado, porque o bloco angular não entra em
  // `iris12`), o status virou 'disabled' — e sem esta linha o usuário ficaria
  // preso na tela de pré-calibração para sempre, esperando um modelo que nunca
  // vai carregar porque ninguém pediu que carregasse.
  const l2csReady = l2csStatus === 'ready' || l2csStatus === 'disabled';
  const podeComecar = l2csReady && checksProntos;
  const l2csFailed = l2csStatus === 'error';

  const [stage, setStage] = useState<
    'tutorial' | 'calibrating' | 'testing' | 'transitioning' | 'drift-warning'
  >('tutorial');
  // Espelho do `stage` para os listeners de visibilidade/blur, que são
  // registrados uma única vez e fechariam sobre o valor do primeiro render.
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // veredito da deriva de pose da calibração recém-treinada. Não-nulo
  // significa que a cabeça migrou mais que o limiar DURANTE a coleta.
  const [driftVerdict, setDriftVerdict] = useState<VeredictoDeriva | null>(null);
  // Alvos que a coleta desistiu de medir. Um modelo treinado sem a linha de
  // baixo prediz a linha de baixo por extrapolação, e a tela precisa dizer.
  const [alvosPulados, setAlvosPulados] = useState(0);
  // Motivo pelo qual o teste de precisão não começou. Enquanto era `null` e a
  // tela ficava em 'testing', qualquer falha virava um spinner eterno.
  const [falhaDoTeste, setFalhaDoTeste] = useState<string | null>(null);

  // Distância efetiva escolhida no início desta calibração. Congelada aqui
  // para a grade e o relatório usarem exatamente o mesmo número.
  const sessionDistanceRef = useRef<number | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedList, setCompletedList] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastCompletedPoint, setLastCompletedPoint] = useState<number | null>(null);
  const [preparing, setPreparing] = useState(false);
  /**
   * A janela de coleta deste alvo está ABERTA.
   *
   * É o único gatilho do pulso da bola: pulsar fora da coleta ensinaria o
   * paciente a fixar quando ninguém está medindo — e a não fixar quando
   * alguém está. Liga imediatamente antes de `startCollectingPoint` e desliga
   * no callback, em qualquer desfecho.
   */
  const [coletando, setColetando] = useState(false);
  const PREPARE_MS = 1500;

  const [opticalCondition, setOpticalCondition] = useState<OpticalCondition>('desconhecido');

  // Checkbox opt-in para iniciar a gravação junto com a calibração.
  // Persistido para o operador não precisar remarcar a cada rodada. STOP e
  // EXPORT continuam manuais em Configurações. Default OFF: usuário normal
  // nunca dispara gravação sem querer.
  const [autoRecord, setAutoRecord] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_RECORD_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(AUTO_RECORD_STORAGE_KEY, String(autoRecord));
    } catch {
      /* localStorage indisponível — silencia */
    }
  }, [autoRecord]);
  // Espelho reativo do isActive() do recorder — usado só para mostrar o
  // indicador "🔴 Gravando" na UI. Poll a 500 ms é barato e evita ter que
  // adicionar API de subscription no recorder por conta desse único consumidor.
  const [isRecording, setIsRecording] = useState<boolean>(false);
  useEffect(() => {
    const tick = () => setIsRecording(recording.isActive());
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [recording]);
  const [calibrationMode, setCalibrationMode] = useState<'full' | 'quick' | null>(null);

  // Lista de alvos da SESSÃO EM CURSO, congelada em `handleStart` depois de
  // `startCalibrationMode`.
  //
  // Antes, `startNextPoint` lia o `activePoints` do render em que `handleStart`
  // rodou. Nesse render `calibrationMode` ainda era `null`, então a lista era
  // a que `getCalibrationTargets()` devolvia ANTES do modo ser aplicado — a
  // grade nominal, calculada no load do módulo com a geometria default. O
  // `ordemDaSequenciaRef` já era montado sobre a lista NOVA. Os índices de uma
  // lista indexavam a outra: em modo rápido a UI mostrava 4 cantos e o engine
  // coletava TL/TC/TR/ML da grade de 9; em modo completo divergiam sempre que
  // a distância medida da sessão ≠ default (que é o caso normal).
  //
  // O ref é a fonte da verdade para o loop (síncrono, imune a render velho);
  // o state existe só para o JSX redesenhar. Os dois são escritos juntos e
  // nunca separadamente — ver `commitSessionTargets`.
  const activePointsRef = useRef<CalibrationPointUI[]>([]);
  /** A rodada de reforço (sprint S4) acontece no máximo uma vez por sessão. */
  const reforcoFeitoRef = useRef(false);
  const [sessionPoints, setSessionPoints] = useState<CalibrationPointUI[] | null>(null);

  const toUiPoints = (targets: readonly { x: number; y: number }[]): CalibrationPointUI[] =>
    targets.map((t) => ({
      x: t.x * 100,
      y: t.y * 100,
      name: POINT_NAME[`${t.x},${t.y}`] ?? '',
    }));

  /** Congela os alvos desta sessão. Chamado UMA vez, após startCalibrationMode. */
  const commitSessionTargets = (targets: readonly { x: number; y: number }[]) => {
    const pts = toUiPoints(targets);
    activePointsRef.current = pts;
    setSessionPoints(pts);
    return pts;
  };

  // Lista NOMINAL — usada só para o preview do tutorial, antes de qualquer
  // sessão começar. Nunca alimenta a coleta.
  const nominalPoints: CalibrationPointUI[] = useMemo(() => {
    const targets = calibration.getCalibrationTargets?.() ?? [];
    if (targets.length === 0) {
      return [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.1, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.9, y: 0.5 },
        { x: 0.1, y: 0.9 },
        { x: 0.5, y: 0.9 },
        { x: 0.9, y: 0.9 },
      ].map((t) => ({ x: t.x * 100, y: t.y * 100, name: POINT_NAME[`${t.x},${t.y}`] ?? '' }));
    }
    return toUiPoints(targets);
  }, [calibrationMode, calibration]);

  // O que a tela desenha: os alvos da sessão quando existe uma, senão o preview.
  const activePoints: CalibrationPointUI[] = sessionPoints ?? nominalPoints;

  /**
   * Onde a bola está agora. `null` só quando a grade ainda não existe — aí não
   * há o que seguir com os olhos e a tela não desenha bola nenhuma.
   */
  const alvoDaBola: CalibrationPointUI | null = activePoints[currentIndex] ?? null;

  /**
   * A cor da bola. Verde por um instante ao fechar um ponto — é a única
   * confirmação que sobrou depois que o ✓ em elemento separado saiu, e ela
   * acontece no próprio nó que já está na tela, sem nada aparecer nem sumir.
   */
  const tintaDaBola = lastCompletedPoint !== null ? SUCCESS : ACCENT;

  const ordemDaSequenciaRef = useRef<number[]>([]);
  const isMounted = useRef(true);
  /** Quando a coleta começou — vira `calibration_seconds` no resumo para o cuidador. */
  const calibracaoIniciadaEmRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES_PER_POINT = 3;

  // Ownership da gravação auto-iniciada. Só finalizamos gravação que ESTE
  // componente iniciou (via handleStart com autoRecord marcado). Se o
  // operador começou manualmente em Configurações, deixamos em paz.
  const autoRecordOwnedRef = useRef(false);
  // Ref atualizada a cada render pra callback de unmount + timeouts sempre
  // enxergarem a versão mais nova (evita closure obsoleto sobre `recording`).
  const finalizeAutoRecordingRef = useRef<(exportFile: boolean) => void>(() => {});
  finalizeAutoRecordingRef.current = (exportFile: boolean) => {
    if (!autoRecordOwnedRef.current) return;
    if (!recording.isActive()) {
      autoRecordOwnedRef.current = false;
      return;
    }
    const stats = recording.getStats();
    const jsonl = exportFile ? recording.exportAsJSONL() : '';
    recording.stop();
    if (exportFile && jsonl) {
      const blob = new Blob([jsonl], { type: 'application/x-ndjson' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // ':' inválido em nome de arquivo no Windows — troca por '-'.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `irisflow-recording-${stamp}.jsonl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`[calib] gravação finalizada + exportada — ${stats.frames} frames`);
    } else {
      console.log('[calib] gravação descartada (attempt incompleto)');
    }
    recording.clear();
    autoRecordOwnedRef.current = false;
  };

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Sair da tela no meio da coleta deixava `isCalibrating` ligado para
      // sempre: o engine reportava `calibrating` a cada frame, o dwell ficava
      // desligado e o cursor oculto em TODO o app, sem recuperação a não ser
      // completar uma calibração inteira. Abortar não descarta o modelo
      // anterior — só encerra a sessão em curso.
      calibration.abort?.();
      // Sair da tela no meio de uma gravação auto-iniciada: descarta pra não
      // deixar JSONL parcial em lugar nenhum.
      finalizeAutoRecordingRef.current(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A janela perder o foco durante a coleta é o mesmo problema por outra
  // porta: os alvos continuariam sendo coletados enquanto o usuário olha para
  // outro lugar, contaminando o modelo com amostras que não correspondem a
  // alvo nenhum. Aborta e devolve a tela ao início, em vez de treinar sujo.
  useEffect(() => {
    const abortarPorPerdaDeFoco = (motivo: string) => {
      if (document.visibilityState === 'visible' && motivo === 'visibility') return;
      if (stageRef.current !== 'calibrating') return;
      console.warn(`[calib] calibração abortada por ${motivo}`);
      calibration.abort?.();
      finalizeAutoRecordingRef.current(false);
      if (!isMounted.current) return;
      setStage('tutorial');
      setPreparing(false);
      setCompletedList([]);
      setSessionPoints(null);
      setErrorMessage(
        'A calibração foi interrompida porque a janela perdeu o foco. Comece de novo.'
      );
    };
    const onVisibility = () => abortarPorPerdaDeFoco('visibility');
    const onBlur = () => abortarPorPerdaDeFoco('blur');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishAndTransition = () => {
    setStage('transitioning');
    // O resultado da calibração vem ANTES de seguir. O diagnóstico de ajuste
    // já era calculado e só aparecia embutido nesta tela; agora ele tem uma
    // leitura própria, em linguagem de cuidador.
    //
    // O destino final (tutorial na primeira vez, menu depois) é decidido lá,
    // no botão de seguir — e vai junto no `state` para a tela de resultado não
    // precisar reproduzir esta regra.
    setTimeout(() => {
      const destino = perfilAtual && !tutorialConcluido(perfilAtual.id) ? '/tutorial' : '/menu';
      navigate('/calibration/resultado', { state: { destino } });
    }, 800);
  };

  // O teste de precisão desenha seu próprio overlay por cima desta tela. Se
  // ele não aparecer, alguma coisa falhou entre o fim do treino e o início do
  // teste — e sem este vigia o operador só via o spinner girando.
  //
  // As dependências são SÓ `stage` e `falhaDoTeste`. `getDiagnostics` nasce de
  // novo a cada vez que o `useMemo` do GazeContext refaz o valor — o que
  // acontece a cada transição de estado do engine (`tracking`↔`no_face`↔…),
  // várias vezes por minuto. Com ele nas deps, o efeito era desmontado e
  // remontado a cada re-render, o `clearTimeout` cancelava o vigia antes dos
  // 6 s e ele NUNCA disparava: o operador ficava com o spinner eterno e sem
  // nenhuma mensagem. Os dois valores usados dentro do timer vêm de refs.
  const diagRef = useRef(getDiagnostics);
  diagRef.current = getDiagnostics;
  const calibRef = useRef(calibration);
  calibRef.current = calibration;
  useEffect(() => {
    if (stage !== 'testing' || falhaDoTeste) return;
    const id = setTimeout(() => {
      if (!isMounted.current) return;
      if (document.getElementById('accuracy-overlay')) return;
      const estado = diagRef.current() ? 'ativo' : 'sem diagnóstico';
      setFalhaDoTeste(
        `O teste de precisão não abriu em 6 segundos (rastreamento ${estado}, ` +
          `modelo ${calibRef.current.isCalibrated() ? 'treinado' : 'NÃO treinado'}). ` +
          'Veja o console para o erro completo.'
      );
    }, 6000);
    return () => clearTimeout(id);
  }, [stage, falhaDoTeste]);

  const runAccuracyTestThenExit = () => {
    const meta = montarMetaDeMedicao({
      sessionUptimeMs: getSessionUptimeMs(),
      opticalCondition: calibration.getActiveOpticalCondition?.() ?? 'desconhecido',
      distanciaCm: sessionDistanceRef.current ?? settings.viewingDistanceCm,
      telaPolegadas: settings.screenDiagonalIn,
      // Instante do treino em uso: é dele que sai o número do bloco, sem
      // ninguém precisar lembrar de anotar qual rodada é qual.
      calibTs: getCalibrationTimestampMs(),
      // a procedência da diagonal. `'default'` significa o hardcode de
      // 23,6″, e o relatório precisa dizer isso em vez de afirmar que mediu.
      screenGeometrySource: settings.screenGeometrySource,
    });
    meta.screenScaleFactor = settings.screenScaleFactor;

    // Sem isto o relatório não sabe em que provider o L2CS rodou nem qual
    // filtro governava — e duas condições viram um número só. A mesma função
    // que Configurações usa: este era o segundo caminho que `runtimeInfo.ts`
    // existe para unificar, e ainda montava o objeto à mão (sem `modelo`).
    const runtime = buildRuntimeInfo(getDiagnostics());

    const inicioDaCalibracaoMs = calibracaoIniciadaEmRef.current;
    startAccuracyTest(
      (result, action) => {
        if (!isMounted.current) return;
        if (action === 'continue') {
          // Resumo para o app do cuidador (acurácia, precisão, taxa de acerto,
          // condições). Só agregados — o relatório completo fica no disco.
          const duracaoS = inicioDaCalibracaoMs
            ? Math.round((Date.now() - inicioDaCalibracaoMs) / 1000)
            : null;
          try {
            emitirResultadoDeCalibracao(result, meta, duracaoS);
          } catch (e) {
            console.warn('[cloud] resumo não emitido', e);
          }
        }
        if (action === 'redo') {
          // Attempt descartado — não exporta um JSONL parcial.
          finalizeAutoRecordingRef.current(false);
          calibration.clear?.();
          setStage('tutorial');
          setCompletedList([]);
          return;
        }
        // Fluxo bem-sucedido: para + exporta antes de sair da tela.
        finalizeAutoRecordingRef.current(true);
        finishAndTransition();
      },
      meta,
      runtime
    );
  };

  /**
   * Roda uma sequência de alvos do começo ao fim.
   *
   * Usada pela calibração inteira e pela rodada de reforço (sprint S4) — as
   * duas passam pela mesma máquina de coleta, embaralhamento e preparo, porque
   * duplicar isso era o caminho mais curto para as duas divergirem.
   */
  const iniciarSequencia = (targets: readonly { x: number; y: number }[]) => {
    const sessionTargets = commitSessionTargets(targets);
    // ORDEM DE LEITURA, não sorteada.
    //
    // A ordem era embaralhada (Fisher-Yates) para evitar que o paciente
    // antecipasse o próximo alvo. Com UMA bola percorrendo a grade, a ordem
    // sorteada custa mais do que rende: cada alvo vira um salto atravessando a
    // tela, o olho chega depois da bola, e os primeiros quadros da janela de
    // coleta registram o olhar ainda em trânsito. O percurso contínuo é o que
    // permite PERSEGUIR a bola em vez de caçá-la — e a perseguição chega no
    // alvo junto com ela.
    const order = ordemDaGrade(sessionTargets);
    ordemDaSequenciaRef.current = order;
    setCompletedList([]);
    setLastCompletedPoint(null);
    setColetando(false);
    setCurrentIndex(order[0]);

    setPreparing(true);
    setTimeout(() => {
      if (!isMounted.current) return;
      setPreparing(false);
      startNextPoint(0);
    }, PREPARE_MS);
  };

  const startNextPoint = (step: number) => {
    if (!isMounted.current) return;
    const order = ordemDaSequenciaRef.current;

    if (step >= order.length) {
      setStage('testing');
      // `completeCalibration` é SÍNCRONO e caro: os dois treinos com busca de
      // λ (25 λ × 9 folds) mais o diagnóstico de ajuste (9 folds
      // leave-one-target-out × 2 olhos) deram ~4 s num perfil realista de 225
      // amostras. Chamado no mesmo tick do `setStage`, o React agrupa a
      // atualização e o navegador nunca pinta a tela de transição: o paciente
      // fica encarando "9 / 9" congelado, sem sinal de que o sistema está
      // vivo, exatamente quando NÃO pode se mexer.
      //
      // Dois rAF garantem que a pintura aconteceu: o primeiro roda antes do
      // quadro que mostra a tela nova, o segundo já depois dele.
      esperarPintura(() => {
        if (!isMounted.current) return;
        calibration.completeCalibration?.((outcome) => {
          if (!outcome || outcome.ok !== false) {
            // a deriva de pose já era medida e só ia para o console. Se a
            // cabeça migrou mais que o limiar entre o primeiro e o último alvo, o
            // modelo aprendeu postura junto com alvo: para aqui e deixa a pessoa
            // decidir, em vez de seguir para o teste com um ajuste contaminado.
            const veredito = calibration.getPoseDriftVerdict?.() ?? null;
            // `getTargetsSkipped` e não `getCalibrationFitDiagnostics`: o
            // segundo dispara o leave-one-target-out (~9 s de main thread
            // travado) e aqui só se quer a contagem de alvos pulados.
            const pulados = calibration.getTargetsSkipped?.()?.length ?? 0;
            if ((veredito || pulados > 0) && isMounted.current) {
              if (veredito)
                console.warn(`[React] Deriva de pose na calibração: ${veredito.mensagem}`);
              if (pulados > 0) console.warn(`[React] ${pulados} alvo(s) ignorado(s) na calibração`);
              setDriftVerdict(veredito);
              setAlvosPulados(pulados);
              setStage('drift-warning');
              return;
            }
            // ── Rodada de reforço (sprint S4) ─────────────────────────
            //
            // O `looByTarget` do treino que acabou já diz quais alvos o modelo
            // não consegue prever a partir dos outros. Em vez de mandar refazer
            // a calibração inteira — mais 26 s de fadiga, com a mesma grade que
            // já falhou — gasta-se de 6 a 12 s onde o modelo é cego.
            //
            // `reforcoFeito` impede o laço: a segunda passada nunca pede uma
            // terceira, mesmo que o erro continue concentrado.
            if (!reforcoFeitoRef.current) {
              const extras = calibration.iniciarRodadaDeReforco?.() ?? [];
              if (extras.length > 0 && isMounted.current) {
                reforcoFeitoRef.current = true;
                console.log(`[React] Reforçando ${extras.length} alvo(s) difícil(eis)`);
                setStage('calibrating');
                iniciarSequencia(extras);
                return;
              }
            }

            console.log('[React] Calibração concluída — disparando teste de precisão automático');
            setTimeout(() => {
              if (!isMounted.current) return;
              // Dentro de um `setTimeout` uma exceção não tem quem a pegue: a
              // tela ficaria no spinner de "Iniciando teste de precisão" para
              // sempre, sem nada dito ao operador.
              try {
                runAccuracyTestThenExit();
              } catch (e) {
                console.error('[React] falha ao iniciar o teste de precisão:', e);
                finalizeAutoRecordingRef.current(false);
                setFalhaDoTeste(e instanceof Error ? e.message : String(e));
              }
            }, 400);
          } else {
            if (isMounted.current) {
              const reason = outcome.reason || 'unknown';
              const msg = humanMessage[reason] || humanMessage.unknown;
              console.error(`[React] Treinamento falhou: ${reason} - ${outcome.detail}`);
              // Calibração falhou — o JSONL até aqui não tem accuracy test útil.
              // Descarta em vez de exportar; próxima tentativa recomeça limpa.
              finalizeAutoRecordingRef.current(false);
              setErrorMessage(msg);
              setStage('tutorial');
            }
          }
        });
      });
      return;
    }

    const pointIdx = order[step];
    setCurrentIndex(pointIdx);
    setErrorMessage(null);
    setLastCompletedPoint(null);

    // SEMPRE do ref: `activePoints` aqui seria a lista do render em que esta
    // closure nasceu, que é anterior a `startCalibrationMode`.
    const pt = activePointsRef.current[pointIdx];
    if (!pt) {
      // Ordem e lista dessincronizadas: abortar é melhor que treinar em alvo
      // errado — era exatamente esse silêncio que fazia o bug de índices
      // trocados entre a UI e o engine passar batido.
      console.error(
        `[calib] alvo ${pointIdx} inexistente na lista da sessão ` +
          `(${activePointsRef.current.length} alvos). Coleta abortada.`
      );
      setErrorMessage('Erro interno na grade de calibração. Tente novamente.');
      setColetando(false);
      setStage('tutorial');
      return;
    }
    setColetando(true);
    calibration.startCollectingPoint?.(pt.x / 100, pt.y / 100, (success: boolean) => {
      if (!isMounted.current) return;
      setColetando(false);
      if (success) {
        retryCountRef.current = 0;
        // A bola parte para o PRÓXIMO alvo já aqui, dentro da pausa de
        // confirmação: é essa janela — sem pulso — que o deslocamento ocupa.
        // Adiar para `startNextPoint` faria a bola deslizar e pulsar ao mesmo
        // tempo, e o pulso deixaria de significar "estou medindo agora".
        const proximo = order[step + 1];
        if (proximo !== undefined) setCurrentIndex(proximo);
        setLastCompletedPoint(pointIdx);
        setCompletedList((prev) => [...prev, pointIdx]);
        setTimeout(() => {
          if (isMounted.current) startNextPoint(step + 1);
        }, 1200);
      } else {
        retryCountRef.current++;
        if (retryCountRef.current >= MAX_RETRIES_PER_POINT) {
          retryCountRef.current = 0;
          // Desistiu deste alvo: a bola segue caminho igual, sem pulso, para
          // o percurso não travar num ponto que não vai render amostra.
          const proximo = order[step + 1];
          if (proximo !== undefined) setCurrentIndex(proximo);
          setCompletedList((prev) => [...prev, pointIdx]);
          setTimeout(() => {
            if (isMounted.current) startNextPoint(step + 1);
          }, 500);
        } else {
          // A mensagem diz a causa real: culpar o movimento quando o
          // problema é a lâmpada faz o paciente tentar se mexer menos, sem
          // efeito nenhum.
          const r = getResumoDoPonto();
          const detalhe = `${r.aceitos}/${r.necessario} amostras`;
          const pitch =
            r.pitchAbsMedioDeg !== null ? `, |pitch| ${r.pitchAbsMedioDeg.toFixed(0)}°` : '';
          // As três causas de bloco zerado eram uma mensagem só, e ela culpava
          // o olhar do paciente. Duas delas são do MODELO — mandar a pessoa
          // parar de se mexer não muda nenhuma das duas. Os números vão junto
          // porque é por eles que se decide se o limiar está mal calibrado.
          const m = r.l2csPorMotivo;
          const dominante =
            m.confianca >= m.implausivel && m.confianca >= m.stale
              ? 'confianca'
              : m.implausivel >= m.stale
                ? 'implausivel'
                : 'stale';
          const msgL2cs =
            dominante === 'confianca'
              ? `Modelo de olhar sem confiança neste ponto (${detalhe}; confiança média ` +
                `${r.confiancaMedia !== null ? r.confiancaMedia.toFixed(3) : '?'} < ` +
                `${r.confiancaMinima}${pitch}). Tentando novamente...`
              : dominante === 'implausivel'
                ? `Ângulo de olhar fora da faixa aceita (${detalhe}${pitch}). ` +
                  `Tentando novamente...`
                : `O sistema perdeu o olhar por um instante (${detalhe}). Tentando novamente...`;
          setErrorMessage(
            r.porQualidade >= r.porL2cs && r.porQualidade > 0
              ? `Imagem ruim neste ponto (${detalhe}) — verifique iluminação e reflexo nos óculos. Tentando novamente...`
              : r.porL2cs > 0
                ? msgL2cs
                : `Poucas amostras neste ponto (${detalhe}) — o rosto pode ter saído do enquadramento. Tentando novamente...`
          );
          setTimeout(() => {
            if (isMounted.current) startNextPoint(step);
          }, 1500);
        }
      }
    });
  };

  // Inicia calibração. `quick=true` reduz para 4 cantos e passa opts.quick
  // para o backend. `opticalCondition` grava o perfil sob a condição
  // escolhida.
  /**
   * Há um modelo treinado que dá para reaproveitar?
   *
   * Lido a cada render de propósito: `isCalibrated()` muda quando um perfil é
   * ativado ou a calibração é invalidada em tempo de execução, e um valor
   * memoizado ofereceria reaproveitar um modelo que já não existe.
   */
  const temCalibracaoSalva = calibration.isCalibrated();

  /**
   * "de hoje", "há 3 dias" — o que decide se vale reaproveitar.
   *
   * O cálculo estava aqui e o menu principal precisa do MESMO texto; duas
   * cópias divergiriam no primeiro ajuste.
   */
  const idadeDaCalibracao = idadeEmTexto(getCalibrationTimestampMs());

  /**
   * Segue com o modelo que já existe, sem coletar ponto nenhum.
   *
   * Mesmo destino do "seguir" da tela de resultado — tutorial na primeira vez,
   * menu depois. Não passa pelo resultado: não houve calibração nova para
   * julgar, e mostrar o veredito do modelo antigo aqui daria a entender que
   * algo foi medido agora.
   */
  const seguirComCalibracaoSalva = () => {
    const destino = perfilAtual && !tutorialConcluido(perfilAtual.id) ? '/tutorial' : '/menu';
    navigate(destino, { replace: true });
  };

  const handleStart = (quick: boolean = false) => {
    if (!l2csReady) return;

    // Se o operador marcou o opt-in E ainda não há gravação ativa (ex.:
    // iniciada manualmente em Configurações), inicia agora. Paramos +
    // exportamos automaticamente após o accuracy test bem-sucedido. NÃO
    // paramos gravação iniciada manualmente em Settings (o
    // `autoRecordOwnedRef` é a distinção). Cancelamentos/redos são
    // descartados em vez de exportados.
    if (autoRecord && !recording.isActive()) {
      recording.start();
      autoRecordOwnedRef.current = true;
      console.log('[calib] gravação iniciada junto com a calibração (opt-in)');
    }

    setCalibrationMode(quick ? 'quick' : 'full');
    setStage('calibrating');
    calibracaoIniciadaEmRef.current = Date.now();
    setCompletedList([]);
    // Nova calibração, novo direito a um reforço (sprint S4).
    reforcoFeitoRef.current = false;

    // A distância MEDIDA nesta sessão manda, quando existe.
    // `viewingDistanceCm` posiciona os alvos pelo orçamento de excentricidade.
    // Enquanto era só digitado, um paciente que sentasse 10 cm mais perto
    // recebia a grade montada para a distância de ontem — e duas gravações
    // reais diferiam 30% em tamanho de rosto exatamente por esse efeito. Fica
    // registrado em `sessionDistanceRef` para o relatório usar a MESMA
    // distância que a grade usou.
    // as duas distâncias são grandezas DIFERENTES e não podem se
    // substituir. Antes desta correção o código fazia
    // `distCm = estimatedDistanceCm ?? settings.viewingDistanceCm`, e a
    // medida de câmera assumia o papel da distância de tela sempre que
    // existisse (isto é, sempre que o FOV estivesse calibrado). Num setup
    // câmera-perto/tela-longe — o RECOMENDADO pelo README — isso colapsava a
    // grade de calibração de 17%/83% para 28%/72%, errava o denominador da
    // compensação de distância (0,76 no lugar de 0,90) e inflava o erro
    // angular do relatório por ~2,4×.
    const { cameraCm, screenCm } = resolveCalibrationDistances({
      measuredCameraDistanceCm: calibration.getCurrentCameraDistanceCm?.() ?? null,
      configuredViewingDistanceCm: settings.viewingDistanceCm,
    });
    sessionDistanceRef.current = screenCm;

    console.log(
      `[calib] distâncias da sessão — tela ${screenCm.toFixed(1)} cm ` +
        `(configurada), câmera ${cameraCm === null ? 'não medida' : `${cameraCm.toFixed(1)} cm`}.`
    );

    const aceitou = calibration.startCalibrationMode?.({
      quick,
      opticalCondition,
      geometry: {
        screenDiagonalIn: settings.screenDiagonalIn,
        // A grade é posicionada por orçamento de excentricidade ANGULAR, que
        // depende da distância até a TELA — o ângulo que o olho precisa girar
        // para alcançar o alvo. A distância até a câmera não tem relação
        // alguma com essa geometria.
        viewingDistanceCm: screenCm,
      },
    });

    // `startCalibrationMode` RECUSA por estado (contraluz forte) devolvendo
    // `false`, sem lançar. Ignorar o retorno deixava a tela entrar em
    // `calibrating` com o motor parado: a bola azul pulsava no primeiro alvo
    // para sempre, sem mensagem e sem saída a não ser o botão Voltar. Aqui a
    // tela volta ao início e diz o motivo, que é acionável (fechar a cortina,
    // virar a mesa) — ao contrário de um travamento mudo.
    if (aceitou === false) {
      const recusa = calibration.getRecusa?.() ?? null;
      console.warn(`[calib] início recusado: ${recusa?.motivo ?? 'motivo desconhecido'}`);
      finalizeAutoRecordingRef.current(false);
      setStage('tutorial');
      setPreparing(false);
      setCompletedList([]);
      setSessionPoints(null);
      setErrorMessage(
        recusa?.mensagem ??
          'Não foi possível começar a calibração agora. Verifique a iluminação e tente de novo.'
      );
      return;
    }

    // Congela as distâncias desta calibração. A compensação de distância usa
    // a VARIAÇÃO em relação a estes dois números para reescalar a predição
    // quando o paciente sentar mais perto ou mais longe depois.
    //
    // DEPOIS da recusa, nunca antes: estas duas variáveis são as MESMAS que o
    // modelo já treinado usa em produção (`mapGaze` → `evaluateDistanceRange`,
    // e o ganho `d·tan Δ` da compensação de pose). Escritas antes, uma recusa
    // por contraluz deixava o modelo em uso com a base de distância da sessão
    // que nem chegou a começar: o paciente sentado 10 cm mais perto passava a
    // ter razão 1,0 no lugar de 0,85, ~140 px de erro na borda em 1080p, sem
    // nenhum sinal na tela.
    calibration.setCalibrationDistancesCm?.(cameraCm, screenCm);

    const targets = calibration.getCalibrationTargets?.() ?? [];
    iniciarSequencia(targets);
  };

  const progressPct =
    activePoints.length > 0 ? (completedList.length / activePoints.length) * 100 : 0;

  // ─── TRANSIÇÃO ────────────────────────────────────────────────────────────
  if (stage === 'transitioning') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: BG,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'cfFadeOut 0.8s ease-in-out forwards',
        }}
      >
        <div
          style={{
            width: '100vw',
            height: '100vh',
            background: `radial-gradient(circle, ${ACCENT} 0%, ${BG} 100%)`,
            animation: 'cfRipple 0.8s ease-out forwards',
          }}
        />
        <style>{`
          @keyframes cfFadeOut { from { opacity:1; } to { opacity:0; } }
          @keyframes cfRipple  { from { transform:scale(0.1); opacity:1; } to { transform:scale(3); opacity:0; } }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <main
        role="main"
        style={{
          position: 'relative',
          width: '100vw',
          height: '100vh',
          background: BG,
          color: TEXT_PRIMARY,
          // A PREPARAÇÃO ROLA; A COLETA NÃO.
          //
          // Era `hidden` sempre, e o conteúdo desta tela — título, painel de
          // prontidão com nove itens, instruções, seletor de condição óptica,
          // botões — passa de uma tela em 1080. O botão de começar ficava
          // inalcançável, e a tela cujo único propósito é sair dela virava um
          // beco. A rolagem por olhar também não salvava: ela procura um
          // ancestral rolável, e `hidden` garante que não existe nenhum.
          //
          // Nos outros estágios continua `hidden`, e isso não é preciosismo:
          // durante a coleta os alvos são posicionados em coordenadas de
          // viewport. Rolar ali deslocaria o alvo em relação ao ponto medido e
          // corromperia a calibração EM SILÊNCIO — sem erro, só com números
          // piores, que ninguém diagnostica lendo o relatório depois.
          overflowY: stage === 'tutorial' ? 'auto' : 'hidden',
          overflowX: 'hidden',
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Botão Voltar */}
        {stage === 'tutorial' && (
          <div style={{ position: 'absolute', top: '2rem', left: '2rem', zIndex: 60 }}>
            <BackButton />
          </div>
        )}

        {/* ─── TUTORIAL / INÍCIO ───────────────────────────────────────── */}
        {stage === 'tutorial' && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              // `alignItems: center` cortava o TOPO quando o conteúdo passava
              // da altura do pai — e o pedaço cortado fica inalcançável mesmo
              // com a rolagem ligada, porque o transbordo sobra para ANTES do
              // início do contêiner. Com `flex-start` o conteúdo cresce para
              // baixo, que é onde a rolagem alcança.
              alignItems: 'flex-start',
              justifyContent: 'center',
              // O topo extra é o respiro do botão de voltar, que flutua em
              // `top: 2rem` e cobriria a primeira linha.
              padding: '5rem 2rem 2rem',
            }}
          >
            <div
              style={{
                maxWidth: 500,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '2rem',
                animation: 'cfFadeUp 0.4s ease-out both',
              }}
            >
              {/* Primeira calibração: é o último passo da primeira abertura, e
                  a barra diz isso. Numa recalibração não há jornada a mostrar. */}
              {!temCalibracaoSalva && <ProgressoDoOnboarding atual="calibracao" />}

              {/* Preview do ponto — mostra ao usuário o que vai aparecer */}
              <div
                style={{
                  position: 'relative',
                  width: 90,
                  height: 90,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, rgba(27, 84, 168, 0.22) 0%, transparent 70%)`,
                    animation: 'cfRadarPing 2s ease-out infinite',
                  }}
                />
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: ACCENT,
                    boxShadow: `0 0 30px ${ACCENT}`,
                    animation: 'cfPulse 1.2s infinite alternate',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: BG,
                    opacity: 0.85,
                  }}
                />
              </div>

              <div>
                <h1
                  className="t-h1"
                  style={{ margin: '0 0 0.75rem', color: TEXT_PRIMARY }}
                >
                  Vamos ensinar o IrisFlow a entender o seu olhar
                </h1>
                <p style={{ fontSize: '1.15rem', color: TEXT_DIM, margin: 0, lineHeight: 1.65 }}>
                  Siga o ponto <strong style={{ color: ACCENT }}>azul</strong> com os olhos.
                </p>
              </div>

              {/* verificação de prontidão do posto de uso.
                  `evaluateReadiness` existia, era testada e correta, e NUNCA
                  tinha chamador de produção. O README anuncia esta tela como
                  recurso; até aqui ela não existia. O item mais caro que ela
                  traz de volta é a checagem de viewport, única defesa contra
                  calibrar em janela não-maximizada — o que infla o erro
                  angular do relatório (/). */}
              {/* O que vai acontecer, quanto tempo leva, e as duas instrucoes que
                  mudam o resultado — inclusive "pisque normalmente", que a
                  versao ingenua ("nao pisque") inverte com o pior efeito
                  possivel: o olho resseca durante a coleta. */}
              {/* Como se posicionar: a referência visual acima dos checks. Só
                  diz "assim"; quem diz "está certo" são as três linhas — por
                  isso a ilustração não muda de cor com o resultado. */}
              <IlustracaoDoRosto largura={240} style={{ margin: '0 auto' }} />
              <ChecksDaCamera onPronto={setChecksProntos} />

              {mostrarDetalhes && <PreparoDaCalibracao />}

              {mostrarDetalhes && <ReadinessPanel />}

              {errorMessage && (
                <div
                  style={{
                    padding: '1rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${DANGER}`,
                    borderRadius: '0.75rem',
                    color: DANGER,
                    fontSize: '0.95rem',
                    maxWidth: 400,
                    lineHeight: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    textAlign: 'left',
                    animation: 'cfFadeUp 0.3s ease-out both',
                  }}
                >
                  <AlertTriangle size={24} style={{ flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: 'block', marginBottom: '0.15rem' }}>
                      Falha na calibração
                    </strong>
                    {errorMessage}
                    <div style={{ marginTop: '0.5rem' }}>
                      <a
                        href="/caregiver/guide"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate('/caregiver/guide?from=/calibration-check');
                        }}
                        style={{
                          color: '#ef4444',
                          fontWeight: 700,
                          textDecoration: 'underline',
                          fontSize: '0.9rem',
                          cursor: 'pointer',
                        }}
                      >
                        Ver Guia de Instalação e Dicas do Cuidador
                      </a>
                    </div>
                  </div>
                </div>
              )}

              <label
                htmlFor="opticalConditionSelect"
                data-testid="optical-condition-label"
                style={{
                  fontSize: '0.9rem',
                  color: TEXT_DIM,
                  alignSelf: 'stretch',
                  textAlign: 'left',
                  fontWeight: 600,
                }}
              >
                Condição óptica do usuário:
              </label>
              <select
                id="opticalConditionSelect"
                data-testid="optical-condition-select"
                value={opticalCondition}
                onChange={(e) => setOpticalCondition(e.target.value as OpticalCondition)}
                data-no-dwell="true"
                style={{
                  alignSelf: 'stretch',
                  padding: '0.75rem 1rem',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '0.75rem',
                  color: TEXT_PRIMARY,
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {OPTICAL_OPTIONS.map((cond) => (
                  <option key={cond} value={cond} style={{ background: '#111' }}>
                    {OPTICAL_LABELS[cond]}
                  </option>
                ))}
              </select>

              <label
                data-testid="auto-record-label"
                style={{
                  alignSelf: 'stretch',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  fontSize: '0.9rem',
                  color: TEXT_DIM,
                  cursor: 'pointer',
                  padding: '0.6rem 0.9rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: '0.75rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={autoRecord}
                  onChange={(e) => setAutoRecord(e.target.checked)}
                  data-no-dwell="true"
                  data-testid="auto-record-checkbox"
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: ACCENT }}
                />
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <strong style={{ color: TEXT_PRIMARY }}>Gravar sessão</strong> junto com esta
                  calibração
                  {isRecording && (
                    <span style={{ color: DANGER, marginLeft: '0.5rem', fontWeight: 700 }}>
                      🔴 gravando
                    </span>
                  )}
                  <br />
                  <span style={{ fontSize: '0.78rem', color: TEXT_DIM }}>
                    Grava calibração + teste de precisão. JSONL baixa automático quando o teste
                    termina. Redo/falha descarta.
                  </span>
                </span>
              </label>

              {/* `data-no-dwell` REMOVIDO daqui.
                  Com ele, um usuário gaze-only não conseguia iniciar a própria
                  (re)calibração: o único caminho para restaurar o rastreamento
                  exigia um cuidador com mouse. Para o público-alvo (ELA, uso
                  possivelmente desacompanhado), isso é perda de autonomia
                  exatamente no momento em que ela mais importa.
                  Em vez de bloquear, um dwell LONGO (`data-dwell-ms`): iniciar
                  a calibração por acidente custa 1–2 min de sessão, então o
                  acionamento tem que ser deliberado — mas possível. */}
              <button
                type="button"
                onClick={() => handleStart(false)}
                disabled={!podeComecar}
                data-dwell-ms="2500"
                data-testid="start-calibration-full"
                aria-disabled={!podeComecar}
                aria-describedby="l2cs-status-message"
                style={{
                  background: podeComecar ? ACCENT : 'rgba(255,255,255,0.10)',
                  color: podeComecar ? '#fff' : TEXT_DIM,
                  border: 'none',
                  padding: '1rem 3rem',
                  borderRadius: '2rem',
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  cursor: podeComecar ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.7rem',
                  transition: 'all 0.2s',
                  boxShadow: podeComecar ? '0 8px 24px rgba(27, 84, 168, 0.40)' : 'none',
                  opacity: podeComecar ? 1 : 0.75,
                }}
                {...hoverAndFocus(
                  (el) => {
                    if (l2csReady) {
                      el.style.transform = 'translateY(-2px)';
                      el.style.boxShadow = '0 12px 32px rgba(27, 84, 168, 0.55)';
                    }
                  },
                  (el) => {
                    if (l2csReady) {
                      el.style.transform = '';
                      el.style.boxShadow = '0 8px 24px rgba(27, 84, 168, 0.40)';
                    }
                  }
                )}
              >
                {l2csReady &&
                  (checksProntos
                    ? `👁  Começar (${nominalPoints.length} pontos)`
                    : 'Ajuste a câmera para começar')}
                {l2csStatus === 'loading' && (
                  <>
                    <Loader2 size={20} style={{ animation: 'cfSpin 1s linear infinite' }} />
                    Carregando...
                  </>
                )}
                {l2csFailed && (
                  <>
                    <AlertTriangle size={20} />
                    Modelo indisponível
                  </>
                )}
              </button>

              {/* Reaproveitar a calibração salva.
                  Refazer nove pontos é um a dois minutos de fixação para quem
                  tem ELA, e nem sempre há o que ganhar: se a posição não mudou,
                  o modelo de ontem vale.
                  A IDADE vai junto de propósito. "Salva" sozinho não ajuda a
                  decidir; uma calibração de semanas atrás, feita com o paciente
                  noutra posição, é pior que refazer — e só a data denuncia
                  isso. */}
              {temCalibracaoSalva && (
                <button
                  type="button"
                  onClick={seguirComCalibracaoSalva}
                  data-dwell-ms="2000"
                  data-testid="usar-calibracao-salva"
                  style={{
                    background: 'transparent',
                    color: TEXT_PRIMARY,
                    border: `1px solid ${ACCENT}`,
                    padding: '0.85rem 2rem',
                    borderRadius: '2rem',
                    fontSize: '1rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                  }}
                >
                  Usar a calibração salva ({idadeDaCalibracao})
                </button>
              )}

              {l2csReady && (
                <button
                  type="button"
                  onClick={() => handleStart(true)}
                  /* idem ao botão da calibração completa: dwell longo em vez de
                     bloqueio, para a recalibração rápida ser alcançável só
                     com o olhar. */
                  data-dwell-ms="2500"
                  data-testid="start-calibration-quick"
                  style={{
                    background: 'transparent',
                    color: TEXT_PRIMARY,
                    border: `1px solid rgba(255,255,255,0.35)`,
                    padding: '0.7rem 2.2rem',
                    borderRadius: '2rem',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  {...hoverAndFocusBackground('transparent', 'rgba(255,255,255,0.08)')}
                >
                  Recalibração rápida (4 pontos)
                </button>
              )}

              <div
                id="l2cs-status-message"
                role={l2csFailed ? 'alert' : 'status'}
                aria-live="polite"
                style={{
                  fontSize: '0.88rem',
                  color: l2csFailed ? DANGER : TEXT_DIM,
                  minHeight: '1.4rem',
                  maxWidth: 400,
                  lineHeight: 1.5,
                }}
              >
                {l2csStatus === 'loading' &&
                  'Aguardando o modelo (~10-15s na 1ª vez). Não feche a página.'}
                {l2csFailed &&
                  'Não foi possível carregar o modelo. Recarregue a página e tente novamente.'}
              </div>
            </div>
          </div>
        )}

        {/* ─── CALIBRANDO ──────────────────────────────────────────────── */}
        {stage === 'calibrating' && (
          <>
            {isRecording && (
              <div
                data-testid="recording-indicator"
                style={{
                  position: 'absolute',
                  top: '1.25rem',
                  right: '1.5rem',
                  zIndex: 45,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.7rem',
                  background: 'rgba(239,68,68,0.10)',
                  border: `1px solid ${DANGER}`,
                  borderRadius: '999px',
                  color: DANGER,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: DANGER,
                    animation: 'cfPulseRed 1.2s infinite alternate',
                  }}
                />
                Gravando
              </div>
            )}

            {/* Barra de progresso — discreta, no topo, não distrai o olhar */}
            <div
              style={{
                position: 'absolute',
                top: '1.25rem',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <div
                style={{
                  width: 130,
                  height: 4,
                  background: 'rgba(255,255,255,0.10)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    background: ACCENT,
                    transition: 'width 0.5s ease-out',
                    borderRadius: 2,
                  }}
                />
              </div>
              <span
                style={{ fontSize: '0.8rem', color: TEXT_DIM, fontVariantNumeric: 'tabular-nums' }}
              >
                {String(completedList.length).padStart(2, '0')} /{' '}
                <span data-testid="calib-progress-total">
                  {String(activePoints.length).padStart(2, '0')}
                </span>
              </span>
            </div>

            {/* Instrução contextual — só quando necessário (prepare-se / erro) */}
            {(preparing || errorMessage) && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '2.5rem',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 40,
                  padding: '0.7rem 2rem',
                  background: errorMessage ? 'rgba(239,68,68,0.12)' : 'rgba(27, 84, 168, 0.10)',
                  border: `1px solid ${errorMessage ? DANGER : ACCENT}`,
                  borderRadius: '3rem',
                  color: errorMessage ? DANGER : ACCENT,
                  fontSize: '1.05rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {errorMessage ?? '👁  Siga o ponto com os olhos.'}
              </div>
            )}

            {/* ── A bola ───────────────────────────────────────────────────
                UMA bola percorre a grade inteira. Não é um elemento por alvo:
                é o MESMO nó mudando de posição, e é essa continuidade que
                deixa o olho PERSEGUIR a bola. Nove elementos que acendem e
                apagam dariam nove saltos sacádicos, e o olho chega no alvo
                novo depois que a janela de coleta já abriu.

                O marcador cinza de "o alvo vai aparecer aqui" saiu de vez: ele
                disputava a fixação com o único ponto que se quer fixar, e
                sobre fundo preto qualquer segundo ponto claro é distrator.

                São dois nós porque as duas animações precisam de `transform`
                ao mesmo tempo: o externo POSICIONA (translate + transição) e o
                interno PULSA (scale). Num nó só, a animação do pulso
                sobrescreveria a posição e a bola voltaria para o canto. */}
            {alvoDaBola && (
              <div
                data-testid="calib-bola"
                data-calibration-target=""
                data-coletando={coletando ? 'true' : 'false'}
                aria-hidden="true"
                className="cf-bola-posicao"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: TAMANHO_DA_BOLA_PX,
                  height: TAMANHO_DA_BOLA_PX,
                  zIndex: 30,
                  // SEM `pointer-events: none`, de propósito. O
                  // `EmergencyContext` esconde o botão de socorro quando um
                  // `[data-calibration-target]` passa por baixo dele, e a
                  // busca é por `elementsFromPoint` — que não devolve
                  // elemento com `pointer-events: none`. A bola sumiria atrás
                  // do botão e aquele ponto seria coletado com o paciente
                  // olhando para outra coisa. A bola não é alvo de dwell de
                  // qualquer jeito: durante a coleta só a emergência é
                  // acionável (ver o dispatcher no `GazeContext`).
                  willChange: 'transform',
                  // `vw`/`vh` e não `left`/`top` em %: a transição de
                  // `transform` roda no compositor e não invalida layout —
                  // e o contêiner desta tela é exatamente 100vw × 100vh.
                  // O `-50%` centraliza a bola no alvo (é do tamanho DELA).
                  transform: `translate3d(calc(${alvoDaBola.x}vw - 50%), calc(${alvoDaBola.y}vh - 50%), 0)`,
                  transition: `transform ${DESLOCAMENTO_DA_BOLA_MS}ms cubic-bezier(0.33, 0, 0.2, 1)`,
                }}
              >
                <div
                  className={`cf-bola${coletando ? ' cf-bola--coletando' : ''}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    // `color` é a tinta da bola INTEIRA: o preenchimento, os
                    // dois anéis e o halo do pulso saem todos de
                    // `currentColor`. Uma cor cravada no CSS deixaria o brilho
                    // azul em volta de uma bola verde no instante da
                    // confirmação.
                    color: tintaDaBola,
                    backgroundColor: tintaDaBola,
                    // 2E ≈ 18 % e BF ≈ 75 % de opacidade: o anel colado e o
                    // brilho externo, a mesma geometria do alvo antigo.
                    boxShadow: `0 0 0 8px ${tintaDaBola}2E, 0 0 36px ${tintaDaBola}BF`,
                    transition:
                      'color 220ms ease, background-color 220ms ease, box-shadow 220ms ease',
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* ─── TESTING ─────────────────────────────────────────────────── */}
        {stage === 'testing' && falhaDoTeste && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
            }}
          >
            <div
              role="alertdialog"
              aria-label="Falha ao iniciar o teste de precisão"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1.25rem',
                maxWidth: 620,
              }}
            >
              <AlertTriangle size={48} color="#f59e0b" aria-hidden="true" />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: TEXT_PRIMARY }}>
                O teste de precisão não começou
              </h2>
              <p style={{ color: TEXT_DIM, fontSize: '1.02rem', margin: 0, lineHeight: 1.6 }}>
                {falhaDoTeste} A calibração foi treinada e continua valendo — só a medição não
                rodou.
              </p>
              <div
                style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setFalhaDoTeste(null);
                    runAccuracyTestThenExit();
                  }}
                  style={{
                    background: ACCENT,
                    color: '#fff',
                    border: 'none',
                    padding: '1rem 2.4rem',
                    borderRadius: '2rem',
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Tentar de novo
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/menu')}
                  style={{
                    background: 'transparent',
                    color: TEXT_DIM,
                    border: '1px solid rgba(255,255,255,0.25)',
                    padding: '1rem 2.4rem',
                    borderRadius: '2rem',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Ir para o menu
                </button>
              </div>
            </div>
          </div>
        )}

        {stage === 'testing' && !falhaDoTeste && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1.5rem',
                animation: 'cfFadeUp 0.4s ease-out both',
              }}
            >
              <Loader2
                size={52}
                color={ACCENT}
                style={{ animation: 'cfSpin 1s linear infinite' }}
              />
              <div>
                <h2
                  style={{
                    fontSize: '1.65rem',
                    fontWeight: 800,
                    margin: '0 0 0.5rem',
                    color: TEXT_PRIMARY,
                  }}
                >
                  Iniciando teste de precisão
                </h2>
                <p style={{ color: TEXT_DIM, fontSize: '1rem', margin: 0, lineHeight: 1.6 }}>
                  Não se mexa. Olhe para os pontos que aparecerem.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ───: DERIVA DE POSE DURANTE A CALIBRAÇÃO ─────────────── */}
        {stage === 'drift-warning' && (driftVerdict || alvosPulados > 0) && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
            }}
          >
            <div
              role="alertdialog"
              aria-labelledby="drift-title"
              aria-describedby="drift-msg"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1.5rem',
                maxWidth: 620,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '1.5rem',
                padding: '2.5rem',
                animation: 'cfFadeUp 0.4s ease-out both',
              }}
            >
              <AlertTriangle size={52} color="#f59e0b" aria-hidden="true" />

              <div>
                <h2
                  id="drift-title"
                  style={{
                    fontSize: '1.65rem',
                    fontWeight: 800,
                    margin: '0 0 0.75rem',
                    color: TEXT_PRIMARY,
                  }}
                >
                  {driftVerdict
                    ? 'A cabeça se moveu durante a calibração'
                    : 'Alguns pontos não foram medidos'}
                </h2>
                <p
                  id="drift-msg"
                  style={{ color: TEXT_DIM, fontSize: '1.05rem', margin: 0, lineHeight: 1.65 }}
                >
                  {driftVerdict?.mensagem}
                  {alvosPulados > 0 && (
                    <>
                      {driftVerdict ? ' ' : ''}
                      {alvosPulados === 1
                        ? '1 ponto foi ignorado — recomendamos refazer.'
                        : `${alvosPulados} pontos foram ignorados — recomendamos refazer.`}
                    </>
                  )}
                </p>
              </div>

              {/* O número medido fica visível: é o que separa "achei que mexi" de
                  "mexi 238px-equivalentes". */}
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                <div>
                  <div
                    data-testid="drift-px"
                    style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b' }}
                  >
                    {driftVerdict ? `${driftVerdict.piorEixoPx.toFixed(0)}px` : '—'}
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: TEXT_DIM,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    deriva equivalente
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: TEXT_PRIMARY }}>
                    {driftVerdict ? (driftVerdict.monotona ? 'Progressiva' : 'Errática') : '—'}
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: TEXT_DIM,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    padrão do movimento
                  </div>
                </div>
              </div>

              {/* Estes dois botões são a ÚNICA saída deste diálogo. Com
                  `data-no-dwell` o dispatcher os marcava como desabilitados e
                  um usuário gaze-only ficava preso aqui para sempre — a mesma
                  perda de autonomia que motivou tirar o atributo do botão de
                  começar (ver acima). Em vez de bloquear, dwell LONGO: refazer
                  a calibração por acidente custa 1–2 min de sessão. */}
              <div
                style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}
              >
                {/* Recalibrar vem primeiro: é a ação que corrige o problema. */}
                <button
                  type="button"
                  data-dwell-ms="2500"
                  data-testid="drift-recalibrar"
                  onClick={() => {
                    setDriftVerdict(null);
                    setAlvosPulados(0);
                    handleStart(false);
                  }}
                  style={{
                    background: ACCENT,
                    color: '#fff',
                    border: 'none',
                    padding: '1rem 2.4rem',
                    borderRadius: '2rem',
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Refazer calibração
                </button>
                {/* Seguir assim continua possível — para um usuário com ELA,
                    repetir a coleta custa fadiga real. Mas é escolha informada. */}
                <button
                  type="button"
                  data-dwell-ms="2500"
                  data-testid="drift-continuar"
                  onClick={() => {
                    setStage('testing');
                    // Mesma proteção do caminho automático: sem ela uma exceção
                    // aqui deixava o spinner girando sem nada dito ao operador.
                    try {
                      runAccuracyTestThenExit();
                    } catch (e) {
                      console.error('[React] falha ao iniciar o teste de precisão:', e);
                      finalizeAutoRecordingRef.current(false);
                      setFalhaDoTeste(e instanceof Error ? e.message : String(e));
                    }
                  }}
                  style={{
                    background: 'transparent',
                    color: TEXT_PRIMARY,
                    border: '1px solid rgba(255,255,255,0.35)',
                    padding: '1rem 2rem',
                    borderRadius: '2rem',
                    fontSize: '0.98rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Continuar mesmo assim
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── KEYFRAMES ───────────────────────────────────────────────── */}
        <style>{`
          @keyframes cfPulse {
            0%   { transform: scale(0.88); box-shadow: 0 0 0 8px rgba(27, 84, 168, 0.15), 0 0 18px #1B54A8; }
            100% { transform: scale(1.10); box-shadow: 0 0 0 12px rgba(27, 84, 168, 0.05), 0 0 44px #1B54A8; }
          }
          @keyframes cfRadarPing {
            0%   { transform: scale(0.1); opacity: 0.9; }
            100% { transform: scale(2.8); opacity: 0; }
          }
          @keyframes cfSpin    { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
          @keyframes cfFadeUp  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
          @keyframes cfPulseRed { from { opacity: 0.55; } to { opacity: 1; } }

          /*
           * A bola que percorre a grade.
           *
           * Só as propriedades transform e opacity animam — as duas que o
           * compositor resolve sozinho. Um box-shadow animado repintaria o
           * halo inteiro a cada quadro, e este é o único elemento em
           * movimento numa tela em que a fixação do paciente É o dado sendo
           * medido: qualquer engasgo aqui vira amostra ruim.
           */
          .cf-bola { position: relative; }
          /* O halo do pulso herda a tinta da bola por currentColor: azul
             enquanto mede, verde no instante em que o ponto fecha. */
          .cf-bola::after {
            content: '';
            position: absolute;
            inset: -20px;
            border-radius: 50%;
            background: radial-gradient(circle, currentColor 0%, transparent 70%);
            opacity: 0;
            pointer-events: none;
          }

          /* O pulso é o sinal de "estou medindo AGORA". Existe só enquanto a
             janela de coleta está aberta — ver o estado coletando. */
          .cf-bola--coletando { animation: cfBolaPulso 1.1s ease-in-out infinite alternate; }
          .cf-bola--coletando::after { animation: cfBolaHalo 1.1s ease-in-out infinite alternate; }

          @keyframes cfBolaPulso {
            from { transform: scale(0.90); }
            to   { transform: scale(1.14); }
          }
          @keyframes cfBolaHalo {
            from { opacity: 0.10; transform: scale(0.80); }
            to   { opacity: 0.32; transform: scale(1.25); }
          }

          /* Quem pediu menos movimento recebe a bola PARADA: ela reposiciona
             de um alvo para o outro sem deslizar e sem pulsar. O alvo continua
             óbvio — é o único ponto aceso na tela. */
          @media (prefers-reduced-motion: reduce) {
            .cf-bola,
            .cf-bola::after { animation: none !important; }
            .cf-bola-posicao { transition: none !important; }
          }
        `}</style>
      </main>
    </>
  );
};
