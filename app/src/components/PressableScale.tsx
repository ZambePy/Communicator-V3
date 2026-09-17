import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends PressableProps {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean | 'light' | 'medium' | 'heavy';
  children?: React.ReactNode;
}

/** Botão com micro-interação de escala (spring) e retorno háptico. */
export function PressableScale({ style, scaleTo = 0.965, haptic = 'light', onPressIn, onPressOut, onPress, children, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animated]}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, { damping: 14, stiffness: 300 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 12, stiffness: 260 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) {
          const style = haptic === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
          Haptics.impactAsync(style).catch(() => undefined);
        }
        onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
