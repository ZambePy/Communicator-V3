import React from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { motion, opacity, useReduceMotion } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends PressableProps {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean | 'light' | 'medium' | 'heavy';
  children?: React.ReactNode;
  /** Animação de entrada do Reanimated (ver `useEntrada`). */
  entering?: React.ComponentProps<typeof Animated.View>['entering'];
}

/**
 * Base de todo toque do app: escala com mola + retorno tátil. Com "reduzir
 * movimento" ligado, a escala vira uma leve mudança de opacidade (o toque
 * continua visível, sem movimento). Com `onPress`, o papel padrão é "button".
 */
export function PressableScale({ style, scaleTo = motion.pressScale, haptic = 'light', onPressIn, onPressOut, onPress, children, accessibilityRole, ...rest }: Props) {
  const reduzir = useReduceMotion();
  const scale = useSharedValue(1);
  const fade = useSharedValue(1);
  // A opacidade que a tela pediu (ex.: item desabilitado) é preservada: o
  // retorno sem movimento multiplica em cima dela, não a substitui.
  const opacidadeBase = StyleSheet.flatten(style)?.opacity ?? 1;
  const animated = useAnimatedStyle(
    () => (reduzir ? { opacity: Number(opacidadeBase) * fade.value } : { transform: [{ scale: scale.value }] }),
    [reduzir, opacidadeBase],
  );

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
      {...rest}
      style={[style, animated]}
      onPressIn={(e) => {
        if (reduzir) fade.value = opacity.pressed;
        else scale.value = withSpring(scaleTo, motion.spring.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (reduzir) fade.value = 1;
        else scale.value = withSpring(1, motion.spring.release);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) {
          const estilo = haptic === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
          Haptics.impactAsync(estilo).catch(() => undefined);
        }
        onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
