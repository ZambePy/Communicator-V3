import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInLeft, FadeInRight, LinearTransition } from 'react-native-reanimated';
import { DemoBanner, IrisLogo, PressableScale, StatusPill, Text } from '@/components';
import { Message } from '@/data/types';
import { useApp } from '@/store/AppProvider';
import { fonts, radius, spacing, useTheme } from '@/theme';
import { dateLong, hm } from '@/utils/format';

const SUGGESTIONS = ['Já estou indo', 'Precisa de algo?', 'Quer água?', 'Está confortável?', 'Vou trocar de posição', 'Te amo'];

export default function Conversa() {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { patient, messages, sendMessage, markRead, session, devices, isDemo } = useApp();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const list = useRef<FlatList<Row>>(null);

  useFocusEffect(
    useCallback(() => {
      markRead();
    }, [markRead]),
  );

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [messages.length]);

  const rows = useMemo(() => groupByDay(messages), [messages]);
  const online = devices[0]?.online ?? false;

  const send = async (t: string, kind: Message['kind'] = 'texto') => {
    const value = t.trim();
    if (!value || sending) return;
    setSending(true);
    setFalha(null);
    try {
      await sendMessage(value, kind);
      // Limpar só depois do sucesso: antes o campo era esvaziado logo de
      // saída, então uma falha de envio apagava o texto do cuidador sem aviso
      // nenhum e sem nada ter chegado ao paciente.
      if (kind === 'texto') setText('');
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível enviar agora.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      {/* cabeçalho */}
      <LinearGradient colors={[colors.gradientHeader[0], colors.gradientHeader[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale onPress={() => router.push('/paciente')} style={styles.headerRow} scaleTo={0.98}>
          <IrisLogo size={44} onDark spinning={online} breathing={online} />
          <View style={{ flex: 1 }}>
            <Text variant="h3" tone="onPrimary">
              {patient?.user_name ?? 'Paciente'}
            </Text>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {session ? 'Escrevendo com os olhos no IrisFlow Communicator' : online ? 'Computador conectado' : 'Computador offline — mensagens ficam na fila'}
            </Text>
          </View>
          <StatusPill label={session ? 'Ao vivo' : online ? 'Online' : 'Offline'} live={Boolean(session)} onDark />
        </PressableScale>
        <PressableScale onPress={() => router.push('/frases')} style={styles.phrasesBtn}>
          <Ionicons name="albums-outline" size={16} color="#FFF" />
          <Text variant="caption" tone="onPrimary" weight="semibold">
            Frases rápidas do paciente
          </Text>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.8)" />
        </PressableScale>
      </LinearGradient>

      {isDemo && <DemoBanner text="Modo demonstração — a conversa é simulada, nenhuma mensagem chega a um paciente real." style={styles.demo} />}

      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }}
        renderItem={({ item }) => (item.type === 'day' ? <DayLabel label={item.label} /> : <Bubble m={item.message} patientName={patient?.user_name ?? ''} />)}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: spacing.xxxl }}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
            <Text variant="bodySmall" tone="muted" center style={{ marginTop: spacing.md, maxWidth: 280 }}>
              Quando {patient?.user_name ?? 'o paciente'} escrever com os olhos, a frase aparece aqui. O que você enviar é falado e exibido na tela do computador.
            </Text>
          </View>
        }
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
      />

      {/* sugestões */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions} keyboardShouldPersistTaps="handled">
        {SUGGESTIONS.map((s) => (
          <PressableScale key={s} onPress={() => send(s, 'frase')} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="bodySmall" weight="medium" tone="primary">
              {s}
            </Text>
          </PressableScale>
        ))}
      </ScrollView>

      {/* composer */}
      <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.sm) + 72 }]}>
        {falha && (
          <View style={[styles.falha, { backgroundColor: colors.dangerTint }]}>
            <Ionicons name="cloud-offline" size={16} color={colors.danger} />
            <Text variant="caption" tone="danger" style={{ flex: 1 }}>
              Não enviado: {falha} O texto continua aí — toque em enviar para tentar de novo.
            </Text>
          </View>
        )}
        <View style={styles.yesno}>
          <PressableScale onPress={() => send('Sim', 'simnao')} style={[styles.yn, { backgroundColor: colors.accentTint }]}>
            <Ionicons name="checkmark" size={20} color={colors.accentDeep} />
            <Text variant="bodySmall" weight="bold" style={{ color: colors.accentDeep }}>
              Sim
            </Text>
          </PressableScale>
          <PressableScale onPress={() => send('Não', 'simnao')} style={[styles.yn, { backgroundColor: colors.dangerTint }]}>
            <Ionicons name="close" size={20} color={colors.danger} />
            <Text variant="bodySmall" weight="bold" tone="danger">
              Não
            </Text>
          </PressableScale>
        </View>
        <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt }]}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Escreva para ser falado na tela…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            onSubmitEditing={() => send(text)}
            blurOnSubmit
            returnKeyType="send"
            keyboardAppearance={mode}
          />
          <PressableScale onPress={() => send(text)} disabled={!text.trim() || sending} haptic="medium" style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.border }]} accessibilityLabel="Enviar">
            <Ionicons name="volume-high" size={20} color="#FFF" />
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
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
    <Animated.View entering={FadeInDown.duration(300)} style={{ alignSelf: 'center', backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, marginVertical: spacing.sm }}>
      <Text variant="caption" tone="muted" weight="semibold">
        {label}
      </Text>
    </Animated.View>
  );
}

function Bubble({ m, patientName }: { m: Message; patientName: string }) {
  const { colors } = useTheme();
  const mine = m.sender === 'cuidador';
  const kindIcon: Record<Message['kind'], keyof typeof Ionicons.glyphMap | null> = { texto: null, frase: 'flash-outline', pictograma: 'images-outline', simnao: 'toggle-outline', sistema: 'information-circle-outline' };
  const icon = kindIcon[m.kind];

  if (m.kind === 'sistema') return <DayLabel label={m.text} />;

  return (
    <Animated.View entering={mine ? FadeInRight.duration(320) : FadeInLeft.duration(320)} layout={LinearTransition.springify()} style={[styles.bubbleRow, mine ? { justifyContent: 'flex-end' } : null]}>
      {!mine && (
        <View style={[styles.eyeAvatar, { backgroundColor: colors.primaryTint }]}>
          <Ionicons name="eye" size={16} color={colors.primary} />
        </View>
      )}
      <View style={{ maxWidth: '80%' }}>
        {mine ? (
          <LinearGradient colors={[colors.primaryDeep, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, styles.bubbleMine]}>
            <Text variant="body" tone="onPrimary">
              {m.text}
            </Text>
          </LinearGradient>
        ) : (
          <View style={[styles.bubble, styles.bubbleTheirs, { backgroundColor: colors.surface, borderColor: colors.border }, m.kind === 'simnao' && { backgroundColor: m.text.toLowerCase().startsWith('s') ? colors.accentTint : colors.dangerTint }]}>
            {m.kind === 'simnao' ? (
              <Text variant="h2" style={{ color: m.text.toLowerCase().startsWith('s') ? colors.accentDeep : colors.danger }}>
                {m.text}
              </Text>
            ) : (
              <Text variant="body">{m.text}</Text>
            )}
          </View>
        )}
        <View style={[styles.meta, mine && { justifyContent: 'flex-end' }]}>
          {icon && <Ionicons name={icon} size={12} color={colors.textMuted} />}
          <Text variant="caption" tone="muted" style={{ fontSize: 11, lineHeight: 14 }}>
            {!mine && m.kind === 'frase' ? 'frase rápida · ' : !mine && m.kind === 'pictograma' ? 'pictograma · ' : ''}
            {hm(m.created_at)}
          </Text>
          {mine && <Ionicons name={m.spoken ? 'volume-high' : 'time-outline'} size={12} color={m.spoken ? colors.accent : colors.textMuted} />}
          {mine && (
            <Text variant="caption" style={{ fontSize: 11, lineHeight: 14, color: m.spoken ? colors.accent : colors.textMuted }}>
              {m.spoken ? 'falado na tela' : 'enviando'}
            </Text>
          )}
        </View>
      </View>
      {!mine && <View style={{ width: 0 }} />}
      {!mine && patientName ? null : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  demo: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  phrasesBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, marginTop: spacing.md },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  eyeAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bubble: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg },
  bubbleMine: { borderBottomRightRadius: 6 },
  bubbleTheirs: { borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingHorizontal: 4 },
  suggestions: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1 },
  composer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  falha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.sm },
  yesno: { flexDirection: 'row', gap: spacing.sm },
  yn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm + 2, borderRadius: radius.md },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: radius.lg, paddingLeft: spacing.lg, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, fontSize: 16, fontFamily: fonts.regular, maxHeight: 110, paddingVertical: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
