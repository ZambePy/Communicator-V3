import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, PressableScale, Screen, ScreenHeader, SectionTitle, StatusPill, Text } from '@/components';
import { useData } from '@/data/DataContext';
import { BetaRegistration, isBetaPlan } from '@/data/types';
import { siteRoute } from '@/lib/config';
import { useApp } from '@/store/AppProvider';
import { radius, shadows, sizes, spacing, useTheme } from '@/theme';
import { brl, formatDate } from '@/utils/format';

/**
 * Quadro 9 do plano de negócios — planos de assinatura da IrisFlow.
 * Durante a beta fechada (README da raiz, seção "Conta IrisFlow e nuvem") ficam só como referência: não há
 * gateway de pagamento e `plans.purchasable` é false em todos.
 */
const PLANS = [
  { id: 'essencial', name: 'Essencial', price: 249, devices: '1 computador', features: ['Comunicação, Computador, Emergência e Cuidador', 'Calibração guiada e ajustes de fixação', 'Suporte por e-mail e tutoriais'] },
  { id: 'completo', name: 'Completo', price: 399, devices: 'Até 3 computadores', recommended: true, features: ['Tudo do Essencial', 'Assistente de conversação com IA', 'Lazer e Bem-estar', 'Relatórios e histórico para a família', 'Suporte prioritário'] },
  {
    id: 'voz',
    name: 'Voz',
    price: 649,
    devices: 'Até 5 computadores',
    features: ['Tudo do Completo', 'Clonagem de voz experimental, a partir de gravações antigas', 'Treinada e executada no computador do paciente — o áudio não sai de lá', 'Só com autorização expressa de quem cede a voz', 'Perfis múltiplos e backup em nuvem', 'Suporte dedicado em até 4 h úteis'],
    note: 'Em validação com famílias e profissionais. A contratação abre quando a validação terminar.',
  },
];

/** O que a beta libera (rank 3 em `license_for_profile()`); a voz depende do módulo chegar ao desktop. */
const BETA_FEATURES: { label: string; icon: keyof typeof Ionicons.glyphMap; pending?: boolean }[] = [
  { label: 'Comunicação, Emergência e Cuidador', icon: 'chatbubbles-outline' },
  { label: 'Relatórios e histórico para a família', icon: 'stats-chart-outline' },
  { label: 'Assistente de conversação', icon: 'sparkles-outline' },
  { label: 'Clonagem de voz · quando disponível', icon: 'mic-outline', pending: true },
];

const INDISPONIVEL = 'Indisponível durante a beta';

export default function Assinatura() {
  const { colors } = useTheme();
  const router = useRouter();
  const data = useData();
  const { plan, subscription } = useApp();
  const beta = isBetaPlan(plan, subscription);
  const [registration, setRegistration] = useState<BetaRegistration | null>(null);

  // "Inscrito em <data>" é um detalhe: se a leitura falhar, o cartão fica sem a linha.
  useEffect(() => {
    if (!beta) return;
    let mounted = true;
    data
      .getBetaRegistration()
      .then((r) => {
        if (mounted) setRegistration(r);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [beta, data]);

  const abrir = (url: string) => {
    Linking.openURL(url).catch(() => undefined);
  };

  return (
    <Screen modal>
      <ScreenHeader onClose={() => router.back()} title={beta ? 'Programa beta' : 'Assinatura'} subtitle={beta ? 'Acesso completo, sem cobrança, enquanto a beta durar.' : 'Sem fidelidade e sem hardware.'} />

      {beta && subscription ? (
        <>
          <View style={[styles.heroWrap, shadows.glow(colors.accentStrong)]}>
            <LinearGradient colors={colors.gradientHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={styles.rowBetween}>
                <Ionicons name="sparkles" size={sizes.icon.lg} color={colors.onDark} />
                <StatusPill label="Sem cobrança" tone="accent" onDark />
              </View>
              <Text variant="caption" tone="onDarkMuted" style={styles.gapTop}>
                Acesso beta ativo até
              </Text>
              <Text variant="h1" tone="onDark">
                {formatDate(subscription.next_charge_at)}
              </Text>
              {registration ? (
                <Text variant="caption" tone="onDarkMuted">
                  Inscrição em {formatDate(registration.registered_at)}
                </Text>
              ) : null}
              <View style={styles.features}>
                {BETA_FEATURES.map((f) => (
                  <View key={f.label} style={styles.featureRow}>
                    <Ionicons name={f.pending ? 'time-outline' : 'checkmark-circle'} size={sizes.icon.sm} color={f.pending ? colors.onDarkMuted : colors.accent} />
                    <Text variant="bodySmall" tone={f.pending ? 'onDarkMuted' : 'onDark'} style={styles.flex}>
                      {f.label}
                    </Text>
                  </View>
                ))}
              </View>
              <Button title="Baixar no computador" variant="light" icon="download-outline" onPress={() => abrir(siteRoute('/beta'))} style={styles.gapTopLg} />
              <Button title="Minha conta no site" variant="glass" icon="person-circle-outline" onPress={() => abrir(siteRoute('/conta'))} style={styles.gapTopSm} />
            </LinearGradient>
          </View>

          <PressableScale onPress={() => abrir(siteRoute('/contato'))} accessibilityRole="link" style={[styles.feedback, { backgroundColor: colors.primaryTint }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={sizes.icon.md} color={colors.primary} />
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold" tone="primary">
                Fale com a gente
              </Text>
              <Text variant="caption" tone="muted">
                Sua opinião guia o que entra antes do lançamento.
              </Text>
            </View>
            <Ionicons name="open-outline" size={sizes.icon.sm} color={colors.primary} />
          </PressableScale>

          <SectionTitle title="Planos depois da beta" />
        </>
      ) : null}

      <View style={styles.plans}>
        {PLANS.map((p, i) => {
          const current = !beta && plan?.id === p.id;
          return (
            <Card key={p.id} index={i} padding={spacing.xl} style={current ? { borderColor: colors.accent, borderWidth: sizes.borderThick } : undefined}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <View style={styles.planTitle}>
                    <Text variant="h2">{p.name}</Text>
                    {p.recommended ? <StatusPill label="Recomendado" tone="accent" /> : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {p.devices}
                  </Text>
                </View>
                <View style={styles.price}>
                  <Text variant="h2" tone="primary">
                    {brl(p.price)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    por mês
                  </Text>
                </View>
              </View>
              <View style={styles.planFeatures}>
                {p.features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="checkmark" size={sizes.icon.sm} color={colors.accentText} />
                    <Text variant="bodySmall" style={styles.flex}>
                      {f}
                    </Text>
                  </View>
                ))}
              </View>
              {current ? (
                <View style={[styles.tag, { backgroundColor: colors.accentTint }]}>
                  <Ionicons name="checkmark-circle" size={sizes.icon.sm} color={colors.accentText} />
                  <Text variant="bodySmall" weight="semibold" tone="accent">
                    Seu plano atual{subscription?.status === 'avaliacao' ? ' · em avaliação' : ''}
                  </Text>
                </View>
              ) : (
                // Na beta a grade é só referência: selo, sem botão de contratação.
                <View style={[styles.tag, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="lock-closed-outline" size={sizes.icon.sm} color={colors.textMuted} />
                  <Text variant="bodySmall" weight="semibold" tone="muted">
                    {p.id === 'voz' ? 'Em validação' : INDISPONIVEL}
                  </Text>
                </View>
              )}
              {p.note ? (
                <Text variant="caption" tone="muted" style={styles.gapTop}>
                  {p.note}
                </Text>
              ) : null}
            </Card>
          );
        })}
      </View>
      <Text variant="caption" tone="muted" center style={styles.footnote}>
        {beta ? 'Os planos passam a valer só depois da beta, e nada é contratado sem um novo aceite seu.' : 'Durante a beta não há contratação nem troca de plano; sua conta segue como está.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapTop: { marginTop: spacing.md },
  gapTopSm: { marginTop: spacing.sm },
  gapTopLg: { marginTop: spacing.xl },
  heroWrap: { borderRadius: radius.xl },
  hero: { borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  features: { marginTop: spacing.lg, gap: spacing.sm },
  featureRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, marginTop: spacing.md, minHeight: sizes.touch },
  plans: { gap: spacing.md },
  planTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  price: { alignItems: 'flex-end' },
  planFeatures: { marginTop: spacing.lg, gap: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: sizes.touch, borderRadius: radius.md, marginTop: spacing.lg },
  footnote: { marginTop: spacing.lg },
});
