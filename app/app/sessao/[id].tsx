import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, GradientHeader, ListRow, MetricTile, PressableScale, ProgressRing, Screen, SectionTitle, Shimmer, StatusPill, Text } from '@/components';
import { useData } from '@/data/DataContext';
import { Session } from '@/data/types';
import { spacing, useTheme } from '@/theme';
import { dateLong, driftLabel, durationMin, fatigueLabel, formatDuration, hm, presetLabel } from '@/utils/format';

export default function SessaoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const data = useData();
  const { colors } = useTheme();
  const [s, setS] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (id) data.getSession(id).then(setS);
  }, [data, id]);

  return (
    <Screen padded={false}>
      <GradientHeader overlap={50}>
        <PressableScale onPress={() => router.back()} hitSlop={12} style={{ alignSelf: 'flex-start', marginBottom: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </PressableScale>
        <Text variant="label" style={{ color: 'rgba(255,255,255,0.75)' }}>
          Relatório de sessão
        </Text>
        <Text variant="h1" tone="onPrimary">
          {s ? dateLong(s.started_at) : '…'}
        </Text>
        {s && (
          <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
            {hm(s.started_at)}
            {s.ended_at ? ` – ${hm(s.ended_at)}` : ' – em andamento'} · {formatDuration(durationMin(s))}
          </Text>
        )}
      </GradientHeader>

      <View style={{ paddingHorizontal: spacing.xl, marginTop: -36 }}>
        {s === undefined ? (
          <Card index={0}>
            <Shimmer height={100} />
          </Card>
        ) : s === null ? (
          <Card index={0}>
            <Text variant="body">Sessão não encontrada.</Text>
          </Card>
        ) : (
          <>
            <Card index={0}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text variant="label" tone="muted">
                    Precisão
                  </Text>
                  <Text variant="h2">{s.calibration_error_px ?? '—'} px</Text>
                  <Text variant="caption" tone="muted">
                    {s.calibration_error_deg ?? '—'}° · calibração em {s.calibration_seconds ?? '—'} s
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
                    <StatusPill label={driftLabel[s.drift_kind]} tone={s.drift_kind === 'erratico' ? 'danger' : s.drift_kind === 'lento' ? 'warning' : 'accent'} />
                    <StatusPill label={fatigueLabel[s.fatigue]} tone={s.fatigue === 'alta' ? 'danger' : s.fatigue === 'atencao' ? 'warning' : 'accent'} />
                  </View>
                </View>
                <ProgressRing value={s.hit_rate_150px ?? 0} label={`${Math.round((s.hit_rate_150px ?? 0) * 100)}%`} caption="alvo 150 px" />
              </View>
            </Card>

            <View style={styles.tiles}>
              <MetricTile index={1} icon="volume-high-outline" label="frases vocalizadas" value={String(s.utterances)} />
              <MetricTile index={2} icon="text-outline" label="caracteres" value={String(s.chars_typed)} tone="accent" />
            </View>
            <View style={styles.tiles}>
              <MetricTile index={3} icon="body-outline" label="desvio postural" value={`${s.posture_drift_px} px`} hint={s.posture_drift_px > 60 ? 'acima do limiar de 60 px' : 'dentro do limiar'} tone={s.posture_drift_px > 60 ? 'warning' : 'primary'} />
              <MetricTile index={4} icon="eye-outline" label="piscadas por minuto" value={s.blink_rate_bpm ? String(s.blink_rate_bpm) : '—'} tone={s.fatigue === 'ok' ? 'accent' : 'warning'} />
            </View>

            {(s.precision_px != null || s.accuracy_report) && (
              <>
                <SectionTitle title="Teste de precisão" />
                <Card index={7} padding={spacing.sm}>
                  <ListRow icon="locate-outline" title="Acurácia (erro médio)" subtitle={fmtPxDeg(s.accuracy_report?.meanErrorPx ?? s.calibration_error_px, s.accuracy_report?.meanErrorDeg ?? s.calibration_error_deg)} tone="primary" />
                  <ListRow icon="pulse-outline" title="Precisão (tremor)" subtitle={fmtPxDeg(s.precision_px ?? s.accuracy_report?.precisionPx ?? null, s.precision_deg ?? s.accuracy_report?.precisionDeg ?? null)} tone="accent" />
                  <ListRow icon="radio-button-on-outline" title="Acerto em alvo de 100 px" subtitle={pct(s.hit_rate_100px ?? s.accuracy_report?.hitRate100 ?? null)} />
                  {s.accuracy_report?.minTargetPx != null && (
                    <ListRow icon="resize-outline" title="Menor botão confortável" subtitle={`${Math.round(s.accuracy_report.minTargetPx)} px${s.accuracy_report.minTargetDeg != null ? ` (${s.accuracy_report.minTargetDeg.toFixed(1)}°)` : ''}`} tone="muted" />
                  )}
                  {s.accuracy_report?.measuredDistanceCm != null && (
                    <ListRow icon="body-outline" title="Distância medida da câmera" subtitle={`${Math.round(s.accuracy_report.measuredDistanceCm)} cm`} tone="muted" />
                  )}
                  <ListRow
                    icon="checkmark-done-outline"
                    title="Pontos medidos"
                    subtitle={s.accuracy_report ? `${s.accuracy_report.pointsMeasured} de ${s.accuracy_report.pointsTotal} · ${s.accuracy_report.score}` : '—'}
                    tone={s.accuracy_report && s.accuracy_report.pointsMeasured < s.accuracy_report.pointsTotal ? 'warning' : 'accent'}
                    last={!s.accuracy_report?.conditions}
                  />
                  {s.accuracy_report?.conditions && (
                    <ListRow
                      icon="sunny-outline"
                      title="Condições registradas"
                      subtitle={condicoes(s.accuracy_report.conditions)}
                      tone="muted"
                      last
                    />
                  )}
                </Card>
              </>
            )}

            <SectionTitle title="Configuração usada" />
            <Card index={5} padding={spacing.sm}>
              <ListRow icon="timer-outline" title="Tempo de fixação" subtitle={`${s.dwell_ms} ms`} />
              <ListRow icon="options-outline" title="Suavização" subtitle={presetLabel[s.filter_preset]} />
              <ListRow icon="hand-left-outline" title="Pedidos de ajuda" subtitle={String(s.help_requests)} tone={s.help_requests ? 'warning' : 'accent'} />
              <ListRow icon="apps-outline" title="Módulos usados" subtitle={s.modules_used.join(', ') || '—'} last={!s.app_version} />
              {s.app_version ? <ListRow icon="code-slash-outline" title="Versão do IrisFlow Communicator" subtitle={s.app_version} tone="muted" last /> : null}
            </Card>

            <Card index={6} tone="primary" style={{ marginTop: spacing.lg }}>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Ionicons name="bulb-outline" size={22} color={colors.primary} />
                <Text variant="bodySmall" style={{ flex: 1 }}>
                  {s.drift_kind === 'erratico'
                    ? 'Desvio errático indica necessidade de recalibrar. Uma recalibração rápida de quatro pontos leva menos de 15 s.'
                    : s.drift_kind === 'lento'
                      ? 'Desvio lento é típico de quem escorrega na cadeira: reapoiar a nuca costuma resolver sem recalibrar.'
                      : s.fatigue !== 'ok'
                        ? 'A taxa de piscadas subiu ao longo da sessão. Pausas curtas ajudam a manter a precisão.'
                        : 'Sessão estável. Se quiser respostas mais rápidas, experimente o tempo de fixação de 800 ms nos Ajustes.'}
                </Text>
              </View>
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

function fmtPxDeg(px: number | null | undefined, deg: number | null | undefined) {
  if (px == null && deg == null) return '—';
  const a = px != null ? `${Math.round(px)} px` : '';
  const b = deg != null ? `${Number(deg).toFixed(2)}°` : '';
  return [a, b].filter(Boolean).join(' · ');
}

function pct(v: number | null) {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

function condicoes(c: NonNullable<Session['accuracy_report']>['conditions']) {
  if (!c) return '—';
  const partes: string[] = [];
  if (c.lighting) partes.push(`luz ${c.lighting}`);
  if (c.glasses != null) partes.push(c.glasses ? 'com óculos' : 'sem óculos');
  if (c.headMovement) partes.push(`cabeça ${c.headMovement}`);
  if (c.distanceCm) partes.push(`${c.distanceCm} cm da tela`);
  if (c.screenInches) partes.push(`tela ${c.screenInches}"`);
  return partes.join(' · ') || '—';
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  tiles: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
