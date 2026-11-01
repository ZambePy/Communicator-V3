import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Text';
import { fonts, radius, sizes, spacing, useTheme } from '@/theme';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Os 4 dígitos estão completos. */
  onCompleto?: (v: string) => void;
  digitos?: number;
  erro?: boolean;
  editavel?: boolean;
}

/**
 * Os 4 números do e-mail (mock 04). Um campo de texto de verdade fica por
 * baixo (teclado numérico, colar e o preenchimento automático do código do
 * sistema funcionam); as caixas só desenham o que foi digitado.
 */
export const CampoDeCodigo = forwardRef<TextInput, Props>(function CampoDeCodigo({ value, onChange, onCompleto, digitos = 4, erro, editavel = true }, ref) {
  const { colors, mode } = useTheme();
  const [foco, setFoco] = useState(false);
  const interno = React.useRef<TextInput>(null);
  const alvo = (ref as React.RefObject<TextInput | null>) ?? interno;

  return (
    <Pressable onPress={() => alvo.current?.focus()} accessible={false} style={styles.linha}>
      {Array.from({ length: digitos }, (_, i) => {
        const atual = foco && i === Math.min(value.length, digitos - 1);
        const borda = erro ? colors.danger : atual ? colors.primary : colors.fieldBorder;
        return (
          <View key={i} style={[styles.caixa, { backgroundColor: colors.surface, borderColor: borda, borderWidth: atual || erro ? 2 : 1.5 }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Text variant="display" weight="heading" maxFontSizeMultiplier={1.2}>
              {value[i] ?? ''}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={alvo}
        value={value}
        onChangeText={(t) => {
          const v = t.replace(/\D/g, '').slice(0, digitos);
          onChange(v);
          if (v.length === digitos) onCompleto?.(v);
        }}
        editable={editavel}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={digitos}
        autoFocus
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        keyboardAppearance={mode}
        caretHidden
        accessibilityLabel={`Código de ${digitos} números`}
        testID="campo-do-codigo"
        style={styles.escondido}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', gap: spacing.md },
  caixa: { flex: 1, height: sizes.digito, borderRadius: radius.lg - 4, alignItems: 'center', justifyContent: 'center' },
  // Fica sobre as caixas, transparente: o toque abre o teclado e o colar funciona.
  escondido: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, color: 'transparent', fontFamily: fonts.regular },
});
