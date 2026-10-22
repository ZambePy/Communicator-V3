import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, IrisLogo, LiveDot, PressableScale, Screen, SectionTitle, Shimmer, Text } from '@/components';
import { hasFatigueData, hasPostureData, HelpRequest, isBetaPlan, Message, MessageKind } from '@/data/types';
import { siteRoute } from '@/lib/config';
import { useApp } from '@/store/AppProvider';
import { motion, radius, sizes, spacing, useTheme } from '@/theme';
import { driftLabel, durationMin, fatigueLabel, firstName, formatDuration, greeting, helpKindLabel, textoLegivel, timeAgo } from '@/utils/format';
import { rotuloDoPlano } from '@/utils/plano';

/** Respostas de um toque. Sim/Não vão como `simnao` (a tela do paciente destaca). */
const RAPIDAS: { texto: string; kind: MessageKind; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { texto: 'Sim', kind: 'simnao', icon: 'checkmark' },
  { texto: 'Não', kind: 'simnao', icon: 'close' },
  { texto: 'Já estou indo', kind: 'frase' },
  { texto: 'Um minuto', kind: 'frase' },
];

type EnvioRapido = { texto: string; estado: 'enviando' | 'ok' | 'falha' } | null;

/**
 * Início (redesenho de 19/10/2026). A tela responde, nesta ordem:
 *  1. o computador está funcionando? — uma frase no topo, não um cartão;
 *  2. alguém precisa de mim? — pedidos abertos sobem para logo abaixo dela;
 *  3. o que {nome} disse? — as palavras do paciente são o destaque da tela,
 *     no único painel, com as respostas de um toque logo embaixo;
 *  4. como vai hoje, e o computador em detalhe — por último, em texto corrido.
 */
export default function Home() {
  const router = useRouter();
  const { profile, patient, devices, session, helpRequests, messages, unreadCount, refresh, plan, subscription, license, patientLoaded, patientVerified } = useApp();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const nome = patient ? firstName(patient.user_name) : 'o paciente';
  const device = devices.find((d) => !d.revoked_at);
  const lastPatientMsg = [...messages].reverse().find((m) => m.sender === 'paciente' && m.kind !== 'sistema');
  const openAlerts = helpRequests.filter((h) => !h.resolved_at);
  const semVerificar = !patientVerified;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.header}>
        <View style={styles.flex}>
          {!patientLoaded ? <Shimmer height={sizes.icon.sm} width="70%" /> : <EstadoDoComputador nome={nome} />}
          {profile ? (
            <Text variant="h1" accessibilityRole="header" style={styles.saudacao}>
              {greeting()}, {firstName(profile.buyer_name)}
            </Text>
          ) : (
            <Shimmer height={sizes.icon.lg + spacing.xs} width="60%" style={styles.saudacao} />
          )}
        </View>
        <IrisLogo size={sizes.logo.sm} spinning={Boolean(device?.online)} breathing={Boolean(session)} />
      </View>

      {/* Pedido aberto vem antes de tudo: é a única coisa que não pode esperar. */}
      {openAlerts.length > 0 ? (
        <View style={styles.pedidos}>
          {openAlerts.slice(0, 3).map((h) => (
            <PedidoAberto key={h.id} h={h} onPress={() => router.push('/(tabs)/alertas')} />
          ))}
        </View>
      ) : null}

      {/* As palavras do paciente: o único painel da tela. */}
      {!patientLoaded ? (
        <Card style={styles.painel}>
          <Shimmer height={sizes.icon.sm} width="45%" />
          <Shimmer height={sizes.button.lg} style={styles.gapTop} />
        </Card>
      ) : (
        <PalavrasDoPaciente nome={nome} m={lastPatientMsg ?? null} novas={unreadCount} semVerificar={semVerificar} />
      )}

      {patientLoaded && !device && patientVerified ? <ConectarComputador nome={nome} /> : null}

      {/* Hoje: só com sessão ao vivo; o histórico fica em Relatórios. */}
      {session ? (
        <>
          <SectionTitle title="Hoje" action="Ver a sessão" onAction={() => router.push({ pathname: '/sessao/[id]', params: { id: session.id } })} />
          <Text variant="bodySmall" tone="muted">
            Em uso há {formatDuration(durationMin(session))}
            {session.modules_used.length ? `, com ${listaNatural(session.modules_used)}` : ''}.
          </Text>
          <View style={styles.numeros}>
            <Numero valor={String(session.utterances)} rotulo={session.utterances === 1 ? 'frase' : 'frases'} />
            <Numero valor={String(session.chars_typed)} rotulo="letras" />
            {session.hit_rate_150px != null ? <Numero valor={`${Math.round(session.hit_rate_150px * 100)}%`} rotulo="de acerto" /> : null}
          </View>
          {/* Postura e fadiga só quando o computador mediu (sem medição, "estável"
              e "descansado" seriam afirmações sem base). */}
          {hasPostureData(session) || hasFatigueData(session) ? (
            <Text variant="bodySmall" tone="muted" style={styles.gapTopSm}>
              {[hasPostureData(session) ? `Postura: ${driftLabel[session.drift_kind].toLowerCase()}.` : null, hasFatigueData(session) ? `${fatigueLabel[session.fatigue]}.` : null].filter(Boolean).join(' ')}
            </Text>
          ) : null}
        </>
      ) : null}

      {/* Pedidos de ajuda, quando não há nenhum aberto: uma linha que dá paz — ou
          que diz, sem enfeitar, que não deu para verificar. */}
      {openAlerts.length === 0 && patientLoaded ? (
        <>
          <SectionTitle title="Pedidos de ajuda" action="Histórico" onAction={() => router.push('/(tabs)/alertas')} />
          {semVerificar ? (
            <PressableScale onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="Não deu para verificar os pedidos. Tentar de novo" style={styles.linha}>
              <Ionicons name="cloud-offline-outline" size={sizes.icon.md} color={colors.warningText} />
              <Text variant="body" style={styles.flex}>
                Não deu para verificar agora. <Text variant="body" tone="primary" weight="semibold">Tentar de novo</Text>
              </Text>
            </PressableScale>
          ) : (
            <View style={styles.linha} accessible>
              <Ionicons name="shield-checkmark-outline" size={sizes.icon.md} color={colors.accentText} />
              <Text variant="body" style={styles.flex}>
                Nenhum pedido aberto.
              </Text>
            </View>
          )}
        </>
      ) : null}

      {device ? (
        <>
          <SectionTitle title={device.name} action="Detalhes" onAction={() => router.push('/paciente')} />
          <View style={styles.checks}>
            <Check ok={device.camera_ok} label="Câmera" />
            <Check ok={device.tracker_ok} label="Olhar" />
            <Check ok={device.calibrated} label={device.calibrated ? 'Calibrado' : 'Calibrar'} warn={!device.calibrated} />
          </View>
          {device.app_version ? (
            <Text variant="caption" tone="muted" style={styles.versao}>
              Versão {device.app_version}
            </Text>
          ) : null}
        </>
      ) : null}

      {plan ? (
        <PressableScale onPress={() => router.push('/assinatura')} accessibilityRole="button" style={styles.plano}>
          <Ionicons name={isBetaPlan(plan, subscription) ? 'sparkles-outline' : 'card-outline'} size={sizes.icon.sm} color={colors.textMuted} />
          <Text variant="caption" tone="muted" style={styles.flexShrink} testID="selo-do-plano">
            {rotuloDoPlano(plan, subscription, license)}
          </Text>
        </PressableScale>
      ) : null}
    </Screen>
  );
}

/** "teclado, frases e conversa" */
function listaNatural(itens: string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/**
 * O estado do computador numa frase, com o ponto da cor do estado. Tocável:
 * abre o perfil (ou tenta de novo, quando a última carga falhou). Sem a carga
 * verificada não dá para afirmar "nenhum computador conectado".
 */
function EstadoDoComputador({ nome }: { nome: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { devices, session, patientVerified, refresh } = useApp();
  const device = devices.find((d) => !d.revoked_at);
  const estado = !device ? (!patientVerified ? 'indisponivel' : 'semComputador') : session ? 'emSessao' : device.online ? 'ligado' : 'desligado';
  const texto =
    estado === 'emSessao'
      ? `${nome} está no computador agora`
      : estado === 'ligado'
        ? 'Computador ligado'
        : estado === 'desligado'
          ? `Computador desligado, visto ${timeAgo(device!.last_seen_at)}`
          : estado === 'indisponivel'
            ? 'Sem atualização agora. Toque para tentar de novo'
            : 'Nenhum computador conectado';
  const cor = estado === 'emSessao' || estado === 'ligado' ? colors.accent : estado === 'indisponivel' ? colors.warning : colors.textMuted;
  return (
    <PressableScale
      onPress={estado === 'indisponivel' ? () => void refresh() : () => router.push('/paciente')}
      scaleTo={motion.pressScaleCard}
      accessibilityRole="button"
      accessibilityLabel={estado === 'indisponivel' ? texto : `${texto}. Abrir o perfil de ${nome}`}
      style={styles.estado}
    >
      {estado === 'emSessao' ? <LiveDot color={cor} /> : <View style={[styles.ponto, { backgroundColor: cor }]} />}
      <Text variant="bodySmall" tone={estado === 'indisponivel' ? 'warning' : 'muted'} weight="medium" style={styles.flexShrink} numberOfLines={2}>
        {texto}
      </Text>
    </PressableScale>
  );
}

/** Pedido aberto no topo do Início: o motivo em destaque e há quanto tempo. */
function PedidoAberto({ h, onPress }: { h: HelpRequest; onPress: () => void }) {
  const { colors } = useTheme();
  const urgente = h.kind === 'emergencia' || h.kind === 'ajuda';
  const fg = urgente ? colors.dangerText : colors.warningText;
  const titulo = h.message ? textoLegivel(h.message) : helpKindLabel[h.kind];
  const situacao = h.acknowledged_at ? 'você já viu' : 'aguardando você';
  return (
    <PressableScale
      onPress={onPress}
      haptic="medium"
      scaleTo={motion.pressScaleCard}
      accessibilityRole="button"
      accessibilityLabel={`${helpKindLabel[h.kind]}: ${titulo}, ${timeAgo(h.created_at)}, ${situacao}. Abrir alertas`}
      style={[styles.pedido, { backgroundColor: urgente ? colors.dangerTint : colors.warningTint, borderLeftColor: urgente ? colors.danger : colors.warning }]}
    >
      <View style={styles.flex}>
        <Text variant="h3" style={{ color: fg }}>
          {titulo}
        </Text>
        <Text variant="caption" tone="muted">
          {helpKindLabel[h.kind]}, {timeAgo(h.created_at)}, {situacao}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={sizes.icon.md} color={fg} />
    </PressableScale>
  );
}

/**
 * O que {nome} escreveu por último, em letra grande — é a razão de existir do
 * app —, com as respostas de um toque logo abaixo.
 */
function PalavrasDoPaciente({ nome, m, novas, semVerificar }: { nome: string; m: Message | null; novas: number; semVerificar: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { sendMessage } = useApp();
  const [envio, setEnvio] = useState<EnvioRapido>(null);

  // A confirmação "Enviado" some sozinha; a falha fica até o próximo toque.
  useEffect(() => {
    if (envio?.estado !== 'ok') return;
    const t = setTimeout(() => setEnvio(null), 2500);
    return () => clearTimeout(t);
  }, [envio]);

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

  if (!m) {
    return (
      <Card style={styles.painel}>
        <Text variant="caption" tone="muted">
          {semVerificar ? 'Sem conexão com a conversa' : 'Conversa'}
        </Text>
        <Text variant="h2" style={styles.vazioTitulo}>
          {semVerificar ? 'Não deu para carregar a conversa' : `Quando ${nome} escrever com os olhos, aparece aqui.`}
        </Text>
        {semVerificar ? (
          <Text variant="bodySmall" tone="muted">
            Assim que a conexão voltar, as mensagens aparecem.
          </Text>
        ) : null}
        <Button title={`Escrever para ${nome}`} variant="secondary" icon="chatbubble-outline" onPress={() => router.push('/(tabs)/conversa')} style={styles.gapTop} />
      </Card>
    );
  }

  const simNao = m.kind === 'simnao';
  const sim = simNao && m.text.trim().toLowerCase().startsWith('s');
  return (
    <Card style={styles.painel}>
      <PressableScale
        onPress={() => router.push('/(tabs)/conversa')}
        accessibilityRole="button"
        accessibilityLabel={`${nome} escreveu, ${timeAgo(m.created_at)}: ${m.text}. Abrir a conversa`}
        scaleTo={motion.pressScaleCard}
      >
        <View style={styles.atribuicao}>
          <Text variant="caption" tone="muted" style={styles.flex}>
            {nome} escreveu, {timeAgo(m.created_at)}
          </Text>
          {novas > 0 ? (
            <Text variant="caption" tone="primary" weight="semibold">
              {novas === 1 ? '1 nova' : `${novas} novas`}
            </Text>
          ) : null}
        </View>
        {simNao ? (
          <View style={styles.simNao}>
            <Ionicons name={sim ? 'checkmark-circle' : 'close-circle'} size={sizes.icon.xl} color={sim ? colors.accentText : colors.dangerText} />
            <Text variant="display" style={{ color: sim ? colors.accentText : colors.dangerText }}>
              {m.text}
            </Text>
          </View>
        ) : (
          <Text variant="fala" style={styles.fala} numberOfLines={6}>
            {m.text}
          </Text>
        )}
      </PressableScale>

      <View style={styles.rapidas}>
        {RAPIDAS.map((r) => {
          const esta = envio?.texto === r.texto;
          // Fundo neutro para as quatro; a cor fica no texto (menta = sim,
          // rosado = não). Tingir o fundo de vermelho num "Não" deixava o
          // botão com cara de perigo.
          const cor = r.texto === 'Sim' ? colors.accentText : r.texto === 'Não' ? colors.dangerText : colors.primary;
          const bg = colors.surfaceAlt;
          return (
            <PressableScale
              key={r.texto}
              onPress={() => void responder(r.texto, r.kind)}
              disabled={envio?.estado === 'enviando'}
              haptic="medium"
              accessibilityRole="button"
              accessibilityLabel={`Responder “${r.texto}” para ${nome}`}
              style={[styles.rapida, { backgroundColor: bg }]}
            >
              {r.icon ? <Ionicons name={esta && envio?.estado === 'ok' ? 'checkmark-done' : r.icon} size={sizes.icon.sm} color={cor} /> : null}
              <Text variant="body" weight="semibold" style={{ color: cor }}>
                {r.texto}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      {envio && envio.estado !== 'enviando' ? (
        <View style={styles.envio} accessibilityLiveRegion="polite">
          <Ionicons name={envio.estado === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={sizes.icon.sm} color={envio.estado === 'ok' ? colors.accentText : colors.dangerText} />
          <Text variant="caption" tone={envio.estado === 'ok' ? 'accent' : 'danger'} style={styles.flex}>
            {envio.estado === 'ok' ? `“${envio.texto}” enviado para ${nome}.` : `“${envio.texto}” não foi enviado. Confira a internet e toque de novo.`}
          </Text>
        </View>
      ) : null}

      <Button title={novas ? 'Responder' : `Escrever para ${nome}`} variant={novas ? 'primary' : 'secondary'} icon="chatbubble-outline" onPress={() => router.push('/(tabs)/conversa')} style={styles.gapTop} />
    </Card>
  );
}

/** Sem computador: os dois passos de verdade (é uma sequência, por isso numerada). */
function ConectarComputador({ nome }: { nome: string }) {
  return (
    <>
      <SectionTitle title="Conectar o computador" />
      <View style={styles.passos}>
        <Passo n={1} texto={`Instale o IrisFlow Communicator no computador de ${nome}.`} />
        <Passo n={2} texto="Entre lá com esta mesma conta. O vínculo é automático." />
      </View>
      <Button title="Baixar para o computador" icon="download-outline" onPress={() => void Linking.openURL(siteRoute('/beta')).catch(() => undefined)} style={styles.gapTop} />
    </>
  );
}

function Passo({ n, texto }: { n: number; texto: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.passo}>
      <View style={[styles.passoN, { borderColor: colors.borderStrong }]}>
        <Text variant="caption" weight="bold" maxFontSizeMultiplier={1.2}>
          {n}
        </Text>
      </View>
      <Text variant="body" style={styles.flex}>
        {texto}
      </Text>
    </View>
  );
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <View style={styles.numero} accessible accessibilityLabel={`${valor} ${rotulo}`}>
      <Text variant="h1">{valor}</Text>
      <Text variant="caption" tone="muted">
        {rotulo}
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
      <Text variant="body" weight="medium">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  gapTop: { marginTop: spacing.lg },
  gapTopSm: { marginTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xl },
  // Tocável (abre o perfil ou tenta de novo): alvo mínimo do app. Tinha 36 dp
  // (revisão de UX de 19/10/2026, achado 19).
  estado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.touch, alignSelf: 'flex-start' },
  ponto: { width: sizes.dot, height: sizes.dot, borderRadius: radius.pill },
  saudacao: { marginTop: spacing.xs },
  pedidos: { gap: spacing.sm, marginBottom: spacing.lg },
  pedido: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.row, paddingVertical: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.md, borderRadius: radius.md, borderLeftWidth: sizes.accentBar },
  painel: { padding: spacing.xl },
  atribuicao: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fala: { marginTop: spacing.sm },
  simNao: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  vazioTitulo: { marginTop: spacing.sm },
  rapidas: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
  // Grade 2 × 2: Sim/Não em cima, respostas curtas embaixo — alvos grandes e alinhados.
  rapida: { minHeight: sizes.button.md, flexBasis: '46%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md },
  envio: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  numeros: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxl, marginTop: spacing.md },
  numero: { minWidth: sizes.touch },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.touch },
  checks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.xxl, rowGap: spacing.sm },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.touch - spacing.sm },
  versao: { marginTop: spacing.xs },
  passos: { gap: spacing.md },
  passo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  passoN: { width: sizes.icon.lg, height: sizes.icon.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: sizes.border },
  plano: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.touch, marginTop: spacing.xxxl },
});
