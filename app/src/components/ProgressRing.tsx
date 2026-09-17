import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from './Text';
import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  caption?: string;
}

/** Anel de progresso animado (SVG) para métricas como taxa de acerto e progresso da sessão. */
export function ProgressRing({ value, size = 84, stroke = 9, color, label, caption }: Props) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [value, progress]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.value) }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color ?? colors.accent} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} animatedProps={animatedProps} />
      </Svg>
      {label && (
        <Text variant="h3" weight="bold" style={{ fontSize: size * 0.22, lineHeight: size * 0.26 }}>
          {label}
        </Text>
      )}
      {caption && (
        <Text variant="caption" tone="muted" style={{ fontSize: Math.max(10, size * 0.12), lineHeight: size * 0.15 }}>
          {caption}
        </Text>
      )}
    </View>
  );
}
