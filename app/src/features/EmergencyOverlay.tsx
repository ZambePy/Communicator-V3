import React, { useEffect, useLayoutEffect, useState } from 'react';
import { AccessibilityInfo, Linking, Modal, Platform, ScrollView, StyleSheet, Vibration, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import Animated from 'react-native-reanimated';
import { Button, LiveDot, PressableScale, Text, useDefinirEspacoDoTopo } from '@/components';
import { HelpRequest } from '@/data/types';
import { useTravaDosBotoes } from '@/hooks/useTravaDosBotoes';
import { haptics } from '@/lib/haptics';
import { useApp } from '@/store/AppProvider';
import { brand, layout, lightColors, radius, sizes, spacing, useEntrada, useTheme, zIndex } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { firstName, helpKindLabel, hm, textoLegivel } from '@/utils/format';

/** Vibração longa e insistente do Android enquanto ninguém confirma (padrão do canal "emergencia"). */
const PADRAO_VIBRACAO = [0, 400, 200, 400, 200, 400];
const REPETIR_A_CADA_MS = 2500;
/** Altura mínima da faixa do alerta minimizado (cresce com a fonte do sistema). */
const ALTURA_DA_FAIXA = sizes.touch + spacing.md;
/**
 * A partir deste atraso entre o pedido (no computador) e a chegada ao
 * servidor, o overlay diz as duas horas. Mesmo limiar da notificação
 * (supabase/functions/desktop-sync/horario.ts).
 */
const ATRASO_RELEVANTE_MS = 2 * 60_000;

/**
 * Redesenho de 19/10/2026 — legível para quem acorda com o alarme:
 *  • o MOTIVO do pedido é a manchete ("Falta de ar"), não o rótulo genérico;
 *  • vermelho chapado e mais fundo (#9E1B16: branco a 8:1, menos ofuscante no
 *    escuro que o degradê de antes); aviso da sessão no marinho do app;
 *  • no lugar dos anéis pulsando (enfeite), uma barra de prazo que diminui a
 *    cada segundo — a única coisa que se mexe, e ela diz alguma coisa.
 */
const FUNDO_DO_SOCORRO = '#9E1B16';

/** Até quantas letras o motivo vira manchete; acima, vai para o texto. */
const MANCHETE_GRANDE = 24;
const MANCHETE_MAX = 40;

/**
 * A manchete do alerta. Socorro e ajuda: o motivo enviado pelo computador
 * ("FALTA DE AR" → "Falta de ar"), quando é curto o bastante para ser lido de
 * longe; senão, o tipo do pedido. Avisos da sessão: sempre o tipo ("Aviso de
 * postura"), com o detalhe no texto.
 */
export function mancheteDoAlerta(alerta: Pick<HelpRequest, 'kind' | 'message'>): { titulo: string; motivoNaManchete: boolean } {
  const urgente = alerta.kind === 'emergencia' || alerta.kind === 'ajuda';
  const motivo = alerta.message?.trim() ? textoLegivel(alerta.message) : null;
  if (urgente && motivo && motivo.length <= MANCHETE_MAX) return { titulo: motivo, motivoNaManchete: true };
  return { titulo: helpKindLabel[alerta.kind], motivoNaManchete: false };
}

/**
 * Alerta de tela cheia: aparece sobre qualquer tela quando o paciente aciona
 * socorro ou ajuda (vermelho), ou quando a sessão emite aviso — postura,
 * fadiga, recalibração (azul). Resolve-se com UM toque ("Estou indo!").
 *
 * Nunca fica escondido: no Android e no web é um `Modal` (janela própria, acima
 * de tudo); no iOS, um `FullWindowOverlay` — uma janela do sistema acima até das
 * telas apresentadas como modal, onde um `Modal` comum não conseguiria abrir.
 *
 * E nunca prende o cuidador: o texto rola e a ação principal fica num rodapé
 * fixo, sempre à vista — em celular pequeno, com a fonte do sistema grande, e
 * justamente quando os contatos aparecem (antes o botão saía da tela, nada
 * rolava e o Voltar do Android era ignorado). Voltar, ou "Minimizar", tira o
 * alerta da tela cheia SEM confirmar nada: fica um aviso vermelho no topo, que
 * reabre o alerta; se o servidor reenviar o pedido (escalonamento), ele volta
 * sozinho para a tela cheia.
 *
 * O som (alarme local) não mora aqui: desde a revisão de UX de 19/10/2026 ele
 * vale para todo pedido urgente sem confirmação — inclusive o que não está na
 * tela, ou com o alerta minimizado — e quem cuida dele é o AppProvider.
 */
export function EmergencyOverlay() {
  const { pendingAlert, dismissPendingAlert, pendingAlertMinimized, minimizePendingAlert } = useApp();
  if (!pendingAlert) return null;

  const urgent = pendingAlert.kind === 'emergencia' || pendingAlert.kind === 'ajuda';
  if (pendingAlertMinimized) return <AlertaMinimizado alerta={pendingAlert} urgent={urgent} />;
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
      // Voltar do Android: depois de confirmado, equivale a "Ver depois"; antes,
      // minimiza — o pedido continua sem resposta e o aviso fica no topo.
      onRequestClose={() => (acaoDoVoltar(pendingAlert) === 'ver-depois' ? dismissPendingAlert() : minimizePendingAlert())}
    >
      {conteudo}
    </Modal>
  );
}

/**
 * O que o Voltar do Android faz no alerta: depois da confirmação, "Ver depois";
 * antes, minimizar — nunca ignorar o toque (o cuidador ficava preso) e nunca
 * confirmar por ele.
 */
export function acaoDoVoltar(alerta: HelpRequest): 'ver-depois' | 'minimizar' {
  return alerta.acknowledged_at ? 'ver-depois' : 'minimizar';
}

/**
 * O alerta minimizado: uma faixa no topo, acima das telas do app, que não some
 * enquanto o pedido estiver sem resposta. Tocar reabre a tela cheia.
 *
 * Revisão de UX de 19/10/2026 (achado 20): ela ficava exatamente sobre os
 * botões Voltar/Fechar das telas (o mesmo topo de `Screen`). Agora informa a
 * altura que ocupa e as telas descem o conteúdo por baixo dela (EspacoDoTopo).
 */
function AlertaMinimizado({ alerta, urgent }: { alerta: HelpRequest; urgent: boolean }) {
  const { restorePendingAlert, patient } = useApp();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const definirEspaco = useDefinirEspacoDoTopo();
  // Reserva a altura mínima antes do primeiro quadro (a medida exata chega no
  // onLayout) e devolve o espaço quando a faixa sai.
  useLayoutEffect(() => {
    definirEspaco(ALTURA_DA_FAIXA);
    return () => definirEspaco(0);
  }, [definirEspaco]);
  const nome = patient ? firstName(patient.user_name) : 'O paciente';
  // Confirmado em outro celular enquanto estava minimizado: a faixa não pode
  // continuar dizendo "sem resposta".
  const confirmado = Boolean(alerta.acknowledged_at);
  const titulo = confirmado ? `${helpKindLabel[alerta.kind]}, confirmado` : `${helpKindLabel[alerta.kind]} sem resposta`;
  const detalhe = confirmado ? 'Toque para ver ou marcar como resolvido.' : urgent ? `${nome} ainda espera. Toque para responder.` : 'Toque para ver o aviso.';
  return (
    <View
      pointerEvents="box-none"
      testID="faixa-do-alerta"
      onLayout={(e) => definirEspaco(e.nativeEvent.layout.height)}
      style={[styles.minimizadoWrap, { top: insets.top + spacing.sm }]}
    >
      <PressableScale
        onPress={restorePendingAlert}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel={`${titulo}. ${detalhe}`}
        testID="alerta-minimizado"
        style={[styles.minimizado, { backgroundColor: urgent ? lightColors.dangerStrong : lightColors.primaryStrong }]}
      >
        {confirmado ? <View style={[styles.kickerDot, { backgroundColor: colors.onDark }]} /> : <LiveDot color={colors.onDark} />}
        <View style={styles.flex}>
          <Text variant="bodySmall" tone="onDark" weight="semibold">
            {titulo}
          </Text>
          <Text variant="caption" tone="onDark">
            {detalhe}
          </Text>
        </View>
        <Ionicons name="expand" size={sizes.icon.md} color={colors.onDark} />
      </PressableScale>
    </View>
  );
}

function Conteudo({ alerta, urgent }: { alerta: HelpRequest; urgent: boolean }) {
  const { acknowledgeAlert, resolveAlert, dismissPendingAlert, minimizePendingAlert, patient, settings } = useApp();
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
  // Um toque duplo não pode cair no botão que acabou de nascer no mesmo lugar
  // do rodapé: "Resolvido" depois da confirmação, ou o "Estou indo!" de OUTRO
  // pedido que assumiu a tela (um socorro mais grave, ou o seguinte sem
  // resposta — revisão de UX de 19/10/2026). Ver `useTravaDosBotoes`.
  const trava = useTravaDosBotoes(alertId, ack);
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
  const fundo = urgent ? FUNDO_DO_SOCORRO : brand.navy;
  const { titulo, motivoNaManchete } = mancheteDoAlerta(alerta);
  const linhaDoTopo = `${motivoNaManchete ? helpKindLabel[alerta.kind] : urgent ? 'Emergência' : 'Aviso da sessão'} às ${hm(alerta.created_at)}`;
  /** Quanto do prazo ainda resta (1 → 0); zero depois de escalado. */
  const fracaoDoPrazo = escalado ? 0 : Math.max(0, Math.min(1, remaining / Math.max(1, timeout)));

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
    if (busy || (acao === 'resolve' ? trava.resolver : trava.confirmar)) return;
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

  return (
    <View style={[styles.root, { backgroundColor: fundo, paddingTop: insets.top + spacing.lg }]} accessibilityViewIsModal>
      <StatusBar style="light" />
      <ScrollView style={styles.flex} contentContainerStyle={styles.rolagem} testID="rolagem-do-alerta" showsVerticalScrollIndicator>
        <Animated.View entering={entrada.cascata(0)} style={styles.top}>
          <View style={styles.kicker}>
            {/* Pulsa enquanto ninguém respondeu; parado depois da confirmação. */}
            {ack ? <View style={[styles.kickerDot, { backgroundColor: colors.onDark }]} /> : <LiveDot color={colors.onDark} />}
            <Text variant="label" tone="onDarkMuted">
              {linhaDoTopo}
            </Text>
          </View>
          <Text variant={titulo.length <= MANCHETE_GRANDE ? 'alarme' : 'display'} tone="onDark" accessibilityRole="header" style={styles.title}>
            {titulo}
          </Text>
          <Text variant="h3" tone="onDarkMuted" weight="medium">
            {urgent ? `${nome} precisa de você agora.` : patient?.user_name ?? 'Paciente'}
          </Text>
        </Animated.View>

        <Animated.View entering={entrada.cascata(1)} style={styles.bottom}>
          {alerta.message && !motivoNaManchete ? (
            <Text variant="body" tone="onDark" style={[styles.mensagem, { borderLeftColor: colors.onDarkBorder }]}>
              {alerta.message}
            </Text>
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
            <View style={styles.prazo}>
              <View style={[styles.trilho, { backgroundColor: colors.onDarkFill }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID="barra-do-prazo">
                <View testID="restante-do-prazo" style={[styles.restante, { backgroundColor: colors.onDark, width: `${Math.round(fracaoDoPrazo * 100)}%` }]} />
              </View>
              {/* Sem região "ao vivo": a contagem muda a cada segundo e o leitor
                  de tela repetiria o texto sem parar. O alerta já é anunciado ao abrir. */}
              <Text variant="bodySmall" tone="onDarkMuted" testID="prazo">
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
              {/* Todos os contatos, não só os dois primeiros: o terceiro pode ser
                  justamente quem está perto agora. */}
              {contacts.map((c, i) => (
                <PressableScale
                  key={`${c.phone}-${i}`}
                  onPress={() => void Linking.openURL(`tel:${c.phone}`).catch(() => undefined)}
                  haptic="medium"
                  accessibilityRole="button"
                  accessibilityLabel={`Ligar para ${c.name}`}
                  style={[styles.contact, { borderColor: colors.onDarkBorder }]}
                >
                  <Ionicons name="call" size={sizes.icon.sm} color={colors.onDark} />
                  <Text variant="body" tone="onDark" weight="semibold" style={styles.flexShrink}>
                    {c.name}
                  </Text>
                </PressableScale>
              ))}
            </View>
          ) : null}

          {ack ? (
            // O que a confirmação fez, sem prometer o que não existe: o pedido
            // está marcado como visto no servidor; o computador do paciente
            // mostra e fala o aviso se estiver com internet.
            <View style={styles.prazoRow}>
              <Ionicons name="checkmark-circle" size={sizes.icon.sm} color={colors.onDark} style={styles.prazoIcon} />
              <Text variant="bodySmall" tone="onDarkMuted" style={styles.flex} testID="confirmado">
                Confirmado às {hm(alerta.acknowledged_at ?? new Date().toISOString())}. A tela do paciente avisa que você viu quando está com internet.
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      {/* Rodapé fixo, fora da rolagem: a resposta ao pedido nunca sai da tela. */}
      <View style={[styles.rodape, { paddingBottom: insets.bottom + spacing.lg }]} testID="acoes-do-alerta">
        {!ack ? (
          <>
            <Button
              title={falha ? 'Tentar de novo' : urgent ? 'Estou indo!' : 'Entendi'}
              variant={urgent ? 'lightDanger' : 'light'}
              size="xl"
              icon={falha ? 'refresh' : 'checkmark-circle'}
              loading={busy === 'ack'}
              disabled={trava.confirmar}
              accessibilityHint={urgent ? `Avisa ${nome} e os outros celulares que você está indo` : undefined}
              onPress={() => void executar('ack')}
            />
            <Button
              title="Minimizar"
              variant="glass"
              icon="contract"
              accessibilityHint="Não confirma nada: o alerta continua sem resposta e fica um aviso no topo da tela"
              onPress={minimizePendingAlert}
            />
          </>
        ) : (
          <>
            <Button
              title={falha ? 'Tentar de novo' : 'Resolvido'}
              variant="light"
              size="lg"
              icon={falha ? 'refresh' : 'checkmark-done'}
              loading={busy === 'resolve'}
              disabled={trava.resolver}
              onPress={() => void executar('resolve')}
            />
            <Button title="Ver depois" variant="glass" onPress={dismissPendingAlert} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  root: { flex: 1, paddingHorizontal: layout.gutter + spacing.xs, zIndex: zIndex.overlay },
  // O texto fica no meio da área livre (quem acorda olha para o centro); com
  // muito conteúdo, a rolagem começa do topo normalmente.
  rolagem: { flexGrow: 1, justifyContent: 'center', gap: spacing.md, paddingBottom: spacing.xxl, width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
  rodape: { gap: spacing.sm, paddingTop: spacing.md, width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
  minimizadoWrap: { position: 'absolute', left: layout.gutter, right: layout.gutter, zIndex: zIndex.overlay },
  minimizado: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: ALTURA_DA_FAIXA, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.lg },
  top: { alignItems: 'flex-start' },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.icon.lg },
  kickerDot: { width: sizes.dot, height: sizes.dot, borderRadius: radius.pill },
  title: { marginTop: spacing.md, marginBottom: spacing.sm },
  bottom: { gap: spacing.lg, marginTop: spacing.xxl, width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' },
  mensagem: { borderLeftWidth: sizes.borderThick, paddingLeft: spacing.md },
  prazo: { gap: spacing.sm },
  trilho: { height: spacing.sm, borderRadius: radius.pill, overflow: 'hidden' },
  restante: { height: '100%', borderRadius: radius.pill },
  prazoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  prazoIcon: { marginTop: spacing.xxs },
  falha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  contacts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  contact: { flexGrow: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: sizes.button.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: sizes.borderThick },
});
