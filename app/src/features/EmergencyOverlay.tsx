import React, { useEffect, useState } from 'react';
import { Linking, Modal, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Button, PressableScale, Text } from '@/components';
import { useApp } from '@/store/AppProvider';
import { brand, radius, spacing, useTheme } from '@/theme';
import { helpKindLabel, hm } from '@/utils/format';

/**
 * Alerta de tela cheia: aparece sobre qualquer tela quando o paciente aciona socorro ou ajuda,
 * ou quando o sistema emite aviso (postura, fadiga, recalibração). Emergências pulsam em vermelho;
 * avisos usam o azul institucional.
 */
export function EmergencyOverlay() {
  const { pendingAlert, acknowledgeAlert, resolveAlert, dismissPendingAlert, patient, settings } = useApp();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState<'ack' | 'resolve' | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  const urgent = pendingAlert?.kind === 'emergencia' || pendingAlert?.kind === 'ajuda';

  // Chaveado por id/estado, não pelo objeto: o UPDATE do servidor (escalonamento,
  // reconhecimento em outro celular) troca o objeto sem que o alerta seja outro,
  // e não pode zerar o cronômetro. Ele conta a partir de `created_at` — o mesmo
  // instante que o servidor usa — e não de quando a tela abriu aqui.
  const alertId = pendingAlert?.id ?? null;
  const createdAt = pendingAlert?.created_at ?? null;
  const acknowledged = Boolean(pendingAlert?.acknowledged_at);
  useEffect(() => {
    if (!alertId || !createdAt) return;
    const tick = () => setSeconds(Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 1000)));
    tick();
    setFalha(null);
    const t = setInterval(tick, 1000);
    let buzz: ReturnType<typeof setInterval> | undefined;
    if (urgent && !acknowledged) {
      buzz = setInterval(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined), 2500);
    }
    return () => {
      clearInterval(t);
      if (buzz) clearInterval(buzz);
    };
  }, [alertId, createdAt, acknowledged, urgent]);

  if (!pendingAlert) return null;

  const ack = Boolean(pendingAlert.acknowledged_at);
  const timeout = settings?.emergency_timeout_s ?? 45;
  const remaining = Math.max(0, timeout - seconds);
  /**
   * O servidor é a fonte da verdade sobre o prazo: a função agendada grava
   * `escalated_at` quando `created_at + emergency_timeout_s` passa sem
   * confirmação, avisa na conversa e reenvia o push. Quando esse carimbo chega
   * (UPDATE via realtime), ele substitui o cronômetro local — que é só uma
   * estimativa a partir do momento em que o alerta apareceu neste celular.
   */
  const escalado = pendingAlert.escalated_at;
  /** O cronômetro local zerou e o servidor ainda não escalou (ele roda a cada minuto). */
  const prazoEsgotado = remaining === 0;
  const gradient = urgent ? colors.gradientDanger : ([brand.navy, brand.blue] as const);
  const contacts = settings?.emergency_contacts ?? [];

  /**
   * `acknowledgeAlert` e `resolveAlert` escrevem no banco e REJEITAM quando a
   * escrita falha. Antes ninguém tratava a rejeição: o cuidador tocava
   * "Estou indo!" sem rede, o botão não mudava, o overlay seguia pulsando e o
   * computador do paciente nunca recebia a confirmação — sem nada na tela
   * dizendo isso. Agora a falha aparece e o botão vira "Tentar de novo".
   */
  const executar = async (acao: 'ack' | 'resolve') => {
    if (busy) return;
    setBusy(acao);
    setFalha(null);
    try {
      if (acao === 'ack') await acknowledgeAlert(pendingAlert.id);
      else await resolveAlert(pendingAlert.id);
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Falha ao falar com o servidor.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <LinearGradient colors={[gradient[0], gradient[1]]} style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.top}>
          <Text variant="label" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {urgent ? 'Emergência' : 'Aviso da sessão'} · {hm(pendingAlert.created_at)}
          </Text>
          <Text variant="display" tone="onPrimary" style={{ marginTop: spacing.sm, fontSize: 26, lineHeight: 36 }}>
            {helpKindLabel[pendingAlert.kind]}
          </Text>
          <Text variant="h3" style={{ color: '#FFFFFF', marginTop: spacing.xs, fontFamily: 'Inter_500Medium' }}>
            {patient?.user_name ?? 'Paciente'}
          </Text>
        </Animated.View>

        <View style={styles.center}>
          <PulseRings urgent={urgent} paused={ack} />
          <View style={[styles.iconCircle, { backgroundColor: '#FFFFFF' }]}>
            <Ionicons name={urgent ? 'hand-left' : pendingAlert.kind === 'postura' ? 'body' : pendingAlert.kind === 'fadiga' ? 'moon' : 'refresh'} size={46} color={urgent ? colors.danger : colors.primary} />
          </View>
        </View>

        <Animated.View entering={FadeInUp.delay(150).duration(500)} style={styles.bottom}>
          <View style={styles.msgBox}>
            <Text variant="body" tone="onPrimary" center>
              {pendingAlert.message}
            </Text>
          </View>

          {/* Três estados, em ordem de verdade: (1) o servidor já escalou —
              mostra o horário dele e o que ele fez (reenviou o push, avisou na
              conversa); (2) o cronômetro local zerou mas o carimbo ainda não
              chegou — o servidor roda a cada minuto; (3) contagem regressiva.
              Em nenhum deles alguém é telefonado sozinho: ligar é o botão abaixo. */}
          {urgent && !ack && (
            <Text variant="bodySmall" center style={{ color: 'rgba(255,255,255,0.85)' }} testID="prazo">
              {escalado
                ? `Escalado às ${hm(escalado)}: ninguém confirmou em ${timeout} s, então o servidor reenviou o alerta para todos os celulares desta conta e avisou na conversa. Confirme abaixo se você vai atender${contacts.length > 0 ? ', ou ligue agora para um dos contatos' : ' — não há contato de emergência cadastrado em Ajustes'}.`
                : prazoEsgotado
                  ? `Passaram-se ${timeout} s sem confirmação. O servidor vai reenviar o alerta em até um minuto; confirme abaixo se você vai atender${contacts.length > 0 ? ', ou ligue agora para um dos contatos' : ' — não há contato de emergência cadastrado em Ajustes'}.`
                  : `Prazo para alguém confirmar: ${remaining} s. Depois disso o servidor reenvia o alerta a todos os celulares.`}
            </Text>
          )}

          {falha && (
            <View style={styles.falha}>
              <Ionicons name="cloud-offline" size={18} color="#FFFFFF" />
              <Text variant="bodySmall" style={{ color: '#FFFFFF', flex: 1 }}>
                Não deu para registrar: {falha} O computador do paciente NÃO recebeu a
                confirmação.
              </Text>
            </View>
          )}

          {/* Ligar é a única coisa que realmente aciona alguém, e é manual. Por
              isso os contatos aparecem também antes do reconhecimento, assim
              que o prazo estoura (localmente ou pelo carimbo do servidor). */}
          {contacts.length > 0 && (ack || (urgent && (prazoEsgotado || Boolean(escalado)))) && (
            <View style={styles.contacts}>
              {contacts.slice(0, 2).map((c) => (
                <PressableScale key={c.phone} onPress={() => void Linking.openURL(`tel:${c.phone}`).catch(() => undefined)} style={styles.contact}>
                  <Ionicons name="call" size={18} color="#FFFFFF" />
                  <Text variant="bodySmall" tone="onPrimary" weight="semibold">
                    {c.name}
                  </Text>
                </PressableScale>
              ))}
            </View>
          )}

          {!ack ? (
            <Button
              title={falha ? 'Tentar de novo' : urgent ? 'Estou indo!' : 'Entendi'}
              variant={urgent ? 'ghost' : 'accent'}
              size="lg"
              icon={falha ? 'refresh' : 'checkmark-circle'}
              loading={busy === 'ack'}
              onPress={() => void executar('ack')}
              style={urgent ? { backgroundColor: '#FFFFFF', borderRadius: radius.md } : undefined}
            />
          ) : (
            <>
              <Button title={falha ? 'Tentar de novo' : 'Resolvido'} variant="accent" size="lg" icon={falha ? 'refresh' : 'checkmark-done'} loading={busy === 'resolve'} onPress={() => void executar('resolve')} />
              <PressableScale onPress={dismissPendingAlert} style={{ alignSelf: 'center', padding: spacing.sm }}>
                <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.85)' }} weight="semibold">
                  Ver depois
                </Text>
              </PressableScale>
            </>
          )}
        </Animated.View>
      </LinearGradient>
    </Modal>
  );
}

function PulseRings({ urgent, paused }: { urgent: boolean; paused: boolean }) {
  const rings = [0, 1, 2];
  return (
    <>
      {rings.map((i) => (
        <Ring key={i} delay={i * 600} paused={paused} color={urgent ? '#FFFFFF' : brand.tealSoft} />
      ))}
    </>
  );
}

function Ring({ delay, paused, color }: { delay: number; paused: boolean; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: paused ? 3200 : 1800, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), -1, false));
  }, [delay, paused, p]);
  const s = useAnimatedStyle(() => ({ opacity: (1 - p.value) * (paused ? 0.25 : 0.5), transform: [{ scale: 1 + p.value * 1.9 }] }));
  return <Animated.View style={[styles.ring, { borderColor: color }, s]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.xxl, justifyContent: 'space-between' },
  top: {},
  center: { alignItems: 'center', justifyContent: 'center', height: 260 },
  iconCircle: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 3 },
  bottom: { gap: spacing.md },
  msgBox: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.md, padding: spacing.lg },
  falha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: radius.md, padding: spacing.md },
  contacts: { flexDirection: 'row', gap: spacing.sm },
  contact: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: 'rgba(255,255,255,0.16)', paddingVertical: spacing.md, borderRadius: radius.md },
});
