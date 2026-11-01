import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AlertListSkeleton, Button, EmptyState, Notice, PressableScale, Screen, ScreenHeader, Text } from '@/components';
import { HelpKind, HelpRequest } from '@/data/types';
import { abrirAjustesDoCanal, useCanalDeEmergencia } from '@/hooks/usePushNotifications';
import { useTravaDosBotoes } from '@/hooks/useTravaDosBotoes';
import { useApp } from '@/store/AppProvider';
import { lightColors, motion, radius, sizes, spacing, useEntrada, useReduceMotion, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { quando, situacaoDoPedido } from '@/utils/alertas';
import { firstName, helpKindLabel, textoLegivel, timeAgo } from '@/utils/format';

const ehUrgente = (h: HelpRequest) => h.kind === 'emergencia' || h.kind === 'ajuda';

const ICONE: Record<HelpKind, keyof typeof Ionicons.glyphMap> = {
  emergencia: 'alert-circle-outline',
  ajuda: 'hand-left-outline',
  postura: 'body-outline',
  fadiga: 'moon-outline',
  recalibracao: 'locate-outline',
  dispositivo: 'desktop-outline',
};

/** Relógio que anda de segundo em segundo só enquanto há contagem na tela. */
function useAgora(ligado: boolean): number {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!ligado) return;
    const t = setInterval(() => setAgora(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [ligado]);
  return agora;
}

/**
 * Alertas (redesenho de 31/10/2026, mock 08): os pedidos abertos em cima, em
 * cartão; o que já passou embaixo, em "Antes", uma linha cada. Sem os avisos
 * fixos de antes (o prazo de 45 s, "os alertas chegam com o app aberto"): só
 * aparece aviso quando ele vale agora e o cuidador pode fazer algo.
 */
export default function Alertas() {
  const { helpRequests, acknowledgeAlert, resolveAlert, settings, patient, patientLoaded, patientVerified, pushError, refresh } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  // Android: o canal do socorro fura o "Não perturbe"? Só o cuidador liga isso.
  const { furaNaoPerturbe } = useCanalDeEmergencia();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const abertos = helpRequests.filter((h) => !h.resolved_at);
  const antes = helpRequests.filter((h) => h.resolved_at).slice(0, 30);
  const nome = patient ? firstName(patient.user_name) : 'a pessoa';
  const prazo = settings?.emergency_timeout_s ?? 45;
  const contando = abertos.some((h) => ehUrgente(h) && !h.acknowledged_at && !h.escalated_at);
  const agora = useAgora(contando);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <ScreenHeader title="Alertas" />

      {/* Só o que a pessoa pode resolver agora, em uma linha e uma ação. */}
      {pushError === 'permissao' ? (
        <Notice
          tone="warning"
          icon="notifications-off-outline"
          title="Notificações desligadas"
          text="Sem elas, o pedido de ajuda só toca com o app aberto."
          action={{ label: 'Ativar nos ajustes do celular', onPress: () => void Linking.openSettings().catch(() => undefined) }}
          style={styles.notice}
        />
      ) : furaNaoPerturbe === false && abertos.some(ehUrgente) ? (
        // O app pede ao Android que o socorro toque no "Não perturbe", mas o
        // sistema só atende se o cuidador ligar isso no canal (APP-5).
        <Notice
          tone="warning"
          icon="moon-outline"
          text="No Não perturbe, o socorro fica sem som."
          action={{ label: 'Deixar tocar sempre', onPress: () => void abrirAjustesDoCanal() }}
          style={styles.notice}
          testID="aviso-nao-perturbe"
        />
      ) : null}

      {/* Há alertas na tela, mas a última atualização falhou: podem faltar os mais novos. */}
      {patientLoaded && !patientVerified && helpRequests.length > 0 ? (
        <Notice tone="warning" icon="cloud-offline-outline" text="Sem atualização agora. Podem faltar alertas novos." style={styles.notice} testID="alertas-desatualizados" />
      ) : null}

      <View style={styles.lista}>
        {!patientLoaded && helpRequests.length === 0 ? (
          <AlertListSkeleton />
        ) : abertos.length === 0 && !patientVerified ? (
          // A carga falhou (ou nem a conta carregou): "tudo tranquilo" seria uma
          // afirmação sem base — e fechar o aviso de erro não muda isso.
          <EmptyState icon="cloud-offline-outline" title="Não deu para verificar os alertas" body="Confira a internet e tente de novo." action={{ label: 'Tentar de novo', icon: 'refresh', onPress: () => void onRefresh() }} />
        ) : abertos.length === 0 ? (
          <EmptyState icon="shield-checkmark-outline" tone="accent" title="Tudo tranquilo por aqui" body={`Avisamos na hora se ${nome} precisar de você.`} />
        ) : (
          abertos.map((h, i) => <CartaoDoAlerta key={h.id} h={h} index={i} nome={nome} situacao={ehUrgente(h) ? situacaoDoPedido(h, prazo, agora) : null} onAck={() => acknowledgeAlert(h.id)} onResolve={() => resolveAlert(h.id)} />)
        )}
      </View>

      {antes.length > 0 ? (
        <View>
          <Text variant="bodySmall" weight="semibold" tone="muted" accessibilityRole="header" style={styles.secao}>
            Antes
          </Text>
          {antes.map((h, i) => (
            <LinhaDoHistorico key={h.id} h={h} primeira={i === 0} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

/** Título do pedido: "Carlos pediu ajuda: dor muito forte." */
function tituloDoPedido(h: HelpRequest, nome: string): string {
  const motivo = h.message?.trim() ? textoLegivel(h.message) : '';
  if (ehUrgente(h)) {
    const verbo = h.kind === 'emergencia' ? 'pediu socorro' : 'pediu ajuda';
    if (!motivo) return `${nome} ${verbo}.`;
    const minusculo = motivo.charAt(0).toLocaleLowerCase('pt-BR') + motivo.slice(1);
    return `${nome} ${verbo}: ${minusculo.replace(/[.!]+$/, '')}.`;
  }
  return motivo || helpKindLabel[h.kind];
}

/** O contorno que "toca": pulsa enquanto ninguém respondeu. Parado com "reduzir movimento". */
function AnelQueToca({ cor, ativo }: { cor: string; ativo: boolean }) {
  const reduzir = useReduceMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduzir || !ativo) {
      cancelAnimation(p);
      p.value = 0;
      return;
    }
    p.value = withRepeat(withTiming(1, { duration: motion.duration.pulse, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [ativo, reduzir, p]);
  const estilo = useAnimatedStyle(() => ({ opacity: 0.8 * (1 - p.value), transform: [{ scaleX: 1 + p.value * 0.03 }, { scaleY: 1 + p.value * 0.06 }] }));
  if (!ativo || reduzir) return null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.anel, { borderColor: cor }, estilo]} />;
}

function CartaoDoAlerta({ h, index, nome, situacao, onAck, onResolve }: { h: HelpRequest; index: number; nome: string; situacao: string | null; onAck: () => Promise<void>; onResolve: () => Promise<void> }) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const [busy, setBusy] = useState<'ack' | 'resolve' | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const urgente = ehUrgente(h);
  // Revisão de UX de 19/10/2026 (achado 12): depois de "Estou indo",
  // "Resolvido" ocupa o lugar dele e um toque duplo resolvia o socorro. A
  // mesma trava do alerta em tela cheia (`useTravaDosBotoes`).
  const trava = useTravaDosBotoes(h.id, Boolean(h.acknowledged_at));

  // acknowledgeAlert/resolveAlert gravam no banco e rejeitam quando a escrita
  // falha. A falha aparece no cartão — ninguém sai achando que o paciente foi avisado.
  const executar = async (acao: 'ack' | 'resolve') => {
    if (busy || (acao === 'resolve' && trava.resolver)) return;
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

  const titulo = tituloDoPedido(h, nome);
  const corDoTipo = urgente ? colors.dangerText : colors.warningText;
  const tocando = urgente && !h.acknowledged_at;

  return (
    <Animated.View
      entering={entrada.cascata(index)}
      layout={entrada.layout()}
      style={[styles.cartao, urgente ? { backgroundColor: colors.dangerTint, borderColor: colors.danger, borderWidth: sizes.borderThick } : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: colors.mode === 'light' ? sizes.border : 0 }]}
    >
      <AnelQueToca cor={colors.danger} ativo={tocando} />
      <View accessible accessibilityLabel={`${helpKindLabel[h.kind]}, ${timeAgo(h.created_at)}. ${titulo}${situacao ? ` ${situacao}` : ''}`}>
        <View style={styles.topoDoCartao}>
          <Text variant="caption" weight="semibold" style={{ color: corDoTipo }}>
            {helpKindLabel[h.kind]}
          </Text>
          <Text variant="caption" weight="semibold" style={{ color: corDoTipo }}>
            {timeAgo(h.created_at)}
          </Text>
        </View>
        <Text variant="h2" style={styles.titulo}>
          {titulo}
        </Text>
        {situacao ? (
          <Text variant="bodySmall" tone="muted" style={styles.situacao} accessibilityLiveRegion="polite">
            {situacao}
          </Text>
        ) : null}
      </View>

      {falha ? <Notice tone="danger" title="Nada foi registrado" text={`${falha} Toque de novo.`} style={styles.falha} /> : null}

      <View style={styles.acoes}>
        {!h.acknowledged_at ? (
          <PressableScale
            onPress={() => void executar('ack')}
            disabled={busy !== null}
            haptic="medium"
            accessibilityRole="button"
            accessibilityState={{ disabled: busy !== null, busy: busy === 'ack' }}
            accessibilityLabel={urgente ? 'Estou indo' : 'Ciente'}
            style={[styles.acao, { backgroundColor: !urgente ? colors.surfaceRaised : colors.mode === 'dark' ? lightColors.background : colors.primaryStrong }]}
          >
            <Text variant="body" weight="semibold" style={{ color: !urgente ? colors.text : colors.mode === 'dark' ? lightColors.text : colors.onPrimary }}>
              {busy === 'ack' ? 'Enviando…' : falha ? 'Tentar de novo' : urgente ? 'Estou indo' : 'Ciente'}
            </Text>
          </PressableScale>
        ) : null}
        <Button title="Resolvido" variant="outline" loading={busy === 'resolve'} disabled={busy !== null || trava.resolver} onPress={() => void executar('resolve')} style={[styles.acao, { borderColor: urgente ? colors.dangerText : colors.borderStrong }]} />
      </View>
    </Animated.View>
  );
}

function LinhaDoHistorico({ h, primeira }: { h: HelpRequest; primeira: boolean }) {
  const { colors } = useTheme();
  const motivo = h.message?.trim() ? textoLegivel(h.message) : null;
  const titulo = motivo && motivo.length <= 60 ? motivo : helpKindLabel[h.kind];
  return (
    <View style={[styles.historico, !primeira && { borderTopWidth: sizes.border, borderTopColor: colors.border }]} accessible accessibilityLabel={`${titulo}, ${quando(h.created_at)}, resolvido`}>
      <View style={[styles.icone, { backgroundColor: colors.surface }]}>
        <Ionicons name={ICONE[h.kind]} size={sizes.icon.sm} color={colors.textMuted} />
      </View>
      <View style={styles.flex}>
        <Text variant="body" weight="semibold" numberOfLines={2}>
          {titulo}
        </Text>
        <Text variant="caption" tone="muted">
          {quando(h.created_at)}
        </Text>
      </View>
      <Text variant="caption" tone="accent" weight="semibold">
        Resolvido
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  notice: { marginBottom: spacing.md },
  lista: { gap: spacing.md },
  cartao: { padding: spacing.xl, borderRadius: radius.lg + 2 },
  anel: { borderRadius: radius.lg + 2, borderWidth: sizes.borderThick },
  topoDoCartao: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  titulo: { marginTop: spacing.sm },
  situacao: { marginTop: spacing.xs },
  falha: { marginTop: spacing.md },
  acoes: { flexDirection: 'row', gap: spacing.sm + 2, marginTop: spacing.lg + 2 },
  acao: { flex: 1, minHeight: sizes.touch + 2, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  secao: { marginTop: spacing.xxl, marginBottom: spacing.xs },
  historico: { flexDirection: 'row', alignItems: 'center', gap: spacing.md + 2, paddingVertical: spacing.md + 2 },
  icone: { width: sizes.tile.md, height: sizes.tile.md, borderRadius: radius.md - 2, alignItems: 'center', justifyContent: 'center' },
});
