import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EXPERIMENT } from '@tracker/config/experiment';
import { tamanhoDoCursorNoSistema } from '@tracker/computador/geometria';
import type { CapacidadesDoSistema } from '@tracker/computador/protocolo';
import { useGaze, suspenderDwell } from '../context/GazeContext';
import { aprenderComSelecao, deveAprender, registrarAcaoDoUsuario } from '@tracker/interaction/correcaoPorDwell';
import { HistoricoDoOlhar } from '@tracker/interaction/janelaDoDwell';
import { getSaturacaoDoOlhar, getUltimaPredicaoSemCorrecao } from '@tracker/calibration';
import { modoApresentacaoAtivo } from '../services/apresentacao';
import { useSettings } from '../context/SettingsContext';
import { limitarDwellMs } from '../dwellMs';
import { mensagemDeSaida, ponteDoModoComputador, type PonteDoModoComputador } from './ponte';

/**
 * Liga e desliga o Modo Computador a partir do app.
 *
 * Enquanto ativo, cada amostra do motor vai para o processo principal, que a
 * converte para a tela e a entrega à sobreposição. O app fica escondido; quem
 * termina o modo é a sobreposição (botão "IrisFlow", "Socorro", inatividade)
 * ou o sistema (tela mudou). O motivo volta por `onParou`, e é aqui que
 * "Socorro" vira a tela de emergência do app.
 */
export interface ModoComputador {
  disponivel: boolean;
  capacidades: CapacidadesDoSistema | null;
  ativo: boolean;
  iniciando: boolean;
  erro: string | null;
  aviso: string | null;
  iniciar: () => Promise<void>;
  parar: () => Promise<void>;
}

export function useModoComputador(ponte: PonteDoModoComputador | null = ponteDoModoComputador()): ModoComputador {
  const navigate = useNavigate();
  const { subscribe } = useGaze();
  const { settings } = useSettings();
  const [capacidades, setCapacidades] = useState<CapacidadesDoSistema | null>(null);
  const [ativo, setAtivo] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cancelarFluxoRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!ponte) return;
    let vivo = true;
    void ponte.capacidades().then((c) => { if (vivo) setCapacidades(c); }).catch(() => { if (vivo) setCapacidades(null); });
    return () => { vivo = false; };
  }, [ponte]);

  const ativoRef = useRef(false);

  /**
   * Fica `false` quando o hook desmonta.
   *
   * `iniciar()` espera o IPC que sobe a sobreposição nativa, e só DEPOIS
   * suspende o dwell do app e assina o olhar. Se a tela sair de cena durante
   * essa espera — o próprio `onParou('emergencia')` navega, e a limpeza abaixo
   * documenta que um banner também pode —, a limpeza roda ANTES da
   * continuação: ela devolve o dwell, e em seguida a continuação o suspende de
   * novo, para sempre. `dwellSuspenso` é global no `GazeContext` e o único
   * caller de `suspenderDwell(false)` é este hook, que já não existe mais.
   * Resultado: clique por olhar e por piscada mortos no app inteiro, sem
   * recuperação a não ser recarregar — perda total de entrada para quem só
   * tem o olhar.
   */
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // Corta o fluxo de olhar e devolve o dwell ao app. Chamado em toda saída.
  const pararFluxo = useCallback(() => {
    cancelarFluxoRef.current?.();
    cancelarFluxoRef.current = null;
    suspenderDwell(false);
    ativoRef.current = false;
  }, []);

  useEffect(() => {
    if (!ponte) return;
    const off = ponte.onParou((motivo) => {
      pararFluxo();
      setAtivo(false);
      setIniciando(false);
      if (motivo === 'emergencia') {
        navigate('/emergency?autoTrigger=other');
        return;
      }
      setAviso(mensagemDeSaida(motivo));
    });
    return () => {
      off();
      // A tela saiu de cena com o modo ligado (um banner navegou, por
      // exemplo): encerra no sistema também, senão o app fica escondido sem
      // ninguém ouvindo o `parou`.
      if (ativoRef.current) void ponte.parar();
      pararFluxo();
    };
  }, [ponte, navigate, pararFluxo]);

  const iniciar = useCallback(async () => {
    if (!ponte || ativo || iniciando) return;
    setErro(null);
    setAviso(null);
    setIniciando(true);
    const dwellMs = limitarDwellMs(settings.dwellMs);
    const r = await ponte.iniciar({
      dwellMs,
      tamanhoCursorPx: tamanhoDoCursorNoSistema(EXPERIMENT.cursorSizePx),
      lupa: true,
    });
    if (!montado.current) {
      // A tela saiu enquanto a sobreposição subia. Se ela SUBIU, precisa
      // descer: a limpeza do efeito já passou e viu `ativoRef.current === false`,
      // então ninguém mais vai derrubá-la.
      if (r.ok) void ponte.parar();
      return;
    }
    if (!r.ok) {
      setIniciando(false);
      setErro(r.motivo);
      return;
    }
    pararFluxo();
    // Dwell do app suspenso ANTES de ligar o fluxo: a janela fica oculta e o
    // olhar passa a ser da sobreposição.
    suspenderDwell(true);
    ativoRef.current = true;
    // Rótulos da sobreposição → correção por dwell. É o único caminho pelo
    // qual ela aprende no Modo Computador: a janela do app está oculta e
    // nenhuma seleção "do app" acontece ali. O alvo é sempre desenhado por nós
    // (barra ou teclado flutuante), logo `alvoIsolado`; `degradado` já foi
    // filtrado na sobreposição, que não manda seleção de amostra degradada.
    // Correção por dwell em malha aberta (M15): a predição antes da correção
    // de cada quadro, para medir a janela estável do dwell da sobreposição.
    const historico = new HistoricoDoOlhar();
    const cancelarSelecao = ponte.onSelecao?.((sel) => {
      if (!ativoRef.current) return;
      const agora = performance.now();
      // Toda seleção encerra a quarentena do rótulo anterior; a sobreposição
      // não tem desfazer.
      registrarAcaoDoUsuario({ desfazer: false, agoraMs: agora });
      const ok = deveAprender({
        alvoIsolado: true,
        origem: 'overlay',
        tamanhoDoAlvoPx: sel.tamanhoPx,
        degradado: false,
        apresentacao: modoApresentacaoAtivo(),
        emergencia: false,
        alvoEspecial: false,
        saturado: getSaturacaoDoOlhar().fora,
      });
      if (!ok) return;
      aprenderComSelecao({
        centroDoAlvo: sel.centro,
        olhar: sel.olhar,
        agoraMs: agora,
        viewport: {
          largura: document.documentElement.clientWidth,
          altura: document.documentElement.clientHeight,
        },
        origem: 'overlay',
        tamanhoDoAlvoPx: sel.tamanhoPx,
        // O relógio da sobreposição é de outro processo (`sel.t` só ordena):
        // a janela é o dwell que terminou agora, pelo relógio daqui.
        medida: EXPERIMENT.correcaoPorDwellKalman ? historico.medir(agora - dwellMs, agora) : null,
        ladoDoAlvoPx: { largura: sel.tamanhoPx, altura: sel.tamanhoPx },
      });
    }) ?? null;
    const cancelarOlhar = subscribe((s) => {
      if (EXPERIMENT.correcaoPorDwellKalman && s.hasFace && s.eyeState !== 'closed' && s.uncalibrated !== true) {
        const pre = getUltimaPredicaoSemCorrecao();
        if (pre) {
          historico.registrar({
            t: Number.isFinite(s.timestamp) ? s.timestamp : performance.now(),
            x: pre.x * document.documentElement.clientWidth,
            y: pre.y * document.documentElement.clientHeight,
            saturada: getSaturacaoDoOlhar().fora,
          });
        }
      }
      ponte.olhar({
        x: s.x,
        y: s.y,
        t: Number.isFinite(s.timestamp) ? s.timestamp : performance.now(),
        hasFace: s.hasFace,
        eyeState: s.eyeState ?? 'unknown',
        degraded: s.degraded === true,
        uncalibrated: s.uncalibrated === true,
      });
    });
    cancelarFluxoRef.current = () => {
      cancelarOlhar();
      cancelarSelecao?.();
    };
    setIniciando(false);
    setAtivo(true);
  }, [ponte, ativo, iniciando, settings.dwellMs, subscribe, pararFluxo]);

  const parar = useCallback(async () => {
    if (!ponte) return;
    pararFluxo();
    await ponte.parar();
    setAtivo(false);
  }, [ponte, pararFluxo]);

  return {
    disponivel: ponte !== null,
    capacidades,
    ativo,
    iniciando,
    erro,
    aviso,
    iniciar,
    parar,
  };
}
