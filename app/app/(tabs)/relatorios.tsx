import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Card, EmptyState, ListRow, MetricTile, ProgressRing, Screen, ScreenHeader, SectionTitle, Shimmer, Text } from '@/components';
import { useData } from '@/data/DataContext';
import { hasFatigueData, Session } from '@/data/types';
import { useApp } from '@/store/AppProvider';
import { motion, opacity, radius, sizes, spacing, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { dateShort, durationMin, fatigueLabel, firstName, formatDuration } from '@/utils/format';

type Dia = { label: string; nomeCompleto: string; utterances: number; minutes: number; isToday: boolean };

export default function Relatorios() {
  const { colors } = useTheme();
  const router = useRouter();
  const data = useData();
  const { patient, can, plan, session } = useApp();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const allowed = can('relatorios');
  const nome = patient ? firstName(patient.user_name) : 'o paciente';

  const carregar = useCallback(async () => {
    if (!patient || !allowed) return;
    try {
      const s = await data.listSessions(patient.id, 30);
      setSessions(s);
      setErro(null);
    } catch (e) {
      // Sem isto o esqueleto ficava para sempre: a rejeição não era tratada.
      setErro(mensagemDeErro(e, 'Não foi possível carregar as sessões.'));
      setSessions((atual) => atual ?? []);
    }
  }, [data, patient, allowed]);

  useEffect(() => {
    void carregar();
  }, [carregar, session?.utterances, tentativa]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await carregar();
    setRefreshing(false);
  }, [carregar]);

  /**
   * Sessões que CONTAM: encerradas, ou a única ao vivo de verdade (`session`
   * do AppProvider, que exige heartbeat do computador). Uma linha `active`
   * órfã — computador que caiu sem encerrar — teria duração "até agora" e
   * inflaria horas de uso; ela fica na lista marcada, fora dos totais.
   */
  const orfa = useCallback((s: Session) => s.status !== 'ended' && s.id !== session?.id, [session?.id]);
  const validas = useMemo(() => (sessions ?? []).filter((s) => !orfa(s)), [sessions, orfa]);
  /** "Últimos 7 dias" de verdade: só o que começou nos últimos 7 dias, não as 30 sessões carregadas. */
  const ultimos7 = useMemo(() => {
    const limite = Date.now() - 7 * 86_400_000;
    return validas.filter((s) => new Date(s.started_at).getTime() >= limite);
  }, [validas]);

  const week = useMemo(() => {
    const days: Dia[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const ofDay = ultimos7.filter((s) => new Date(s.started_at).toDateString() === key);
      days.push({
        label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        nomeCompleto: d.toLocaleDateString('pt-BR', { weekday: 'long' }),
        utterances: ofDay.reduce((a, s) => a + s.utterances, 0),
        minutes: ofDay.reduce((a, s) => a + durationMin(s), 0),
        isToday: i === 0,
      });
    }
    return days;
  }, [ultimos7]);

  const totals = useMemo(() => {
    const s = ultimos7;
    const errs = s.map((x) => x.calibration_error_px).filter((x): x is number => x !== null);
    const hits = s.map((x) => x.hit_rate_150px).filter((x): x is number => x !== null);
    return {
      minutes: s.reduce((a, x) => a + durationMin(x), 0),
      utterances: s.reduce((a, x) => a + x.utterances, 0),
      avgErr: errs.length ? Math.round(errs.reduce((a, b) => a + b, 0) / errs.length) : null,
      avgHit: hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : null,
      help: s.reduce((a, x) => a + x.help_requests, 0),
    };
  }, [ultimos7]);

  return (
    <Screen refreshing={refreshing} onRefresh={allowed ? onRefresh : undefined}>
      <ScreenHeader eyebrow={patient?.user_name} title="Relatórios" />

      {!allowed ? (
        <Card>
          <EmptyState
            icon="lock-closed-outline"
            title="Relatórios fazem parte do plano Completo"
            body={`Seu plano atual é o ${plan?.name ?? 'Essencial'}. O Completo inclui o histórico de uso e os relatórios de sessão para a família.`}
            action={{ label: 'Ver planos', icon: 'sparkles-outline', onPress: () => router.push('/assinatura') }}
            compact
          />
        </Card>
      ) : sessions === null ? (
        <Card>
          <Shimmer height={spacing.xl} width="40%" />
          <Shimmer height={sizes.chart} style={styles.gapTop} />
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          {erro ? (
            <EmptyState icon="cloud-offline-outline" title="Não foi possível carregar" body={erro} action={{ label: 'Tentar de novo', icon: 'refresh', onPress: () => setTentativa((n) => n + 1) }} compact />
          ) : (
            <EmptyState icon="stats-chart-outline" title="Ainda sem sessões" body={`Quando ${nome} usar o IrisFlow no computador, o resumo de cada dia aparece aqui.`} compact />
          )}
        </Card>
      ) : (
        <>
          <Card index={0}>
            <View style={styles.summary}>
              <View style={styles.flex}>
                <Text variant="caption" tone="muted">
                  Últimos 7 dias
                </Text>
                <Text variant="display" accessibilityLabel={`${totals.utterances} frases nos últimos 7 dias`}>
                  {totals.utterances}
                </Text>
                <Text variant="bodySmall" tone="muted">
                  frases · {formatDuration(totals.minutes)} de uso
                </Text>
              </View>
              <ProgressRing value={totals.avgHit ?? 0} label={totals.avgHit != null ? `${Math.round(totals.avgHit * 100)}%` : '—'} caption="acerto" accessibilityLabel={totals.avgHit != null ? `Acerto médio de ${Math.round(totals.avgHit * 100)} por cento` : 'Acerto médio ainda sem dados'} />
            </View>
            <WeekChart days={week} />
          </Card>

          <View style={styles.tiles}>
            <MetricTile index={1} icon="locate-outline" label="erro médio de calibração" value={totals.avgErr != null ? `${totals.avgErr} px` : '—'} hint="referência: 57 px" tone="primary" />
            <MetricTile index={2} icon="hand-left-outline" label="pedidos de ajuda" value={String(totals.help)} tone={totals.help > 2 ? 'warning' : 'accent'} />
          </View>

          {erro ? <Text variant="caption" tone="danger" style={styles.gapTop}>{erro}</Text> : null}

          <SectionTitle title="Sessões" />
          <Card index={3} padding={0}>
            {sessions.map((s, i) => (
              <ListRow
                key={s.id}
                icon={orfa(s) ? 'help-circle-outline' : s.status === 'ended' ? 'time-outline' : 'radio-button-on'}
                title={orfa(s) ? `${dateShort(s.started_at)} · interrompida` : `${dateShort(s.started_at)} · ${formatDuration(durationMin(s))}`}
                subtitle={orfa(s) ? 'O computador parou sem encerrar — fora dos totais' : `${s.utterances} frases${s.calibration_error_px != null ? ` · ${Math.round(s.calibration_error_px)} px` : ''}${hasFatigueData(s) ? ` · ${fatigueLabel[s.fatigue]}` : ''}`}
                tone={orfa(s) ? 'muted' : s.status !== 'ended' ? 'accent' : s.fatigue === 'alta' || s.drift_kind === 'erratico' ? 'warning' : 'primary'}
                onPress={() => router.push({ pathname: '/sessao/[id]', params: { id: s.id } })}
                last={i === sessions.length - 1}
              />
            ))}
          </Card>
          <View style={styles.privacy}>
            <Ionicons name="shield-checkmark-outline" size={sizes.icon.sm} color={colors.textMuted} />
            <Text variant="caption" tone="muted" style={styles.flexShrink}>
              Só números agregados — nenhuma imagem sai do computador.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function WeekChart({ days }: { days: Dia[] }) {
  const max = Math.max(1, ...days.map((d) => d.utterances));
  const resumo = days.map((d) => `${d.nomeCompleto}: ${d.utterances} frases`).join('; ');
  return (
    <View style={styles.chartWrap} accessible accessibilityRole="image" accessibilityLabel={`Frases por dia. ${resumo}.`}>
      <View style={styles.chart}>
        {days.map((d, i) => (
          <Bar key={i} index={i} ratio={d.utterances / max} label={d.label} value={d.utterances} today={d.isToday} />
        ))}
      </View>
      <Text variant="caption" tone="muted" style={styles.chartCaption}>
        Frases faladas por dia
      </Text>
    </View>
  );
}

function Bar({ ratio, label, value, today, index }: { ratio: number; label: string; value: number; today: boolean; index: number }) {
  const { colors, reduceMotion } = useTheme();
  const alvo = Math.max(spacing.xs, ratio * sizes.chart);
  const h = useSharedValue(reduceMotion ? alvo : 0);
  useEffect(() => {
    h.value = reduceMotion ? alvo : withDelay(index * motion.stagger, withTiming(alvo, { duration: motion.duration.slow * 1.6, easing: Easing.out(Easing.cubic) }));
  }, [alvo, index, h, reduceMotion]);
  const st = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <View style={styles.barCol}>
      <Text variant="caption" tone="muted" maxFontSizeMultiplier={1.2}>
        {value || ''}
      </Text>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.bar, { backgroundColor: today ? colors.chartToday : colors.chartBar, opacity: value === 0 ? opacity.faint : 1 }, st]} />
      </View>
      <Text variant="caption" tone={today ? 'accent' : 'muted'} weight={today ? 'bold' : 'medium'} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  gapTop: { marginTop: spacing.md },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  chartWrap: { marginTop: spacing.xl },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  chartCaption: { marginTop: spacing.sm },
  barCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
  barTrack: { height: sizes.chart, justifyContent: 'flex-end', alignSelf: 'stretch' },
  bar: { alignSelf: 'stretch', borderRadius: radius.xs },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl },
});
