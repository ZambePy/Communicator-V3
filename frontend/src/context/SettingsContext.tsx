import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FOV_PADRAO_DEG, sanitizarMapaDeFov, type MapaDeFov } from '@tracker/camera/fovPorCamera';
import { posicaoDaCameraValida, type PosicaoDaCamera } from '@tracker/geometria6dof';
import { computeDisplayGeometry, pickPanelForDisplay } from '@tracker/displayGeometry';
import { aplicarGeometriaDoUsuario } from '../design/gazeMetrics';
import { setSessionGeometry } from '@tracker/calibration';
import { EVENTO_DE_ACURACIA_MEDIDA } from '@tracker/accuracy';
import { EVENTO_DE_CALIBRACAO_EM_USO } from '@tracker/calibration';
import { DWELL_PADRAO_MS, dwellMsDoLegado, limitarDwellMs } from '../dwellMs';
import { limitarPasso, PASSO_PADRAO_MS, type EntradaDoAcionador } from '@tracker/interaction/varreduraPorAcionador';
import { limitarPressaoLonga, PRESSAO_LONGA_EMERGENCIA_MS } from '@tracker/interaction/varreduraPorAcionador';
import { limitarPiscadaMin, PISCADA_MIN_PADRAO_MS } from '@tracker/interaction/simNaoPorPiscada';
import { CONTAGEM_PADRAO_S, limitarContagemDaEmergencia } from '../services/emergencia/contagemDaEmergencia';

function entradaDoAcionadorValida(a: unknown): a is EntradaDoAcionador {
  if (!a || typeof a !== 'object') return false;
  const o = a as { tipo?: unknown; codigo?: unknown; botao?: unknown };
  if (o.tipo === 'tecla') return typeof o.codigo === 'string' && o.codigo.length > 0 && o.codigo.length < 40;
  if (o.tipo === 'mouse') return typeof o.botao === 'number' && Number.isInteger(o.botao) && o.botao >= 0 && o.botao <= 4;
  return false;
}
import { registrarFalhaDeGravacao, registrarGravacaoOk } from '../services/local/falhasDeGravacao';
import type { LinguagemDoRelatorio } from '@tracker/resultadoSimples';

/** `simples`/`tecnica`, ou `null` (não perguntado) para qualquer outra coisa. */
export function linguagemDoRelatorioValida(v: unknown): LinguagemDoRelatorio | null {
  return v === 'simples' || v === 'tecnica' ? v : null;
}

/** Formato antigo. Sobrevive só para a migração em `lerSettingsDoDisco`. */
type DwellSpeed = 'slow' | 'normal' | 'fast';
type Theme = 'light' | 'dark';

interface Settings {
  /**
   * Tempo de permanência até o clique, em ms.
   *
   * Era `dwellSpeed: 'slow' | 'normal' | 'fast'`. Três degraus não cobrem a
   * distância entre ELA avançada e boa fixação; o valor migra na leitura.
   */
  dwellMs: number;
  soundEnabled: boolean;
  voiceGender: 'female' | 'male' | 'cloned';
  voiceProfileId?: string;
  eyeDominance: 'left' | 'right' | 'both';
  theme: Theme;
  // Conforto visual.
  // brightnessLevel: 0.4 (mínimo utilizável) — 1.0 (sem escurecimento).
  // Aplicado como CSS `filter: brightness()` no <html>, escurece TUDO em
  // software sem depender do brilho do monitor (útil quando o cuidador
  // não tem controle direto do brilho — TV, monitor sem OSD acessível).
  brightnessLevel: number;
  // Filtro âmbar sobre a UI inteira. Evidência AAO: pacientes com
  // fotofobia se aliviam bloqueando a componente azul do espectro.
  // Implementado via overlay fixo em html.amber-filter::after.
  amberFilter: boolean;
  // Brilho real do monitor (0-100). Só usado quando o Electron
  // IPC `window.electronBrightness` está disponível (Windows via WMI).
  // Persiste entre sessões e re-aplica no boot.
  monitorBrightness: number | null;
  // Geometria física do posto de uso. NÃO é cosmética: entra em duas contas
  // que antes usavam hardcodes separados e divergentes.
  //   1. `meanErrorDeg` do relatório de precisão. Com 15,6" hardcoded numa
  //      tela de 23,6", o erro angular saía 34% MENOR do que o real.
  //   2. A posição dos alvos de calibração, que sai de um orçamento de
  //      excentricidade angular (ver `computeCalibrationTargets`).
  // Só o cuidador sabe estes números — o browser não expõe tamanho físico.
  screenDiagonalIn: number;
  viewingDistanceCm: number;
  // Origem de `screenDiagonalIn`. Existe para o preenchimento automático
  // (EDID via Electron) NUNCA sobrescrever um valor que o cuidador digitou:
  // se ele mediu com fita, esse número vale mais que o EDID, que em vários
  // monitores vem arredondado a centímetro inteiro ou zerado.
  screenGeometrySource: 'default' | 'auto' | 'manual';
  // Consentimento para ler configurações do sistema (EDID do monitor, escala
  // da tela). `null` = ainda não perguntamos. Ler o hardware do usuário sem
  // avisar é o tipo de coisa que um software de saúde não faz por
  // conveniência, mesmo quando o dado é inócuo e o SO permitiria.
  systemAccessGranted: boolean | null;
  // Campo de visão HORIZONTAL da câmera, em graus. Nenhuma API expõe isso;
  // é derivado uma única vez, quando o cuidador mede a distância com fita e
  // aperta "Calibrar campo de visão" em Configurações. A partir daí o app
  // estima a distância sozinho em toda sessão, que é o que faz o medidor de
  // distância da pré-calibração funcionar de verdade.
  cameraHorizontalFovDeg: number | null;
  // FOV medido POR CÂMERA (chave = identidade do dispositivo). O campo acima
  // é o valor ATIVO; este mapa é a memória: trocar de webcam restaura o FOV
  // dela, ou volta ao padrão avisando quando é uma câmera nunca medida.
  fovPorCamera: MapaDeFov;
  // Identidade da última câmera aberta — é o que permite dizer "a câmera
  // mudou" no boot seguinte.
  ultimaCameraChave: string | null;
  // A câmera escolhida no Preparo (o `deviceId` dela). O rastreador abre esta
  // câmera; `null` = ninguém escolheu (vale a última aberta, ou a padrão).
  // Relato de 18/10/2026, item 3: a escolha era gravada só no preparo do
  // perfil, que nenhum código de produção lia — o engine abria outra câmera.
  cameraDeviceId: string | null;
  // Fator de escala do Windows relatado pelo SO. NÃO entra na conversão
  // px→cm (a escala se cancela, porque o erro é medido em px CSS e a tela
  // cobre um número fixo de px CSS). Guardado para (a) desambiguar monitores
  // e (b) registrar a configuração no relatório, já que "1280×800 numa tela
  // de 23,6\"" é a assinatura de escala em 150% e confunde quem lê o
  // histórico depois.
  screenScaleFactor: number | null;
  // Dicas contextuais já dispensadas com "Entendi" (uma linha na primeira
  // entrada em cada módulo). Ids de `DicaContextual`. Persistem para a dica
  // não voltar a cada abertura — repetir orientação a quem já entendeu é
  // ruído exatamente para quem tem menos energia para ignorá-lo.
  dicasVistas: string[];
  // De que lado da tela está a câmera. Só a saída 6DoF experimental
  // (`EXPERIMENT.saida6DoF`) usa, e só ela pergunta. `null` = não informado.
  posicaoDaCamera: PosicaoDaCamera | null;
  // Alarme da emergência sobe o volume do Windows ao máximo (e devolve o
  // volume anterior quando para). Ligado por padrão: o alarme existe para
  // ser ouvido de outro cômodo, à noite. Quem não quiser desliga em
  // Configurações → Emergência.
  alarmeComVolumeMaximo: boolean;
  // Plano B (pedido de 18/10/2026: "quando o olhar piora"). `acionador`: a
  // tela é percorrida sozinha e um acionador (botão USB, tecla) seleciona —
  // ver `components/VarreduraComAcionador`. `acionador: null` = Espaço/Enter,
  // o padrão de fábrica dos acionadores USB.
  modoDeEntrada: 'olhar' | 'acionador';
  acionador: EntradaDoAcionador | null;
  acionadorPassoMs: number;
  // Com o acionador ligado, o olhar não clica (dois caminhos selecionando ao
  // mesmo tempo confundem quem já está com o olhar ruim).
  acionadorDesligaOlhar: boolean;
  // Quanto tempo SEGURAR o acionador chama a emergência (revisão de UX de
  // 19/10/2026: era fixo em 2 s). Faixa segura em `limitarPressaoLonga`.
  acionadorPressaoLongaMs: number;
  // Sim/Não por piscada longa na tela Sim · Não (uma = sim, duas = não).
  simNaoPorPiscada: boolean;
  piscadaLongaMs: number;
  // Modo só horizontal (pedido de 21/10/2026): na ELA o olhar vertical costuma
  // ir embora primeiro. Ligado, as telas laterais (Sim/Não, teclado lateral,
  // pergunta do cuidador) respondem só ao olhar para a esquerda ou a direita,
  // e a Emergência vira uma faixa na borda direita — ver `zonasLaterais.ts`.
  modoHorizontal: boolean;
  // Varredura falada (rodada 3, 21/10/2026): com a varredura por acionador
  // andando, a voz do computador diz o nome do botão destacado, baixinho, a
  // cada passo. Desligada por padrão — quem enxerga bem não precisa dela, e
  // uma voz repetindo cada botão cansa. Ver `services/interaction/varreduraFalada`.
  varreduraFalada: boolean;
  // Quanto dura a contagem da Emergência, em segundos (3–10, padrão 5; decisão
  // 5 da rodada 3). Faixa em `limitarContagemDaEmergencia`.
  contagemDaEmergenciaS: number;
  // Modo hospital (rodada 3): a tela inicial passa a ser a do vocabulário de
  // UTI (dor, sede, aspirar, posição, frio, calor, enfermagem, família,
  // sim/não), com alvos grandes. O menu completo continua a um olhar.
  modoHospital: boolean;
  // Como os resultados da calibração e do teste de precisão são escritos
  // (pedido de 19/10/2026): `simples` = a palavra ("Ótima", "Boa",
  // "Refazer os cantos") e uma frase do que fazer; `tecnica` = os números.
  // `null` = ainda não perguntamos — a tela de calibração pergunta UMA vez, e
  // Configurações muda depois.
  linguagemDoRelatorio: LinguagemDoRelatorio | null;
  // Por onde a voz do paciente sai (roadmap 3, de 19/10/2026): `null` = a saída
  // padrão do computador; um texto é o código do aparelho escolhido, em geral o
  // cabo de áudio virtual ("CABLE Input") que leva a voz para uma chamada de
  // WhatsApp ou Meet. Vale para a voz personalizada e a voz guardada; a voz do
  // sistema e o alarme da emergência não seguem este ajuste.
  //
  // SÓ PARA A SESSÃO (revisão final, rodada 2, B1, 21/10/2026): não vai para o
  // disco e, ao abrir o app, é sempre `null`. Quem escolhia o cabo para uma chamada
  // e esquecia de voltar abria o app no dia seguinte com a voz saindo pelo cabo —
  // ninguém na sala a ouvia e a tela não dizia nada: a fala do paciente sumia em
  // silêncio. Para uma nova chamada, escolhe-se de novo.
  saidaDaVoz: string | null;
}

const defaultSettings: Settings = {
  dwellMs: DWELL_PADRAO_MS,
  soundEnabled: true,
  voiceGender: 'female',
  eyeDominance: 'both',
  // Dark por default para o paciente. Evidência PMC12027292: reduz olho seco
  // (22.73 vs 24.40, p<0.05) e preserva CFF (indicador de fadiga). Fundo
  // claro em tela grande satura a pupila e induz piscada — sintoma que o
  // usuário deste projeto reportou. O cuidador continua podendo escolher
  // 'light' em SettingsScreen; a preferência persiste em localStorage.
  theme: 'dark',
  brightnessLevel: 1.0,
  amberFilter: false,
  monitorBrightness: null,
  // Defaults = o posto de uso de referência (medido). Editáveis em
  // configurações → Teste de precisão; qualquer tela diferente PRECISA ser
  // ajustada, senão o erro angular do relatório mente e a grade de
  // calibração fica posicionada para a tela errada.
  screenDiagonalIn: 23.6,
  viewingDistanceCm: 60,
  screenGeometrySource: 'default',
  systemAccessGranted: null,
  // 69,7° — valor nominal da webcam 1080p de referência, fixado em vez de
  // derivado. O passo "Calibrar campo de visão" saiu do protocolo pelo
  // orçamento de tempo do projeto: ele custava um minuto de preparo por
  // sessão e só alimenta `distanciaMedidaCm`, que é testemunha de movimento,
  // não entrada do erro angular. O botão continua na tela para quem quiser
  // derivar o valor da própria câmera; o default apenas deixa de ser `null`,
  // que era o que fazia toda sessão sair sem a testemunha.
  cameraHorizontalFovDeg: FOV_PADRAO_DEG,
  fovPorCamera: {},
  ultimaCameraChave: null,
  cameraDeviceId: null,
  screenScaleFactor: null,
  dicasVistas: [],
  posicaoDaCamera: null,
  alarmeComVolumeMaximo: true,
  modoDeEntrada: 'olhar',
  acionador: null,
  acionadorPassoMs: PASSO_PADRAO_MS,
  acionadorDesligaOlhar: true,
  acionadorPressaoLongaMs: PRESSAO_LONGA_EMERGENCIA_MS,
  simNaoPorPiscada: false,
  piscadaLongaMs: PISCADA_MIN_PADRAO_MS,
  modoHorizontal: false,
  varreduraFalada: false,
  contagemDaEmergenciaS: CONTAGEM_PADRAO_S,
  modoHospital: false,
  linguagemDoRelatorio: null,
  saidaDaVoz: null,
};

const SettingsContext = createContext<{
  settings: Settings;
  /**
   * Aplica e grava. Devolve `false` quando a gravação no disco FALHOU (a
   * mudança vale nesta sessão e o aviso "não foi possível salvar" aparece) —
   * relato de 18/10/2026, item 15. Fora do provider nada é gravado.
   */
  updateSettings: (s: Partial<Settings>) => boolean;
}>({ settings: defaultSettings, updateSettings: () => false });

/**
 * Tema TRAVADO, temporariamente.
 *
 * `'dark'` fixa o app no azul escuro da identidade; `null` devolve a escolha
 * ao cuidador exatamente como era. Um valor só, num lugar só — é o que torna
 * isto reversível sem arqueologia.
 *
 * Por que travar, além do pedido: hoje o tema claro está QUEBRADO em boa
 * parte do app. Vários módulos foram escritos dark-first, com fundo em
 * `var(--color-bg-base)` mas texto e borda cravados em branco — galeria,
 * fotos, notícias, jogos, teclado ocular. O caso mais irônico é o próprio
 * `CaregiverPageLayout`, que tem `#0f172a` cravado: o cuidador clica em
 * "Modo Claro" e a tela onde ele clicou não muda de cor. O seletor já não
 * descrevia o que fazia.
 *
 * O valor salvo em disco NÃO é apagado. Ele fica lá, inerte, e volta a valer
 * sozinho no dia em que esta constante virar `null`.
 */
export const TEMA_FIXO: Theme | null = 'dark';

/**
 * Tema inicial.
 *
 * O `prefers-color-scheme` do SISTEMA vencia o default clínico: numa
 * instalação nova, num Windows em modo claro (o padrão de fábrica), o
 * IrisFlow abria CLARO — sem ninguém ter pedido, contra a evidência citada
 * no default acima. Com `TEMA_FIXO` esse caminho morre; sem ela, ele volta,
 * e aí a checagem de sistema é legítima porque o usuário ainda não escolheu.
 */
function initialTheme(saved: Partial<Settings> | null): Theme {
  if (TEMA_FIXO) return TEMA_FIXO;
  if (saved?.theme) return saved.theme;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

// Aplicação centralizada no <html>. Concentrada em um lugar para evitar
// telas migrarem em momentos diferentes.
function applyVisualComfort(s: Pick<Settings, 'theme' | 'brightnessLevel' | 'amberFilter'>): void {
  const html = document.documentElement;

  // `TEMA_FIXO` vence qualquer `updateSettings({ theme })` que escape — hoje
  // só a tela de Configurações escreve isso, mas a rede vale para o futuro.
  html.classList.toggle('dark', (TEMA_FIXO ?? s.theme) === 'dark');
  html.classList.toggle('amber-filter', s.amberFilter === true);

  // Clamp por segurança — slider da UI já limita, mas localStorage pode
  // conter valor inválido de versões antigas.
  const b = Math.max(0.4, Math.min(1.0, s.brightnessLevel ?? 1.0));
  // brightness(1) = neutro, remove o filter para não pagar composite cost.
  html.style.filter = b < 1 ? `brightness(${b.toFixed(2)})` : '';
}

/** Versão do schema de `Settings` gravado no localStorage. */
const SETTINGS_SCHEMA_VERSION = 1;
const SETTINGS_KEY = 'irisflow_settings';

/**
 * Lê as configurações do disco sem nunca lançar. Um localStorage truncado
 * (acontece quando os perfis de calibração estouram a quota) não pode derrubar
 * O `SettingsProvider` no boot — seria tela branca sem recuperação.
 */
function lerSettingsDoDisco(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const obj = parsed as Partial<Settings> & { schemaVersion?: number };
    // Schema de versão diferente: descarta em vez de mesclar. Metade de um
    // formato com metade de outro é pior que voltar aos defaults, porque o
    // resultado não corresponde a nenhuma configuração que alguém escolheu.
    if (obj.schemaVersion !== undefined && obj.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
      console.warn(
        `[SettingsContext] configurações de schema v${obj.schemaVersion} ` +
          `(atual: v${SETTINGS_SCHEMA_VERSION}) — usando os defaults.`
      );
      return null;
    }
    // MIGRAÇÃO dwellSpeed → dwellMs.
    //
    // Feita aqui, e SEM subir `SETTINGS_SCHEMA_VERSION`: a checagem acima
    // descarta tudo quando a versão diverge, o que apagaria exatamente a
    // escolha que esta migração existe para preservar. Um paciente com ELA
    // avançada configurado em "lento" voltaria a 1,5 s e ficaria sem conseguir
    // clicar, sem ter como avisar ninguém.
    const legado = (obj as { dwellSpeed?: DwellSpeed }).dwellSpeed;
    if (typeof obj.dwellMs !== 'number' && typeof legado === 'string') {
      obj.dwellMs = dwellMsDoLegado(legado);
    }
    if (!Array.isArray(obj.dicasVistas)) {
      // Campo novo, ou storage editado à mão: sem lista, nenhuma dica foi vista.
      obj.dicasVistas = [];
    }
    if (typeof obj.dwellMs === 'number') {
      // Storage editado à mão, ou vindo de uma versão com outra faixa.
      obj.dwellMs = limitarDwellMs(obj.dwellMs);
    }
    // Campos novos do V2: ausentes em disco antigo, e o mapa nunca pode vir
    // com entradas quebradas (um FOV NaN restaurado quebraria toda distância).
    obj.fovPorCamera = sanitizarMapaDeFov((obj as { fovPorCamera?: unknown }).fovPorCamera);
    if (typeof obj.ultimaCameraChave !== 'string') obj.ultimaCameraChave = null;
    if (typeof obj.cameraDeviceId !== 'string' || !obj.cameraDeviceId.trim()) obj.cameraDeviceId = null;
    obj.posicaoDaCamera = posicaoDaCameraValida((obj as { posicaoDaCamera?: unknown }).posicaoDaCamera);
    // Campo novo (19/10/2026): fora de um booleano, vale o padrão (ligado).
    if (typeof obj.alarmeComVolumeMaximo !== 'boolean') delete obj.alarmeComVolumeMaximo;
    // Plano B (19/10/2026): o que não for válido volta ao padrão.
    if (obj.modoDeEntrada !== 'olhar' && obj.modoDeEntrada !== 'acionador') delete obj.modoDeEntrada;
    if (!entradaDoAcionadorValida(obj.acionador)) obj.acionador = null;
    if (typeof obj.acionadorPassoMs === 'number') obj.acionadorPassoMs = limitarPasso(obj.acionadorPassoMs);
    else delete obj.acionadorPassoMs;
    if (typeof obj.acionadorDesligaOlhar !== 'boolean') delete obj.acionadorDesligaOlhar;
    // Fora da faixa, o limite dela: um limiar de 50 ms editado à mão faria de
    // cada aperto comum uma emergência (revisão de UX de 19/10/2026).
    if (typeof obj.acionadorPressaoLongaMs === 'number') obj.acionadorPressaoLongaMs = limitarPressaoLonga(obj.acionadorPressaoLongaMs);
    else delete obj.acionadorPressaoLongaMs;
    if (typeof obj.simNaoPorPiscada !== 'boolean') delete obj.simNaoPorPiscada;
    if (typeof obj.piscadaLongaMs === 'number') obj.piscadaLongaMs = limitarPiscadaMin(obj.piscadaLongaMs);
    else delete obj.piscadaLongaMs;
    // Campo de 21/10/2026: só um booleano liga o modo só horizontal.
    if (typeof obj.modoHorizontal !== 'boolean') delete obj.modoHorizontal;
    // Rodada 3 (21/10/2026): campos novos, ausentes em disco antigo. O que não
    // for válido volta ao padrão. A contagem entra na faixa de 3–10 s: um 0
    // editado à mão mandaria o pedido de socorro na hora, sem CANCELAR.
    if (typeof obj.varreduraFalada !== 'boolean') delete obj.varreduraFalada;
    if (typeof obj.contagemDaEmergenciaS === 'number') obj.contagemDaEmergenciaS = limitarContagemDaEmergencia(obj.contagemDaEmergenciaS);
    else delete obj.contagemDaEmergenciaS;
    if (typeof obj.modoHospital !== 'boolean') delete obj.modoHospital;
    // Campo de 19/10/2026: ausente em disco antigo (ainda não perguntado), e
    // um valor editado à mão não pode virar uma terceira linguagem.
    obj.linguagemDoRelatorio = linguagemDoRelatorioValida(
      (obj as { linguagemDoRelatorio?: unknown }).linguagemDoRelatorio
    );
    // Só para a sessão (B1, 21/10/2026): o que um disco de versão anterior, ou editado à mão, trouxer
    // aqui NÃO vale. Ao abrir o app a voz sai pela saída padrão, a que a sala ouve.
    obj.saidaDaVoz = null;

    return obj;
  } catch (e) {
    console.warn(
      '[SettingsContext] configurações ilegíveis no localStorage — usando os defaults.',
      e
    );
    return null;
  }
}

/**
 * Grava sem nunca lançar. Quota estourada não pode derrubar a UI — mas também
 * não pode passar por salva (relato de 18/10/2026, item 15): devolve `false` e
 * registra a falha, que aparece na tela como "não foi possível salvar".
 */
function gravarSettingsNoDisco(s: Settings): boolean {
  try {
    // A saída da voz é só da sessão (B1, 21/10/2026): não vai para o disco, e o valor antigo que
    // houvesse lá some na primeira gravação.
    const { saidaDaVoz: _daSessao, ...doDisco } = s;
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...doDisco, schemaVersion: SETTINGS_SCHEMA_VERSION })
    );
    registrarGravacaoOk('ajustes');
    return true;
  } catch (e) {
    // Quota excedida é o caso real: 5 perfis de calibração ocupam quase toda
    // a cota. Perder a persistência da configuração é ruim; derrubar a sessão
    // do paciente é pior.
    registrarFalhaDeGravacao('ajustes', e);
    return false;
  }
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = lerSettingsDoDisco();
    return {
      ...defaultSettings,
      ...(saved ?? {}),
      theme: initialTheme(saved),
    };
  });

  /**
   * As configurações mais recentes, inclusive as que ainda não renderizaram.
   *
   * `updateSettings` precisa gravar E DEVOLVER se gravou (relato de
   * 18/10/2026, item 15), e isso não cabe num updater funcional — o React o
   * chama depois, e duas vezes no StrictMode. Toda mudança passa por
   * `aplicar`, que parte deste ref: duas chamadas no mesmo handler continuam
   * se somando, que era o que o updater funcional garantia.
   */
  const atualRef = useRef(settings);
  const aplicar = useCallback(
    (mudar: (anterior: Settings) => Settings, opcoes: { gravar: boolean } = { gravar: true }): boolean => {
      const anterior = atualRef.current;
      const next = mudar(anterior);
      if (next === anterior) return true;
      atualRef.current = next;
      const gravou = opcoes.gravar ? gravarSettingsNoDisco(next) : true;
      setSettings(next);
      return gravou;
    },
    []
  );

  // Preenche a diagonal a partir do EDID: no boot e quando o monitor da janela
  // muda (ela foi para outro monitor, ou a resolução/escala dele mudou — aviso
  // `onTelaMudou` do processo principal, que responde pelo monitor em que a
  // janela ESTÁ, não pelo primário).
  //
  // Só age quando a origem atual é 'default' ou 'auto'. Um valor 'manual' (o
  // cuidador digitou em Configurações) é soberano: o EDID reporta em
  // centímetros inteiros, então erra por até ~0,4" — melhor que um hardcode
  // errado, pior que uma medição com fita.
  useEffect(() => {
    const sys = (
      window as unknown as {
        irisflowSystem?: {
          getMonitorSizes?: () => Promise<{ widthCm: number; heightCm: number }[]>;
          getDisplayInfo?: () => Promise<{
            widthPx: number;
            heightPx: number;
            scaleFactor: number;
          }>;
          onTelaMudou?: (cb: (info: { id: number; scaleFactor: number }) => void) => () => void;
        };
      }
    ).irisflowSystem;
    if (!sys?.getMonitorSizes) return; // browser puro / build web: sem IPC
    // Só lê o sistema depois do consentimento explícito.
    if (settings.systemAccessGranted !== true) return;
    let cancelled = false;
    const getMonitorSizes = sys.getMonitorSizes;
    // Lê tamanho físico E info do display juntos: a segunda serve para
    // escolher QUAL painel corresponde ao monitor em uso quando há mais de um.
    const ler = () => void Promise.all([getMonitorSizes(), sys.getDisplayInfo?.() ?? Promise.resolve(null)])
      .then(([sizes, info]) => {
        if (cancelled) return;
        // Pelo `aplicar`, não por um updater funcional: o mesmo ponto de
        // partida do `updateSettings`, para os dois nunca se sobrescreverem.
        const prev = atualRef.current;
        const scale = info?.scaleFactor ?? null;
        if (prev.screenGeometrySource === 'manual') {
          // Só a escala, e sem gravar — como sempre foi.
          if (scale !== null && scale !== prev.screenScaleFactor) {
            aplicar(() => ({ ...prev, screenScaleFactor: scale }), { gravar: false });
          }
          return;
        }
        const aspect = info && info.heightPx > 0 ? info.widthPx / info.heightPx : null;
        const { panel, ambiguous } = pickPanelForDisplay(sizes ?? [], aspect);
        const geo = computeDisplayGeometry(panel);
        if (!geo) {
          console.log('[display] EDID não utilizável; mantendo diagonal configurada.');
          if (scale !== null) aplicar(() => ({ ...prev, screenScaleFactor: scale }), { gravar: false });
          return;
        }
        if (ambiguous) {
          console.warn(
            '[display] mais de um monitor com a mesma proporção — a diagonal lida ' +
              'pode ser do monitor errado. Se o número abaixo não bater com a sua tela, ' +
              'corrija à mão em Configurações → Teste de precisão.'
          );
        }
        const rounded = Math.round(geo.diagonalIn * 10) / 10;
        if (
          Math.abs(rounded - prev.screenDiagonalIn) < 0.05 &&
          prev.screenGeometrySource === 'auto' &&
          scale === prev.screenScaleFactor
        )
          return;
        console.log(
          `[display] diagonal lida do sistema: ${rounded}" ` +
            `(${geo.widthCm}×${geo.heightCm} cm). Anterior: ${prev.screenDiagonalIn}".` +
            (scale && scale !== 1 ? ` Escala do Windows: ${(scale * 100).toFixed(0)}%.` : '')
        );
        aplicar(() => ({
          ...prev,
          screenDiagonalIn: rounded,
          screenGeometrySource: 'auto' as const,
          screenScaleFactor: scale,
        }));
      })
      .catch(() => {
        /* IPC indisponível: segue com o valor configurado */
      });
    ler();
    const pararDeOuvir = sys.onTelaMudou?.(() => {
      if (!cancelled) ler();
    });
    return () => {
      cancelled = true;
      pararDeOuvir?.();
    };
  }, [settings.systemAccessGranted, aplicar]);

  // Aplica conforto visual no boot e a cada mudança relevante.
  useEffect(() => {
    applyVisualComfort(settings);
  }, [settings.theme, settings.brightnessLevel, settings.amberFilter]);

  // Brilho real do monitor via IPC do Electron.
  // Reaplica no boot se houve valor salvo (o monitor volta pra 100%
  // quando a máquina reinicia; nós restauramos a preferência).
  useEffect(() => {
    const b = settings.monitorBrightness;
    if (b == null) return;
    const api = (
      window as unknown as {
        electronBrightness?: { set: (pct: number) => Promise<{ ok: boolean }> };
      }
    ).electronBrightness;
    if (!api) return;
    api.set(b).catch((e) => {
      console.warn('[SettingsContext] falha ao aplicar brilho de monitor:', e);
    });
  }, [settings.monitorBrightness]);

  // Parte de `atualRef`, não de uma closure sobre `settings`: duas chamadas no
  // mesmo handler partiriam do mesmo valor e a segunda sobrescreveria a
  // primeira (inclusive no localStorage). Identidade estável. Devolve se a
  // gravação deu certo (relato de 18/10/2026, item 15).
  const updateSettings = useCallback(
    (partial: Partial<Settings>): boolean => aplicar((anterior) => ({ ...anterior, ...partial })),
    [aplicar]
  );

  // A geometria do usuário alimenta o design system (tokens CSS de tamanho
  // mínimo de alvo) e o pipeline. Propagar aqui, e não só ao calibrar, é o que
  // faz uma correção da diagonal valer na hora: `screenPxPerCm()` está no
  // caminho quente da compensação de pose.
  useEffect(() => {
    const aplicar = () => {
      aplicarGeometriaDoUsuario(settings.viewingDistanceCm, settings.screenDiagonalIn);
      setSessionGeometry({
        viewingDistanceCm: settings.viewingDistanceCm,
        screenDiagonalIn: settings.screenDiagonalIn,
      });
    };
    aplicar();

    // REDIMENSIONAR a janela também muda a geometria.
    //
    // `pxPerCmFromScreen` deriva a densidade de `clientWidth`/`clientHeight`
    // do documento. Sem este listener os tokens ficavam congelados no valor do
    // primeiro render: o cuidador maximizava a janela e `--gaze-target-min`
    // continuava calculado para a janela pequena — o app passava a achar que
    // 5° eram menos pixels do que são, e parava de avisar que os alvos
    // estavam abaixo do mínimo.
    //
    // `requestAnimationFrame` agrupa a rajada de eventos de um arrasto de
    // janela num recálculo por quadro; o cálculo é aritmética simples, mas
    // escrever custom properties no `<html>` invalida estilo da árvore toda.
    let pendente = 0;
    const aoRedimensionar = () => {
      if (pendente) return;
      pendente = requestAnimationFrame(() => {
        pendente = 0;
        aplicar();
      });
    };
    window.addEventListener('resize', aoRedimensionar);
    // Alvo mínimo medido (M18): uma rodada de medição nova muda o requisito,
    // e o modelo em uso também — a medição só vale para a calibração em que
    // foi feita, e o perfil salvo só carrega depois do MediaPipe, bem depois
    // deste efeito.
    window.addEventListener(EVENTO_DE_ACURACIA_MEDIDA, aoRedimensionar);
    window.addEventListener(EVENTO_DE_CALIBRACAO_EM_USO, aoRedimensionar);
    return () => {
      window.removeEventListener('resize', aoRedimensionar);
      window.removeEventListener(EVENTO_DE_ACURACIA_MEDIDA, aoRedimensionar);
      window.removeEventListener(EVENTO_DE_CALIBRACAO_EM_USO, aoRedimensionar);
      if (pendente) cancelAnimationFrame(pendente);
    };
  }, [settings.viewingDistanceCm, settings.screenDiagonalIn]);

  // Sem o `useMemo`, todo render do provider re-renderizaria todos os
  // consumidores de `useSettings`, mesmo sem nenhuma configuração mudar.
  const value = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => useContext(SettingsContext);
