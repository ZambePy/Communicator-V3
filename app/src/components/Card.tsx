import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { radius, shadows, spacing, useTheme } from '@/theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** aceito para compatibilidade; hoje ignorado (evita cascade genérico). */
  index?: number;
  animated?: boolean;
  tone?: 'surface' | 'primary' | 'accent' | 'danger' | 'warning' | 'outline';
  padding?: number;
  /**
   * Marca hierarquia com glow colorido. Usar em NO MÁXIMO um card por tela
   * (o mais importante — sessão ao vivo, alerta aberto). Sem parâmetro = sem glow.
   */
  glow?: 'primary' | 'accent' | 'danger';
}

export function Card({ children, style, animated = false, tone = 'surface', padding = spacing.lg, glow }: Props) {
  const { colors } = useTheme();
  const bg =
    tone === 'primary'
      ? colors.primaryTint
      : tone === 'accent'
        ? colors.accentTint
        : tone === 'danger'
          ? colors.dangerTint
          : tone === 'warning'
            ? colors.warningTint
            : tone === 'outline'
              ? 'transparent'
              : colors.surface;

  const glowColor = glow === 'primary' ? colors.primary : glow === 'accent' ? colors.accent : glow === 'danger' ? colors.danger : undefined;

  const base = [
    styles.card,
    { backgroundColor: bg, padding, borderColor: colors.border, borderWidth: tone === 'outline' ? 1 : StyleSheet.hairlineWidth },
    // Sombras: só surfaces "brancas" recebem shadow discreto; toned cards ficam com borda apenas.
    tone === 'surface' && !glow && shadows.card(colors.shadow),
    glowColor && shadows.glow(glowColor),
    style,
  ];

  if (!animated) return <View style={base}>{children}</View>;
  return (
    <Animated.View entering={FadeIn.duration(360)} style={base}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'visible' },
});
