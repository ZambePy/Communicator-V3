import React from 'react';
import { AccessibilityRole, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { motion, radius, shadows, sizes, spacing, useEntrada, useTheme } from '@/theme';

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

/** Superfície de conteúdo. Cartões coloridos (`tone`) ficam sem sombra — só a cor. */
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
      borderWidth: tone === 'surface' || tone === 'outline' ? sizes.border : 0,
    },
    tone === 'surface' && mode === 'light' && shadows.card(colors.shadow),
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
