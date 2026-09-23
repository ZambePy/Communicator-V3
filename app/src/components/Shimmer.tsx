import React, { useEffect } from 'react';
import { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { motion, radius, spacing, useTheme } from '@/theme';

interface Props {
  style?: StyleProp<ViewStyle>;
  height?: number;
  width?: DimensionValue;
}

/** Placeholder de carregamento com pulso suave (parado com "reduzir movimento"). */
export function Shimmer({ style, height = spacing.lg, width }: Props) {
  const { colors, reduceMotion } = useTheme();
  const o = useSharedValue(reduceMotion ? 0.8 : 0.5);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(o);
      o.value = 0.8;
      return;
    }
    o.value = withRepeat(withTiming(1, { duration: motion.duration.slow * 2, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(o);
  }, [o, reduceMotion]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, width, borderRadius: radius.sm, backgroundColor: colors.skeleton }, style, s]} />;
}
