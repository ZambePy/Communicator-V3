import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { radius, useTheme } from '@/theme';

/** Placeholder de carregamento com pulso suave. */
export function Shimmer({ style, height = 16 }: { style?: StyleProp<ViewStyle>; height?: number }) {
  const { colors } = useTheme();
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, borderRadius: radius.sm, backgroundColor: colors.skeleton }, style, s]} />;
}
