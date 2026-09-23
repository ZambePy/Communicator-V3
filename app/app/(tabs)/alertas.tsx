import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { AlertListSkeleton, Button, Card, EmptyState, Notice, Screen, ScreenHeader, SegmentedControl, StatusPill, Text } from '@/components';
import { HelpRequest } from '@/data/types';
import { pushIndisponivel } from '@/hooks/usePushNotifications';
import { useApp } from '@/store/AppProvider';
import { radius, sizes, spacing, useEntrada, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { firstName, helpKindLabel, hm, timeAgo } from '@/utils/format';

type Filter = 'abertos' | 'todos';

export default function Alertas() {
  const { colors } = useTheme();
  const { helpRequests, acknowledgeAlert, resolveAlert, settings, patient, patientLoaded, pushError, refresh, error } = useApp();
  const [filter, setFilter] = useState<Filter>('abertos');
  const [refreshing, setRefreshing] = useState(false);
  const semPush = pushIndisponivel();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const open = helpRequests.filter((h) => !h.resolved_at);
  const list = filter === 'abertos' ? open : helpRequests;
  const nome = patient ? firstName(patient.user_name) : 'o paciente';
  const prazo = settings?.emergency_timeout_s ?? 45;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader eyebrow={patient?.user_name} title="Alertas" right={open.length ? <StatusPill label={open.length === 1 ? '1 aberto' : `${open.length} abertos`} tone="danger" /> : undefined} />

      <SegmentedControl<Filter>
        value={filter}
        onChange={setFilter}
        accessibilityLabel="Quais alertas mostrar"
        options={[
          { value: 'abertos', label: open.length ? `Abertos (${open.length})` : 'Abertos' },
          { value: 'todos', label: 'Histórico' },
        ]}
      />

      {/* O que o servidor faz quando ninguém responde — numa linha. Ligar para
          os contatos continua sendo uma ação da pessoa (Ajustes > Emergência). */}
      <View style={styles.info} accessible>
        <Ionicons name="time-outline" size={sizes.icon.sm} color={colors.textMuted} />
        <Text variant="caption" tone="muted" style={styles.flex}>
          Sem confirmação em {prazo} s, o alerta é reenviado a todos os celulares da conta.
        </Text>
      </View>

      {/* Push: só o que a pessoa pode resolver, em linguagem simples. Expo Go e
          emulador são ambientes de desenvolvimento e não geram aviso. */}
      {pushError === 'permissao' ? (
        <Notice
          tone="warning"
          icon="notifications-off-outline"
          title="Notificações desligadas"
          text="Ative para saber na hora, mesmo com o app fechado."
          action={{ label: 'Ativar nos ajustes do celular', onPress: () => void Linking.openSettings().catch(() => undefined) }}
          style={styles.notice}
        />
      ) : pushError === 'registro' || semPush === 'sem-projeto' ? (
        <Notice tone="info" icon="notifications-outline" text="Por enquanto, os alertas chegam com o app aberto. Deixe-o aberto quando precisar." style={styles.notice} />
      ) : null}

      <View style={styles.list}>
        {!patientLoaded && helpRequests.length === 0 ? (
          <AlertListSkeleton />
        ) : list.length === 0 && error ? (
          // A carga falhou: "tudo tranquilo" seria uma afirmação sem base.
          <EmptyState icon="cloud-offline-outline" title="Não deu para verificar os alertas" body="Confira a internet e tente de novo." action={{ label: 'Tentar de novo', icon: 'refresh', onPress: () => void onRefresh() }} />
        ) : list.length === 0 ? (
          filter === 'abertos' ? (
            <EmptyState icon="shield-checkmark-outline" tone="accent" title="Tudo tranquilo por aqui" body={`Avisamos na hora se ${nome} precisar de você.`} />
          ) : (
            <EmptyState icon="time-outline" title="Nenhum alerta ainda" body="Pedidos de ajuda e avisos da sessão ficam guardados aqui." />
          )
        ) : (
          list.map((h, i) => <AlertCard key={h.id} h={h} index={i} onAck={() => acknowledgeAlert(h.id)} onResolve={() => resolveAlert(h.id)} />)
        )}
      </View>
    </Screen>
  );
}

function AlertCard({ h, index, onAck, onResolve }: { h: HelpRequest; index: number; onAck: () => Promise<void>; onResolve: () => Promise<void> }) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const [busy, setBusy] = useState<'ack' | 'resolve' | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const urgent = h.kind === 'emergencia' || h.kind === 'ajuda';
  const resolved = Boolean(h.resolved_at);
  const tone = resolved ? 'muted' : urgent ? 'danger' : 'warning';
  const cor = tone === 'danger' ? colors.dangerText : tone === 'warning' ? colors.warningText : colors.textMuted;
  const bg = tone === 'danger' ? colors.dangerTint : tone === 'warning' ? colors.warningTint : colors.surfaceAlt;
  const barra = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : 'transparent';
  const icon: keyof typeof Ionicons.glyphMap = urgent ? 'hand-left' : h.kind === 'postura' ? 'body' : h.kind === 'fadiga' ? 'moon' : h.kind === 'dispositivo' ? 'desktop' : 'refresh';

  // acknowledgeAlert/resolveAlert gravam no banco e rejeitam quando a escrita
  // falha. A falha aparece no cartão — ninguém sai achando que o paciente foi avisado.
  const executar = async (acao: 'ack' | 'resolve') => {
    if (busy) return;
    setBusy(acao);
    setFalha(null);
    try {
      await (acao === 'ack' ? onAck() : onResolve());
    } catch (e) {
      setFalha(mensagemDeErro(e, 'Não foi possível registrar agora.'));
    } finally {
      setBusy(null);
    }
  };

  const estado = resolved ? 'Resolvido' : h.acknowledged_at ? 'Você já viu' : 'Aguardando resposta';

  return (
    <Animated.View entering={entrada.cascata(index)} layout={entrada.reduzir ? undefined : LinearTransition}>
      <Card padding={0} style={styles.alertCard}>
        <View style={[styles.bar, { backgroundColor: barra }]} />
        <View style={styles.alertBody}>
          <View style={styles.alertTop} accessible accessibilityLabel={`${helpKindLabel[h.kind]}, ${timeAgo(h.created_at)}. ${h.message}. ${estado}.`}>
            <View style={[styles.icon, { backgroundColor: bg }]}>
              <Ionicons name={icon} size={sizes.icon.md} color={cor} />
            </View>
            <View style={styles.flex}>
              <View style={styles.rowBetween}>
                <Text variant="body" weight="semibold" style={styles.flex}>
                  {helpKindLabel[h.kind]}
                </Text>
                <Text variant="caption" tone="muted">
                  {timeAgo(h.created_at)}
                </Text>
              </View>
              {h.message ? (
                <Text variant="bodySmall" tone="muted" style={styles.msg}>
                  {h.message}
                </Text>
              ) : null}
              <View style={styles.pills}>
                <StatusPill label={estado} tone={resolved ? 'accent' : h.acknowledged_at ? 'primary' : urgent ? 'danger' : 'warning'} live={!resolved && !h.acknowledged_at && urgent} />
                {/* `escalated_at` vem do servidor (função agendada): o prazo passou
                    sem confirmação e o alerta foi reenviado a todos os celulares. */}
                {h.escalated_at ? <StatusPill label={`Reenviado às ${hm(h.escalated_at)}`} tone="danger" /> : null}
              </View>
            </View>
          </View>

          {falha ? <Notice tone="danger" title="Nada foi registrado" text={`${falha} Toque de novo para tentar outra vez.`} style={styles.falha} /> : null}

          {!resolved && (
            <View style={styles.actions}>
              {!h.acknowledged_at && (
                <Button title={falha && busy === null ? 'Tentar de novo' : 'Estou ciente'} variant="secondary" icon="eye-outline" loading={busy === 'ack'} disabled={busy !== null} onPress={() => void executar('ack')} style={styles.flex} />
              )}
              <Button title="Resolvido" variant="accent" icon="checkmark-done" loading={busy === 'resolve'} disabled={busy !== null} onPress={() => void executar('resolve')} style={styles.flex} />
            </View>
          )}
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  notice: { marginTop: spacing.md },
  list: { marginTop: spacing.lg, gap: spacing.md },
  alertCard: { flexDirection: 'row', overflow: 'hidden' },
  bar: { width: sizes.accentBar },
  alertBody: { flex: 1, padding: spacing.lg },
  alertTop: { flexDirection: 'row', gap: spacing.md },
  icon: { width: sizes.tile.md, height: sizes.tile.md, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  msg: { marginTop: spacing.xxs },
  pills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  falha: { marginTop: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
});
