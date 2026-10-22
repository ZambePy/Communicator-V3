import React from 'react';
import { AccessibilityRole, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { motion, radius, sizes, spacing, useEntrada, useTheme } from '@/theme';

export type CardTone = 'surface' | 'primary' | 'accent' | 'danger' | 'warning' | 'muted' | 'outline';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Posição na cascata de entrada da tela (atraso de `índice × stagger`).
   * Omitido = sem animação. Cortada com "reduzir movimento".
   */
  index?: number;
  tone?: CardTone;
  padding?: number;
  /** Cartão inteiro tocável (ex.: atalho para outra tela). */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  testID?: string;
}

/**
 * Superfície de conteúdo, chapada (19/10/2026): sem sombra em nenhum tema. No
 * escuro, o painel se separa do fundo pelo tom; no claro, por um fio de borda.
 * Use pouco — uma superfície por tela é a regra; o resto se organiza por espaço
 * e títulos de seção.
 */
export function Card({ children, style, index, tone = 'surface', padding = spacing.lg, onPress, accessibilityLabel, accessibilityHint, accessibilityRole, testID }: Props) {
  const { colors, mode } = useTheme();
  const entrada = useEntrada();
  const bg: Record<CardTone, string> = {
    surface: colors.surface,
    primary: colors.primaryTint,
    accent: colors.accentTint,
    danger: colors.dangerTint,
    warning: colors.warningTint,
    muted: colors.surfaceAlt,
    outline: 'transparent',
  };
  const base = [
    styles.card,
    {
      backgroundColor: bg[tone],
      padding,
      borderColor: colors.border,
      // No escuro, o painel já se separa do fundo pelo tom; a borda fica para o
      // claro (branco sobre cinza-azulado) e para o `outline`.
      borderWidth: tone === 'outline' || (tone === 'surface' && mode === 'light') ? sizes.border : 0,
    },
    style,
  ];
  const entering = index === undefined ? undefined : entrada.cascata(index);

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        scaleTo={motion.pressScaleCard}
        entering={entering}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
        style={base}
      >
        {children}
      </PressableScale>
    );
  }
  return (
    <Animated.View entering={entering} style={base} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} testID={testID}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg },
});
