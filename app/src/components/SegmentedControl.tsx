import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { radius, spacing, useTheme } from '@/theme';

interface Option<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

interface Props<T extends string | number> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}

/** Seletor segmentado com indicador deslizante (spring). */
export function SegmentedControl<T extends string | number>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(0);
  const segW = width / options.length;

  useEffect(() => {
    x.value = withSpring(idx * segW, { damping: 16, stiffness: 180 });
  }, [idx, segW, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 8)}>
      {width > 0 && <Animated.View style={[styles.indicator, { width: segW, backgroundColor: colors.surface, shadowColor: colors.shadow }, indicator]} />}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            style={styles.seg}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <Text variant="bodySmall" weight={active ? 'semibold' : 'medium'} tone={active ? 'primary' : 'muted'} center>
              {o.label}
            </Text>
            {o.hint && (
              <Text variant="caption" tone="muted" center style={{ fontSize: 11, lineHeight: 14 }}>
                {o.hint}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.md, padding: 4, position: 'relative' },
  indicator: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.sm, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  seg: { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
});
