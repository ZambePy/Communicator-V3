import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { Avatar, Card, GrupoDeLinhas, IconButton, LinhaDeValor, LiveDot, PressableScale, Screen, Shimmer, Text } from '@/components';
import { HelpRequest, Message, MessageKind } from '@/data/types';
import { siteRoute } from '@/lib/config';
import { useApp } from '@/store/AppProvider';
import { motion, radius, sizes, spacing, useEntrada, useTheme } from '@/theme';
import { durationMin, firstName, helpKindLabel, hm, textoLegivel, timeAgo } from '@/utils/format';

/**
 * Respostas de um toque (mock 06). "Já estou indo" é a mais usada e a mais
 * larga, em teal; Sim/Não vão como `simnao` (a tela do paciente destaca).
 */
const RESPOSTAS_RAPIDAS: { texto: string; kind: MessageKind; principal?: boolean }[] = [
  { texto: 'Já estou indo', kind: 'frase', principal: true },
  { texto: 'Sim', kind: 'simnao' },
  { texto: 'Não', kind: 'simnao' },
];

/** "45 min", "1 h 40", "2 h" — curto, para caber no número do dia (mock 06). */
function duracaoCurta(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const ehDeHoje = (iso: string, agora = new Date()) => new Date(iso).toDateString() === agora.toDateString();
const urgente = (h: HelpRequest) => h.kind === 'emergencia' || h.kind === 'ajuda';

/**
 * Início (redesenho de 31/10/2026). Responde, de cima para baixo, "está tudo
 * bem com {nome}?":
 *  1. quem é e o estado agora (escrevendo, computador ligado ou desligado);
 *  2. um pedido de ajuda aberto, se houver — antes de tudo;
 *  3. a última frase, grande, com as respostas de um toque;
 *  4. hoje em dois números, o computador e os pedidos do dia;
 *  5. as frases de mais cedo e o atalho para os relatórios.
 * Sem números técnicos (px, erro de calibração): eles ficam no detalhe da sessão.
 */
export default function Home() {
  const router = useRouter();
  const { patient, devices, session, helpRequests, messages, refresh, patientLoaded, patientVerified } = useApp();
  const { colors } = useTheme();
  const entrada = useEntrada();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const nome = patient ? firstName(patient.user_name) : 'a pessoa';
  const device = devices.find((d) => !d.revoked_at);
  const falas = useMemo(() => messages.filter((m) => m.sender === 'paciente' && m.kind !== 'sistema'), [messages]);
  const ultima = falas.length ? falas[falas.length - 1] : null;
  const maisCedo = useMemo(() => falas.slice(-4, -1).reverse(), [falas]);
  const abertos = helpRequests.filter((h) => !h.resolved_at);
  const frasesHoje = falas.filter((m) => ehDeHoje(m.created_at)).length;
  const pedidosHoje = helpRequests.filter((h) => urgente(h) && ehDeHoje(h.created_at)).length;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.topo}>
        <EstadoDaPessoa nome={nome} />
        <IconButton icon="person-outline" variant="tinted" accessibilityLabel="Meu perfil" onPress={() => router.push('/perfil')} />
      </View>

      {/* Pedido aberto vem antes de tudo: é a única coisa que não pode esperar. */}
      {abertos.length > 0 ? (
        <View style={styles.pedidos}>
          {abertos.slice(0, 2).map((h, i) => (
            <PedidoAberto key={h.id} h={h} index={i} onPress={() => router.push('/(tabs)/alertas')} />
          ))}
        </View>
      ) : null}

      {!patientLoaded ? (
        <Card style={styles.painel}>
          <Shimmer height={sizes.icon.sm} width="35%" />
          <Shimmer height={sizes.button.lg} style={styles.gapTop} />
        </Card>
      ) : (
        <UltimaFrase nome={nome} m={ultima} semVerificar={!patientVerified} />
      )}

      {patientLoaded ? (
        <Animated.View entering={entrada.cascata(1)} style={styles.hoje}>
          <Numero valor={String(frasesHoje)} rotulo={frasesHoje === 1 ? 'frase hoje' : 'frases hoje'} />
          <Numero valor={session ? duracaoCurta(durationMin(session)) : 'Não'} rotulo="no computador agora" />
        </Animated.View>
      ) : null}

      {patientLoaded ? (
        <Animated.View entering={entrada.cascata(2)} style={styles.gapTopSm}>
          <GrupoDeLinhas>
            {device ? (
              <LinhaDeValor rotulo={device.name} valor={device.online ? 'Ligado' : `Desligado, visto ${timeAgo(device.last_seen_at)}`} tom={device.online ? 'accent' : 'muted'} onPress={() => router.push('/paciente')} testID="linha-do-computador" />
            ) : patientVerified ? (
              <LinhaDeValor rotulo="Nenhum computador ainda" valor="Baixar" tom="default" accessibilityHint="Abre a página de download no site" onPress={() => void Linking.openURL(siteRoute('/baixar')).catch(() => undefined)} />
            ) : (
              <LinhaDeValor rotulo="Computador" valor="Sem atualização" />
            )}
            <LinhaDeValor rotulo="Pedidos de ajuda hoje" valor={!patientVerified ? 'Sem atualização' : pedidosHoje === 0 ? 'Nenhum' : String(pedidosHoje)} tom={pedidosHoje > 0 ? 'danger' : 'muted'} onPress={() => router.push('/(tabs)/alertas')} />
          </GrupoDeLinhas>
        </Animated.View>
      ) : null}

      {maisCedo.length > 0 ? (
        <Animated.View entering={entrada.cascata(3)}>
          <Text variant="bodySmall" weight="semibold" tone="muted" accessibilityRole="header" style={styles.secao}>
            Mais cedo
          </Text>
          {maisCedo.map((m, i) => (
            <View key={m.id} style={[styles.linhaCedo, i > 0 && { borderTopWidth: sizes.border, borderTopColor: colors.border }]} accessible accessibilityLabel={`${nome} disse às ${hm(m.created_at)}: ${m.text}`}>
              <Text variant="body" style={styles.flex} numberOfLines={2}>
                {m.text}
              </Text>
              <Text variant="caption" tone="muted">
                {hm(m.created_at)}
              </Text>
            </View>
          ))}
        </Animated.View>
      ) : null}

      <PressableScale onPress={() => router.push('/relatorios')} accessibilityRole="button" accessibilityLabel="Ver relatórios" scaleTo={motion.pressScaleCard} style={styles.relatorios}>
        <Ionicons name="bar-chart-outline" size={sizes.icon.sm} color={colors.primary} />
        <Text variant="body" weight="semibold" tone="primary">
          Ver relatórios
        </Text>
      </PressableScale>
    </Screen>
  );
}

/**
 * Quem é e como está agora, com o ponto vivo quando está escrevendo. Tocável:
 * abre a pessoa (ou tenta de novo, quando a última carga falhou).
 */
function EstadoDaPessoa({ nome }: { nome: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { patient, devices, session, patientLoaded, patientVerified, refresh } = useApp();
  const device = devices.find((d) => !d.revoked_at);
  const estado = !device ? (!patientVerified ? 'indisponivel' : 'semComputador') : session ? 'emSessao' : device.online ? 'ligado' : 'desligado';
  const texto =
    estado === 'emSessao'
      ? 'Escrevendo agora'
      : estado === 'ligado'
        ? 'Computador ligado'
        : estado === 'desligado'
          ? 'Computador desligado'
          : estado === 'indisponivel'
            ? 'Sem atualização agora. Toque para tentar de novo'
            : 'Nenhum computador conectado';
  const cor = estado === 'emSessao' || estado === 'ligado' ? colors.accentText : estado === 'indisponivel' ? colors.warningText : colors.textMuted;
  return (
    <PressableScale
      onPress={estado === 'indisponivel' ? () => void refresh() : () => router.push('/paciente')}
      scaleTo={motion.pressScaleCard}
      accessibilityRole="button"
      accessibilityLabel={estado === 'indisponivel' ? texto : `${texto}. Abrir o perfil de ${nome}`}
      style={styles.pessoa}
    >
      <Avatar name={patient?.user_name} chave={patient?.id} umaLetra />
      <View style={styles.flexShrink}>
        {patientLoaded || patient ? (
          <Text variant="h2" numberOfLines={1} accessibilityRole="header">
            {nome}
          </Text>
        ) : (
          <Shimmer height={sizes.icon.md} width={120} />
        )}
        <View style={styles.estado}>
          {estado === 'emSessao' ? <LiveDot color={colors.accent} /> : <View style={[styles.ponto, { backgroundColor: cor }]} />}
          <Text variant="caption" weight="medium" style={[styles.flexShrink, { color: cor }]} numberOfLines={2}>
            {texto}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

/** Pedido aberto no topo do Início: o motivo em destaque e há quanto tempo. */
function PedidoAberto({ h, index, onPress }: { h: HelpRequest; index: number; onPress: () => void }) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const ehUrgente = urgente(h);
  const fg = ehUrgente ? colors.dangerText : colors.warningText;
  const titulo = h.message ? textoLegivel(h.message) : helpKindLabel[h.kind];
  const situacao = h.acknowledged_at ? 'você já viu' : 'aguardando você';
  return (
    <Animated.View entering={entrada.cascata(index)}>
      <PressableScale
        onPress={onPress}
        haptic="medium"
        scaleTo={motion.pressScaleCard}
        accessibilityRole="button"
        accessibilityLabel={`${helpKindLabel[h.kind]}: ${titulo}, ${timeAgo(h.created_at)}, ${situacao}. Abrir alertas`}
        style={[styles.pedido, { backgroundColor: ehUrgente ? colors.dangerTint : colors.surface, borderColor: ehUrgente ? colors.danger : colors.border }]}
      >
        <View style={styles.flex}>
          <Text variant="caption" weight="semibold" style={{ color: fg }}>
            {helpKindLabel[h.kind]}, {timeAgo(h.created_at)}
          </Text>
          <Text variant="h3" style={styles.pedidoTitulo}>
            {titulo}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={sizes.icon.md} color={fg} />
      </PressableScale>
    </Animated.View>
  );
}

type Envio = { texto: string; estado: 'ok' | 'falha' } | null;

/**
 * A última frase, grande — a razão de existir do app —, com as respostas de um
 * toque. A resposta sai na hora (envio otimista: já está na Conversa); aqui só
 * aparece "Enviado" ou, se falhou, o pedido para tocar de novo.
 */
function UltimaFrase({ nome, m, semVerificar }: { nome: string; m: Message | null; semVerificar: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const entrada = useEntrada();
  const { sendMessage } = useApp();
  const [envio, setEnvio] = useState<Envio>(null);

  useEffect(() => {
    if (envio?.estado !== 'ok') return;
    const t = setTimeout(() => setEnvio(null), 2_500);
    return () => clearTimeout(t);
  }, [envio]);

  const responder = (texto: string, kind: MessageKind) => {
    setEnvio({ texto, estado: 'ok' });
    sendMessage(texto, kind).catch(() => setEnvio({ texto, estado: 'falha' }));
  };

  if (!m) {
    return (
      <Animated.View entering={entrada.cascata(0)}>
        <Card style={styles.painel}>
          <Text variant="caption" tone="muted">
            {semVerificar ? 'Sem conexão com a conversa' : 'Conversa'}
          </Text>
          <Text variant="h2" style={styles.vazioTitulo}>
            {semVerificar ? 'Não deu para carregar a conversa' : `Quando ${nome} escrever com o olhar, aparece aqui.`}
          </Text>
          <PressableScale onPress={() => router.push('/(tabs)/conversa')} accessibilityRole="button" style={[styles.escrever, { backgroundColor: colors.surfaceRaised }]}>
            <Text variant="body" weight="semibold">
              Escrever para {nome}
            </Text>
          </PressableScale>
        </Card>
      </Animated.View>
    );
  }

  const simNao = m.kind === 'simnao';
  const sim = simNao && m.text.trim().toLowerCase().startsWith('s');
  return (
    <Animated.View entering={entrada.cascata(0)}>
      <Card style={styles.painel}>
        <PressableScale
          onPress={() => router.push('/(tabs)/conversa')}
          accessibilityRole="button"
          accessibilityLabel={`${nome} disse às ${hm(m.created_at)}: ${m.text}. Abrir a conversa`}
          scaleTo={motion.pressScaleCard}
        >
          <Text variant="caption" tone="muted">
            Disse às {hm(m.created_at)}
          </Text>
          {/* A chave pela mensagem: uma frase nova entra com movimento, a mesma não pisca. */}
          <Animated.View key={m.id} entering={entrada.mensagem()}>
            <Text variant="display" style={[styles.frase, simNao && { color: sim ? colors.accentText : colors.dangerText }]} numberOfLines={5} testID="ultima-frase">
              {m.text}
            </Text>
          </Animated.View>
        </PressableScale>

        <View style={styles.respostas}>
          {RESPOSTAS_RAPIDAS.map((r) => {
            const esta = envio?.texto === r.texto;
            return (
              <PressableScale
                key={r.texto}
                onPress={() => responder(r.texto, r.kind)}
                haptic="medium"
                accessibilityRole="button"
                accessibilityLabel={`Responder “${r.texto}” para ${nome}`}
                style={[styles.resposta, r.principal && styles.respostaPrincipal, { backgroundColor: r.principal ? colors.accentTint : colors.surfaceRaised }]}
              >
                {esta && envio?.estado === 'ok' ? <Ionicons name="checkmark" size={sizes.icon.sm} color={r.principal ? colors.accentText : colors.text} /> : null}
                <Text variant="body" weight="semibold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: r.principal ? colors.accentText : colors.text }}>
                  {r.texto}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        {envio ? (
          <Animated.View entering={entrada.suave()} style={styles.envio} accessibilityLiveRegion="polite">
            <Text variant="caption" tone={envio.estado === 'ok' ? 'accent' : 'danger'} testID="estado-da-resposta">
              {envio.estado === 'ok' ? `Enviado para ${nome}.` : `“${envio.texto}” não enviou. Toque de novo.`}
            </Text>
          </Animated.View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.numero, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: colors.mode === 'light' ? sizes.border : 0 }]} accessible accessibilityLabel={`${valor} ${rotulo}`}>
      <Text variant="h1">{valor}</Text>
      <Text variant="caption" tone="muted">
        {rotulo}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  gapTop: { marginTop: spacing.lg },
  gapTopSm: { marginTop: spacing.md },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.xl },
  // Tocável (abre a pessoa ou tenta de novo): alvo mínimo do app.
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.touch, flexShrink: 1 },
  estado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xxs },
  ponto: { width: sizes.dot, height: sizes.dot, borderRadius: radius.pill },
  pedidos: { gap: spacing.sm, marginBottom: spacing.md },
  pedido: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.row, padding: spacing.lg, borderRadius: radius.lg, borderWidth: sizes.borderThick },
  pedidoTitulo: { marginTop: spacing.xxs },
  painel: { padding: spacing.xl, borderRadius: radius.lg + 2 },
  frase: { marginTop: spacing.sm },
  vazioTitulo: { marginTop: spacing.sm },
  escrever: { minHeight: sizes.touch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  respostas: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg + 2 },
  resposta: { flex: 1, minHeight: sizes.touch, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  respostaPrincipal: { flex: 2 },
  envio: { marginTop: spacing.md },
  hoje: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  numero: { flex: 1, borderRadius: radius.lg + 2, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg + 2 },
  secao: { marginTop: spacing.xxl, marginBottom: spacing.xs },
  linhaCedo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: sizes.touch },
  relatorios: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.touch, marginTop: spacing.xl, alignSelf: 'flex-start' },
});
