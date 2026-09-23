import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { radius, sizes, useTheme } from '@/theme';
import { initials } from '@/utils/format';

interface Props {
  name?: string | null;
  size?: keyof typeof sizes.avatar;
  /** Sobre gradiente escuro. */
  onDark?: boolean;
}

/** Iniciais da pessoa num círculo. Decorativo: quem usa já mostra o nome ao lado. */
export function Avatar({ name, size = 'md', onDark }: Props) {
  const { colors } = useTheme();
  const d = sizes.avatar[size];
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.circle, { width: d, height: d, backgroundColor: onDark ? colors.onDarkFill : colors.primaryTint, borderColor: onDark ? colors.onDarkBorder : 'transparent' }]}
    >
      <Text variant={size === 'lg' ? 'h1' : 'bodySmall'} weight="bold" tone={onDark ? 'onDark' : 'primary'} maxFontSizeMultiplier={1}>
        {name ? initials(name) : '·'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: sizes.border },
});
