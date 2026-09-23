import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { Button, IrisLogo, Text } from '@/components';
import { legalLinks } from '@/lib/config';
import { layout, radius, sizes, spacing, useTheme } from '@/theme';

/**
 * O app não tem como falar com o servidor: o build saiu sem
 * EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Nunca vira modo de
 * demonstração — o cuidador vê um aviso neutro e humano, e quem desenvolve vê o
 * motivo técnico no console.
 *
 * "Tentar de novo" recarrega o app (`expo-updates`): se uma atualização OTA com
 * a configuração certa já foi publicada, ela entra aqui. No Expo Go/dev o
 * recarregamento não existe, e o botão só confirma que ainda não deu.
 */
export function ServicoIndisponivel() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const [tentando, setTentando] = useState(false);
  const [ainda, setAinda] = useState(false);

  useEffect(() => {
    console.error('[IrisFlow Cuidador] Build sem EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY: confira app/.env ou o "env" do perfil no eas.json.');
  }, []);

  const tentar = async () => {
    setTentando(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setAinda(true);
    } finally {
      setTentando(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + spacing.huge, paddingBottom: insets.bottom + spacing.xxl }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.center}>
        <IrisLogo size={sizes.logo.xl} spinning={false} breathing={false} />
        <View style={[styles.badge, { backgroundColor: colors.warningTint }]}>
          <Ionicons name="cloud-offline-outline" size={sizes.icon.md} color={colors.warningText} />
        </View>
        <Text variant="h2" center accessibilityRole="header" style={styles.title}>
          Não conseguimos conectar agora
        </Text>
        <Text variant="body" tone="muted" center style={styles.body}>
          Estamos cuidando disso. Tente de novo em alguns minutos — se continuar, fale com a gente.
        </Text>
        {ainda ? (
          <Text variant="bodySmall" tone="muted" center style={styles.body} accessibilityLiveRegion="polite">
            Ainda não foi. Vale tentar mais tarde.
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button title="Tentar de novo" icon="refresh" size="lg" loading={tentando} onPress={() => void tentar()} />
        <Button
          title="Falar com a equipe"
          variant="ghost"
          icon="mail-outline"
          onPress={() => void Linking.openURL(`mailto:${legalLinks.supportEmail}?subject=${encodeURIComponent('IrisFlow Cuidador não conecta')}`).catch(() => undefined)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: layout.gutter, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
  badge: { marginTop: -spacing.xl, marginLeft: sizes.logo.xl - spacing.xl, width: sizes.tile.md, height: sizes.tile.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: spacing.xxl },
  body: { marginTop: spacing.sm, maxWidth: layout.textMax },
  actions: { gap: spacing.sm, width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
});
