import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from './Text';
import { haptics } from '@/lib/haptics';
import { motion, opacity, radius, shadows, sizes, spacing, useTheme } from '@/theme';

interface Option<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
  /** Texto lido pelo leitor de tela, quando o rótulo visível é abreviado (ex.: "A–Z"). */
  accessibilityLabel?: string;
}

interface Props<T extends string | number> {
  options: Option<T>[];
  /** `null` = nada selecionado (ajuste ainda não definido pelo cuidador). */
  value: T | null;
  onChange: (v: T) => void;
  /** Nome do grupo para leitores de tela (ex.: "Tempo de fixação"). */
  accessibilityLabel?: string;
  /** Mostra as opções sem aceitar toque — ex.: ajuste que o computador ainda não aplica. */
  disabled?: boolean;
}

/**
 * Seletor segmentado com indicador deslizante. Segmentos de no mínimo 48 dp;
 * com fonte grande o texto quebra linha e o trilho cresce, sem cortar nada.
 * Com "reduzir movimento", o indicador pula direto para o lugar.
 */
export function SegmentedControl<T extends string | number>({ options, value, onChange, accessibilityLabel, disabled = false }: Props<T>) {
  const { colors, mode, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const found = options.findIndex((o) => o.value === value);
  const idx = Math.max(0, found);
  const semSelecao = found < 0;
  const x = useSharedValue(0);
  const segW = width / options.length;

  useEffect(() => {
    x.value = reduceMotion ? idx * segW : withSpring(idx * segW, motion.spring.slide);
  }, [idx, segW, x, reduceMotion]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={[styles.track, { backgroundColor: colors.surfaceAlt }, disabled && { opacity: opacity.disabled }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - spacing.xs * 2)}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { disabled: true } : undefined}
    >
      {width > 0 && !semSelecao && (
        <Animated.View style={[styles.indicator, { width: segW, backgroundColor: colors.surface, borderColor: colors.border }, mode === 'light' && shadows.card(colors.shadow), indicator]} />
      )}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            style={styles.seg}
            disabled={disabled}
            onPress={() => {
              if (active || disabled) return;
              haptics.selecao();
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active, disabled }}
            accessibilityLabel={[o.accessibilityLabel ?? o.label, o.hint].filter(Boolean).join(', ')}
          >
            <Text variant="bodySmall" weight={active ? 'semibold' : 'medium'} tone={active ? 'primary' : 'muted'} center>
              {o.label}
            </Text>
            {o.hint ? (
              <Text variant="caption" tone="muted" center>
                {o.hint}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.md, padding: spacing.xs },
  indicator: { position: 'absolute', top: spacing.xs, bottom: spacing.xs, left: spacing.xs, borderRadius: radius.sm, borderWidth: sizes.hairline },
  seg: { flex: 1, minHeight: sizes.touch, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
});
