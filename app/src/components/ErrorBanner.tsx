import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { useApp } from '@/store/AppProvider';
import { layout, radius, shadows, sizes, spacing, useEntrada, useTheme, zIndex } from '@/theme';
import { tipoDeFalha } from '@/utils/errors';

/**
 * Aviso global de conexão/atualização, sobre qualquer tela, abaixo da barra de
 * status. Diz o que houve em linguagem de gente (o texto técnico do erro não
 * chega à tela) e oferece a saída: "Tentar de novo". Alvos de 48 dp.
 */
export function ErrorBanner() {
  const { error, refresh, clearError } = useApp();
  const { colors, mode } = useTheme();
  const entrada = useEntrada();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  if (!error) return null;

  const tipo = tipoDeFalha(error);
  const offline = tipo === 'offline';
  const titulo = offline ? 'Sem internet no momento' : tipo === 'sessao' ? 'Sua sessão expirou' : 'Não conseguimos atualizar';
  const texto = offline ? 'Assim que a conexão voltar, atualizamos tudo.' : tipo === 'sessao' ? 'Entre de novo para continuar recebendo os alertas.' : 'Os dados podem estar desatualizados.';

  const tentar = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View
      entering={entrada.suave()}
      exiting={entrada.saida()}
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
      accessibilityLiveRegion="polite"
      testID="error-banner"
    >
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, mode === 'light' && shadows.raised(colors.shadow)]}>
        <View style={[styles.icon, { backgroundColor: offline ? colors.warningTint : colors.dangerTint }]}>
          <Ionicons name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={sizes.icon.md} color={offline ? colors.warningText : colors.dangerText} />
        </View>
        <View style={styles.texts}>
          <Text variant="bodySmall" weight="semibold">
            {titulo}
          </Text>
          <Text variant="caption" tone="muted">
            {texto}
          </Text>
          <PressableScale onPress={() => void tentar()} disabled={busy} accessibilityRole="button" accessibilityLabel="Tentar de novo" style={styles.retry}>
            <Ionicons name="refresh" size={sizes.icon.xs} color={colors.primary} />
            <Text variant="bodySmall" weight="semibold" tone="primary">
              {busy ? 'Tentando…' : 'Tentar de novo'}
            </Text>
          </PressableScale>
        </View>
        <IconButton icon="close" accessibilityLabel="Fechar aviso" onPress={clearError} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: layout.gutter, right: layout.gutter, zIndex: zIndex.banner },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, paddingLeft: spacing.md, paddingRight: spacing.xs, borderRadius: radius.lg, borderWidth: sizes.border },
  icon: { width: sizes.tile.md, height: sizes.tile.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: spacing.xxs, paddingTop: spacing.xxs },
  retry: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: sizes.touch, alignSelf: 'flex-start', marginBottom: -spacing.sm },
});
