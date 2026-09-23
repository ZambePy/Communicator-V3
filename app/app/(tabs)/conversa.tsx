import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Avatar, ConversationSkeleton, EmptyState, IconButton, LiveDot, Notice, PressableScale, Text } from '@/components';
import { Message } from '@/data/types';
import { useApp } from '@/store/AppProvider';
import { fonts, layout, motion, radius, sizes, spacing, typeScale, useEntrada, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { dateLong, firstName, hm } from '@/utils/format';

const SUGESTOES = ['Já estou indo', 'Precisa de algo?', 'Quer água?', 'Está confortável?', 'Vou trocar de posição', 'Te amo'];

export default function Conversa() {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { patient, messages, sendMessage, markRead, session, devices, unreadCount, patientLoaded, error, refresh } = useApp();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const list = useRef<FlatList<Row>>(null);
  const focada = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focada.current = true;
      markRead().catch(() => undefined);
      return () => {
        focada.current = false;
      };
    }, [markRead]),
  );

  // Mensagem nova chegando COM a aba em foco: marca como lida na hora. Antes
  // só o focus marcava, então o selo de não lidas subia enquanto o cuidador
  // estava olhando exatamente para a conversa.
  useEffect(() => {
    if (focada.current && unreadCount > 0) markRead().catch(() => undefined);
  }, [unreadCount, markRead]);

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [messages.length]);

  const rows = useMemo(() => groupByDay(messages), [messages]);
  const device = devices.find((d) => !d.revoked_at);
  const online = device?.online ?? false;
  const nome = patient ? firstName(patient.user_name) : 'o paciente';

  const send = async (t: string, kind: Message['kind'] = 'texto') => {
    const value = t.trim();
    if (!value || sending) return;
    setSending(true);
    setFalha(null);
    try {
      await sendMessage(value, kind);
      // Limpar só depois do sucesso: uma falha de envio não pode apagar o
      // texto do cuidador sem nada ter chegado ao paciente.
      if (kind === 'texto') setText('');
    } catch (e) {
      setFalha(mensagemDeErro(e, 'Não foi possível enviar agora.'));
    } finally {
      setSending(false);
    }
  };

  const status = session ? 'Escrevendo com os olhos' : online ? 'Computador ligado' : device ? 'Desligado · as mensagens esperam na fila' : 'Nenhum computador conectado';
  const podeEnviar = Boolean(text.trim()) && !sending;

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior="padding">
      {/* Cabeçalho fixo */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <PressableScale onPress={() => router.push('/paciente')} accessibilityRole="button" accessibilityLabel={`${patient?.user_name ?? 'Paciente'}. ${status}. Abrir perfil`} scaleTo={motion.pressScaleCard} style={styles.headerWho}>
          <Avatar name={patient?.user_name} />
          <View style={styles.flex}>
            <Text variant="h3" numberOfLines={1} accessibilityRole="header">
              {patient?.user_name ?? 'Paciente'}
            </Text>
            <View style={styles.statusRow}>
              {session ? <LiveDot color={colors.accent} /> : <View style={[styles.dot, { backgroundColor: online ? colors.accent : colors.textMuted }]} />}
              <Text variant="caption" tone="muted" style={styles.flex} numberOfLines={2}>
                {status}
              </Text>
            </View>
          </View>
        </PressableScale>
        <IconButton icon="albums-outline" variant="tinted" accessibilityLabel="Frases rápidas" accessibilityHint={`Editar as frases que aparecem na tela de ${nome}`} onPress={() => router.push('/frases')} />
      </View>

      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (item.type === 'day' ? <DayLabel label={item.label} /> : <Bubble m={item.message} nome={nome} />)}
        ListEmptyComponent={
          !patientLoaded ? (
            <ConversationSkeleton />
          ) : error ? (
            <EmptyState icon="cloud-offline-outline" title="Não deu para carregar a conversa" body="Confira a internet e tente de novo." action={{ label: 'Tentar de novo', icon: 'refresh', onPress: () => void refresh() }} />
          ) : (
            <EmptyState icon="chatbubbles-outline" title="Nenhuma mensagem ainda" body={`Quando ${nome} escrever com os olhos, aparece aqui. O que você mandar é falado na tela do computador.`} />
          )
        }
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
      />

      {/* Respostas prontas + campo */}
      <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {falha ? <Notice tone="danger" title="Não enviado" text={`${falha} O texto continua no campo — toque em enviar para tentar de novo.`} style={styles.falha} /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          <Chip label="Sim" icon="checkmark" tone="accent" onPress={() => void send('Sim', 'simnao')} disabled={sending} nome={nome} />
          <Chip label="Não" icon="close" tone="danger" onPress={() => void send('Não', 'simnao')} disabled={sending} nome={nome} />
          {SUGESTOES.map((s) => (
            <Chip key={s} label={s} onPress={() => void send(s, 'frase')} disabled={sending} nome={nome} />
          ))}
        </ScrollView>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            placeholder={`Escreva — ${nome} ouve na tela`}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            // "Enviar" no teclado manda a mensagem (em vez de quebrar linha), como antes.
            returnKeyType="send"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => void send(text)}
            keyboardAppearance={mode}
            selectionColor={colors.primary}
            accessibilityLabel={`Mensagem para ${nome}`}
            accessibilityHint="O texto é falado e mostrado na tela do computador"
            maxFontSizeMultiplier={1.6}
          />
          <PressableScale
            onPress={() => void send(text)}
            disabled={!podeEnviar}
            haptic="medium"
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            accessibilityHint="Envia para ser falado na tela"
            accessibilityState={{ disabled: !podeEnviar, busy: sending }}
            style={[styles.sendBtn, { backgroundColor: podeEnviar ? colors.primaryStrong : colors.surfaceAlt }]}
          >
            <Ionicons name="send" size={sizes.icon.md} color={podeEnviar ? colors.onPrimary : colors.textMuted} />
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, icon, tone = 'primary', onPress, disabled, nome }: { label: string; icon?: keyof typeof Ionicons.glyphMap; tone?: 'primary' | 'accent' | 'danger'; onPress: () => void; disabled?: boolean; nome: string }) {
  const { colors } = useTheme();
  const fg = tone === 'accent' ? colors.accentText : tone === 'danger' ? colors.dangerText : colors.primary;
  const bg = tone === 'accent' ? colors.accentTint : tone === 'danger' ? colors.dangerTint : colors.primaryTint;
  return (
    <PressableScale onPress={onPress} disabled={disabled} haptic="medium" accessibilityRole="button" accessibilityLabel={`Enviar “${label}” para ${nome}`} style={[styles.chip, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={sizes.icon.sm} color={fg} /> : null}
      <Text variant="bodySmall" weight="semibold" style={{ color: fg }}>
        {label}
      </Text>
    </PressableScale>
  );
}

type Row = { type: 'day'; key: string; label: string } | { type: 'msg'; key: string; message: Message };

function groupByDay(messages: Message[]): Row[] {
  const rows: Row[] = [];
  let lastDay = '';
  for (const m of messages) {
    const day = new Date(m.created_at).toDateString();
    if (day !== lastDay) {
      const today = new Date().toDateString();
      rows.push({ type: 'day', key: `day-${day}`, label: day === today ? 'Hoje' : dateLong(m.created_at) });
      lastDay = day;
    }
    rows.push({ type: 'msg', key: m.id, message: m });
  }
  return rows;
}

function DayLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.day, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="header">
      <Text variant="caption" tone="muted" weight="semibold">
        {label}
      </Text>
    </View>
  );
}

/**
 * Mensagem de sistema com estilo próprio — NÃO é um rótulo de dia. Do
 * paciente ("Estou bem", enviado pela tela do computador): pílula teal com
 * remetente e hora, para que o cuidador veja que foi um sinal deliberado e
 * quando. Do servidor (escalonamento sem confirmação): âmbar, com alerta.
 */
function SystemNote({ m, nome }: { m: Message; nome: string }) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const doPaciente = m.sender === 'paciente';
  const bg = doPaciente ? colors.accentTint : colors.warningTint;
  const fg = doPaciente ? colors.accentText : colors.warningText;
  const icon: keyof typeof Ionicons.glyphMap = doPaciente ? 'checkmark-circle' : 'alert-circle';
  const remetente = doPaciente ? nome : 'IrisFlow';
  return (
    <Animated.View entering={entrada.suave()} style={[styles.systemNote, { backgroundColor: bg }]} accessible accessibilityLabel={`${remetente}: ${m.text}, às ${hm(m.created_at)}`}>
      <Ionicons name={icon} size={sizes.icon.md} color={fg} />
      <View style={styles.flexShrink}>
        <Text variant="body" weight="semibold" style={{ color: fg }}>
          {m.text}
        </Text>
        <Text variant="caption" tone="muted">
          {remetente} · {hm(m.created_at)}
        </Text>
      </View>
    </Animated.View>
  );
}

function Bubble({ m, nome }: { m: Message; nome: string }) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const mine = m.sender === 'cuidador';

  if (m.kind === 'sistema') return <SystemNote m={m} nome={nome} />;

  const sim = m.kind === 'simnao' && m.text.trim().toLowerCase().startsWith('s');
  const tipo = !mine && m.kind === 'frase' ? 'frase rápida' : !mine && m.kind === 'pictograma' ? 'pictograma' : null;
  const estado = mine ? (m.spoken ? 'falado na tela' : 'na fila') : null;
  const rotulo = `${mine ? 'Você' : nome}${tipo ? `, ${tipo}` : ''}: ${m.text}. ${hm(m.created_at)}${estado ? `, ${estado}` : ''}`;

  return (
    <Animated.View entering={entrada.suave()} layout={entrada.reduzir ? undefined : LinearTransition} style={[styles.bubbleRow, mine && styles.mineRow]} accessible accessibilityLabel={rotulo}>
      <View style={styles.bubbleCol}>
        {mine ? (
          <View style={[styles.bubble, styles.bubbleMine, { backgroundColor: colors.primaryStrong }]}>
            <Text variant="body" tone="onPrimary">
              {m.text}
            </Text>
          </View>
        ) : m.kind === 'simnao' ? (
          <View style={[styles.bubble, styles.bubbleTheirs, styles.yesNo, { backgroundColor: sim ? colors.accentTint : colors.dangerTint }]}>
            <Ionicons name={sim ? 'checkmark-circle' : 'close-circle'} size={sizes.icon.lg} color={sim ? colors.accentText : colors.dangerText} />
            <Text variant="h2" style={{ color: sim ? colors.accentText : colors.dangerText }}>
              {m.text}
            </Text>
          </View>
        ) : (
          <View style={[styles.bubble, styles.bubbleTheirs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="body">{m.text}</Text>
          </View>
        )}
        <View style={[styles.meta, mine && styles.metaMine]}>
          {tipo ? (
            <Text variant="caption" tone="muted">
              {tipo} ·
            </Text>
          ) : null}
          <Text variant="caption" tone="muted">
            {hm(m.created_at)}
          </Text>
          {mine ? (
            <>
              <Ionicons name={m.spoken ? 'volume-high' : 'time-outline'} size={sizes.icon.xs} color={m.spoken ? colors.accentText : colors.textMuted} />
              <Text variant="caption" tone={m.spoken ? 'accent' : 'muted'}>
                {estado}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: layout.gutter, paddingBottom: spacing.md, borderBottomWidth: sizes.hairline },
  headerWho: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.touch },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: sizes.dot, height: sizes.dot, borderRadius: radius.pill },
  listContent: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, gap: spacing.md, flexGrow: 1 },
  day: { alignSelf: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, marginVertical: spacing.sm },
  systemNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'center', maxWidth: '92%', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, marginVertical: spacing.xs },
  bubbleRow: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  bubbleCol: { maxWidth: '84%' },
  bubble: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg },
  bubbleMine: { borderBottomRightRadius: radius.xs },
  bubbleTheirs: { borderBottomLeftRadius: radius.xs, borderWidth: sizes.border, borderColor: 'transparent' },
  yesNo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs, paddingHorizontal: spacing.xs },
  metaMine: { justifyContent: 'flex-end' },
  composer: { paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: sizes.hairline, gap: spacing.sm },
  falha: { marginHorizontal: layout.gutter },
  chips: { paddingHorizontal: layout.gutter, gap: spacing.sm },
  chip: { minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: layout.gutter },
  input: {
    flex: 1,
    minHeight: sizes.touch,
    maxHeight: sizes.composerMax,
    borderRadius: radius.lg,
    borderWidth: sizes.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
  },
  sendBtn: { width: sizes.touch, height: sizes.touch, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
