import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, DemoBanner, GradientHeader, IrisLogo, ListRow, MetricTile, PressableScale, ProgressRing, Screen, SectionTitle, Shimmer, StatusPill, Text } from '@/components';
import { isBetaPlan } from '@/data/types';
import { useApp } from '@/store/AppProvider';
import { radius, spacing, useTheme } from '@/theme';
import { driftLabel, durationMin, fatigueLabel, firstName, formatDate, formatDuration, greeting, helpKindLabel, initials, presetLabel, timeAgo } from '@/utils/format';

export default function Home() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, patient, devices, session, helpRequests, messages, unreadCount, loading, refresh, isDemo, plan, subscription, sendMessage } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const device = devices[0];
  const online = device?.online ?? false;
  const lastPatientMsg = [...messages].reverse().find((m) => m.sender === 'paciente');
  const openAlerts = helpRequests.filter((h) => !h.resolved_at);

  const fatigueTone = session?.fatigue === 'alta' ? 'danger' : session?.fatigue === 'atencao' ? 'warning' : 'accent';
  const driftTone = session?.drift_kind === 'erratico' ? 'danger' : session?.drift_kind === 'lento' ? 'warning' : 'accent';

  return (
    <Screen padded={false} refreshing={refreshing} onRefresh={onRefresh}>
      <GradientHeader overlap={70}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.72)' }}>
              {greeting()},
            </Text>
            <Text variant="display" tone="onPrimary" style={{ marginTop: 2 }}>
              {profile ? firstName(profile.buyer_name) : '…'}
            </Text>
          </View>
          <IrisLogo size={64} onDark spinning={online} breathing={online} halo={online} refraction={Boolean(session)} />
        </View>

        <PressableScale onPress={() => router.push('/paciente')} style={styles.patientChip} scaleTo={0.98}>
          <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text variant="bodySmall" tone="onPrimary" weight="bold">
              {patient ? initials(patient.user_name) : '·'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="body" tone="onPrimary" weight="semibold">
              {patient?.user_name ?? 'Selecione o paciente'}
            </Text>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {device ? `${device.name} · v${device.app_version}` : 'Nenhum computador pareado'}
            </Text>
          </View>
          <StatusPill label={online ? (session ? 'Em sessão' : 'Online') : 'Offline'} live={online && Boolean(session)} onDark />
        </PressableScale>
      </GradientHeader>

      <View style={{ paddingHorizontal: spacing.xl, marginTop: -58 }}>
        {isDemo && <DemoBanner text="Modo demonstração — dados simulados. Aguarde para ver mensagens e um pedido de socorro chegarem." style={{ marginBottom: spacing.md }} />}

        {/* Sessão ao vivo */}
        {loading && !session ? (
          <Card>
            <Shimmer height={22} style={{ width: '50%' }} />
            <Shimmer height={80} style={{ marginTop: spacing.md }} />
          </Card>
        ) : session ? (
          <Card glow="primary" animated>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">
                  Sessão em andamento
                </Text>
                <Text variant="display" tone="primary" style={styles.heroNumber}>
                  {formatDuration(durationMin(session))}
                </Text>
                <Text variant="caption" tone="muted">
                  {session.modules_used.join(' · ')}
                </Text>
              </View>
              <ProgressRing value={session.hit_rate_150px ?? 0} label={`${Math.round((session.hit_rate_150px ?? 0) * 100)}%`} caption="acerto" />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.rowBetween}>
              <Indicator icon="body-outline" label="Postura" value={driftLabel[session.drift_kind]} tone={driftTone} />
              <Indicator icon="eye-outline" label="Fadiga" value={fatigueLabel[session.fatigue]} tone={fatigueTone} />
              <Indicator icon="timer-outline" label="Fixação" value={`${session.dwell_ms} ms`} tone="primary" />
            </View>
          </Card>
        ) : (
          <Card animated>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <View style={[styles.idleIcon, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="moon-outline" size={22} color={colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="semibold">
                  Nenhuma sessão ativa
                </Text>
                <Text variant="caption" tone="muted">
                  {device ? `Última atividade ${timeAgo(device.last_seen_at)}` : 'Pareie o computador do paciente nos Ajustes.'}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Última mensagem do paciente */}
        <SectionTitle title="Conversa" action="Abrir" onAction={() => router.push('/(tabs)/conversa')} />
        <PressableScale onPress={() => router.push('/(tabs)/conversa')} scaleTo={0.985}>
          <Card tone={unreadCount ? 'primary' : 'surface'}>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
              <View style={[styles.idleIcon, { backgroundColor: unreadCount ? colors.primary : colors.primaryTint }]}>
                <Ionicons name="chatbubble-ellipses" size={20} color={unreadCount ? '#FFF' : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowBetween}>
                  <Text variant="caption" tone="muted">
                    {lastPatientMsg ? `${firstName(patient?.user_name ?? '')} · ${timeAgo(lastPatientMsg.created_at)}` : 'Sem mensagens ainda'}
                  </Text>
                  {unreadCount > 0 && <StatusPill label={`${unreadCount} nova${unreadCount > 1 ? 's' : ''}`} tone="primary" />}
                </View>
                <Text variant="body" weight={unreadCount ? 'semibold' : 'regular'} style={{ marginTop: 4 }} numberOfLines={2}>
                  {lastPatientMsg?.text ?? 'Quando o paciente escrever com os olhos, a frase aparece aqui.'}
                </Text>
              </View>
            </View>
          </Card>
        </PressableScale>

        {/* Respostas rápidas */}
        <View style={styles.quickRow}>
          {['Já estou indo', 'Sim', 'Não', 'Um minuto'].map((t, i) => (
            <PressableScale key={t} onPress={() => sendMessage(t, i === 1 || i === 2 ? 'simnao' : 'frase')} style={[styles.quick, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="bodySmall" weight="semibold" tone="primary">
                {t}
              </Text>
            </PressableScale>
          ))}
        </View>

        {/* Métricas */}
        <SectionTitle title="Hoje" />
        <View style={styles.tiles}>
          <MetricTile icon="volume-high-outline" label="frases vocalizadas" value={String(session?.utterances ?? 0)} tone="primary" />
          <MetricTile icon="text-outline" label="caracteres escritos" value={String(session?.chars_typed ?? 0)} tone="accent" />
        </View>
        <View style={styles.tiles}>
          <MetricTile icon="locate-outline" label="erro de calibração" value={session?.calibration_error_px ? `${session.calibration_error_px} px` : '—'} hint={session?.calibration_error_deg ? `${session.calibration_error_deg}°` : undefined} tone="primary" />
          <MetricTile icon="options-outline" label="suavização" value={session ? presetLabel[session.filter_preset] : '—'} tone="accent" />
        </View>

        {/* Alertas abertos */}
        <SectionTitle title="Alertas" action="Ver todos" onAction={() => router.push('/(tabs)/alertas')} />
        <Card padding={spacing.sm}>
          {openAlerts.length === 0 ? (
            <ListRow icon="shield-checkmark" title="Tudo tranquilo" subtitle="Nenhum alerta pendente" tone="accent" last />
          ) : (
            openAlerts.slice(0, 3).map((h, i) => (
              <ListRow
                key={h.id}
                icon={h.kind === 'emergencia' || h.kind === 'ajuda' ? 'hand-left' : h.kind === 'postura' ? 'body' : h.kind === 'fadiga' ? 'moon' : 'refresh'}
                title={helpKindLabel[h.kind]}
                subtitle={`${timeAgo(h.created_at)} · ${h.acknowledged_at ? 'reconhecido' : 'aguardando'}`}
                tone={h.kind === 'emergencia' || h.kind === 'ajuda' ? 'danger' : 'warning'}
                onPress={() => router.push('/(tabs)/alertas')}
                last={i === Math.min(openAlerts.length, 3) - 1}
              />
            ))
          )}
        </Card>

        {/* Dispositivo */}
        <SectionTitle title="Computador do paciente" />
        <Card padding={spacing.sm}>
          <ListRow icon="desktop-outline" title={device?.name ?? 'Nenhum dispositivo'} subtitle={device ? `${online ? 'Conectado' : 'Visto ' + timeAgo(device.last_seen_at)} · IrisFlow Communicator ${device.app_version}` : 'Pareie nos Ajustes'} tone={online ? 'accent' : 'muted'} right={<Check ok={online} />} />
          <ListRow icon="videocam-outline" title="Câmera" subtitle={device?.camera_ok ? '1280×720 a 30 fps' : 'Não detectada'} tone={device?.camera_ok ? 'accent' : 'muted'} right={<Check ok={Boolean(device?.camera_ok)} />} />
          <ListRow icon="eye-outline" title="Rastreamento" subtitle={device?.tracker_ok ? 'Motor ativo' : 'Parado'} tone={device?.tracker_ok ? 'accent' : 'muted'} right={<Check ok={Boolean(device?.tracker_ok)} />} />
          <ListRow icon="locate-outline" title="Calibração" subtitle={device?.calibrated ? `Válida · ${session?.calibration_seconds ?? '—'} s` : 'Necessária'} tone={device?.calibrated ? 'accent' : 'warning'} right={<Check ok={Boolean(device?.calibrated)} />} last />
        </Card>

        {plan && (
          <Text variant="caption" tone="muted" center style={{ marginTop: spacing.xl }}>
            {isBetaPlan(plan, subscription) && subscription ? `Programa beta · acesso completo até ${formatDate(subscription.next_charge_at)}` : `Plano ${plan.name} · Comunicação, Emergência e Cuidador incluídos`}
          </Text>
        )}
      </View>
    </Screen>
  );
}

function Indicator({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone: 'accent' | 'warning' | 'danger' | 'primary' }) {
  const { colors } = useTheme();
  const color = tone === 'accent' ? colors.accent : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : colors.primary;
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Ionicons name={icon} size={20} color={color} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="bodySmall" weight="semibold" style={{ color }}>
        {value}
      </Text>
    </View>
  );
}

function Check({ ok }: { ok: boolean }) {
  const { colors } = useTheme();
  return <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={ok ? colors.accent : colors.textMuted} />;
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  patientChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.lg },
  idleIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  quick: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: radius.pill, borderWidth: 1 },
  tiles: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  heroNumber: { fontSize: 38, lineHeight: 44, letterSpacing: -1, marginTop: 2, marginBottom: 2 },
});
