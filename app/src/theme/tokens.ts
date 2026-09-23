/**
 * Tokens de design da IrisFlow — derivados do tópico 2.3 (Branding) do Plano de Negócios 2026.
 *
 *  • Azul institucional #1B54A8  → cor primária: símbolo, títulos, destaques (confiança, seriedade clínica)
 *  • Azul-marinho profundo #091B33 → pupila do símbolo e tipografia do logotipo (ancoragem e contraste)
 *  • Verde-teal #00A693          → confirmação e indicadores positivos (vitalidade, cuidado)
 *  • Vermelho de perigo           → só emergência e ações destrutivas
 *  • Branco e neutros claros     → fundos, clareza e respiro visual
 *
 * Regra tipográfica do plano: nenhum texto essencial em corpo reduzido, nenhum texto em baixo
 * contraste e hierarquia visual explícita.
 *
 * Contraste: toda combinação texto/fundo usada nas telas passa de 4,5:1 (AA) nos dois
 * temas; ícones e contornos de campo passam de 3:1. Por isso cada cor da marca tem
 * papéis separados — `accent` (#00A693) é ótimo para ícone e gráfico, mas como texto
 * sobre branco fica em 3:1; o texto teal usa `accentText`, e o botão teal, `accentStrong`.
 *
 * NADA de cor, tamanho ou espaçamento solto nas telas: tudo sai daqui.
 */
import { Platform, StyleSheet } from 'react-native';

/** Cores da marca. As telas não usam isto direto: usam os papéis de `ThemeColors` abaixo. */
export const brand = {
  blue: '#1B54A8',
  blueDeep: '#143F80',
  /** Halo do símbolo (IrisLogo). */
  azure: '#4F86D9',
  navy: '#091B33',
  abyss: '#050B1B',
  teal: '#00A693',
  tealDeep: '#00796A',
  white: '#FFFFFF',
  /** Reflexo secundário da pupila no símbolo. */
  whiteSoft: 'rgba(255,255,255,0.75)',
} as const;

/**
 * Espectro de refração — evocação da íris fotográfica do banner da marca.
 * Uso restrito: apenas como fio de luz na íris animada (IrisLogo).
 * Nunca em ícone, botão, texto ou fundo de UI (destoa do tom clínico).
 */
export const spectrum = {
  cyan: '#7CE0FF',
  violet: '#B48CFF',
  rose: '#FF8FA3',
} as const;

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  mode: ThemeMode;
  // ---- superfícies ----
  background: string;
  surface: string;
  /** Preenchimento neutro: trilho do seletor, campos, chips, blocos de ícone. */
  surfaceAlt: string;
  /** Avisos flutuantes (banner de conexão). */
  surfaceElevated: string;
  /** Divisórias e contorno de cartão. */
  border: string;
  /** Contorno de campo de texto (≥ 3:1 contra a superfície). */
  borderStrong: string;
  // ---- texto ----
  text: string;
  textMuted: string;
  // ---- marca ----
  /** Azul para texto e ícone (AA sobre surface/background). */
  primary: string;
  /** Fundo de botão azul (texto `onPrimary` AA). */
  primaryStrong: string;
  primaryTint: string;
  onPrimary: string;
  /** Teal para ícone, anel e gráfico (≥ 3:1). */
  accent: string;
  /** Teal para texto (AA). */
  accentText: string;
  /** Fundo de botão teal (texto branco AA). */
  accentStrong: string;
  accentTint: string;
  danger: string;
  dangerText: string;
  dangerStrong: string;
  dangerTint: string;
  warning: string;
  warningText: string;
  warningTint: string;
  // ---- sobre fundos escuros (gradientes da marca e da emergência) ----
  onDark: string;
  onDarkMuted: string;
  onDarkFill: string;
  onDarkBorder: string;
  scrim: string;
  gradientBrand: readonly [string, string, string];
  gradientHero: readonly [string, string];
  gradientDanger: readonly [string, string];
  // ---- componentes ----
  chartBar: string;
  chartToday: string;
  shadow: string;
  tabBar: string;
  skeleton: string;
}

export const lightColors: ThemeColors = {
  mode: 'light',
  background: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF1F7',
  surfaceElevated: '#FFFFFF',
  border: '#E1E7F0',
  borderStrong: '#7A889C',
  text: brand.navy,
  textMuted: '#52627A',
  primary: brand.blue,
  primaryStrong: brand.blue,
  primaryTint: '#E4EDF9',
  onPrimary: brand.white,
  accent: brand.teal,
  accentText: '#00705F',
  accentStrong: brand.tealDeep,
  accentTint: '#DCF3EF',
  danger: '#D23B3B',
  dangerText: '#B3261E',
  dangerStrong: '#C62828',
  dangerTint: '#FCE8E6',
  warning: '#C77C02',
  warningText: '#8A5200',
  warningTint: '#FFF1DA',
  onDark: brand.white,
  onDarkMuted: 'rgba(255,255,255,0.88)',
  onDarkFill: 'rgba(255,255,255,0.14)',
  onDarkBorder: 'rgba(255,255,255,0.24)',
  scrim: 'rgba(9,27,51,0.55)',
  gradientBrand: [brand.abyss, brand.navy, brand.blue],
  gradientHero: ['#0B2A55', brand.blue],
  gradientDanger: ['#B3261E', '#7F1A15'],
  chartBar: brand.blue,
  chartToday: brand.teal,
  shadow: brand.navy,
  tabBar: '#FFFFFF',
  skeleton: '#E4E9F1',
};

export const darkColors: ThemeColors = {
  mode: 'dark',
  background: '#081221',
  surface: '#0F1C31',
  surfaceAlt: '#17273F',
  surfaceElevated: '#1A2C48',
  border: '#22344F',
  borderStrong: '#5A6F8E',
  text: '#F1F5FB',
  textMuted: '#A3B2C7',
  primary: '#8AB0F0',
  primaryStrong: '#2A62BA',
  primaryTint: '#172C4F',
  onPrimary: brand.white,
  accent: '#2CC3AE',
  accentText: '#4FD6C1',
  accentStrong: brand.tealDeep,
  accentTint: '#0D3A36',
  danger: '#FF6B6B',
  dangerText: '#FF8A80',
  dangerStrong: '#C62828',
  dangerTint: '#3F1A1D',
  warning: '#F2B24A',
  warningText: '#F7C46C',
  warningTint: '#3B2C12',
  onDark: brand.white,
  onDarkMuted: 'rgba(255,255,255,0.88)',
  onDarkFill: 'rgba(255,255,255,0.14)',
  onDarkBorder: 'rgba(255,255,255,0.24)',
  scrim: 'rgba(0,0,0,0.62)',
  gradientBrand: [brand.abyss, brand.navy, brand.blueDeep],
  gradientHero: ['#0E2A52', '#1A4C9A'],
  gradientDanger: ['#B3261E', '#7F1A15'],
  chartBar: '#6F9BE6',
  chartToday: '#2CC3AE',
  shadow: '#000000',
  tabBar: '#0C182B',
  skeleton: '#1B2E4B',
};

/** Escala de espaçamento (múltiplos de 4). */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/** Medidas de layout de tela. */
export const layout = {
  /** Margem lateral das telas. */
  gutter: spacing.xl,
  /** Espaço entre seções de uma tela. */
  section: spacing.xxxl,
  /** Respiro no fim do conteúdo rolável. */
  bottom: spacing.huge,
  /** Largura máxima do conteúdo (tablets e web). */
  maxContent: 560,
  /** Largura máxima de um bloco curto de texto centralizado (estados vazios). */
  textMax: 320,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Tamanhos fixos de componente. Alvos de toque nunca abaixo de `touch` (48 dp). */
export const sizes = {
  touch: 48,
  /** Símbolo da IrisFlow: `sm` cabeçalho · `md` login · `lg` boas-vindas · `xl` splash/carregando. */
  logo: { sm: 44, md: 56, lg: 72, xl: 96 },
  icon: { xs: 16, sm: 18, md: 22, lg: 28, xl: 36, hero: 48 },
  avatar: { sm: 40, md: 48, lg: 88 },
  /** Quadrados/círculos com ícone: `sm` métricas · `md` linhas de lista · `lg` destaques · `xl` estados vazios. */
  tile: { sm: 36, md: 40, lg: 56, xl: 68 },
  /** Altura mínima de uma linha de lista. */
  row: 64,
  button: { md: 52, lg: 60, xl: 68 },
  input: 56,
  tabBar: 64,
  badge: 20,
  dot: 8,
  hairline: StyleSheet.hairlineWidth,
  border: 1,
  borderThick: 2,
  /** Faixa lateral que marca a urgência de um cartão de alerta. */
  accentBar: 4,
  ring: { sm: 64, md: 84, lg: 104 },
  ringStroke: { sm: 7, md: 9 },
  chart: 112,
  /** Círculo central da tela de emergência. */
  emergencyIcon: 120,
  /** Campo de mensagem: altura máxima antes de rolar por dentro. */
  composerMax: 120,
} as const;

/**
 * Pilha de fontes do sistema — reserva para quando as fontes carregadas falham.
 */
export const systemFontStack = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}) as string;

/**
 * Inter em cinco pesos (carregados em `app/_layout.tsx` com `useFonts`). O peso vem
 * do arquivo da fonte, não de `fontWeight`: no Android, `fontWeight` sobre uma família
 * carregada por nome faz o sistema procurar outra variante e cair na fonte padrão.
 */
export const fonts = {
  display: 'Inter_800ExtraBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'display';

/**
 * Escala tipográfica (tamanho / altura de linha / tracking). Corpo mínimo de 15 px e
 * legenda de 14 px — o público é de cuidadores, muitos idosos. As únicas exceções são o
 * rótulo da barra de abas (13 px, limitado pelo espaço de cinco abas) e o número do selo.
 */
export const typeScale = {
  display: { fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  h1: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  h2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  h3: { fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  bodySmall: { fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  caption: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  label: { fontSize: 14, lineHeight: 20, letterSpacing: 0.6 },
  tab: { fontSize: 13, lineHeight: 16, letterSpacing: 0 },
  badge: { fontSize: 12, lineHeight: 14, letterSpacing: 0 },
} as const;

export type TypeVariant = keyof typeof typeScale;

/**
 * Até onde cada estilo acompanha o tamanho de fonte do sistema. Corpo vai até 2×
 * (o máximo do Android); títulos e rótulos de espaço fixo param antes, para o layout
 * não quebrar — os contêineres crescem na vertical em vez de cortar texto.
 */
export const fontScaleCap: Record<TypeVariant, number> = {
  display: 1.3,
  h1: 1.4,
  h2: 1.5,
  h3: 1.6,
  body: 2,
  bodySmall: 2,
  caption: 1.8,
  label: 1.6,
  tab: 1.2,
  badge: 1.2,
};

export const opacity = {
  /** Marcas de dado vazio (ex.: barra de um dia sem uso no gráfico). */
  faint: 0.25,
  disabled: 0.45,
  pressed: 0.85,
} as const;

export const zIndex = {
  banner: 50,
  overlay: 100,
} as const;

/** Durações e molas. Tudo é cortado quando o sistema pede "reduzir movimento". */
export const motion = {
  duration: { fast: 160, base: 260, slow: 420, pulse: 1800, breath: 2400 },
  /** Atraso entre itens de uma lista que entra em cascata. */
  stagger: 45,
  /** Escala no toque: botões e chips. */
  pressScale: 0.97,
  /** Escala no toque: superfícies grandes (cartões, linhas), que pedem um movimento menor. */
  pressScaleCard: 0.985,
  spring: {
    press: { damping: 15, stiffness: 320 },
    release: { damping: 14, stiffness: 260 },
    slide: { damping: 18, stiffness: 200 },
  },
} as const;

export const shadows = {
  /** Cartão comum: sombra discreta no claro; no escuro o contorno faz o trabalho. */
  card: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  }),
  /** Elementos que flutuam sobre o conteúdo (banner de conexão, seletor). */
  raised: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  }),
  /** Sombra tonificada — no máximo um elemento por tela (o cartão de status do Início). */
  glow: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  }),
};
