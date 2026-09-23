import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Text } from './Text';
import { motion, radius, sizes, spacing, useTheme } from '@/theme';

export type PillTone = 'accent' | 'primary' | 'danger' | 'warning' | 'muted';

interface Props {
  label: string;
  tone?: PillTone;
  /** Ponto pulsante: algo acontecendo agora (sessão ao vivo, socorro aguardando). */
  live?: boolean;
  /** Versão para fundos escuros (gradientes). */
  onDark?: boolean;
}

/** Selo de estado (não é tocável). O texto sempre acompanha a cor — nunca só a cor. */
export function StatusPill({ label, tone = 'accent', live, onDark }: Props) {
  const { colors } = useTheme();
  const cor: Record<PillTone, { fg: string; dot: string; bg: string }> = {
    accent: { fg: colors.accentText, dot: colors.accent, bg: colors.accentTint },
    primary: { fg: colors.primary, dot: colors.primary, bg: colors.primaryTint },
    danger: { fg: colors.dangerText, dot: colors.danger, bg: colors.dangerTint },
    warning: { fg: colors.warningText, dot: colors.warning, bg: colors.warningTint },
    muted: { fg: colors.textMuted, dot: colors.textMuted, bg: colors.surfaceAlt },
  };
  const c = cor[tone];
  const fg = onDark ? colors.onDark : c.fg;
  const dot = onDark ? (tone === 'accent' ? colors.accent : colors.onDark) : c.dot;
  return (
    <View style={[styles.pill, { backgroundColor: onDark ? colors.onDarkFill : c.bg }]}>
      {live ? <LiveDot color={dot} /> : <View style={[styles.dot, { backgroundColor: dot }]} />}
      <Text variant="caption" weight="semibold" style={[styles.label, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
}

/** Ponto com anel que se expande. Parado quando o sistema pede menos movimento. */
export function LiveDot({ color, size = sizes.dot }: { color: string; size?: number }) {
  const { reduceMotion } = useTheme();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(p);
      p.value = 0;
      return;
    }
    p.value = withRepeat(withTiming(1, { duration: motion.duration.pulse, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [p, reduceMotion]);
  const ring = useAnimatedStyle(() => ({ opacity: reduceMotion ? 0 : 1 - p.value, transform: [{ scale: 1 + p.value * 2.2 }] }), [reduceMotion]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ring]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + spacing.xxs, borderRadius: radius.pill, alignSelf: 'flex-start', maxWidth: '100%' },
  dot: { width: sizes.dot, height: sizes.dot, borderRadius: sizes.dot / 2 },
  label: { flexShrink: 1 },
});
