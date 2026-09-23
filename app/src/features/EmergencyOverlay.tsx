import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Linking, Modal, Platform, StyleSheet, Vibration, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Button, LiveDot, PressableScale, Text } from '@/components';
import { HelpRequest } from '@/data/types';
import { haptics } from '@/lib/haptics';
import { useApp } from '@/store/AppProvider';
import { layout, lightColors, motion, radius, sizes, spacing, useEntrada, useTheme, zIndex } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { firstName, helpKindLabel, hm } from '@/utils/format';

/** Vibração longa e insistente do Android enquanto ninguém confirma (padrão do canal "emergencia"). */
const PADRAO_VIBRACAO = [0, 400, 200, 400, 200, 400];
const REPETIR_A_CADA_MS = 2500;
/**
 * A partir deste atraso entre o pedido (no computador) e a chegada ao
 * servidor, o overlay diz as duas horas. Mesmo limiar da notificação
 * (supabase/functions/desktop-sync/horario.ts).
 */
const ATRASO_RELEVANTE_MS = 2 * 60_000;

/**
 * Alerta de tela cheia: aparece sobre qualquer tela quando o paciente aciona
 * socorro ou ajuda (vermelho), ou quando a sessão emite aviso — postura,
 * fadiga, recalibração (azul). Resolve-se com UM toque ("Estou indo!").
 *
 * Nunca fica escondido: no Android e no web é um `Modal` (janela própria, acima
 * de tudo); no iOS, um `FullWindowOverlay` — uma janela do sistema acima até das
 * telas apresentadas como modal, onde um `Modal` comum não conseguiria abrir.
 */
export function EmergencyOverlay() {
  const { pendingAlert, dismissPendingAlert } = useApp();
  if (!pendingAlert) return null;

  const urgent = pendingAlert.kind === 'emergencia' || pendingAlert.kind === 'ajuda';
  const podeFechar = Boolean(pendingAlert.acknowledged_at);
  const conteudo = <Conteudo alerta={pendingAlert} urgent={urgent} />;

  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
        <View style={StyleSheet.absoluteFill}>{conteudo}</View>
      </FullWindowOverlay>
    );
  }
  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      // Voltar do Android não some com um pedido sem resposta; depois de
      // confirmado, equivale a "Ver depois".
      onRequestClose={() => (podeFechar ? dismissPendingAlert() : undefined)}
    >
      {conteudo}
    </Modal>
  );
}

function Conteudo({ alerta, urgent }: { alerta: HelpRequest; urgent: boolean }) {
  const { acknowledgeAlert, resolveAlert, dismissPendingAlert, patient, settings } = useApp();
  const { colors } = useTheme();
  const entrada = useEntrada();
  const insets = useSafeAreaInsets();
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState<'ack' | 'resolve' | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  const nome = patient ? firstName(patient.user_name) : 'O paciente';

  // Chaveado por id/estado, não pelo objeto: o UPDATE do servidor (escalonamento,
  // reconhecimento em outro celular) troca o objeto sem que o alerta seja outro,
  // e não pode zerar o cronômetro. Ele conta a partir de quando o servidor
  // RECEBEU o pedido (`received_at`) — o mesmo instante que a função agendada
  // usa — e não de quando a tela abriu aqui. Sem a coluna, `created_at`.
  const alertId = alerta.id;
  const recebidoEm = alerta.received_at ?? alerta.created_at;
  const ack = Boolean(alerta.acknowledged_at);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.round((Date.now() - new Date(recebidoEm).getTime()) / 1000)));
    tick();
    setFalha(null);
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [alertId, recebidoEm]);
  /** O pedido esperou (fila offline do computador) antes de chegar ao servidor? */
  const chegouAtrasado = new Date(recebidoEm).getTime() - new Date(alerta.created_at).getTime() >= ATRASO_RELEVANTE_MS;

  // Vibração insistente enquanto um pedido de socorro não é confirmado: padrão
  // longo no Android (Vibration), retorno tátil de erro no iOS.
  useEffect(() => {
    if (!urgent || ack) return;
    const vibrar = () => {
      if (Platform.OS === 'android') {
        try {
          Vibration.vibrate(PADRAO_VIBRACAO);
        } catch {
          /* aparelho sem vibração */
        }
      } else haptics.erro();
    };
    vibrar();
    const buzz = setInterval(vibrar, REPETIR_A_CADA_MS);
    return () => {
      clearInterval(buzz);
      try {
        Vibration.cancel();
      } catch {
        /* nada a cancelar */
      }
    };
  }, [alertId, urgent, ack]);

  // Leitor de tela: anuncia o alerta assim que ele aparece.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(`${helpKindLabel[alerta.kind]}. ${nome}. ${alerta.message}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  const timeout = settings?.emergency_timeout_s ?? 45;
  const remaining = Math.max(0, timeout - seconds);
  /**
   * O servidor é a fonte da verdade sobre o prazo: a função agendada grava
   * `escalated_at` quando `received_at + emergency_timeout_s` passa sem
   * confirmação, avisa na conversa e reenvia o push. Quando esse carimbo chega
   * (UPDATE via realtime), ele substitui o cronômetro local — que é só uma
   * estimativa a partir de `received_at`.
   */
  const escalado = alerta.escalated_at;
  /** O cronômetro local zerou e o servidor ainda não escalou (ele roda a cada minuto). */
  const prazoEsgotado = remaining === 0;
  const contacts = settings?.emergency_contacts ?? [];
  const gradient = urgent ? colors.gradientDanger : colors.gradientHero;

  /**
   * `acknowledgeAlert` e `resolveAlert` escrevem no banco e REJEITAM quando a
   * escrita falha. A falha aparece e o botão vira "Tentar de novo" — em vez de
   * fingir que o computador do paciente foi avisado.
   *
   * O que a confirmação faz de verdade: grava `acknowledged_at` no pedido. O
   * servidor deixa de escalar, os outros celulares da conta veem "você já viu"
   * e o computador do paciente — que assina `help_requests` — mostra e fala
   * "Seu cuidador viu o pedido às HH:MM" quando está com internet.
   */
  const executar = async (acao: 'ack' | 'resolve') => {
    if (busy) return;
    setBusy(acao);
    setFalha(null);
    try {
      if (acao === 'ack') await acknowledgeAlert(alerta.id);
      else await resolveAlert(alerta.id);
    } catch (e) {
      haptics.erro();
      setFalha(mensagemDeErro(e, 'Não foi possível falar com o servidor.'));
    } finally {
      setBusy(null);
    }
  };

  const sufixoContatos = contacts.length > 0 ? ' Se precisar, ligue para um contato abaixo.' : ' Não há contato de emergência cadastrado em Ajustes.';
  const textoPrazo = escalado
    ? `Reenviado às ${hm(escalado)} a todos os celulares desta conta: ninguém confirmou em ${timeout} s.${sufixoContatos}`
    : prazoEsgotado
      ? `Passaram-se ${timeout} s sem confirmação. O alerta será reenviado a todos os celulares em até um minuto.${sufixoContatos}`
      : `Prazo para alguém confirmar: ${remaining} s. Depois, o alerta é reenviado a todos os celulares.`;

  // Ligar é a única coisa que realmente aciona alguém, e é manual. Os contatos
  // aparecem assim que o prazo estoura (local ou pelo carimbo do servidor), ou
  // depois da confirmação.
  const mostrarContatos = contacts.length > 0 && (ack || (urgent && (prazoEsgotado || Boolean(escalado))));
  const icone: keyof typeof Ionicons.glyphMap = urgent ? 'hand-left' : alerta.kind === 'postura' ? 'body' : alerta.kind === 'fadiga' ? 'moon' : alerta.kind === 'dispositivo' ? 'desktop' : 'refresh';
  // O vermelho da emergência é o mesmo nos dois temas; os textos sobre ele
  // usam as cores do tema claro para o contraste não depender do tema.
  const corIcone = urgent ? lightColors.dangerStrong : lightColors.primaryStrong;

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.4, y: 1 }}
      style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
      accessibilityViewIsModal
    >
      <StatusBar style="light" />
      <Animated.View entering={entrada.cascata(0)} style={styles.top}>
        <View style={[styles.kicker, { backgroundColor: colors.onDarkFill }]}>
          {/* Pulsa enquanto ninguém respondeu; parado depois da confirmação. */}
          {ack ? <View style={[styles.kickerDot, { backgroundColor: colors.onDark }]} /> : <LiveDot color={colors.onDark} />}
          <Text variant="label" tone="onDark">
            {urgent ? 'Emergência' : 'Aviso da sessão'} · {hm(alerta.created_at)}
          </Text>
        </View>
        <Text variant="display" tone="onDark" accessibilityRole="header" style={styles.title}>
          {helpKindLabel[alerta.kind]}
        </Text>
        <Text variant="h3" tone="onDarkMuted" weight="medium">
          {urgent ? `${nome} precisa de você agora.` : patient?.user_name ?? 'Paciente'}
        </Text>
      </Animated.View>

      <View style={styles.center} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <PulseRings paused={ack} />
        <View style={[styles.iconCircle, { backgroundColor: colors.onDark }]}>
          <Ionicons name={icone} size={sizes.icon.hero} color={corIcone} />
        </View>
      </View>

      <Animated.View entering={entrada.cascata(2)} style={styles.bottom}>
        {alerta.message ? (
          <View style={[styles.msgBox, { backgroundColor: colors.onDarkFill }]}>
            <Text variant="body" tone="onDark" center>
              {alerta.message}
            </Text>
          </View>
        ) : null}

        {/* Pedido que esperou na fila offline do computador: o horário do
            topo é o do pedido; aqui, quando chegou. Sem isto, um socorro de
            horas atrás pareceria acontecer agora — ou o inverso. */}
        {chegouAtrasado ? (
          <View style={styles.prazoRow}>
            <Ionicons name="cloud-offline-outline" size={sizes.icon.sm} color={colors.onDarkMuted} style={styles.prazoIcon} />
            <Text variant="bodySmall" tone="onDarkMuted" style={styles.flex} testID="atraso">
              Pedido feito às {hm(alerta.created_at)} no computador do paciente; chegou às {hm(recebidoEm)}.
            </Text>
          </View>
        ) : null}

        {/* Três estados, em ordem de verdade: (1) o servidor já reenviou —
            mostra o horário dele; (2) o cronômetro local zerou mas o carimbo
            ainda não chegou — o servidor roda a cada minuto; (3) contagem
            regressiva. Em nenhum deles alguém é telefonado sozinho. */}
        {urgent && !ack ? (
          <View style={styles.prazoRow}>
            <Ionicons name={escalado ? 'send' : 'time-outline'} size={sizes.icon.sm} color={colors.onDarkMuted} style={styles.prazoIcon} />
            {/* Sem região "ao vivo": a contagem muda a cada segundo e o leitor
                de tela repetiria o texto sem parar. O alerta já é anunciado ao abrir. */}
            <Text variant="bodySmall" tone="onDarkMuted" style={styles.flex} testID="prazo">
              {textoPrazo}
            </Text>
          </View>
        ) : null}

        {falha ? (
          <View style={[styles.falha, { backgroundColor: colors.scrim }]} accessibilityLiveRegion="assertive">
            <Ionicons name="cloud-offline-outline" size={sizes.icon.md} color={colors.onDark} />
            <Text variant="bodySmall" tone="onDark" style={styles.flex}>
              Não deu para registrar: {falha} A confirmação NÃO foi gravada — o alerta segue sem resposta e o paciente não foi avisado.
            </Text>
          </View>
        ) : null}

        {mostrarContatos ? (
          <View style={styles.contacts}>
            {contacts.slice(0, 2).map((c, i) => (
              <PressableScale
                key={`${c.phone}-${i}`}
                onPress={() => void Linking.openURL(`tel:${c.phone}`).catch(() => undefined)}
                haptic="medium"
                accessibilityRole="button"
                accessibilityLabel={`Ligar para ${c.name}`}
                style={[styles.contact, { backgroundColor: colors.onDarkFill, borderColor: colors.onDarkBorder }]}
              >
                <Ionicons name="call" size={sizes.icon.sm} color={colors.onDark} />
                <Text variant="bodySmall" tone="onDark" weight="semibold" style={styles.flexShrink}>
                  {c.name}
                </Text>
              </PressableScale>
            ))}
          </View>
        ) : null}

        {!ack ? (
          <Button
            title={falha ? 'Tentar de novo' : urgent ? 'Estou indo!' : 'Entendi'}
            variant={urgent ? 'lightDanger' : 'light'}
            size="xl"
            icon={falha ? 'refresh' : 'checkmark-circle'}
            loading={busy === 'ack'}
            accessibilityHint={urgent ? `Avisa ${nome} e os outros celulares que você está indo` : undefined}
            onPress={() => void executar('ack')}
          />
        ) : (
          <>
            {/* O que a confirmação fez, sem prometer o que não existe: o pedido
                está marcado como visto no servidor; o computador do paciente
                mostra e fala o aviso se estiver com internet. */}
            <View style={styles.prazoRow}>
              <Ionicons name="checkmark-circle" size={sizes.icon.sm} color={colors.onDark} style={styles.prazoIcon} />
              <Text variant="bodySmall" tone="onDarkMuted" style={styles.flex} testID="confirmado">
                Confirmado às {hm(alerta.acknowledged_at ?? new Date().toISOString())}. A tela do paciente avisa que você viu quando está com internet.
              </Text>
            </View>
            <Button title={falha ? 'Tentar de novo' : 'Resolvido'} variant="light" size="lg" icon={falha ? 'refresh' : 'checkmark-done'} loading={busy === 'resolve'} onPress={() => void executar('resolve')} />
            <Button title="Ver depois" variant="glass" onPress={dismissPendingAlert} />
          </>
        )}
      </Animated.View>
    </LinearGradient>
  );
}

/** Anéis que pulsam a partir do ícone. Com "reduzir movimento": um anel parado. */
function PulseRings({ paused }: { paused: boolean }) {
  const { reduceMotion } = useTheme();
  if (reduceMotion) return <Ring delay={0} paused estatico />;
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Ring key={i} delay={i * (motion.duration.pulse / 3)} paused={paused} />
      ))}
    </>
  );
}

function Ring({ delay, paused, estatico }: { delay: number; paused: boolean; estatico?: boolean }) {
  const { colors } = useTheme();
  const p = useSharedValue(estatico ? 0.35 : 0);
  useEffect(() => {
    if (estatico) return;
    p.value = 0;
    p.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: paused ? motion.duration.pulse * 1.8 : motion.duration.pulse, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), -1, false));
    return () => cancelAnimation(p);
  }, [delay, paused, p, estatico]);
  const s = useAnimatedStyle(() => ({ opacity: (1 - p.value) * (paused ? 0.25 : 0.55), transform: [{ scale: 1 + p.value * 1.9 }] }));
  return <Animated.View style={[styles.ring, { borderColor: colors.onDark }, s]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  root: { flex: 1, paddingHorizontal: layout.gutter + spacing.xs, justifyContent: 'space-between', zIndex: zIndex.overlay },
  top: { alignItems: 'flex-start' },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  kickerDot: { width: sizes.dot, height: sizes.dot, borderRadius: radius.pill },
  title: { marginTop: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center', flexGrow: 1, minHeight: sizes.emergencyIcon * 1.6 },
  iconCircle: { width: sizes.emergencyIcon, height: sizes.emergencyIcon, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: sizes.emergencyIcon, height: sizes.emergencyIcon, borderRadius: radius.pill, borderWidth: sizes.borderThick + 1 },
  bottom: { gap: spacing.md, width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
  msgBox: { borderRadius: radius.lg, padding: spacing.lg },
  prazoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  prazoIcon: { marginTop: spacing.xxs },
  falha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  contacts: { flexDirection: 'row', gap: spacing.sm },
  contact: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: sizes.button.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: sizes.border },
});
