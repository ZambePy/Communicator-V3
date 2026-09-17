/**
 * Tokens de design da IrisFlow — derivados do tópico 2.3 (Branding) do Plano de Negócios 2026.
 *
 *  • Azul institucional #1B54A8  → cor primária: símbolo, títulos, destaques (confiança, seriedade clínica)
 *  • Azul-marinho profundo #091B33 → pupila do símbolo e tipografia do logotipo (ancoragem e contraste)
 *  • Verde-teal #00A693          → confirmação e indicadores positivos (vitalidade, cuidado)
 *  • Branco e neutros claros     → fundos, clareza e respiro visual
 *
 * Regra tipográfica do plano: nenhum texto essencial em corpo reduzido, nenhum texto em baixo
 * contraste e hierarquia visual explícita.
 */
import { Platform } from 'react-native';

export const brand = {
  blue: '#1B54A8',
  blueDeep: '#143F80',
  blueSoft: '#3D74C8',
  blueTint: '#E3ECF8',
  azure: '#4F86D9',
  navy: '#091B33',
  navySoft: '#12284A',
  abyss: '#050B1B',
  teal: '#00A693',
  tealDeep: '#00806F',
  tealSoft: '#2FC2AF',
  tealTint: '#DDF5F1',
  white: '#FFFFFF',
} as const;

/**
 * Espectro de refração — evocação da íris fotográfica do banner da marca.
 * Uso restrito: apenas como fio de luz na íris animada e no halo do cabeçalho.
 * Nunca em ícone, botão, texto ou fundo de UI (destoa do tom clínico).
 */
export const spectrum = {
  cyan: '#7CE0FF',
  violet: '#B48CFF',
  rose: '#FF8FA3',
} as const;

export const semantic = {
  danger: '#D64545',
  dangerTint: '#FBE4E4',
  warning: '#E39B2B',
  warningTint: '#FCF0DA',
  info: '#1B54A8',
} as const;

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  mode: ThemeMode;
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textMuted: string;
  textOnPrimary: string;
  primary: string;
  primaryDeep: string;
  primaryTint: string;
  accent: string;
  accentDeep: string;
  accentTint: string;
  danger: string;
  dangerTint: string;
  warning: string;
  warningTint: string;
  overlay: string;
  gradientHeader: readonly [string, string, string];
  gradientAccent: readonly [string, string];
  gradientDanger: readonly [string, string];
  shadow: string;
  tabBar: string;
  skeleton: string;
}

export const lightColors: ThemeColors = {
  mode: 'light',
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF2F9',
  surfaceElevated: '#FFFFFF',
  border: '#DCE4EF',
  text: brand.navy,
  textMuted: '#5B6B82',
  textOnPrimary: brand.white,
  primary: brand.blue,
  primaryDeep: brand.blueDeep,
  primaryTint: brand.blueTint,
  accent: brand.teal,
  accentDeep: brand.tealDeep,
  accentTint: brand.tealTint,
  danger: semantic.danger,
  dangerTint: semantic.dangerTint,
  warning: semantic.warning,
  warningTint: semantic.warningTint,
  overlay: 'rgba(9,27,51,0.55)',
  gradientHeader: [brand.abyss, brand.navy, brand.blue],
  gradientAccent: [brand.teal, brand.tealSoft],
  gradientDanger: ['#B43232', '#E05A5A'],
  shadow: brand.navy,
  tabBar: 'rgba(255,255,255,0.92)',
  skeleton: '#E4EAF3',
};

export const darkColors: ThemeColors = {
  mode: 'dark',
  background: '#070F1E',
  surface: '#0F1F38',
  surfaceAlt: '#16294A',
  surfaceElevated: '#1A2F55',
  border: '#22375C',
  text: '#F2F6FB',
  textMuted: '#9FB0C8',
  textOnPrimary: brand.white,
  primary: '#4F86D9',
  primaryDeep: brand.blue,
  primaryTint: '#16294A',
  accent: '#2AC4AE',
  accentDeep: brand.teal,
  accentTint: '#0F3A36',
  danger: '#F06565',
  dangerTint: '#3B1A1A',
  warning: '#F0B04A',
  warningTint: '#3D2E12',
  overlay: 'rgba(0,0,0,0.6)',
  gradientHeader: [brand.abyss, brand.navy, brand.blueDeep],
  gradientAccent: [brand.tealDeep, brand.teal],
  gradientDanger: ['#8E2323', '#C94343'],
  shadow: '#000000',
  tabBar: 'rgba(11,25,48,0.92)',
  skeleton: '#1B2E50',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  pill: 999,
} as const;

/**
 * Pilha de fontes do sistema — usada nos títulos de destaque.
 * A Boldonse foi retirada do projeto (não havia o .ttf empacotado e o plugin expo-font
 * apontava para um arquivo inexistente, quebrando o prebuild). Nada aqui depende de
 * carregamento assíncrono: o sistema já tem a fonte quando a primeira tela pinta.
 */
export const systemFontStack = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}) as string;

export const fonts = {
  display: systemFontStack,
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Escala tipográfica — corpo mínimo de 15px por exigência de legibilidade do plano. */
export const typeScale = {
  display: 30,
  h1: 26,
  h2: 21,
  h3: 17,
  body: 16,
  bodySmall: 15,
  caption: 13,
} as const;

export const shadows = {
  card: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  }),
  float: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  }),
  /** Sombra tonificada — usar só em um card por tela para marcar hierarquia. */
  glow: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  }),
};
