import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card, EmptyState, ListRow, MetricTile, Notice, ProgressRing, Screen, ScreenHeader, SectionTitle, Shimmer, StatusPill, Text } from '@/components';
import { useData } from '@/data/DataContext';
import { hasFatigueData, hasPostureData, Session } from '@/data/types';
import { sizes, spacing } from '@/theme';
import { dateLong, decimal, driftLabel, durationMin, fatigueLabel, formatDuration, hm, presetLabel } from '@/utils/format';

export default function SessaoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const data = useData();
  const [s, setS] = useState<Session | null | undefined>(undefined);
  /** Falha ao buscar (rede, servidor) — diferente de "não existe", e com nova tentativa. */
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!id) return;
    setFalhou(false);
    data
      .getSession(id)
      .then(setS)
      .catch(() => {
        // Antes toda falha virava "Sessão não encontrada… pode ter sido
        // removida": uma queda de rede parecia dado apagado, e sem saída.
        setS(undefined);
        setFalhou(true);
      });
  }, [data, id, tentativa]);

  const titulo = s ? capitalizar(dateLong(s.started_at)) : 'Relatório de sessão';
  const periodo = s ? `${hm(s.started_at)}${s.ended_at ? ` – ${hm(s.ended_at)}` : ' · em andamento'} · ${formatDuration(durationMin(s))}` : undefined;

  return (
    <Screen>
      <ScreenHeader onBack={() => router.back()} eyebrow="Relatório de sessão" title={titulo} subtitle={periodo} />

      {falhou ? (
        <Card>
          <EmptyState
            icon="cloud-offline-outline"
            title="Não deu para carregar a sessão"
            body="Verifique a internet e tente de novo."
            action={{ label: 'Tentar de novo', icon: 'refresh', onPress: () => setTentativa((n) => n + 1) }}
            compact
          />
        </Card>
      ) : s === undefined ? (
        <Card>
          <Shimmer height={sizes.ring.md} />
        </Card>
      ) : s === null ? (
        <Card>
          <EmptyState icon="document-outline" title="Sessão não encontrada" body="Ela pode ter sido removida. Volte e escolha outra na lista." compact />
        </Card>
      ) : (
        <>
          <Card index={0}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text variant="caption" tone="muted">
                  Precisão da calibração
                </Text>
                <Text variant="display">{s.calibration_error_px != null ? `${Math.round(s.calibration_error_px)} px` : '—'}</Text>
                <Text variant="caption" tone="muted">
                  {s.calibration_error_deg != null ? `${decimal(s.calibration_error_deg, 2)}°` : '—'}
                  {s.calibration_seconds != null ? ` · calibrada em ${s.calibration_seconds} s` : ''}
                </Text>
                {/* Postura e fadiga só quando medidas: o banco tem default (0 / 'nenhum' / 'ok'). */}
                {hasPostureData(s) || hasFatigueData(s) ? (
                  <View style={styles.pills}>
                    {hasPostureData(s) ? <StatusPill label={driftLabel[s.drift_kind]} tone={s.drift_kind === 'erratico' ? 'danger' : s.drift_kind === 'lento' ? 'warning' : 'accent'} /> : null}
                    {hasFatigueData(s) ? <StatusPill label={fatigueLabel[s.fatigue]} tone={s.fatigue === 'alta' ? 'danger' : s.fatigue === 'atencao' ? 'warning' : 'accent'} /> : null}
                  </View>
                ) : null}
              </View>
              {s.hit_rate_150px != null ? <ProgressRing value={s.hit_rate_150px} label={`${Math.round(s.hit_rate_150px * 100)}%`} caption="acerto" accessibilityLabel={`Acerto em alvo de 150 pixels: ${Math.round(s.hit_rate_150px * 100)} por cento`} /> : null}
            </View>
          </Card>

          <View style={styles.tiles}>
            <MetricTile index={1} icon="volume-high-outline" label="frases faladas" value={String(s.utterances)} />
            <MetricTile index={2} icon="text-outline" label="letras escritas" value={String(s.chars_typed)} tone="accent" />
            {hasPostureData(s) ? (
              <MetricTile index={3} icon="body-outline" label="desvio postural" value={`${s.posture_drift_px} px`} hint={s.posture_drift_px > 60 ? 'acima do limite de 60 px' : 'dentro do limite'} tone={s.posture_drift_px > 60 ? 'warning' : 'primary'} />
            ) : null}
            {s.blink_rate_bpm != null ? <MetricTile index={4} icon="eye-outline" label="piscadas por minuto" value={String(s.blink_rate_bpm)} tone={s.fatigue === 'ok' ? 'accent' : 'warning'} /> : null}
          </View>

          <Notice tone="info" icon="bulb-outline" title="Dica" text={dica(s)} style={styles.dica} />

          {s.precision_px != null || s.accuracy_report ? (
            <>
              <SectionTitle title="Teste de precisão" />
              <Card padding={0}>
                <ListRow icon="locate-outline" title="Acurácia (erro médio)" subtitle={fmtPxDeg(s.accuracy_report?.meanErrorPx ?? s.calibration_error_px, s.accuracy_report?.meanErrorDeg ?? s.calibration_error_deg)} tone="primary" />
                <ListRow icon="pulse-outline" title="Precisão (tremor)" subtitle={fmtPxDeg(s.precision_px ?? s.accuracy_report?.precisionPx ?? null, s.precision_deg ?? s.accuracy_report?.precisionDeg ?? null)} tone="accent" />
                <ListRow icon="radio-button-on-outline" title="Acerto em alvo de 100 px" subtitle={pct(s.hit_rate_100px ?? s.accuracy_report?.hitRate100 ?? null)} />
                {s.accuracy_report?.minTargetPx != null ? (
                  <ListRow icon="resize-outline" title="Menor botão confortável" subtitle={`${Math.round(s.accuracy_report.minTargetPx)} px${s.accuracy_report.minTargetDeg != null ? ` (${decimal(s.accuracy_report.minTargetDeg, 1)}°)` : ''}`} tone="muted" />
                ) : null}
                {s.accuracy_report?.measuredDistanceCm != null ? <ListRow icon="body-outline" title="Distância medida da câmera" subtitle={`${Math.round(s.accuracy_report.measuredDistanceCm)} cm`} tone="muted" /> : null}
                <ListRow
                  icon="checkmark-done-outline"
                  title="Pontos medidos"
                  subtitle={s.accuracy_report ? `${s.accuracy_report.pointsMeasured} de ${s.accuracy_report.pointsTotal} · ${s.accuracy_report.score}` : '—'}
                  tone={s.accuracy_report && s.accuracy_report.pointsMeasured < s.accuracy_report.pointsTotal ? 'warning' : 'accent'}
                  last={!s.accuracy_report?.conditions}
                />
                {s.accuracy_report?.conditions ? <ListRow icon="sunny-outline" title="Condições registradas" subtitle={condicoes(s.accuracy_report.conditions)} tone="muted" last /> : null}
              </Card>
            </>
          ) : null}

          <SectionTitle title="Configuração usada" />
          <Card padding={0}>
            <ListRow icon="timer-outline" title="Tempo de fixação" subtitle={`${s.dwell_ms} ms`} />
            <ListRow icon="pulse-outline" title="Suavização" subtitle={presetLabel[s.filter_preset]} />
            <ListRow icon="hand-left-outline" title="Pedidos de ajuda" subtitle={String(s.help_requests)} tone={s.help_requests ? 'warning' : 'accent'} />
            <ListRow icon="apps-outline" title="Módulos usados" subtitle={s.modules_used.join(', ') || '—'} last={!s.app_version} />
            {s.app_version ? <ListRow icon="code-slash-outline" title="Versão do IrisFlow" subtitle={s.app_version} tone="muted" last /> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}

/** Uma recomendação só, a mais importante para esta sessão. */
function dica(s: Session): string {
  if (s.drift_kind === 'erratico') return 'O desvio foi irregular: vale recalibrar. Uma recalibração rápida de quatro pontos leva menos de 15 s.';
  if (s.drift_kind === 'lento') return 'Desvio lento costuma ser o corpo escorregando na cadeira: reapoiar a nuca resolve sem recalibrar.';
  if (hasFatigueData(s) && s.fatigue !== 'ok') return 'As piscadas aumentaram ao longo da sessão. Pausas curtas ajudam a manter a precisão.';
  return 'Sessão estável. Para respostas mais rápidas, experimente 800 ms de fixação nos Ajustes.';
}

function capitalizar(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fmtPxDeg(px: number | null | undefined, deg: number | null | undefined) {
  if (px == null && deg == null) return '—';
  const a = px != null ? `${Math.round(px)} px` : '';
  const b = deg != null ? `${decimal(deg, 2)}°` : '';
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
  if (c.screenInches) partes.push(`tela de ${decimal(c.screenInches, 1)}"`);
  return partes.join(' · ') || '—';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  pills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  dica: { marginTop: spacing.md },
});
