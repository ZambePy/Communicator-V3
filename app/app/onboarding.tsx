import React from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { Button, MarcaCuidador, Text } from '@/components';
import { siteRoute } from '@/lib/config';
import { brand, darkColors, layout, sizes, spacing, useEntrada } from '@/theme';

/**
 * O que o app faz, em três linhas — numa tela só (19/10/2026). Antes eram três
 * páginas de carrossel: duas ficavam escondidas atrás de um deslize que muita
 * gente não faz, e cada página repetia o mesmo molde de ícone num quadrado.
 * O que abre a tela é o próprio produto: uma frase escrita com os olhos, como
 * ela aparece na Conversa.
 */
const O_QUE_FAZ: { icon: keyof typeof Ionicons.glyphMap; texto: string }[] = [
  { icon: 'chatbubbles-outline', texto: 'O que a pessoa que você cuida escreve com os olhos chega aqui na hora, e você responde de onde estiver.' },
  // O que o alerta faz com o app aberto; com o app fechado depende do push do build.
  { icon: 'notifications-outline', texto: 'Um pedido de socorro ocupa a tela e vibra até alguém confirmar.' },
  { icon: 'desktop-outline', texto: 'Você acompanha o uso e ajusta o computador sem sair do lugar.' },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entrada = useEntrada();
  // A boas-vindas é sempre escura (o marinho da marca), nos dois temas.
  const c = darkColors;

  return (
    <View style={[styles.root, { backgroundColor: brand.navy, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <ScrollView contentContainerStyle={styles.rolagem} showsVerticalScrollIndicator={false}>
        <View style={styles.marca}>
          <MarcaCuidador size={sizes.logo.md} onDark />
        </View>

        {/* Uma fala de exemplo, no mesmo desenho da Conversa. */}
        <Animated.View entering={entrada.suave()} style={[styles.exemplo, { borderLeftColor: c.primary }]} accessible accessibilityLabel="Exemplo de mensagem escrita com os olhos: Estou com sede.">
          <Text variant="display" weight="headingSemibold" tone="onDark">
            Estou com sede.
          </Text>
          <Text variant="caption" style={{ color: c.textMuted }}>
            escrito com os olhos, agora
          </Text>
        </Animated.View>

        <Text variant="h1" tone="onDark" accessibilityRole="header" style={styles.titulo}>
          O olhar tem voz
        </Text>

        <View style={styles.lista}>
          {O_QUE_FAZ.map((i) => (
            <View key={i.texto} style={styles.item}>
              <Ionicons name={i.icon} size={sizes.icon.md} color={c.primary} style={styles.itemIcone} />
              <Text variant="body" style={[styles.flex, { color: c.textMuted }]}>
                {i.texto}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Button title="Entrar" size="lg" icon="log-in-outline" onPress={() => router.push('/(auth)/login')} style={{ backgroundColor: c.primaryStrong }} />
        {/* A conta nasce no site (página Beta); o app não cadastra ninguém. */}
        <Button
          title="Ainda não tenho conta"
          variant="glass"
          accessibilityHint="Abre a página de inscrição no site da IrisFlow"
          onPress={() => void Linking.openURL(siteRoute('/beta')).catch(() => undefined)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1 },
  rolagem: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: layout.gutter + spacing.xs, paddingBottom: spacing.xl, width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
  marca: { alignItems: 'flex-start', marginBottom: spacing.huge },
  exemplo: { borderLeftWidth: sizes.borderThick + 1, paddingLeft: spacing.lg, paddingVertical: spacing.xs },
  titulo: { marginTop: spacing.huge },
  lista: { marginTop: spacing.lg, gap: spacing.lg },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemIcone: { marginTop: spacing.xxs },
  actions: { paddingHorizontal: layout.gutter, gap: spacing.md, width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
});
