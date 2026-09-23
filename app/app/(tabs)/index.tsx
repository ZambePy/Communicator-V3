import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Card, IrisLogo, ListRow, PressableScale, ProgressRing, Screen, SectionTitle, Shimmer, StatusPill, Text } from '@/components';
import { hasFatigueData, hasPostureData, isBetaPlan, MessageKind } from '@/data/types';
import { siteRoute } from '@/lib/config';
import { useApp } from '@/store/AppProvider';
import { motion, radius, shadows, sizes, spacing, useTheme } from '@/theme';
import { driftLabel, durationMin, fatigueLabel, firstName, formatDate, formatDuration, greeting, helpKindLabel, timeAgo } from '@/utils/format';

/** Respostas de um toque. Sim/Não vão como `simnao` (a tela do paciente destaca). */
const RAPIDAS: { texto: string; kind: MessageKind; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { texto: 'Sim', kind: 'simnao', icon: 'checkmark' },
  { texto: 'Não', kind: 'simnao', icon: 'close' },
  { texto: 'Já estou indo', kind: 'frase' },
  { texto: 'Um minuto', kind: 'frase' },
];

type EnvioRapido = { texto: string; estado: 'enviando' | 'ok' | 'falha' } | null;

export default function Home() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, patient, devices, session, helpRequests, messages, unreadCount, refresh, plan, subscription, sendMessage, patientLoaded, error } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [envio, setEnvio] = useState<EnvioRapido>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // A confirmação "Enviado" some sozinha; a falha fica até o próximo toque.
  useEffect(() => {
    if (envio?.estado !== 'ok') return;
    const t = setTimeout(() => setEnvio(null), 2500);
    return () => clearTimeout(t);
  }, [envio]);

  const nome = patient ? firstName(patient.user_name) : 'o paciente';
  const ativos = devices.filter((d) => !d.revoked_at);
  const device = ativos[0];
  const lastPatientMsg = [...messages].reverse().find((m) => m.sender === 'paciente');
  const openAlerts = helpRequests.filter((h) => !h.resolved_at);

  const responder = async (texto: string, kind: MessageKind) => {
    if (envio?.estado === 'enviando') return;
    setEnvio({ texto, estado: 'enviando' });
    try {
      await sendMessage(texto, kind);
      setEnvio({ texto, estado: 'ok' });
    } catch {
      setEnvio({ texto, estado: 'falha' });
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {/* Saudação */}
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="body" tone="muted">
            {greeting()},
          </Text>
          {profile ? (
            <Text variant="h1" accessibilityRole="header">
              {firstName(profile.buyer_name)}
            </Text>
          ) : (
            <Shimmer height={sizes.icon.lg + spacing.xs} width="45%" style={styles.nameShimmer} />
          )}
        </View>
        <IrisLogo size={sizes.logo.sm} spinning={Boolean(device?.online)} breathing={Boolean(session)} />
      </View>

      {/* Estado do computador / sessão */}
      {!patientLoaded ? (
        <Card style={styles.heroSkeleton}>
          <Shimmer height={sizes.avatar.sm} width="60%" />
          <Shimmer height={sizes.button.lg} style={styles.gapTop} />
        </Card>
      ) : (
        <Hero
          nome={nome}
          patientName={patient?.user_name ?? null}
          onOpen={() => (session ? router.push({ pathname: '/sessao/[id]', params: { id: session.id } }) : router.push('/paciente'))}
        />
      )}

      {/* Conversa */}
      <SectionTitle title="Conversa" />
      <Card>
        {lastPatientMsg ? (
          <PressableScale onPress={() => router.push('/(tabs)/conversa')} accessibilityRole="button" accessibilityLabel={`Última mensagem de ${nome}, ${timeAgo(lastPatientMsg.created_at)}: ${lastPatientMsg.text}`} scaleTo={motion.pressScaleCard} style={styles.lastMsg}>
            <View style={[styles.eye, { backgroundColor: colors.primaryTint }]}>
              <Ionicons name="eye" size={sizes.icon.sm} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <View style={styles.rowBetween}>
                <Text variant="caption" tone="muted" style={styles.flex}>
                  {nome} · {timeAgo(lastPatientMsg.created_at)}
                </Text>
                {unreadCount > 0 && <StatusPill label={unreadCount === 1 ? '1 nova' : `${unreadCount} novas`} tone="primary" />}
              </View>
              <Text variant="body" weight={unreadCount ? 'semibold' : 'regular'} numberOfLines={3}>
                {lastPatientMsg.text}
              </Text>
            </View>
          </PressableScale>
        ) : (
          <View style={styles.emptyMsg}>
            <Ionicons name={error ? 'cloud-offline-outline' : 'chatbubble-ellipses-outline'} size={sizes.icon.lg} color={error ? colors.warningText : colors.primary} />
            <View style={styles.flex}>
              <Text variant="body" weight="semibold">
                {error ? 'Não deu para carregar a conversa' : 'Ainda sem mensagens'}
              </Text>
              <Text variant="bodySmall" tone="muted">
                {error ? 'Assim que a conexão voltar, as mensagens aparecem aqui.' : `Quando ${nome} escrever com os olhos, aparece aqui.`}
              </Text>
            </View>
          </View>
        )}

        {/* Respostas de um toque só quando há o que responder. */}
        {lastPatientMsg ? (
          <View style={styles.quickRow}>
            {RAPIDAS.map((r) => {
              const esta = envio?.texto === r.texto;
              const cor = r.texto === 'Sim' ? colors.accentText : r.texto === 'Não' ? colors.dangerText : colors.primary;
              const bg = r.texto === 'Sim' ? colors.accentTint : r.texto === 'Não' ? colors.dangerTint : colors.primaryTint;
              return (
                <PressableScale
                  key={r.texto}
                  onPress={() => void responder(r.texto, r.kind)}
                  disabled={envio?.estado === 'enviando'}
                  haptic="medium"
                  accessibilityRole="button"
                  accessibilityLabel={`Responder “${r.texto}” para ${nome}`}
                  style={[styles.quick, { backgroundColor: bg }]}
                >
                  {r.icon ? <Ionicons name={esta && envio?.estado === 'ok' ? 'checkmark-done' : r.icon} size={sizes.icon.sm} color={cor} /> : null}
                  <Text variant="bodySmall" weight="semibold" style={{ color: cor }}>
                    {r.texto}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        ) : null}
        {envio && envio.estado !== 'enviando' ? (
          <View style={styles.envio} accessibilityLiveRegion="polite">
            <Ionicons name={envio.estado === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={sizes.icon.sm} color={envio.estado === 'ok' ? colors.accentText : colors.dangerText} />
            <Text variant="caption" tone={envio.estado === 'ok' ? 'accent' : 'danger'} style={styles.flex}>
              {envio.estado === 'ok' ? `“${envio.texto}” enviado para ${nome}.` : `“${envio.texto}” não foi enviado. Confira a internet e toque de novo.`}
            </Text>
          </View>
        ) : null}

        <Button
          title={unreadCount ? 'Responder' : `Escrever para ${nome}`}
          variant={unreadCount ? 'primary' : 'secondary'}
          icon="chatbubble-outline"
          onPress={() => router.push('/(tabs)/conversa')}
          style={styles.gapTop}
        />
      </Card>

      {/* Alertas */}
      <SectionTitle title="Alertas" action="Ver todos" onAction={() => router.push('/(tabs)/alertas')} />
      <Card padding={0}>
        {/* Sem carga, "tudo tranquilo" seria uma afirmação sem base: numa
            falha, dizer que não deu para verificar e oferecer tentar de novo. */}
        {openAlerts.length === 0 && error ? (
          <ListRow icon="cloud-offline-outline" title="Não deu para verificar os alertas" subtitle="Toque para tentar de novo." tone="warning" onPress={() => void refresh()} last />
        ) : openAlerts.length === 0 ? (
          <ListRow icon="shield-checkmark" title="Tudo tranquilo" subtitle="Nenhum alerta pendente." tone="accent" last />
        ) : (
          openAlerts.slice(0, 3).map((h, i) => {
            const urgente = h.kind === 'emergencia' || h.kind === 'ajuda';
            return (
              <ListRow
                key={h.id}
                icon={urgente ? 'hand-left' : h.kind === 'postura' ? 'body' : h.kind === 'fadiga' ? 'moon' : h.kind === 'dispositivo' ? 'desktop' : 'refresh'}
                title={helpKindLabel[h.kind]}
                subtitle={`${timeAgo(h.created_at)} · ${h.acknowledged_at ? 'você já viu' : 'aguardando'}`}
                tone={urgente ? 'danger' : 'warning'}
                onPress={() => router.push('/(tabs)/alertas')}
                last={i === Math.min(openAlerts.length, 3) - 1}
              />
            );
          })
        )}
      </Card>

      {/* Computador */}
      {device ? (
        <>
          <SectionTitle title="Computador" action="Detalhes" onAction={() => router.push('/paciente')} />
          <Card>
            <Text variant="bodySmall" tone="muted" numberOfLines={1}>
              {device.name}
              {device.app_version ? ` · versão ${device.app_version}` : ''}
            </Text>
            <View style={styles.checks}>
              <Check ok={device.online} label={device.online ? 'Conectado' : 'Desconectado'} />
              <Check ok={device.camera_ok} label="Câmera" />
              <Check ok={device.tracker_ok} label="Rastreamento" />
              <Check ok={device.calibrated} label={device.calibrated ? 'Calibrado' : 'Calibrar'} warn={!device.calibrated} />
            </View>
          </Card>
        </>
      ) : null}

      {plan ? (
        <PressableScale onPress={() => router.push('/assinatura')} accessibilityRole="button" style={styles.plan}>
          <Ionicons name={isBetaPlan(plan, subscription) ? 'sparkles-outline' : 'card-outline'} size={sizes.icon.sm} color={colors.textMuted} />
          <Text variant="caption" tone="muted" center style={styles.flexShrink}>
            {isBetaPlan(plan, subscription) && subscription ? `Beta · acesso completo até ${formatDate(subscription.next_charge_at)}` : `Plano ${plan.name}`}
          </Text>
        </PressableScale>
      ) : null}
    </Screen>
  );
}

/**
 * O cartão principal: responde, num relance, "como está o computador de
 * {nome} agora?". Estados: sem computador, desligado, ligado, em sessão — e
 * "sem atualização", quando a carga falhou e não dá para afirmar nada.
 */
function Hero({ nome, patientName, onOpen }: { nome: string; patientName: string | null; onOpen: () => void }) {
  const { colors } = useTheme();
  const { devices, session, error, refresh } = useApp();
  const device = devices.find((d) => !d.revoked_at);
  const online = device?.online ?? false;

  const estado = !device ? (error ? 'indisponivel' : 'semComputador') : session ? 'emSessao' : online ? 'ligado' : 'desligado';
  const pill = estado === 'emSessao' ? { label: 'Ao vivo', live: true, tone: 'accent' as const } : estado === 'ligado' ? { label: 'Ligado', live: false, tone: 'accent' as const } : estado === 'desligado' ? { label: 'Desligado', live: false, tone: 'muted' as const } : null;
  const posturaMedida = session ? hasPostureData(session) : false;
  const fadigaMedida = session ? hasFatigueData(session) : false;
  const acerto = session?.hit_rate_150px ?? null;

  const rotulo =
    estado === 'emSessao'
      ? `Sessão em andamento há ${formatDuration(durationMin(session!))}. Toque para ver o relatório.`
      : estado === 'ligado'
        ? `Computador de ${nome} ligado.`
        : estado === 'desligado'
          ? `Computador de ${nome} desligado, visto ${timeAgo(device!.last_seen_at)}.`
          : estado === 'indisponivel'
            ? 'Sem atualização agora. Toque para tentar de novo.'
            : `Nenhum computador conectado a ${nome}.`;
  const icone: keyof typeof Ionicons.glyphMap = estado === 'ligado' ? 'desktop-outline' : estado === 'indisponivel' ? 'cloud-offline-outline' : 'moon-outline';
  const titulo = estado === 'ligado' ? 'Computador ligado' : estado === 'indisponivel' ? 'Sem atualização agora' : 'Computador desligado';
  const detalhe =
    estado === 'ligado'
      ? `Pronto para quando ${nome} quiser conversar.`
      : estado === 'indisponivel'
        ? 'Quando a conexão voltar, o estado do computador aparece aqui.'
        : device
          ? `Visto ${timeAgo(device.last_seen_at)}. As mensagens esperam na fila.`
          : '';

  const conteudo = (
    <LinearGradient colors={colors.gradientHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroTop}>
        <Avatar name={patientName} onDark />
        <Text variant="h3" tone="onDark" style={styles.flex} numberOfLines={1}>
          {patientName ?? 'Paciente'}
        </Text>
        {pill ? <StatusPill label={pill.label} live={pill.live} tone={pill.tone} onDark /> : null}
      </View>

      {estado === 'emSessao' && session ? (
        <>
          <View style={styles.heroMain}>
            <View style={styles.flex}>
              <Text variant="caption" tone="onDarkMuted">
                Sessão em andamento
              </Text>
              <Text variant="display" tone="onDark">
                {formatDuration(durationMin(session))}
              </Text>
              {session.modules_used.length ? (
                <Text variant="caption" tone="onDarkMuted">
                  {session.modules_used.join(' · ')}
                </Text>
              ) : null}
            </View>
            {acerto != null ? <ProgressRing value={acerto} label={`${Math.round(acerto * 100)}%`} caption="acerto" onDark accessibilityLabel={`Acerto de ${Math.round(acerto * 100)} por cento`} /> : null}
          </View>
          <View style={[styles.heroStats, { borderTopColor: colors.onDarkBorder }]}>
            <Stat valor={String(session.utterances)} rotulo="frases" />
            <Stat valor={String(session.chars_typed)} rotulo="letras" />
            <Stat valor={`${session.dwell_ms} ms`} rotulo="fixação" />
          </View>
          {posturaMedida || fadigaMedida ? (
            <View style={styles.pills}>
              {posturaMedida ? <StatusPill label={`Postura: ${driftLabel[session.drift_kind].toLowerCase()}`} onDark tone={session.drift_kind === 'nenhum' ? 'accent' : 'warning'} /> : null}
              {fadigaMedida ? <StatusPill label={fatigueLabel[session.fatigue]} onDark tone={session.fatigue === 'ok' ? 'accent' : 'warning'} /> : null}
            </View>
          ) : null}
        </>
      ) : estado === 'semComputador' ? (
        <>
          <Text variant="h2" tone="onDark" style={styles.heroTitle}>
            Vamos conectar o computador
          </Text>
          <View style={styles.steps}>
            <Passo n={1} texto={`Instale o IrisFlow no computador de ${nome}.`} />
            <Passo n={2} texto="Entre lá com esta mesma conta. Pronto: o vínculo é automático." />
          </View>
          <Button title="Baixar para o computador" variant="light" icon="download-outline" onPress={() => void Linking.openURL(siteRoute('/beta')).catch(() => undefined)} style={styles.heroCta} />
        </>
      ) : (
        <View style={styles.heroIdle}>
          <View style={[styles.idleIcon, { backgroundColor: colors.onDarkFill }]}>
            <Ionicons name={icone} size={sizes.icon.md} color={colors.onDark} />
          </View>
          <View style={styles.flex}>
            <Text variant="h2" tone="onDark">
              {titulo}
            </Text>
            <Text variant="bodySmall" tone="onDarkMuted">
              {detalhe}
            </Text>
          </View>
        </View>
      )}
    </LinearGradient>
  );

  // Sem computador, a ação é o botão de download: o cartão não é tocável (um
  // botão dentro de outro ficaria inalcançável para o leitor de tela).
  if (estado === 'semComputador') return <View style={[styles.heroWrap, shadows.glow(colors.primaryStrong)]}>{conteudo}</View>;
  return (
    <PressableScale onPress={estado === 'indisponivel' ? () => void refresh() : onOpen} scaleTo={motion.pressScaleCard} accessibilityRole="button" accessibilityLabel={rotulo} style={[styles.heroWrap, shadows.glow(colors.primaryStrong)]}>
      {conteudo}
    </PressableScale>
  );
}

function Stat({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="h3" tone="onDark">
        {valor}
      </Text>
      <Text variant="caption" tone="onDarkMuted">
        {rotulo}
      </Text>
    </View>
  );
}

function Passo({ n, texto }: { n: number; texto: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.passo}>
      <View style={[styles.passoN, { backgroundColor: colors.onDarkFill, borderColor: colors.onDarkBorder }]}>
        <Text variant="caption" tone="onDark" weight="bold" maxFontSizeMultiplier={1.2}>
          {n}
        </Text>
      </View>
      <Text variant="bodySmall" tone="onDarkMuted" style={styles.flex}>
        {texto}
      </Text>
    </View>
  );
}

function Check({ ok, label, warn }: { ok: boolean; label: string; warn?: boolean }) {
  const { colors } = useTheme();
  const icon: keyof typeof Ionicons.glyphMap = ok ? 'checkmark-circle' : warn ? 'alert-circle' : 'ellipse-outline';
  const cor = ok ? colors.accentText : warn ? colors.warningText : colors.textMuted;
  return (
    <View style={styles.check} accessible accessibilityLabel={`${label}: ${ok ? 'ok' : warn ? 'precisa de atenção' : 'não'}`}>
      <Ionicons name={icon} size={sizes.icon.md} color={cor} />
      <Text variant="bodySmall" weight="medium" style={styles.flexShrink}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  gapTop: { marginTop: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  nameShimmer: { marginTop: spacing.xs },
  heroSkeleton: { gap: spacing.md },
  heroWrap: { borderRadius: radius.xl },
  hero: { borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.xl },
  heroStats: { flexDirection: 'row', marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: sizes.hairline },
  stat: { flex: 1, gap: spacing.xxs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  heroTitle: { marginTop: spacing.xl },
  steps: { marginTop: spacing.md, gap: spacing.md },
  passo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  passoN: { width: sizes.icon.lg, height: sizes.icon.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: sizes.border },
  heroCta: { marginTop: spacing.xl },
  heroIdle: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.xl },
  idleIcon: { width: sizes.tile.md, height: sizes.tile.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.xxs },
  lastMsg: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  eye: { width: sizes.tile.md, height: sizes.tile.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  emptyMsg: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  // Grade 2 × 2: Sim/Não em cima, respostas curtas embaixo — alvos grandes e alinhados.
  quick: { minHeight: sizes.touch, flexBasis: '46%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  envio: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checks: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, marginTop: spacing.md },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexBasis: '50%', flexGrow: 1, minHeight: sizes.touch - spacing.md },
  plan: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: sizes.touch, marginTop: spacing.xxl, paddingHorizontal: spacing.lg },
});
