import React, { forwardRef, useState } from 'react';
import { StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { fonts, radius, sizes, spacing, typeScale, useTheme } from '@/theme';

interface Props extends Omit<TextInputProps, 'style'> {
  /** Rótulo visível acima do campo (também é o nome lido pelo leitor de tela). */
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Acessório à direita, dentro do campo (ex.: mostrar/ocultar senha). */
  right?: React.ReactNode;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
}

/** Campo de texto com rótulo visível, 56 dp de altura e contorno com contraste ≥ 3:1. */
export const TextField = forwardRef<TextInput, Props>(function TextField({ label, icon, right, error, style, onFocus, onBlur, ...rest }, ref) {
  const { colors, mode } = useTheme();
  const [foco, setFoco] = useState(false);
  const borda = error ? colors.danger : foco ? colors.primary : colors.borderStrong;
  return (
    <View style={style}>
      <Text variant="caption" weight="semibold" tone="muted" style={styles.label}>
        {label}
      </Text>
      <View style={[styles.box, { backgroundColor: colors.surface, borderColor: borda, borderWidth: foco || error ? sizes.borderThick : sizes.border }]}>
        {icon ? <Ionicons name={icon} size={sizes.icon.sm} color={foco ? colors.primary : colors.textMuted} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={mode}
          selectionColor={colors.primary}
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          maxFontSizeMultiplier={1.6}
          {...rest}
          onFocus={(e) => {
            setFoco(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFoco(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: colors.text }]}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { marginBottom: spacing.xs },
  box: { minHeight: sizes.input, borderRadius: radius.md, paddingLeft: spacing.lg, paddingRight: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // O foco já aparece na borda do campo (2 dp, azul); no web, o contorno padrão
  // do navegador por dentro dela seria um segundo anel.
  input: { flex: 1, minHeight: sizes.input - spacing.xs, fontFamily: fonts.regular, fontSize: typeScale.body.fontSize, paddingVertical: spacing.sm, outlineWidth: 0 },
  error: { marginTop: spacing.xs },
});
