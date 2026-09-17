import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Card, EmptyState, GradientHeader, PressableScale, Screen, SectionTitle, SegmentedControl, StatusPill, Text } from '@/components';
import { HelpRequest } from '@/data/types';
import { pushIndisponivel } from '@/hooks/usePushNotifications';
import { useApp } from '@/store/AppProvider';
import { radius, spacing, useTheme } from '@/theme';
import { helpKindLabel, hm, timeAgo } from '@/utils/format';

type Filter = 'abertos' | 'todos';

export default function Alertas() {
  const { colors } = useTheme();
  const { helpRequests, acknowledgeAlert, resolveAlert, settings, patient } = useApp();
  const [filter, setFilter] = useState<Filter>('abertos');
  const semPush = pushIndisponivel();

  const open = helpRequests.filter((h) => !h.resolved_at);
  const list = filter === 'abertos' ? open : helpRequests;
  const emergencies = helpRequests.filter((h) => h.kind === 'emergencia' || h.kind === 'ajuda').length;

  return (
    <Screen padded={false}>
      <GradientHeader overlap={50}>
        <Text variant="label" style={{ color: 'rgba(255,255,255,0.75)' }}>
          {patient?.user_name ?? 'Paciente'}
        </Text>
        <Text variant="h1" tone="onPrimary">
          Alertas
        </Text>
        <View style={styles.stats}>
          <Stat value={String(open.length)} label={open.length === 1 ? 'aberto' : 'abertos'} />
          <Stat value={String(emergencies)} label={emergencies === 1 ? 'pedido de socorro' : 'pedidos de socorro'} />
          <Stat value={`${settings?.emergency_timeout_s ?? 45} s`} label="prazo de resposta" />
        </View>
      </GradientHeader>

      <View style={{ paddingHorizontal: spacing.xl, marginTop: -36 }}>
        <Card index={0} padding={spacing.xs}>
          <SegmentedControl<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'abertos', label: `Abertos (${open.length})` },
              { value: 'todos', label: 'Histórico' },
            ]}
          />
        </Card>

        <Card index={1} tone="primary" style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Ionicons name="information-circle" size={22} color={colors.primary} />
            {/* Descreve exatamente o que o escalonamento do servidor faz (marca
                `escalated_at`, avisa na conversa, reenvia o push a todos os
                celulares da conta) — e o que ele NÃO faz: telefonar para alguém. */}
            <Text variant="bodySmall" style={{ flex: 1 }}>
              A célula de socorro fica em posição fixa em todas as telas do paciente. Se ninguém confirmar um pedido de socorro ou de ajuda em {settings?.emergency_timeout_s ?? 45} s, o servidor escala o alerta: registra o horário, avisa na conversa e reenvia a notificação para todos os celulares desta conta. Ligar para os contatos de emergência continua sendo uma ação sua — nenhum telefonema é feito sozinho.
            </Text>
          </View>
        </Card>

        {/* Esta é a tela que promete o aviso no celular. Onde a promessa é
            feita, a ressalva também — não só no console. */}
        {semPush && (
          <Card index={2} tone="warning" style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Ionicons name="notifications-off" size={22} color={colors.warning} />
              <Text variant="bodySmall" style={{ flex: 1 }}>
                A notificação por push ainda não está ativa neste build — {semPush}. Com o app aberto o alerta ocupa a tela inteira normalmente; com o app fechado, nada chega ao celular. Deixe o app aberto ou combine outro meio de aviso.
              </Text>
            </View>
          </Card>
        )}

        <SectionTitle title={filter === 'abertos' ? 'Precisam de atenção' : 'Todos os alertas'} />
        {list.length === 0 ? (
          <EmptyState icon="shield-checkmark-outline" title="Nenhum alerta" body="Pedidos de ajuda, avisos de postura, fadiga e recalibração aparecem aqui assim que acontecem." />
        ) : (
          list.map((h, i) => <AlertCard key={h.id} h={h} index={i} onAck={() => acknowledgeAlert(h.id)} onResolve={() => resolveAlert(h.id)} />)
        )}
      </View>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text variant="h2" tone="onPrimary">
        {value}
      </Text>
      <Text variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
        {label}
      </Text>
    </View>
  );
}

function AlertCard({ h, index, onAck, onResolve }: { h: HelpRequest; index: number; onAck: () => Promise<void>; onResolve: () => Promise<void> }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState<'ack' | 'resolve' | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const urgent = h.kind === 'emergencia' || h.kind === 'ajuda';
  const resolved = Boolean(h.resolved_at);
  const tone = resolved ? 'muted' : urgent ? 'danger' : 'warning';
  const color = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.textMuted;
  const bg = tone === 'danger' ? colors.dangerTint : tone === 'warning' ? colors.warningTint : colors.surfaceAlt;
  const icon: keyof typeof Ionicons.glyphMap = urgent ? 'hand-left' : h.kind === 'postura' ? 'body' : h.kind === 'fadiga' ? 'moon' : h.kind === 'dispositivo' ? 'desktop' : 'refresh';

  // acknowledgeAlert/resolveAlert gravam no banco e rejeitam quando a escrita
  // falha. Antes a rejeição não era tratada: o cuidador tocava "Estou ciente",
  // nada mudava na tela, e ele saía achando que o paciente tinha sido avisado.
  const executar = async (acao: 'ack' | 'resolve') => {
    if (busy) return;
    setBusy(acao);
    setFalha(null);
    try {
      await (acao === 'ack' ? onAck() : onResolve());
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível registrar agora.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(380)} layout={LinearTransition.springify()}>
      <Card animated={false} style={[styles.alert, !resolved && urgent && { borderLeftWidth: 4, borderLeftColor: colors.danger }, !resolved && !urgent && { borderLeftWidth: 4, borderLeftColor: colors.warning }]}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={[styles.icon, { backgroundColor: bg }]}>
            <Ionicons name={icon} size={22} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.rowBetween}>
              <Text variant="body" weight="semibold">
                {helpKindLabel[h.kind]}
              </Text>
              <Text variant="caption" tone="muted">
                {timeAgo(h.created_at)}
              </Text>
            </View>
            <Text variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
              {h.message}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
              {resolved ? (
                <StatusPill label="Resolvido" tone="accent" />
              ) : h.acknowledged_at ? (
                <StatusPill label="Reconhecido" tone="primary" />
              ) : (
                <StatusPill label="Aguardando resposta" tone={urgent ? 'danger' : 'warning'} live={urgent} />
              )}
              {/* `escalated_at` é gravado pela função agendada do servidor quando
                  o prazo passa sem confirmação; ele reenvia o push e avisa na
                  conversa. O horário vem do servidor, não do relógio do celular. */}
              {h.escalated_at && <StatusPill label={`Escalado às ${hm(h.escalated_at)}`} tone="danger" />}
            </View>
          </View>
        </View>
        {falha && (
          <View style={[styles.falha, { backgroundColor: colors.dangerTint }]}>
            <Ionicons name="cloud-offline" size={16} color={colors.danger} />
            <Text variant="caption" tone="danger" style={{ flex: 1 }}>
              Nada foi registrado: {falha} Toque de novo para tentar outra vez.
            </Text>
          </View>
        )}
        {!resolved && (
          <View style={styles.actions}>
            {!h.acknowledged_at && (
              <PressableScale onPress={() => void executar('ack')} disabled={busy !== null} style={[styles.actionBtn, { backgroundColor: colors.primaryTint, opacity: busy === 'ack' ? 0.6 : 1 }]}>
                <Ionicons name={falha ? 'refresh' : 'eye'} size={16} color={colors.primary} />
                <Text variant="bodySmall" weight="semibold" tone="primary">
                  {busy === 'ack' ? 'Registrando…' : falha ? 'Tentar de novo' : 'Estou ciente'}
                </Text>
              </PressableScale>
            )}
            <PressableScale onPress={() => void executar('resolve')} disabled={busy !== null} style={[styles.actionBtn, { backgroundColor: colors.accentTint, opacity: busy === 'resolve' ? 0.6 : 1 }]}>
              <Ionicons name="checkmark-done" size={16} color={colors.accentDeep} />
              <Text variant="bodySmall" weight="semibold" style={{ color: colors.accentDeep }}>
                {busy === 'resolve' ? 'Registrando…' : 'Resolvido'}
              </Text>
            </PressableScale>
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', marginTop: spacing.lg, gap: spacing.md },
  alert: { marginBottom: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  falha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm + 2, borderRadius: radius.sm },
});
