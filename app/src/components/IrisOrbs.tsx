import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { radius, useTheme } from '@/theme';

/**
 * Orbes translúcidos que flutuam lentamente — textura de fundo das telas de
 * marca (boas-vindas), sem distrair. Parados com "reduzir movimento".
 */
export function IrisOrbs() {
  const { colors, reduceMotion } = useTheme();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [t, reduceMotion]);

  const a = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * 24 }, { translateY: t.value * -14 }, { scale: 1 + t.value * 0.08 }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * -18 }, { translateY: t.value * 20 }] }));
  const c = useAnimatedStyle(() => ({ transform: [{ translateY: t.value * 12 }, { scale: 1 - t.value * 0.06 }] }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.orb, styles.a, { backgroundColor: colors.onDarkFill }, a]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.b, { backgroundColor: colors.accent }, b]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.c, { backgroundColor: colors.onDarkFill }, c]} />
    </>
  );
}

const styles = StyleSheet.create({
  orb: { position: 'absolute', borderRadius: radius.pill },
  a: { width: 260, height: 260, right: -80, top: -90, opacity: 0.5 },
  b: { width: 180, height: 180, left: -60, bottom: -40, opacity: 0.2 },
  c: { width: 120, height: 120, right: 60, bottom: -30, opacity: 0.35 },
});
