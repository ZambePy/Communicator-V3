import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { EASE_OUT, motion, radius, spacing, useReduceMotion, useTheme } from '@/theme';

interface Props {
  passo: number;
  total?: number;
  /** Sem `onVoltar`, o botão não aparece. */
  onVoltar?: () => void;
}

/**
 * Topo de cada passo do cadastro (mock 03-05): voltar, "Passo N de 3" e a
 * barra que avança. A barra é absoluta e sem filhos: animar a largura não
 * remonta o resto da tela.
 */
export function PassosDoCadastro({ passo, total = 3, onVoltar }: Props) {
  const { colors } = useTheme();
  const reduzir = useReduceMotion();
  const fracao = useSharedValue(passo / total);
  useEffect(() => {
    fracao.value = reduzir ? passo / total : withTiming(passo / total, { duration: motion.duration.slow, easing: EASE_OUT });
  }, [passo, total, reduzir, fracao]);
  const preenchido = useAnimatedStyle(() => ({ width: `${fracao.value * 100}%` }));

  return (
    <View style={styles.wrap}>
      {onVoltar ? <IconButton icon="chevron-back" variant="tinted" accessibilityLabel="Voltar" onPress={onVoltar} style={styles.voltar} /> : <View style={styles.semVoltar} />}
      <Text variant="bodySmall" weight="semibold" tone="muted" accessibilityLabel={`Passo ${passo} de ${total}`}>
        Passo {passo} de {total}
      </Text>
      <View
        style={[styles.trilho, { backgroundColor: colors.dotIdle }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: passo }}
      >
        <Animated.View style={[styles.barra, { backgroundColor: colors.accent }, preenchido]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xxl },
  voltar: { marginBottom: spacing.xl },
  semVoltar: { height: spacing.lg },
  trilho: { height: 4, borderRadius: radius.pill, marginTop: spacing.sm, overflow: 'hidden' },
  barra: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
});
