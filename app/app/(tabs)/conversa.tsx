import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { ConversationSkeleton, EmptyState, IconButton, LiveDot, Notice, PressableScale, Text, useEspacoDoTopo } from '@/components';
import { Message } from '@/data/types';
import { useApp } from '@/store/AppProvider';
import { fonts, layout, motion, radius, sizes, spacing, typeScale, useEntrada, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { firstName, hm } from '@/utils/format';
import { agruparPorDia, LinhaDaConversa } from '@/utils/conversa';
import { ehPerguntaSimNao, excessoDaPergunta, lerResposta, ligarRespostas, MAXIMO_DA_PERGUNTA } from '@/utils/perguntaSimNao';
import { AvisoDoLimiteDaPergunta, CartaoDaPergunta, CartaoDaResposta, ChipDaPergunta, DicaDaPergunta } from '@/features/PerguntaSimNao';

const SUGESTOES = ['Já estou indo', 'Precisa de algo?', 'Quer água?', 'Está confortável?', 'Vou trocar de posição', 'Te amo'];

export default function Conversa() {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Faixa do alerta minimizado no topo: o cabeçalho fixo desce por baixo dela (revisão de UX de 19/10/2026).
  const faixa = useEspacoDoTopo();
  const { patient, messages, sendMessage, markRead, session, devices, unreadCount, patientLoaded, patientVerified, refresh } = useApp();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  /** O campo está compondo uma pergunta de sim ou não (pedido de 21/10/2026). */
  const [perguntando, setPerguntando] = useState(false);
  const list = useRef<FlatList<LinhaDaConversa>>(null);
  const [focada, setFocada] = useState(false);
  // "Está vendo" = aba em foco E app na frente. Só o foco não basta: com a
  // Conversa aberta e o celular no bolso (app em segundo plano, tempo real
  // ainda vivo), a mensagem do paciente era marcada como lida — em todos os
  // celulares da conta — sem ninguém ter lido.
  const [naFrente, setNaFrente] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => setNaFrente(estado === 'active'));
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocada(true);
      return () => setFocada(false);
    }, []),
  );

  // Ao abrir a aba, ao voltar para o app com ela aberta e a cada mensagem nova
  // chegando enquanto o cuidador olha: marca como lidas.
  useEffect(() => {
    if (focada && naFrente && unreadCount > 0) markRead().catch(() => undefined);
  }, [focada, naFrente, unreadCount, markRead]);

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [messages.length]);

  const rows = useMemo(() => agruparPorDia(messages), [messages]);
  // Cada resposta do paciente ligada à pergunta que ela responde.
  const ligacoes = useMemo(() => ligarRespostas(messages), [messages]);
  /** Letras que passam do limite da pergunta (texto que já estava escrito quando ela foi ligada). */
  const excesso = excessoDaPergunta(text, perguntando);
  const device = devices.find((d) => !d.revoked_at);
  const online = device?.online ?? false;
  const nome = patient ? firstName(patient.user_name) : 'o paciente';

  /** Envia; `true` se chegou. */
  const send = async (t: string, kind: Message['kind'] = 'texto'): Promise<boolean> => {
    const value = t.trim();
    if (!value || sending) return false;
    setSending(true);
    setFalha(null);
    try {
      await sendMessage(value, kind);
      return true;
    } catch (e) {
      setFalha(mensagemDeErro(e, 'Não foi possível enviar agora.'));
      return false;
    } finally {
      setSending(false);
    }
  };

  /**
   * O que está no campo: mensagem, ou pergunta de sim ou não (`simnao`, que o
   * computador mostra grande, com o NÃO e o SIM dos lados). Limpar só depois do
   * sucesso: uma falha de envio não pode apagar o texto do cuidador sem nada ter
   * chegado ao paciente.
   */
  const enviarDoCampo = async () => {
    // O `maxLength` do campo não corta o que já estava escrito quando a pergunta foi ligada
    // (revisão final de 21/10/2026): o excesso trava o envio, também pelo "Enviar" do teclado.
    if (excesso > 0) return;
    if (await send(text, perguntando ? 'simnao' : 'texto')) {
      setText('');
      setPerguntando(false);
    }
  };

  const status = session ? 'Escrevendo com os olhos agora' : online ? 'Computador ligado' : device ? 'Computador desligado. As mensagens esperam na fila.' : 'Nenhum computador conectado';
  const podeEnviar = Boolean(text.trim()) && !sending && excesso === 0;

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior="padding">
      {/* Cabeçalho fixo */}
      <View testID="cabecalho-da-conversa" style={[styles.header, { paddingTop: insets.top + spacing.sm + faixa, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <PressableScale onPress={() => router.push('/paciente')} accessibilityRole="button" accessibilityLabel={`${patient?.user_name ?? 'Paciente'}. ${status}. Abrir perfil`} scaleTo={motion.pressScaleCard} style={styles.headerWho}>
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
        renderItem={({ item }) => (item.type === 'day' ? <DayLabel label={item.label} /> : <Linha m={item.message} nome={nome} respostaDe={ligacoes.respostaDe} />)}
        ListEmptyComponent={
          !patientLoaded ? (
            <ConversationSkeleton />
          ) : !patientVerified ? (
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
        {falha ? <Notice tone="danger" title="Não enviado" text={`${falha} O texto continua no campo. Toque em enviar para tentar de novo.`} style={styles.falha} /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          <ChipDaPergunta ativo={perguntando} onPress={() => setPerguntando((p) => !p)} disabled={sending} nome={nome} />
          <Chip label="Sim" icon="checkmark" tone="accent" onPress={() => void send('Sim', 'simnao')} disabled={sending} nome={nome} />
          <Chip label="Não" icon="close" tone="danger" onPress={() => void send('Não', 'simnao')} disabled={sending} nome={nome} />
          {SUGESTOES.map((s) => (
            <Chip key={s} label={s} onPress={() => void send(s, 'frase')} disabled={sending} nome={nome} />
          ))}
        </ScrollView>
        {perguntando ? <DicaDaPergunta nome={nome} /> : null}
        {excesso > 0 ? <AvisoDoLimiteDaPergunta excesso={excesso} /> : null}
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: perguntando ? colors.primary : colors.border }]}
            placeholder={perguntando ? `Pergunta de sim ou não para ${nome}` : `Escreva; ${nome} ouve na tela`}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={perguntando ? MAXIMO_DA_PERGUNTA : 500}
            // "Enviar" no teclado manda a mensagem (em vez de quebrar linha), como antes.
            returnKeyType="send"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => void enviarDoCampo()}
            keyboardAppearance={mode}
            selectionColor={colors.primary}
            accessibilityLabel={perguntando ? `Pergunta de sim ou não para ${nome}` : `Mensagem para ${nome}`}
            accessibilityHint={perguntando ? 'A pergunta aparece grande na tela do computador, com o não e o sim dos lados' : 'O texto é falado e mostrado na tela do computador'}
            maxFontSizeMultiplier={1.6}
          />
          <PressableScale
            onPress={() => void enviarDoCampo()}
            disabled={!podeEnviar}
            haptic="medium"
            accessibilityRole="button"
            accessibilityLabel={perguntando ? 'Enviar pergunta' : 'Enviar'}
            accessibilityHint={perguntando ? 'Envia a pergunta para a tela do computador' : 'Envia para ser falado na tela'}
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
  const bg = colors.surfaceAlt;
  return (
    <PressableScale onPress={onPress} disabled={disabled} haptic="medium" accessibilityRole="button" accessibilityLabel={`Enviar “${label}” para ${nome}`} style={[styles.chip, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={sizes.icon.sm} color={fg} /> : null}
      <Text variant="bodySmall" weight="semibold" style={{ color: fg }}>
        {label}
      </Text>
    </PressableScale>
  );
}

function DayLabel({ label }: { label: string }) {
  return (
    <View style={styles.day} accessibilityRole="header">
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
    <Animated.View entering={entrada.suave()} style={[styles.systemNote, { backgroundColor: bg, borderLeftColor: fg }]} accessible accessibilityLabel={`${remetente}: ${m.text}, às ${hm(m.created_at)}`}>
      <Ionicons name={icon} size={sizes.icon.md} color={fg} />
      <View style={styles.flexShrink}>
        <Text variant="body" weight="semibold" style={{ color: fg }}>
          {m.text}
        </Text>
        <Text variant="caption" tone="muted">
          {remetente}, {hm(m.created_at)}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * Uma linha da conversa (redesenho de 19/10/2026). O que {nome} escreveu com
 * os olhos aparece como transcrição — sem balão, em Sora, com um fio na cor do
 * céu à esquerda que marca a voz dele. O que o cuidador manda é a resposta:
 * balão azul compacto, à direita. A diferença de peso é de propósito: cada
 * letra do paciente custou um olhar.
 */
function Linha({ m, nome, respostaDe }: { m: Message; nome: string; respostaDe: Map<string, Message> }) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const mine = m.sender === 'cuidador';

  if (m.kind === 'sistema') return <SystemNote m={m} nome={nome} />;
  // Pergunta sim/não do cuidador e a resposta do paciente a ela (21/10/2026).
  if (ehPerguntaSimNao(m)) return <CartaoDaPergunta m={m} resposta={respostaDe.get(m.id) ?? null} nome={nome} />;
  const resposta = lerResposta(m);
  if (resposta?.pergunta) return <CartaoDaResposta m={m} lado={resposta.resposta} pergunta={resposta.pergunta} nome={nome} />;

  const sim = m.kind === 'simnao' && m.text.trim().toLowerCase().startsWith('s');
  const tipo = !mine && m.kind === 'frase' ? 'frase pronta' : !mine && m.kind === 'pictograma' ? 'pictograma' : null;
  const estado = mine ? (m.spoken ? 'falado na tela' : 'na fila') : null;
  const rotulo = `${mine ? 'Você' : nome}${tipo ? `, ${tipo}` : ''}: ${m.text}. ${hm(m.created_at)}${estado ? `, ${estado}` : ''}`;

  return (
    <Animated.View entering={entrada.suave()} layout={entrada.reduzir ? undefined : LinearTransition} style={[styles.linha, mine && styles.linhaMinha]} accessible accessibilityLabel={rotulo}>
      {mine ? (
        <View style={styles.colMinha}>
          <View style={[styles.balao, { backgroundColor: colors.primaryStrong }]}>
            <Text variant="body" tone="onPrimary">
              {m.text}
            </Text>
          </View>
          <View style={[styles.meta, styles.metaMinha]}>
            <Text variant="caption" tone="muted">
              {hm(m.created_at)}
            </Text>
            <Ionicons name={m.spoken ? 'volume-high' : 'time-outline'} size={sizes.icon.xs} color={m.spoken ? colors.accentText : colors.textMuted} />
            <Text variant="caption" tone={m.spoken ? 'accent' : 'muted'}>
              {estado}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.fala, { borderLeftColor: m.kind === 'simnao' ? (sim ? colors.accent : colors.danger) : colors.primary }]}>
          {m.kind === 'simnao' ? (
            <View style={styles.simNao}>
              <Ionicons name={sim ? 'checkmark-circle' : 'close-circle'} size={sizes.icon.xl} color={sim ? colors.accentText : colors.dangerText} />
              <Text variant="display" style={{ color: sim ? colors.accentText : colors.dangerText }}>
                {m.text}
              </Text>
            </View>
          ) : (
            <Text variant="h2" weight="headingSemibold">
              {m.text}
            </Text>
          )}
          <Text variant="caption" tone="muted" style={styles.metaFala}>
            {tipo ? `${tipo}, ` : ''}
            {hm(m.created_at)}
          </Text>
        </View>
      )}
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
  listContent: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  day: { marginTop: spacing.md },
  systemNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderLeftWidth: sizes.accentBar },
  linha: { flexDirection: 'row' },
  linhaMinha: { justifyContent: 'flex-end' },
  colMinha: { maxWidth: '82%' },
  balao: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, borderBottomRightRadius: radius.xs },
  // O fio à esquerda marca a voz do paciente: azul-céu numa fala, menta num
  // "sim", rosado num "não".
  fala: { flexShrink: 1, maxWidth: '94%', borderLeftWidth: sizes.borderThick + 1, paddingLeft: spacing.md, paddingVertical: spacing.xxs },
  simNao: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaFala: { marginTop: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs, paddingHorizontal: spacing.xs },
  metaMinha: { justifyContent: 'flex-end' },
  composer: { paddingTop: spacing.md, paddingBottom: spacing.md, borderTopWidth: sizes.hairline, gap: spacing.sm },
  falha: { marginHorizontal: layout.gutter },
  chips: { paddingHorizontal: layout.gutter, gap: spacing.sm },
  chip: { minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radius.md },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: layout.gutter },
  input: {
    flex: 1,
    minHeight: sizes.touch,
    maxHeight: sizes.composerMax,
    borderRadius: radius.md,
    borderWidth: sizes.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
  },
  sendBtn: { width: sizes.touch, height: sizes.touch, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
