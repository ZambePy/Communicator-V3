import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MousePointerClick,
  MousePointer2,
  Move,
  MoveVertical,
  Keyboard,
  ZoomIn,
  Pin,
  Pause,
  Play,
  TriangleAlert,
  Home,
  CornerDownLeft,
  Delete,
  ArrowBigUp,
  ArrowLeft,
  ArrowRight,
  X,
} from 'lucide-react';
import {
  createDwellState,
  stepDwell,
  configComTolerancia,
  DEFAULT_DWELL_CONFIG,
  type DwellState,
  type DwellTarget,
} from '@tracker/interaction/dwell';
import { EXPERIMENT } from '@tracker/config/experiment';
import { estiloDoCursor } from '@tracker/interaction/cursorStyle';
import { geometriaDoAnel } from '@tracker/interaction/dwellRing';
import { SeguidorDeCursor, IDADE_MAXIMA_MS } from '@tracker/interaction/seguidorDeCursor';
import { PlanejadorDoCursor, transicaoDoPasso } from '@tracker/interaction/cursorNoCompositor';
import { ALVO_MINIMO_OVERLAY_PX } from '@tracker/interaction/correcaoPorDwell';
import type { AmostraDeOlhar, ConfiguracaoDoModo, AcaoDoSistema } from '@tracker/computador/protocolo';
import type { Ponto } from '@tracker/computador/geometria';
import {
  ESTADO_INICIAL,
  LUPA_RAIO_PX,
  LUPA_ZOOM,
  ROLAGEM_ZONA_MORTA_PX,
  reduzir,
  descricaoDoEstado,
  type EstadoDaMaquina,
  type EventoDaMaquina,
  type IdDeBotao,
  type Efeito,
} from './maquina';
import { pontePara } from './ponte';
import { geometriaDaBarra, ESPACO_ENTRE_BOTOES_PX } from './geometriaDaBarra';

/**
 * A sobreposição: o que o paciente vê por cima do Windows.
 *
 *   - cursor pequeno com anel de progresso (o mesmo desenho do app, menor);
 *   - barra lateral de ações (armar tarefa, teclado, lupa, fixar, pausar,
 *     emergência, voltar ao IrisFlow);
 *   - painel da lupa (região ampliada) e teclado, quando abertos;
 *   - uma linha de estado no canto superior esquerdo.
 *
 * O dwell é o do core (`stepDwell`), com uma diferença: sobre a ÁREA (que
 * não tem elementos) o "alvo" é uma fixação — um ponto que vale enquanto o
 * olhar fica a menos de `RAIO_DE_FIXACAO_PX` dele. Sem isso, olhar 1,5 s para
 * qualquer lugar da tela contaria como dwell, e ler um parágrafo clicaria.
 */

const RAIO_DE_FIXACAO_PX = 35;
const RAIO_DE_FIXACAO_NA_LUPA_PX = 24;
const LUPA_CANCELA_APOS_MS = 1200;
const INATIVIDADE_MS = 3 * 60_000;
const CORES = {
  painel: 'rgba(15, 23, 42, 0.86)',
  borda: 'rgba(148, 163, 184, 0.35)',
  texto: '#f8fafc',
  ativo: '#38bdf8',
  emergencia: '#dc2626',
  voltar: '#22c55e',
};

type Icone = React.ComponentType<{ size?: number; style?: React.CSSProperties }>;

interface BotaoDaBarra {
  id: IdDeBotao;
  rotulo: string;
  /** O componente, não o elemento: o tamanho do ícone acompanha o do botão. */
  Icone: Icone;
  /** Espelhado na horizontal (o "Direito" é o ponteiro do "Duplo" virado). */
  espelhado?: boolean;
  cor?: string;
}

const BOTOES: BotaoDaBarra[] = [
  { id: 'clique', rotulo: 'Clicar', Icone: MousePointerClick },
  { id: 'duplo', rotulo: 'Duplo', Icone: MousePointer2 },
  { id: 'direito', rotulo: 'Direito', Icone: MousePointer2, espelhado: true },
  { id: 'arrastar', rotulo: 'Arrastar', Icone: Move },
  { id: 'rolar', rotulo: 'Rolar', Icone: MoveVertical },
  { id: 'teclado', rotulo: 'Teclado', Icone: Keyboard },
  { id: 'lupa', rotulo: 'Lupa', Icone: ZoomIn },
  { id: 'fixar', rotulo: 'Fixar', Icone: Pin },
  { id: 'pausar', rotulo: 'Pausar', Icone: Pause },
  { id: 'emergencia', rotulo: 'Socorro', Icone: TriangleAlert, cor: CORES.emergencia },
  { id: 'voltar', rotulo: 'IrisFlow', Icone: Home, cor: CORES.voltar },
];

const LINHAS_DO_TECLADO: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç'],
  ['maiuscula', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'apagar'],
  ['á', 'é', 'í', 'ó', 'ú', 'â', 'ê', 'ô', 'ã', 'õ'],
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['.', ',', '?', '!', '@', '-', '_', ':', '/', "'"],
  ['esquerda', 'direita', 'espaco', 'enter', 'ctrl+c', 'ctrl+v', 'fechar'],
];

const ROTULO_DA_TECLA: Record<string, React.ReactNode> = {
  maiuscula: <ArrowBigUp size={22} />,
  apagar: <Delete size={22} />,
  espaco: 'espaço',
  enter: <CornerDownLeft size={22} />,
  esquerda: <ArrowLeft size={22} />,
  direita: <ArrowRight size={22} />,
  fechar: <X size={22} />,
  'ctrl+c': 'copiar',
  'ctrl+v': 'colar',
};

const idDaTecla = (k: string) => (k.length === 1 ? `c:${k}` : k);

interface Fixacao {
  key: object;
  ponto: Ponto;
}

export const Overlay: React.FC = () => {
  const ponte = useMemo(() => pontePara(window), []);
  const [config, setConfig] = useState<ConfiguracaoDoModo | null>(null);
  const [estado, setEstado] = useState<EstadoDaMaquina>(ESTADO_INICIAL);
  const [semOlhar, setSemOlhar] = useState(false);
  const estadoRef = useRef<EstadoDaMaquina>(ESTADO_INICIAL);
  const configRef = useRef<ConfiguracaoDoModo | null>(null);
  const dwellRef = useRef<DwellState>(createDwellState());
  const fixacaoRef = useRef<Fixacao | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  /** Ver o laço de pintura no efeito do olhar: separa render de inferência. */
  const seguidorRef = useRef(new SeguidorDeCursor());
  /**
   * Cursor pelo compositor (`EXPERIMENT.cursorPeloCompositor`, o padrão): o
   * mesmo da janela do app — destino e travessia escritos uma vez por
   * amostra, quadros intermediários desenhados pelo compositor. Ver
   * `interaction/cursorNoCompositor.ts`.
   */
  const planejadorRef = useRef(new PlanejadorDoCursor());
  const pinturaRef = useRef<{
    offsetPx: number; escala: number; opacidade: string; fundo: string; sombra: string; borda: string;
    anel: { tamanhoPx: number; pct: number } | null;
  } | null>(null);
  const anelRef = useRef<SVGCircleElement>(null);
  const realceRef = useRef<HTMLElement | null>(null);
  const foraDaLupaDesdeRef = useRef<number | null>(null);
  const ultimoRostoRef = useRef<number>(performance.now());
  const lupaPedidoRef = useRef(0);

  // `despachar` e `executarEfeito` se chamam mutuamente (a lupa despacha o
  // resultado da captura); o ref quebra o ciclo sem re-assinar o olhar.
  const despacharRef = useRef<(evento: EventoDaMaquina) => void>(() => {});
  const despachar = useCallback((evento: EventoDaMaquina) => despacharRef.current(evento), []);

  const executarEfeito = (ef: Efeito): void => {
    if (ef.tipo === 'acao') {
      void ponte.acao(ef.acao).then((r) => {
        if (!r.ok) console.warn('[overlay] ação recusada', ef.acao.tipo, r.erro);
      });
      return;
    }
    // Lupa: pede a captura e, quando chega, abre o painel. Um pedido antigo
    // que chegue depois de o paciente ter cancelado é descartado.
    const pedido = ++lupaPedidoRef.current;
    const acao: AcaoDoSistema = { tipo: 'lupa', ponto: ef.ponto, raioPx: LUPA_RAIO_PX };
    void ponte.acao(acao).then((r) => {
      if (pedido !== lupaPedidoRef.current) return;
      if (r.ok && 'lupa' in r) despachar({ tipo: 'lupaPronta', regiao: r.lupa.regiao, imagem: r.lupa.imagem });
      else despachar({ tipo: 'lupaFalhou' });
    });
  };

  despacharRef.current = (evento: EventoDaMaquina) => {
    const { estado: novo, efeitos } = reduzir(estadoRef.current, evento);
    if (novo !== estadoRef.current) {
      estadoRef.current = novo;
      setEstado(novo);
    }
    for (const ef of efeitos) executarEfeito(ef);
  };

  useEffect(() => {
    const aplicar = (c: ConfiguracaoDoModo) => {
      if (configRef.current) {
        // Reajuste de escala do monitor (DPI): o main reenvia a configuração
        // com o novo tamanho em DIP. Só a geometria muda; o estado da máquina
        // (dwell em curso, lupa aberta) continua — nada foi invalidado.
        const antes = configRef.current;
        if (antes.monitor.width !== c.monitor.width || antes.monitor.height !== c.monitor.height) {
          configRef.current = { ...antes, monitor: c.monitor };
          setConfig(configRef.current);
        }
        return;
      }
      configRef.current = c;
      setConfig(c);
      estadoRef.current = { ...ESTADO_INICIAL, lupa: c.lupa };
      setEstado(estadoRef.current);
    };
    const off = ponte.onConfig(aplicar);
    // Também PEDE a configuração: se o push do main chegou antes de este
    // ouvinte existir, a página ficaria transparente e sem barra — com o app
    // escondido atrás. Os dois caminhos convergem em `aplicar`.
    void ponte.acao({ tipo: 'pronto' }).then((r) => {
      if (r.ok && 'config' in r) aplicar(r.config);
    });
    return off;
  }, [ponte]);

  // Inatividade: sem rosto por muito tempo, volta ao IrisFlow. O paciente
  // que saiu da frente da tela não pode voltar e achar o Windows "travado".
  useEffect(() => {
    const t = setInterval(() => {
      const idade = performance.now() - ultimoRostoRef.current;
      setSemOlhar(idade > 4000);
      if (idade > INATIVIDADE_MS) void ponte.acao({ tipo: 'sair', motivo: 'inatividade' });
    }, 1000);
    return () => clearInterval(t);
  }, [ponte]);

  /** Resolve o alvo do dwell para uma amostra: elemento da UI ou fixação. */
  const resolverAlvo = (a: AmostraDeOlhar): { target: DwellTarget | null; tipo: 'botao' | 'tecla' | 'lupa' | 'area' | null; el: HTMLElement | null } => {
    const e = estadoRef.current;
    const elemento = (document.elementFromPoint(a.x, a.y) as Element | null)?.closest<HTMLElement>('[data-alvo]') ?? null;
    if (elemento) {
      const id = elemento.dataset.alvo ?? '';
      const tipo = id.startsWith('botao:') ? 'botao' : id.startsWith('tecla:') ? 'tecla' : id === 'lupa-area' ? 'lupa' : null;
      if (tipo === 'lupa') {
        const fix = fixacao(a, RAIO_DE_FIXACAO_NA_LUPA_PX);
        return { target: { key: fix.key, customDwellMs: null, isEmergency: false, isRecovery: false, isDisabled: false }, tipo, el: elemento };
      }
      if (tipo) {
        fixacaoRef.current = null;
        return {
          target: {
            key: elemento,
            customDwellMs: null,
            isEmergency: id === 'botao:emergencia',
            isRecovery: id === 'botao:voltar',
            isDisabled: elemento.getAttribute('aria-disabled') === 'true',
          },
          tipo,
          el: elemento,
        };
      }
    }
    // Área: só conta quando há algo para fazer com a fixação. Rolando, só a
    // zona morta em volta da âncora é alvo (é lá que a fixação encerra a
    // rolagem): fora dela o olhar parado é o gesto de rolar, e um anel
    // enchendo ali seria uma promessa que a máquina não cumpre.
    const foraDaAncora = e.fase.tipo === 'rolando' && Math.abs(a.y - e.fase.ancora.y) >= ROLAGEM_ZONA_MORTA_PX;
    const areaAtiva = !e.pausado && !e.teclado && e.fase.tipo !== 'lupa' && !foraDaAncora && (e.tarefa !== null || e.fase.tipo === 'rolando');
    if (!areaAtiva) {
      fixacaoRef.current = null;
      return { target: null, tipo: null, el: null };
    }
    const fix = fixacao(a, RAIO_DE_FIXACAO_PX);
    return { target: { key: fix.key, customDwellMs: null, isEmergency: false, isRecovery: false, isDisabled: false }, tipo: 'area', el: null };
  };

  const fixacao = (a: Ponto, raio: number): Fixacao => {
    const atual = fixacaoRef.current;
    if (atual && Math.hypot(a.x - atual.ponto.x, a.y - atual.ponto.y) <= raio) return atual;
    const nova = { key: {}, ponto: { x: a.x, y: a.y } };
    fixacaoRef.current = nova;
    return nova;
  };

  const realcar = (el: HTMLElement | null, pct: number) => {
    const anterior = realceRef.current;
    if (anterior && anterior !== el) {
      anterior.style.boxShadow = '';
      anterior.style.background = '';
    }
    realceRef.current = el;
    if (!el) return;
    const p = Math.round(pct * 100);
    el.style.background = `conic-gradient(${CORES.ativo} ${p}%, rgba(56,189,248,0.18) ${p}%)`;
    el.style.boxShadow = `0 0 0 3px ${CORES.ativo}`;
  };

  useEffect(() => {
    const cursorPeloCompositor = EXPERIMENT.cursorPeloCompositor;
    /** Último valor escrito em cada propriedade: escreve só o que mudou. */
    const escrito = new Map<string, string>();
    const escrever = (el: HTMLElement | SVGElement, prop: 'transform' | 'transition' | 'opacity' | 'background' | 'boxShadow' | 'border', valor: string) => {
      const chave = (el === cursorRef.current ? 'c:' : 'a:') + prop;
      if (escrito.get(chave) === valor) return;
      escrito.set(chave, valor);
      el.style[prop] = valor;
    };
    /**
     * Cursor pelo compositor: uma escrita de destino + travessia por amostra;
     * os quadros entre as amostras o compositor desenha sozinho.
     */
    const pintarPeloCompositor = (x: number, y: number, tMs: number): void => {
      const cursor = cursorRef.current;
      const p = pinturaRef.current;
      if (!cursor || !p) return;
      const passo = planejadorRef.current.passo({ x, y, tMs });
      if (passo) {
        // A duração vai antes do destino: vale a que estiver em vigor quando
        // o `transform` muda.
        escrever(cursor, 'transition', transicaoDoPasso(passo.duracaoMs));
        escrever(cursor, 'transform', `translate3d(${passo.x - p.offsetPx}px, ${passo.y - p.offsetPx}px, 0) scale(${p.escala})`);
      }
      escrever(cursor, 'opacity', p.opacidade);
      escrever(cursor, 'background', p.fundo);
      escrever(cursor, 'boxShadow', p.sombra);
      escrever(cursor, 'border', p.borda);
      const anel = anelRef.current;
      if (!anel) return;
      const svg = anel.ownerSVGElement!;
      if (!p.anel) {
        escrever(svg, 'opacity', '0');
        return;
      }
      const g = geometriaDoAnel(p.anel.tamanhoPx, p.anel.pct);
      anel.setAttribute('stroke-dashoffset', String(g.offset));
      if (passo) {
        // O anel que estava escondido aparece no lugar, sem atravessar a tela
        // — e só aparece com a posição desta amostra escrita.
        const visivel = escrito.get('a:opacity') === '1';
        escrever(svg, 'transition', transicaoDoPasso(visivel ? passo.duracaoMs : 0));
        escrever(svg, 'transform', `translate3d(${passo.x - g.centro}px, ${passo.y - g.centro}px, 0)`);
        escrever(svg, 'opacity', '1');
      }
    };

    const off = ponte.onOlhar((a) => {
      const c = configRef.current;
      if (!c) return;
      if (a.hasFace) ultimoRostoRef.current = performance.now();

      const { target, tipo, el } = resolverAlvo(a);
      const saida = stepDwell(
        dwellRef.current,
        { x: a.x, y: a.y, timestamp: a.t, hasFace: a.hasFace, degraded: a.degraded, uncalibrated: a.uncalibrated, eyeState: a.eyeState },
        target,
        // Memória de intrusão (M19) também na sobreposição.
        configComTolerancia({ ...DEFAULT_DWELL_CONFIG, dwellMs: c.dwellMs }, EXPERIMENT.toleranciaIntrusoes),
      );
      dwellRef.current = saida.state;

      let pct = 0;
      if (saida.effect.type === 'progress') pct = saida.effect.pct;
      if (saida.effect.type === 'click') {
        pct = 0;
        fixacaoRef.current = null;
        // Rótulo para a correção por dwell da janela do app: um dwell CONCLUÍDO
        // num alvo desenhado por nós diz para onde a pessoa olhava. Só de
        // amostra sã — degradada ou sem calibração não diz nada — e só de alvo
        // grande o bastante para o centro valer como verdade (a política do
        // tamanho é do módulo de correção; aqui só se evita o IPC inútil).
        if ((tipo === 'botao' || tipo === 'tecla') && el && !a.degraded && !a.uncalibrated) {
          const r = el.getBoundingClientRect();
          const tamanhoPx = Math.min(r.width, r.height);
          if (tamanhoPx >= ALVO_MINIMO_OVERLAY_PX) {
            void ponte.acao({
              tipo: 'selecao',
              centro: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
              tamanhoPx,
              olhar: { x: a.x, y: a.y },
            });
          }
        }
        if (tipo === 'botao' && el) despachar({ tipo: 'botao', id: el.dataset.alvo!.slice('botao:'.length) as IdDeBotao });
        else if (tipo === 'tecla' && el) despachar({ tipo: 'tecla', id: el.dataset.alvo!.slice('tecla:'.length) });
        else if (tipo === 'lupa' && el) {
          const r = el.getBoundingClientRect();
          despachar({ tipo: 'lupaAlvo', pontoNoPainel: { x: a.x - r.left, y: a.y - r.top }, painel: { width: r.width, height: r.height } });
        } else if (tipo === 'area') despachar({ tipo: 'area', ponto: { x: a.x, y: a.y } });
      }
      realcar(tipo === 'botao' || tipo === 'tecla' ? el : null, pct);

      // Rolagem contínua e cancelamento da lupa dependem do fluxo, não do dwell.
      const e = estadoRef.current;
      if (e.fase.tipo === 'rolando') despachar({ tipo: 'olhar', ponto: { x: a.x, y: a.y }, t: a.t });
      if (e.fase.tipo === 'lupa' && e.fase.regiao) {
        if (tipo === 'lupa') foraDaLupaDesdeRef.current = null;
        else if (foraDaLupaDesdeRef.current === null) foraDaLupaDesdeRef.current = a.t;
        else if (a.t - foraDaLupaDesdeRef.current > LUPA_CANCELA_APOS_MS) {
          foraDaLupaDesdeRef.current = null;
          lupaPedidoRef.current++;
          despachar({ tipo: 'lupaCancelada' });
        }
      } else {
        foraDaLupaDesdeRef.current = null;
      }

      // O ESTILO fica num buffer; a POSIÇÃO vai para o compositor (o padrão:
      // destino + travessia, uma escrita por amostra) ou, na volta segura,
      // para o seguidor do laço de pintura abaixo — o mesmo desacoplamento da
      // janela do app. Antes a sobreposição escrevia aqui a posição crua, uma
      // vez por amostra: era o "para-e-teleporta" que o app já não tinha.
      //
      // O carimbo de tempo é o DESTA janela, não o `a.t` do emissor: cada
      // janela tem o próprio `performance.timeOrigin`, e a idade da amostra é
      // comparada com o relógio do rAF daqui.
      const tAqui = performance.now();
      if (!cursorPeloCompositor) seguidorRef.current.aoReceberAmostra({ x: a.x, y: a.y, tMs: tAqui });
      const est = estiloDoCursor({
        tamanhoPx: c.tamanhoCursorPx,
        estado: target ? 'sobreAlvo' : a.degraded ? 'degradado' : 'normal',
        dwellPct: pct,
      });
      pinturaRef.current = {
        offsetPx: est.offsetPx,
        escala: est.escala,
        opacidade: a.hasFace ? '1' : '0.3',
        fundo: est.preenchimento,
        sombra: est.anel,
        borda: est.tracejado ? '2px dashed rgba(234,179,8,0.9)' : '',
        anel: target && pct > 0 ? { tamanhoPx: est.tamanhoPx, pct } : null,
      };
      if (cursorPeloCompositor) pintarPeloCompositor(a.x, a.y, tAqui);
    });

    // LAÇO DE PINTURA — taxa do display, não da câmera. Lê o seguidor e o
    // buffer de estilo; nenhuma leitura de layout, nenhum hit-test (esse
    // continua no callback, por amostra). Fonte seca (> 300 ms sem amostra):
    // o cursor congela E fica translúcido, em vez de parecer saudável.
    //
    // Com o cursor pelo compositor, este laço só vigia a fonte: a posição já
    // foi entregue ao compositor por `pintarPeloCompositor`.
    let raf = 0;
    const pintar = (agoraMs: number): void => {
      raf = requestAnimationFrame(pintar);
      const cursor = cursorRef.current;
      const p = pinturaRef.current;
      if (!cursor || !p) return;
      if (cursorPeloCompositor) {
        const idade = planejadorRef.current.idadeMs(agoraMs);
        if (idade !== null && idade > IDADE_MAXIMA_MS) escrever(cursor, 'opacity', '0.35');
        return;
      }
      const pos = seguidorRef.current.render(agoraMs);
      if (!pos) return;
      cursor.style.transform = `translate3d(${pos.x - p.offsetPx}px, ${pos.y - p.offsetPx}px, 0) scale(${p.escala})`;
      cursor.style.opacity = pos.parado ? '0.35' : p.opacidade;
      cursor.style.background = p.fundo;
      cursor.style.boxShadow = p.sombra;
      cursor.style.border = p.borda;
      const anel = anelRef.current;
      if (anel) {
        const svg = anel.ownerSVGElement!;
        if (p.anel) {
          const g = geometriaDoAnel(p.anel.tamanhoPx, p.anel.pct);
          anel.setAttribute('stroke-dashoffset', String(g.offset));
          svg.style.transform = `translate3d(${pos.x - g.centro}px, ${pos.y - g.centro}px, 0)`;
          svg.style.opacity = '1';
        } else {
          svg.style.opacity = '0';
        }
      }
    };
    raf = requestAnimationFrame(pintar);
    return () => {
      off();
      cancelAnimationFrame(raf);
      seguidorRef.current.reiniciar();
      planejadorRef.current.reiniciar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ponte, despachar]);

  if (!config) return null;

  const g = geometriaDoAnel(config.tamanhoCursorPx, 0);
  // Botões maiores e afastados da borda direita (ver `geometriaDaBarra.ts`).
  const barra = geometriaDaBarra(config.monitor.height, BOTOES.length);
  const larguraDaBarra = barra.larguraOcupadaPx;

  // Painel da lupa: centrado no ponto, mas inteiro na tela e fora da barra.
  const ladoDaLupa = Math.round(LUPA_RAIO_PX * 2 * LUPA_ZOOM);
  const lupa = estado.fase.tipo === 'lupa' && estado.fase.regiao ? estado.fase : null;
  const posLupa = lupa
    ? {
        left: Math.min(config.monitor.width - larguraDaBarra - ladoDaLupa - 8, Math.max(8, lupa.centro.x - ladoDaLupa / 2)),
        top: Math.min(config.monitor.height - ladoDaLupa - 8, Math.max(8, lupa.centro.y - ladoDaLupa / 2)),
      }
    : null;

  const larguraDoTeclado = Math.min(config.monitor.width - larguraDaBarra - 32, 10 * 72 + 9 * 8);
  const ladoDaTecla = Math.floor((larguraDoTeclado - 9 * 8) / 10);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: config.monitor.width,
        height: config.monitor.height,
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        color: CORES.texto,
        userSelect: 'none',
      }}
    >
      {/* Estado, canto superior esquerdo. */}
      <div
        role="status"
        style={{
          position: 'absolute', top: 10, left: 10, padding: '6px 12px', borderRadius: 10,
          background: CORES.painel, border: `1px solid ${CORES.borda}`, fontSize: 14, fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 8, maxWidth: 480,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 5, background: semOlhar ? '#f59e0b' : CORES.voltar }} />
        {semOlhar ? 'Procurando o olhar…' : descricaoDoEstado(estado)}
      </div>

      {/* Barra lateral. Também responde ao mouse FÍSICO: quando ele entra na
          barra, a sobreposição deixa de ser atravessável, e um cuidador pode
          clicar em "IrisFlow" ou "Socorro" com o mouse de verdade. */}
      <div
        aria-label="Ações do Modo Computador"
        onMouseEnter={() => void ponte.acao({ tipo: 'capturarMouse', ligado: true })}
        onMouseLeave={() => void ponte.acao({ tipo: 'capturarMouse', ligado: false })}
        style={{
          position: 'absolute', top: barra.topoPx, right: barra.direitaPx, bottom: barra.basePx, width: barra.ladoPx,
          display: 'flex', flexDirection: 'column', gap: ESPACO_ENTRE_BOTOES_PX, alignItems: 'center', justifyContent: 'center',
        }}
      >
        {BOTOES.map((b) => {
          const ligado =
            (b.id === estado.tarefa) ||
            (b.id === 'teclado' && estado.teclado) ||
            (b.id === 'lupa' && estado.lupa) ||
            (b.id === 'fixar' && estado.fixar) ||
            (b.id === 'pausar' && estado.pausado);
          const cor = b.cor ?? (ligado ? CORES.ativo : CORES.borda);
          return (
            <div
              key={b.id}
              data-alvo={`botao:${b.id}`}
              role="button"
              aria-pressed={ligado}
              onClick={() => despachar({ tipo: 'botao', id: b.id })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') despachar({ tipo: 'botao', id: b.id }); }}
              tabIndex={0}
              style={{
                width: barra.ladoPx, height: barra.ladoPx, borderRadius: barra.raioPx, boxSizing: 'border-box',
                background: ligado ? 'rgba(56,189,248,0.22)' : CORES.painel,
                border: `2px solid ${cor}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                color: b.cor ?? CORES.texto, fontSize: barra.fontePx, fontWeight: 700, letterSpacing: '0.01em',
                cursor: 'pointer',
              }}
            >
              {b.id === 'pausar' && estado.pausado
                ? <Play size={barra.iconePx} />
                : <b.Icone size={barra.iconePx} style={b.espelhado ? { transform: 'scaleX(-1)' } : undefined} />}
              <span>{b.id === 'pausar' && estado.pausado ? 'Retomar' : b.rotulo}</span>
            </div>
          );
        })}
      </div>

      {/* Painel da lupa. */}
      {lupa && posLupa && (
        <div
          data-alvo="lupa-area"
          style={{
            position: 'absolute', left: posLupa.left, top: posLupa.top, width: ladoDaLupa, height: ladoDaLupa,
            borderRadius: 16, overflow: 'hidden', border: `3px solid ${CORES.ativo}`,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)', background: '#000',
          }}
        >
          {lupa.imagem && (
            <img src={lupa.imagem} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'auto' }} />
          )}
        </div>
      )}

      {/* Teclado. */}
      {estado.teclado && (
        <div
          aria-label="Teclado"
          style={{
            position: 'absolute', left: 16, bottom: 12, width: larguraDoTeclado, padding: 8, boxSizing: 'border-box',
            borderRadius: 16, background: CORES.painel, border: `1px solid ${CORES.borda}`,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {LINHAS_DO_TECLADO.map((linha, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {linha.map((k) => {
                const id = idDaTecla(k);
                const largo = k === 'espaco' ? 3 : k === 'ctrl+c' || k === 'ctrl+v' ? 1.4 : 1;
                const ligado = k === 'maiuscula' && estado.maiuscula;
                return (
                  <div
                    key={k}
                    data-alvo={`tecla:${id}`}
                    role="button"
                    style={{
                      width: ladoDaTecla * largo + 8 * (largo - 1), height: Math.min(56, ladoDaTecla), borderRadius: 10, boxSizing: 'border-box',
                      background: ligado ? 'rgba(56,189,248,0.22)' : 'rgba(30,41,59,0.9)',
                      border: `2px solid ${ligado ? CORES.ativo : CORES.borda}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: k.length === 1 ? 22 : 13, fontWeight: 700, color: k === 'fechar' ? '#fca5a5' : CORES.texto,
                    }}
                  >
                    {ROTULO_DA_TECLA[k] ?? (k.length === 1 && estado.maiuscula ? k.toUpperCase() : k)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Cursor e anel de progresso. */}
      <div
        ref={cursorRef}
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, top: 0, width: config.tamanhoCursorPx, height: config.tamanhoCursorPx,
          borderRadius: '50%', pointerEvents: 'none', transform: 'translate3d(-9999px,-9999px,0)',
          transformOrigin: 'center center', willChange: 'transform', opacity: 0, zIndex: 20,
        }}
      />
      <svg
        aria-hidden="true"
        width={g.lado}
        height={g.lado}
        viewBox={`0 0 ${g.lado} ${g.lado}`}
        style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', opacity: 0, zIndex: 21, transform: 'translate3d(-9999px,-9999px,0)' }}
      >
        <circle
          ref={anelRef}
          cx={g.centro}
          cy={g.centro}
          r={g.raio}
          fill="none"
          stroke={CORES.ativo}
          strokeWidth={g.espessura}
          strokeDasharray={g.circunferencia}
          strokeDashoffset={g.circunferencia}
          strokeLinecap="round"
          transform={`rotate(${g.rotacaoDeg} ${g.centro} ${g.centro})`}
        />
      </svg>
    </div>
  );
};
