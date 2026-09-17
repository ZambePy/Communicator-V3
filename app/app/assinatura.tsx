import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Card, GradientHeader, PressableScale, Screen, SectionTitle, StatusPill, Text } from '@/components';
import { useData } from '@/data/DataContext';
import { BetaRegistration, isBetaPlan } from '@/data/types';
import { siteRoute } from '@/lib/config';
import { useApp } from '@/store/AppProvider';
import { brand, radius, spacing, useTheme } from '@/theme';
import { brl, formatDate } from '@/utils/format';

/**
 * Quadro 9 do plano de negócios — planos de assinatura da IrisFlow.
 * Durante a beta fechada (../docs/BETA.md) ficam só como referência: não há
 * gateway de pagamento e `plans.purchasable` é false em todos.
 */
const PLANS = [
  { id: 'essencial', name: 'Essencial', price: 249, devices: '1 dispositivo', features: ['Comunicação, Computador, Emergência e Cuidador', 'Calibração guiada e ajustes de fixação', 'Suporte por e-mail e tutoriais'] },
  { id: 'completo', name: 'Completo', price: 399, devices: 'Até 3 dispositivos', recommended: true, features: ['Tudo do Essencial', 'Assistente de conversação com IA', 'Lazer e Bem-estar (jogos, galeria, notícias, meditação)', 'Relatórios de sessão e histórico para a família', 'Suporte prioritário por mensagem'] },
  {
    id: 'voz',
    name: 'Voz',
    price: 649,
    devices: 'Até 5 dispositivos',
    features: [
      'Tudo do Completo',
      'Clonagem de voz em fase experimental, a partir de gravações antigas',
      'O modelo é treinado e executado no computador do paciente — o áudio não sai de lá',
      'Exige autorização expressa de quem cede a voz, registrada antes do treino',
      'Perfis múltiplos e backup em nuvem',
      'Suporte dedicado em até 4 h úteis',
    ],
    note: 'Módulo em validação com famílias e profissionais. A contratação abre quando a validação terminar.',
  },
];

/** O que a beta libera (rank 3 em `license_for_profile()`); a voz depende do módulo chegar ao desktop. */
const BETA_FEATURES: { label: string; pending?: boolean }[] = [
  { label: 'Comunicação, Computador, Emergência e Cuidador' },
  { label: 'Relatórios de sessão e histórico para a família' },
  { label: 'Assistente de conversação' },
  { label: 'Clonagem de voz', pending: true },
];

const INDISPONIVEL = 'Indisponível durante a beta';

export default function Assinatura() {
  const { colors } = useTheme();
  const router = useRouter();
  const data = useData();
  const { plan, subscription } = useApp();
  const beta = isBetaPlan(plan, subscription);
  const [registration, setRegistration] = useState<BetaRegistration | null>(null);

  // "Inscrito em <data>" é um detalhe: se a leitura falhar, o card fica sem a linha.
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
    <Screen padded={false}>
      <GradientHeader overlap={50}>
        <PressableScale onPress={() => router.back()} hitSlop={12} style={{ alignSelf: 'flex-start', marginBottom: spacing.md }}>
          <Ionicons name="close" size={26} color="#FFF" />
        </PressableScale>
        <Text variant="h1" tone="onPrimary">
          {beta ? 'Programa beta' : 'Assinatura'}
        </Text>
        <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
          {beta ? 'Acesso completo, sem cobrança, enquanto a beta durar.' : 'Sem fidelidade, sem hardware. Planos pagos indisponíveis durante a beta.'}
        </Text>
      </GradientHeader>

      <View style={{ paddingHorizontal: spacing.xl, marginTop: -36, gap: spacing.md }}>
        {beta && subscription && (
          <Card index={0} glow="accent">
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text variant="h2">Acesso beta ativo</Text>
                <Text variant="body" tone="muted" style={{ marginTop: 2 }}>
                  até {formatDate(subscription.next_charge_at)}
                </Text>
              </View>
              <StatusPill label="Sem cobrança" tone="accent" />
            </View>
            <Text variant="bodySmall" tone="muted" style={{ marginTop: spacing.sm }}>
              Sem cobrança durante a beta — nada é contratado sem um novo aceite seu.
            </Text>
            {registration && (
              <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
                Inscrito em {formatDate(registration.registered_at)}
              </Text>
            )}

            <Text variant="label" tone="muted" style={{ marginTop: spacing.lg }}>
              Liberado na beta
            </Text>
            <View style={{ marginTop: spacing.sm, gap: 6 }}>
              {BETA_FEATURES.map((f) => (
                <View key={f.label} style={styles.featureRow}>
                  <Ionicons name={f.pending ? 'time-outline' : 'checkmark-circle'} size={18} color={f.pending ? colors.textMuted : colors.accent} style={{ marginTop: 2 }} />
                  <Text variant="bodySmall" tone={f.pending ? 'muted' : undefined} style={{ flex: 1 }}>
                    {f.label}
                    {f.pending ? ' · quando disponível' : ''}
                  </Text>
                </View>
              ))}
            </View>

            <Button title="Baixar o aplicativo no computador" variant="accent" icon="desktop-outline" onPress={() => abrir(siteRoute('/beta'))} style={{ marginTop: spacing.lg }} />
            <Button title="Minha conta no site" variant="outline" icon="person-circle-outline" onPress={() => abrir(siteRoute('/conta'))} style={{ marginTop: spacing.sm }} />

            <Text variant="caption" tone="muted" style={{ marginTop: spacing.lg }}>
              Sua opinião guia o que entra antes do lançamento. Encontrou algo estranho ou sentiu falta de alguma coisa?{' '}
              <Text variant="caption" tone="primary" weight="semibold" onPress={() => abrir(siteRoute('/contato'))}>
                Fale com a gente
              </Text>
              .
            </Text>
          </Card>
        )}

        {beta && <SectionTitle title="Planos após a beta" />}

        {PLANS.map((p, i) => {
          const current = !beta && plan?.id === p.id;
          return (
            <Card key={p.id} index={i + 1} padding={0} style={current && { borderColor: colors.accent, borderWidth: 2 }}>
              {p.recommended && (
                <LinearGradient colors={[brand.teal, brand.tealSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ribbon}>
                  <Text variant="caption" weight="bold" style={{ color: '#FFF' }}>
                    RECOMENDADO
                  </Text>
                </LinearGradient>
              )}
              <View style={{ padding: spacing.lg }}>
                <View style={styles.rowBetween}>
                  <View>
                    <Text variant="h2">{p.name}</Text>
                    <Text variant="caption" tone="muted">
                      {p.devices}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="h2" tone="primary">
                      {brl(p.price)}
                    </Text>
                    <Text variant="caption" tone="muted">
                      por mês
                    </Text>
                  </View>
                </View>
                <View style={{ marginTop: spacing.md, gap: 6 }}>
                  {p.features.map((f) => (
                    <View key={f} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} style={{ marginTop: 2 }} />
                      <Text variant="bodySmall" style={{ flex: 1 }}>
                        {f}
                      </Text>
                    </View>
                  ))}
                </View>
                {current ? (
                  <View style={[styles.current, { backgroundColor: colors.accentTint }]}>
                    <Ionicons name="checkmark" size={16} color={colors.accentDeep} />
                    <Text variant="bodySmall" weight="semibold" style={{ color: colors.accentDeep }}>
                      Seu plano atual{subscription?.status === 'avaliacao' ? ' · em avaliação' : ''}
                    </Text>
                  </View>
                ) : beta ? (
                  // Na beta a grade é só referência: selo, sem botão e sem link de contratação.
                  <View style={[styles.current, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                    <Text variant="bodySmall" weight="semibold" tone="muted">
                      {INDISPONIVEL}
                    </Text>
                  </View>
                ) : (
                  // Conta antiga com plano pago: sem gateway, a troca fica desabilitada.
                  <Button title={p.id === 'voz' ? 'Em validação' : INDISPONIVEL} variant={p.recommended ? 'accent' : 'outline'} disabled style={{ marginTop: spacing.lg }} />
                )}
                {p.note && (
                  <Text variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
                    {p.note}
                  </Text>
                )}
              </View>
            </Card>
          );
        })}
        <Text variant="caption" tone="muted" center style={{ marginTop: spacing.sm }}>
          A clonagem de voz é experimental: o modelo roda no IrisFlow Communicator, no computador do paciente, e só é treinado com autorização expressa de quem cede a voz. O plano Voz entra em comercialização ao fim dessa validação.
          {beta ? ' Os planos acima passam a valer só depois da beta, e nada é contratado sem um novo aceite seu.' : ' Durante a beta não há contratação nem troca de plano; sua conta segue como está.'}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  featureRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  ribbon: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 4, borderTopLeftRadius: radius.lg, borderBottomRightRadius: radius.md },
  current: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.lg },
});
