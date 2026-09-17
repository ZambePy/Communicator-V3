import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { brand } from '@/theme';

/** Orbes translúcidos que flutuam lentamente — textura de fundo do cabeçalho, sem distrair. */
export function IrisOrbs() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t]);

  const a = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * 24 }, { translateY: t.value * -14 }, { scale: 1 + t.value * 0.08 }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * -18 }, { translateY: t.value * 20 }] }));
  const c = useAnimatedStyle(() => ({ transform: [{ translateY: t.value * 12 }, { scale: 1 - t.value * 0.06 }] }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.orb, styles.a, a]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.b, b]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.c, c]} />
    </>
  );
}

const styles = StyleSheet.create({
  orb: { position: 'absolute', borderRadius: 999 },
  a: { width: 260, height: 260, right: -80, top: -90, backgroundColor: 'rgba(255,255,255,0.07)' },
  b: { width: 180, height: 180, left: -60, bottom: -40, backgroundColor: `${brand.teal}33` },
  c: { width: 120, height: 120, right: 60, bottom: -30, backgroundColor: 'rgba(255,255,255,0.05)' },
});
