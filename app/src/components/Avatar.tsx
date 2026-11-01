import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { corDoAvatar, radius, sizes, useTheme } from '@/theme';
import { initials } from '@/utils/format';

interface Props {
  name?: string | null;
  /** O que fixa a cor (o id da pessoa). Sem ele, o nome. A mesma pessoa tem sempre a mesma cor. */
  chave?: string | null;
  size?: keyof typeof sizes.avatar;
  /** Sobre gradiente escuro. */
  onDark?: boolean;
  /** Só a primeira letra (o mock usa "C", não "CS"). */
  umaLetra?: boolean;
}

/**
 * Iniciais da pessoa num círculo, numa cor estável (31/10/2026: sem foto —
 * nenhuma biblioteca de imagem é dependência do app). Decorativo: quem usa já
 * mostra o nome ao lado.
 */
export function Avatar({ name, chave, size = 'md', onDark, umaLetra }: Props) {
  const { colors } = useTheme();
  const d = sizes.avatar[size];
  const cor = corDoAvatar(chave ?? name);
  const letras = name ? (umaLetra ? name.trim().charAt(0).toUpperCase() : initials(name)) : '·';
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.circle, { width: d, height: d, backgroundColor: onDark ? colors.onDarkFill : cor.bg, borderColor: onDark ? colors.onDarkBorder : 'transparent' }]}
    >
      <Text variant={size === 'lg' ? 'display' : size === 'md' ? 'h3' : 'bodySmall'} weight="heading" style={{ color: onDark ? colors.onDark : cor.fg }} maxFontSizeMultiplier={1}>
        {letras}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: sizes.border },
});
