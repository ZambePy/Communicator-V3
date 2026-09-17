import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Text } from './Text';
import { radius, spacing, useTheme } from '@/theme';

interface Props {
  label: string;
  tone?: 'accent' | 'primary' | 'danger' | 'warning' | 'muted';
  live?: boolean;
  onDark?: boolean;
}

export function StatusPill({ label, tone = 'accent', live, onDark }: Props) {
  const { colors } = useTheme();
  const color = tone === 'accent' ? colors.accent : tone === 'primary' ? colors.primary : tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.textMuted;
  const bg = onDark ? 'rgba(255,255,255,0.14)' : tone === 'accent' ? colors.accentTint : tone === 'primary' ? colors.primaryTint : tone === 'danger' ? colors.dangerTint : tone === 'warning' ? colors.warningTint : colors.surfaceAlt;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {live ? <LiveDot color={onDark ? '#FFFFFF' : color} /> : <View style={[styles.dot, { backgroundColor: onDark ? '#FFFFFF' : color }]} />}
      <Text variant="caption" weight="semibold" style={{ color: onDark ? '#FFFFFF' : color }}>
        {label}
      </Text>
    </View>
  );
}

export function LiveDot({ color, size = 8 }: { color: string; size?: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [p]);
  const ring = useAnimatedStyle(() => ({ opacity: 1 - p.value, transform: [{ scale: 1 + p.value * 2.2 }] }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ring]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, alignSelf: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
