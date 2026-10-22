import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Card, EmptyState, ListRow, Screen, ScreenHeader, SectionTitle, Shimmer, Text } from '@/components';
import { useData } from '@/data/DataContext';
import { hasFatigueData, Session } from '@/data/types';
import { BloqueioDoPlano } from '@/features/BloqueioDoPlano';
import { useApp } from '@/store/AppProvider';
import { motion, opacity, sizes, spacing, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { dateShort, durationMin, fatigueLabel, firstName, formatDuration } from '@/utils/format';

type Dia = { label: string; nomeCompleto: string; utterances: number; minutes: number; isToday: boolean };

export default function Relatorios() {
  const { colors } = useTheme();
  const router = useRouter();
  const data = useData();
  const { patient, can, session } = useApp();
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
        <BloqueioDoPlano />
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
            <EmptyState icon="stats-chart-outline" title="Ainda sem sessões" body={`Quando ${nome} usar o IrisFlow Communicator no computador, o resumo de cada dia aparece aqui.`} compact />
          )}
        </Card>
      ) : (
        <>
          {/* O único painel da tela: a semana, em números e no gráfico. */}
          <Card index={0} style={styles.painel}>
            <Text variant="caption" tone="muted">
              Últimos 7 dias
            </Text>
            <Numero valor={String(totals.utterances)} rotulo={totals.utterances === 1 ? 'frase falada' : 'frases faladas'} grande />
            <View style={styles.numeros}>
              <Numero valor={formatDuration(totals.minutes)} rotulo="de uso" medio />
              <Numero valor={totals.avgHit != null ? `${Math.round(totals.avgHit * 100)}%` : '—'} rotulo="de acerto" medio acessivel={totals.avgHit != null ? undefined : 'Acerto médio ainda sem dados'} />
            </View>
            <WeekChart days={week} />
          </Card>

          <SectionTitle title="Na semana" />
          <View style={styles.numeros}>
            <Numero valor={totals.avgErr != null ? `${totals.avgErr} px` : '—'} rotulo="erro médio de calibração" nota="referência: 57 px" />
            <Numero valor={String(totals.help)} rotulo={totals.help === 1 ? 'pedido de ajuda' : 'pedidos de ajuda'} alerta={totals.help > 2} />
          </View>

          {erro ? <Text variant="caption" tone="danger" style={styles.gapTop}>{erro}</Text> : null}

          <SectionTitle title="Sessões" />
          <View style={[styles.lista, { borderTopColor: colors.border }]}>
            {sessions.map((s, i) => (
              <ListRow
                key={s.id}
                icon={orfa(s) ? 'help-circle-outline' : s.status === 'ended' ? 'time-outline' : 'radio-button-on'}
                title={orfa(s) ? `${dateShort(s.started_at)}, interrompida` : `${dateShort(s.started_at)}, ${formatDuration(durationMin(s))}`}
                subtitle={orfa(s) ? 'O computador parou sem encerrar; fica fora dos totais.' : [`${s.utterances} ${s.utterances === 1 ? 'frase' : 'frases'}`, s.calibration_error_px != null ? `erro de ${Math.round(s.calibration_error_px)} px` : null, hasFatigueData(s) ? fatigueLabel[s.fatigue].toLowerCase() : null].filter(Boolean).join(', ')}
                tone={orfa(s) ? 'muted' : s.status !== 'ended' ? 'accent' : s.fatigue === 'alta' || s.drift_kind === 'erratico' ? 'warning' : 'primary'}
                onPress={() => router.push({ pathname: '/sessao/[id]', params: { id: s.id } })}
                last={i === sessions.length - 1}
              />
            ))}
          </View>
          <View style={styles.privacy}>
            <Ionicons name="shield-checkmark-outline" size={sizes.icon.sm} color={colors.textMuted} />
            <Text variant="caption" tone="muted" style={styles.flexShrink}>
              Só números agregados. Nenhuma imagem sai do computador.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

/**
 * Número com rótulo, em texto corrido (19/10/2026: no lugar dos cartões com
 * ícone e do anel de progresso, que repetiam o mesmo número em três enfeites).
 */
function Numero({ valor, rotulo, grande, medio, nota, alerta, acessivel }: { valor: string; rotulo: string; grande?: boolean; medio?: boolean; nota?: string; alerta?: boolean; acessivel?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.numero} accessible accessibilityLabel={acessivel ?? [`${valor} ${rotulo}`, nota].filter(Boolean).join(', ')}>
      <Text variant={grande ? 'display' : medio ? 'h2' : 'h1'} style={alerta ? { color: colors.warningText } : undefined}>
        {valor}
      </Text>
      <Text variant="caption" tone="muted">
        {rotulo}
      </Text>
      {nota ? (
        <Text variant="caption" tone="primary">
          {nota}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Frases por dia. Barras finas com a ponta arredondada (a base fica reta, na
 * linha do zero); número em cima só do dia de hoje e do maior dia — os outros
 * estão no rótulo acessível e se leem pela altura. Hoje se destaca pela cor E
 * pelo rótulo "hoje", nunca só pela cor.
 */
function WeekChart({ days }: { days: Dia[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...days.map((d) => d.utterances));
  const iMax = days.reduce((m, d, i) => (d.utterances > days[m].utterances ? i : m), 0);
  const resumo = days.map((d) => `${d.nomeCompleto}: ${d.utterances} frases`).join('; ');
  return (
    <View style={styles.chartWrap} accessible accessibilityRole="image" accessibilityLabel={`Frases por dia. ${resumo}.`}>
      <View style={[styles.chart, { borderBottomColor: colors.borderStrong }]}>
        {days.map((d, i) => (
          <Bar key={i} index={i} ratio={d.utterances / max} label={d.isToday ? 'hoje' : d.label} value={d.utterances} today={d.isToday} mostrarValor={d.isToday || (i === iMax && d.utterances > 0)} />
        ))}
      </View>
      <View style={styles.chartLabels}>
        {days.map((d, i) => (
          <Text key={i} variant="caption" tone={d.isToday ? 'primary' : 'muted'} weight={d.isToday ? 'bold' : 'medium'} center style={styles.flex} maxFontSizeMultiplier={1.2}>
            {d.isToday ? 'hoje' : d.label}
          </Text>
        ))}
      </View>
      <Text variant="caption" tone="muted" style={styles.chartCaption}>
        Frases faladas por dia
      </Text>
    </View>
  );
}

function Bar({ ratio, value, today, index, mostrarValor }: { ratio: number; label: string; value: number; today: boolean; index: number; mostrarValor: boolean }) {
  const { colors, reduceMotion } = useTheme();
  const alvo = Math.max(value === 0 ? 2 : spacing.xs, ratio * sizes.chart);
  const h = useSharedValue(reduceMotion ? alvo : 0);
  useEffect(() => {
    h.value = reduceMotion ? alvo : withDelay(index * motion.stagger, withTiming(alvo, { duration: motion.duration.slow * 1.6, easing: Easing.out(Easing.cubic) }));
  }, [alvo, index, h, reduceMotion]);
  const st = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <View style={styles.barCol}>
      <Text variant="caption" weight={today ? 'bold' : 'medium'} tone={today ? 'primary' : 'muted'} maxFontSizeMultiplier={1.2}>
        {mostrarValor ? value : ' '}
      </Text>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.bar, { backgroundColor: today ? colors.chartToday : colors.chartBar, opacity: value === 0 ? opacity.faint : 1 }, st]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  gapTop: { marginTop: spacing.md },
  painel: { padding: spacing.xl },
  // Lista sem moldura: as linhas encostam na margem da tela e o fio separa.
  lista: { marginHorizontal: -spacing.lg, borderTopWidth: sizes.hairline },
  numeros: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: spacing.xxl, rowGap: spacing.md, marginTop: spacing.md },
  numero: { minWidth: sizes.touch, maxWidth: '100%' },
  chartWrap: { marginTop: spacing.xxl },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderBottomWidth: sizes.hairline },
  chartLabels: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  chartCaption: { marginTop: spacing.md },
  barCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
  barTrack: { height: sizes.chart, justifyContent: 'flex-end', alignItems: 'center', alignSelf: 'stretch' },
  // Barra fina (≤ 18 dp), ponta de cima arredondada em 4, base reta na linha do zero.
  bar: { width: '55%', maxWidth: 18, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl },
});
