import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from './Text';
import { motion, sizes, useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  caption?: string;
  /** Texto dos rótulos sobre fundo escuro. */
  onDark?: boolean;
  /** Lido pelo leitor de tela, ex.: "Acerto de 96 por cento". */
  accessibilityLabel?: string;
}

/** Anel de progresso (SVG) para taxas como o acerto em alvo. Sem animação com "reduzir movimento". */
export function ProgressRing({ value, size = sizes.ring.md, stroke = sizes.ringStroke.md, color, trackColor, label, caption, onDark, accessibilityLabel }: Props) {
  const { colors, reduceMotion } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const alvo = Math.max(0, Math.min(1, value));
  const progress = useSharedValue(reduceMotion ? alvo : 0);

  useEffect(() => {
    progress.value = reduceMotion ? alvo : withTiming(alvo, { duration: motion.duration.slow * 2.5, easing: Easing.out(Easing.cubic) });
  }, [alvo, progress, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.value) }));

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? [label, caption].filter(Boolean).join(' ')}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(alvo * 100) }}
    >
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, styles.rotate]}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? (onDark ? colors.onDarkFill : colors.surfaceAlt)} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color ?? colors.accent} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} animatedProps={animatedProps} />
      </Svg>
      {label ? (
        <Text variant="h3" weight="bold" tone={onDark ? 'onDark' : 'default'} maxFontSizeMultiplier={1.2}>
          {label}
        </Text>
      ) : null}
      {caption ? (
        <Text variant="caption" tone={onDark ? 'onDarkMuted' : 'muted'} maxFontSizeMultiplier={1.1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  rotate: { transform: [{ rotate: '-90deg' }] },
});
