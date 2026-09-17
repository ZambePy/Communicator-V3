import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Button, Card, DemoBanner, EmptyState, GradientHeader, ListRow, MetricTile, ProgressRing, Screen, SectionTitle, Shimmer, Text } from '@/components';
import { useData } from '@/data/DataContext';
import { Session } from '@/data/types';
import { useApp } from '@/store/AppProvider';
import { radius, spacing, useTheme } from '@/theme';
import { dateShort, durationMin, fatigueLabel, formatDuration } from '@/utils/format';

export default function Relatorios() {
  const { colors } = useTheme();
  const router = useRouter();
  const data = useData();
  const { patient, can, plan, session, isDemo } = useApp();
  const [sessions, setSessions] = useState<Session[] | null>(null);

  const allowed = can('relatorios');

  useEffect(() => {
    if (!patient || !allowed) return;
    let alive = true;
    data.listSessions(patient.id, 30).then((s) => alive && setSessions(s));
    return () => {
      alive = false;
    };
  }, [data, patient, allowed, session?.utterances]);

  const week = useMemo(() => {
    const days: { label: string; utterances: number; minutes: number; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const ofDay = (sessions ?? []).filter((s) => new Date(s.started_at).toDateString() === key);
      days.push({
        label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        utterances: ofDay.reduce((a, s) => a + s.utterances, 0),
        minutes: ofDay.reduce((a, s) => a + durationMin(s), 0),
        isToday: i === 0,
      });
    }
    return days;
  }, [sessions]);

  const totals = useMemo(() => {
    const s = sessions ?? [];
    const errs = s.map((x) => x.calibration_error_px).filter((x): x is number => x !== null);
    const hits = s.map((x) => x.hit_rate_150px).filter((x): x is number => x !== null);
    return {
      minutes: s.reduce((a, x) => a + durationMin(x), 0),
      utterances: s.reduce((a, x) => a + x.utterances, 0),
      avgErr: errs.length ? Math.round(errs.reduce((a, b) => a + b, 0) / errs.length) : null,
      avgHit: hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : null,
      help: s.reduce((a, x) => a + x.help_requests, 0),
    };
  }, [sessions]);

  return (
    <Screen padded={false}>
      <GradientHeader overlap={50}>
        <Text variant="label" style={{ color: 'rgba(255,255,255,0.75)' }}>
          {patient?.user_name ?? 'Paciente'}
        </Text>
        <Text variant="h1" tone="onPrimary">
          Relatórios
        </Text>
        <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
          Só métricas agregadas — nenhuma imagem sai do computador.
        </Text>
      </GradientHeader>

      <View style={{ paddingHorizontal: spacing.xl, marginTop: -36 }}>
        {isDemo && <DemoBanner text="Modo demonstração — sessões e métricas simuladas, não são de um paciente real." style={{ marginBottom: spacing.md }} />}

        {!allowed ? (
          <Card index={0}>
            <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
              <View style={[styles.lock, { backgroundColor: colors.primaryTint }]}>
                <Ionicons name="lock-closed" size={28} color={colors.primary} />
              </View>
              <Text variant="h3" center style={{ marginTop: spacing.md }}>
                Relatórios de sessão fazem parte do plano Completo
              </Text>
              <Text variant="bodySmall" tone="muted" center style={{ marginTop: spacing.sm }}>
                Seu plano atual é o {plan?.name ?? 'Essencial'}. O Completo inclui histórico de uso, relatórios de sessão para a família, assistente de conversação e Lazer e Bem-estar.
              </Text>
              <Button title="Ver planos" variant="primary" icon="sparkles-outline" onPress={() => router.push('/assinatura')} style={{ marginTop: spacing.lg, alignSelf: 'stretch' }} />
            </View>
          </Card>
        ) : sessions === null ? (
          <Card index={0}>
            <Shimmer height={20} style={{ width: '40%' }} />
            <Shimmer height={120} style={{ marginTop: spacing.md }} />
          </Card>
        ) : sessions.length === 0 ? (
          <Card index={0}>
            <EmptyState icon="stats-chart-outline" title="Ainda sem sessões" body="Assim que o paciente usar o IrisFlow Communicator, a sessão aparece aqui com precisão, postura, fadiga e módulos usados." />
          </Card>
        ) : (
          <>
            <Card index={0}>
              <View style={styles.rowBetween}>
                <View>
                  <Text variant="label" tone="muted">
                    Últimos 7 dias
                  </Text>
                  <Text variant="h2">{totals.utterances} frases</Text>
                  <Text variant="caption" tone="muted">
                    {formatDuration(totals.minutes)} de uso
                  </Text>
                </View>
                <ProgressRing value={totals.avgHit ?? 0} label={totals.avgHit ? `${Math.round(totals.avgHit * 100)}%` : '—'} caption="acerto médio" size={78} />
              </View>
              <WeekChart days={week} />
            </Card>

            <View style={styles.tiles}>
              <MetricTile index={1} icon="locate-outline" label="erro médio de calibração" value={totals.avgErr ? `${totals.avgErr} px` : '—'} hint="referência: 57 px (1920×1080)" tone="primary" />
              <MetricTile index={2} icon="hand-left-outline" label="pedidos de ajuda" value={String(totals.help)} tone={totals.help > 2 ? 'warning' : 'accent'} />
            </View>

            <SectionTitle title="Sessões" />
            <Card index={3} padding={spacing.sm}>
              {sessions.map((s, i) => (
                <ListRow
                  key={s.id}
                  icon={s.status === 'ended' ? 'time-outline' : 'radio-button-on'}
                  title={`${dateShort(s.started_at)} · ${formatDuration(durationMin(s))}`}
                  subtitle={`${s.utterances} frases · ${s.calibration_error_px ?? '—'} px · ${fatigueLabel[s.fatigue]}`}
                  tone={s.status !== 'ended' ? 'accent' : s.fatigue === 'alta' || s.drift_kind === 'erratico' ? 'warning' : 'primary'}
                  onPress={() => router.push({ pathname: '/sessao/[id]', params: { id: s.id } })}
                  last={i === sessions.length - 1}
                />
              ))}
            </Card>
            <Text variant="caption" tone="muted" center style={{ marginTop: spacing.lg, paddingHorizontal: spacing.md }}>
              Cada relatório registra as condições de captura junto com o erro — tela, câmera, distância, iluminação, lentes e postura — para que os números sejam comparáveis entre sessões.
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}

function WeekChart({ days }: { days: { label: string; utterances: number; minutes: number; isToday: boolean }[] }) {
  const max = Math.max(1, ...days.map((d) => d.utterances));
  return (
    <View style={{ marginTop: spacing.lg }}>
      <View style={styles.chart}>
        {days.map((d, i) => (
          <Bar key={i} index={i} ratio={d.utterances / max} label={d.label} value={d.utterances} today={d.isToday} />
        ))}
      </View>
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
        Frases vocalizadas por dia
      </Text>
    </View>
  );
}

function Bar({ ratio, label, value, today, index }: { ratio: number; label: string; value: number; today: boolean; index: number }) {
  const { colors } = useTheme();
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(index * 60, withTiming(Math.max(4, ratio * 96), { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [ratio, index, h]);
  const st = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <View style={styles.barCol}>
      <Text variant="caption" tone="muted" style={{ fontSize: 11, lineHeight: 14 }}>
        {value || ''}
      </Text>
      <View style={{ height: 96, justifyContent: 'flex-end', alignSelf: 'stretch' }}>
        <Animated.View style={[styles.bar, { backgroundColor: today ? colors.accent : colors.primary, opacity: value === 0 ? 0.25 : 1 }, st]} />
      </View>
      <Text variant="caption" tone={today ? 'accent' : 'muted'} weight={today ? 'bold' : 'medium'} style={{ fontSize: 11, lineHeight: 14 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tiles: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 140 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  bar: { alignSelf: 'stretch', borderRadius: 6 },
  lock: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
