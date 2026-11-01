import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInputProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { Notice } from './Notice';
import { Text } from './Text';
import { TextField } from './TextField';
import { layout, radius, sizes, spacing, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';

interface Props {
  visivel: boolean;
  titulo: string;
  rotulo: string;
  valorInicial: string;
  placeholder?: string;
  teclado?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** Devolve a mensagem do que está errado, ou `null`. */
  validar?: (v: string) => string | null;
  /** Grava. Rejeita com a mensagem para a tela; a folha fica aberta com o texto. */
  onSalvar: (v: string) => Promise<void>;
  onFechar: () => void;
}

/** Folha de baixo para editar um campo só (nome, celular). */
export function FolhaDeEdicao({ visivel, titulo, rotulo, valorInicial, placeholder, teclado, autoCapitalize = 'sentences', validar, onSalvar, onFechar }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [valor, setValor] = useState(valorInicial);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  useEffect(() => {
    if (visivel) {
      setValor(valorInicial);
      setFalha(null);
    }
  }, [visivel, valorInicial]);

  const invalido = validar ? validar(valor) : null;

  const salvar = async () => {
    if (salvando) return;
    if (invalido) {
      setFalha(invalido);
      return;
    }
    setSalvando(true);
    setFalha(null);
    try {
      await onSalvar(valor);
      onFechar();
    } catch (e) {
      setFalha(mensagemDeErro(e, 'Não deu para salvar agora. Tente de novo.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <KeyboardAvoidingView behavior="padding" style={styles.raiz}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={[styles.folha, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.xl }]} accessibilityViewIsModal>
          <View style={[styles.alca, { backgroundColor: colors.border }]} />
          <Text variant="h2" accessibilityRole="header">
            {titulo}
          </Text>
          <TextField
            label={rotulo}
            value={valor}
            onChangeText={setValor}
            placeholder={placeholder}
            keyboardType={teclado}
            autoCapitalize={autoCapitalize}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void salvar()}
            style={styles.campo}
          />
          {falha ? <Notice tone="danger" text={falha} style={styles.campo} /> : null}
          <View style={styles.acoes}>
            <Button title="Cancelar" variant="outline" onPress={onFechar} style={styles.flex} />
            <Button title="Salvar" loading={salvando} onPress={() => void salvar()} style={styles.flex} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  raiz: { flex: 1, justifyContent: 'flex-end' },
  folha: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: layout.gutter, paddingTop: spacing.md },
  alca: { alignSelf: 'center', width: sizes.touch - spacing.sm, height: spacing.xs, borderRadius: radius.pill, marginBottom: spacing.lg },
  campo: { marginTop: spacing.lg },
  acoes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
});
