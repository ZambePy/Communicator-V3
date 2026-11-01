import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Avatar, ConversationSkeleton, EmptyState, IconButton, LiveDot, PressableScale, Text, useEspacoDoTopo } from '@/components';
import { Message } from '@/data/types';
import { definirConversaEmFoco, limparAvisosDaConversa } from '@/hooks/usePushNotifications';
import { useApp } from '@/store/AppProvider';
import { fonts, layout, motion, radius, sizes, spacing, typeScale, useEntrada, useTheme } from '@/theme';
import { firstName, hm } from '@/utils/format';
import { agruparPorDia, estadoDoEnvio, LinhaDaConversa } from '@/utils/conversa';
import { ehPerguntaSimNao, excessoDaPergunta, lerResposta, ligarRespostas, MAXIMO_DA_PERGUNTA } from '@/utils/perguntaSimNao';
import { AvisoDoLimiteDaPergunta, CartaoDaPergunta, CartaoDaResposta, ChipDaPergunta, DicaDaPergunta } from '@/features/PerguntaSimNao';

/** Respostas de um toque, as mesmas do Início (mock 07), e duas sugestões depois da pergunta. */
const RAPIDAS: { texto: string; kind: Message['kind'] }[] = [
  { texto: 'Já estou indo', kind: 'frase' },
  { texto: 'Sim', kind: 'simnao' },
  { texto: 'Não', kind: 'simnao' },
];
const SUGESTOES = ['Quer água?', 'Está confortável?'];

/**
 * Conversa (redesenho de 31/10/2026). O que mudou:
 *  - envio otimista: o balão aparece na hora com "Enviando…", depois "Enviado"
 *    e "Falado na tela"; se falhar, "Não enviou. Tocar para tentar de novo". O
 *    campo nunca trava enquanto envia;
 *  - mensagem nova entra com movimento (só as novas, não a lista inteira ao abrir);
 *  - com esta Conversa na frente, o push da mesma pessoa não vira faixa (o
 *    balão já está entrando) — só vibra;
 *  - sem parágrafos fixos no topo: o estado do computador é uma linha curta.
 */
export default function Conversa() {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Faixa do alerta minimizado no topo: o cabeçalho fixo desce por baixo dela (revisão de UX de 19/10/2026).
  const faixa = useEspacoDoTopo();
  const { patient, messages, sendMessage, reenviarMensagem, markRead, session, devices, unreadCount, patientLoaded, patientVerified, refresh } = useApp();
  const [text, setText] = useState('');
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

  // Com a Conversa desta pessoa na frente, o push de mensagem dela não vira
  // faixa (`decidirApresentacao`), e as que estavam na bandeja saem.
  const pacienteId = patient?.id ?? null;
  const vendo = focada && naFrente;
  useEffect(() => {
    if (!vendo || !pacienteId) return;
    definirConversaEmFoco(pacienteId);
    void limparAvisosDaConversa(pacienteId);
    return () => definirConversaEmFoco(null);
  }, [vendo, pacienteId]);

  // Ao abrir a aba, ao voltar para o app com ela aberta e a cada mensagem nova
  // chegando enquanto o cuidador olha: marca como lidas.
  useEffect(() => {
    if (vendo && unreadCount > 0) markRead().catch(() => undefined);
  }, [vendo, unreadCount, markRead]);

  const rows = useMemo(() => agruparPorDia(messages), [messages]);
  // Cada resposta do paciente ligada à pergunta que ela responde.
  const ligacoes = useMemo(() => ligarRespostas(messages), [messages]);
  /** Letras que passam do limite da pergunta (texto que já estava escrito quando ela foi ligada). */
  const excesso = excessoDaPergunta(text, perguntando);
  const device = devices.find((d) => !d.revoked_at);
  const online = device?.online ?? false;
  const nome = patient ? firstName(patient.user_name) : 'a pessoa';

  // Só as mensagens que chegam DEPOIS de a tela abrir entram com movimento.
  const vistas = useRef<Set<string> | null>(null);
  if (vistas.current === null && patientLoaded) vistas.current = new Set(rows.map((r) => r.key));
  const ehNova = (chave: string) => Boolean(vistas.current && !vistas.current.has(chave));
  useEffect(() => {
    if (!vistas.current) return;
    for (const r of rows) vistas.current.add(r.key);
  }, [rows]);
  // A última fala do paciente é a maior (mock 07).
  const ultimaDoPaciente = useMemo(() => [...messages].reverse().find((m) => m.sender === 'paciente' && m.kind !== 'sistema')?.id ?? null, [messages]);

  /** Envia na hora (otimista): o campo não trava e o balão já aparece. */
  const send = (t: string, kind: Message['kind'] = 'texto') => {
    const value = t.trim();
    if (!value) return false;
    // A falha fica no próprio balão ("Não enviou. Tocar para tentar de novo").
    sendMessage(value, kind).catch(() => undefined);
    return true;
  };

  /**
   * O que está no campo: mensagem, ou pergunta de sim ou não (`simnao`, que o
   * computador mostra grande, com o NÃO e o SIM dos lados). O texto sai do
   * campo na hora: se o envio falhar, ele continua no balão para tentar de novo.
   */
  const enviarDoCampo = () => {
    // O `maxLength` do campo não corta o que já estava escrito quando a pergunta foi ligada
    // (revisão final de 21/10/2026): o excesso trava o envio, também pelo "Enviar" do teclado.
    if (excesso > 0) return;
    if (send(text, perguntando ? 'simnao' : 'texto')) {
      setText('');
      setPerguntando(false);
    }
  };

  const status = session ? 'Escrevendo agora' : online ? 'Computador ligado' : device ? 'Computador desligado' : 'Nenhum computador conectado';
  const corDoStatus = session || online ? colors.accentText : colors.textMuted;
  const podeEnviar = Boolean(text.trim()) && excesso === 0;

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior="padding">
      {/* Cabeçalho fixo */}
      <View testID="cabecalho-da-conversa" style={[styles.header, { paddingTop: insets.top + spacing.sm + faixa, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <PressableScale onPress={() => router.push('/paciente')} accessibilityRole="button" accessibilityLabel={`${patient?.user_name ?? 'Pessoa'}. ${status}. Abrir perfil`} scaleTo={motion.pressScaleCard} style={styles.headerWho}>
          <Avatar name={patient?.user_name} chave={patient?.id} size="sm" umaLetra />
          <View style={styles.flex}>
            <Text variant="h3" weight="heading" numberOfLines={1} accessibilityRole="header">
              {nome}
            </Text>
            <View style={styles.statusRow}>
              {session ? <LiveDot color={colors.accent} /> : <View style={[styles.dot, { backgroundColor: corDoStatus }]} />}
              <Text variant="caption" weight="medium" style={[styles.flex, { color: corDoStatus }]} numberOfLines={1}>
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
        renderItem={({ item }) =>
          item.type === 'day' ? (
            <DayLabel label={item.label} />
          ) : (
            <Linha
              m={item.message}
              nome={nome}
              respostaDe={ligacoes.respostaDe}
              nova={ehNova(item.key)}
              grande={item.message.id === ultimaDoPaciente}
              onTentarDeNovo={() => void reenviarMensagem(item.message.id).catch(() => undefined)}
            />
          )
        }
        ListEmptyComponent={
          !patientLoaded ? (
            <ConversationSkeleton />
          ) : !patientVerified ? (
            <EmptyState icon="cloud-offline-outline" title="Não deu para carregar a conversa" body="Confira a internet e tente de novo." action={{ label: 'Tentar de novo', icon: 'refresh', onPress: () => void refresh() }} />
          ) : (
            <EmptyState icon="chatbubbles-outline" title="Nenhuma mensagem ainda" body={`Quando ${nome} escrever com o olhar, aparece aqui.`} />
          )
        }
        // Rola para o fim quando a lista cresce (sem a espera de 120 ms de antes).
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: Boolean(vistas.current) })}
        keyboardShouldPersistTaps="handled"
      />

      {/* Respostas prontas + campo */}
      <View style={[styles.composer, { backgroundColor: colors.background }]}>
        {device && !online ? (
          <Text variant="caption" tone="muted" style={styles.aviso} testID="aviso-desligado">
            {nome} vê quando o computador ligar.
          </Text>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {RAPIDAS.map((r) => (
            <Chip key={r.texto} label={r.texto} onPress={() => void send(r.texto, r.kind)} nome={nome} />
          ))}
          <ChipDaPergunta ativo={perguntando} onPress={() => setPerguntando((p) => !p)} nome={nome} />
          {SUGESTOES.map((s) => (
            <Chip key={s} label={s} onPress={() => void send(s, 'frase')} nome={nome} />
          ))}
        </ScrollView>
        {perguntando ? <DicaDaPergunta nome={nome} /> : null}
        {excesso > 0 ? <AvisoDoLimiteDaPergunta excesso={excesso} /> : null}
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: perguntando ? colors.primary : 'transparent' }]}
            placeholder={perguntando ? `Pergunta de sim ou não para ${nome}` : `Escreva. ${nome} ouve na tela.`}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={perguntando ? MAXIMO_DA_PERGUNTA : 500}
            // "Enviar" no teclado manda a mensagem (em vez de quebrar linha), como antes.
            returnKeyType="send"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => enviarDoCampo()}
            keyboardAppearance={mode}
            selectionColor={colors.primary}
            accessibilityLabel={perguntando ? `Pergunta de sim ou não para ${nome}` : `Mensagem para ${nome}`}
            accessibilityHint={perguntando ? 'A pergunta aparece grande na tela do computador, com o não e o sim dos lados' : 'O texto é falado e mostrado na tela do computador'}
            maxFontSizeMultiplier={1.6}
          />
          <PressableScale
            onPress={() => enviarDoCampo()}
            disabled={!podeEnviar}
            haptic="medium"
            accessibilityRole="button"
            accessibilityLabel={perguntando ? 'Enviar pergunta' : 'Enviar'}
            accessibilityHint={perguntando ? 'Envia a pergunta para a tela do computador' : 'Envia para ser falado na tela'}
            accessibilityState={{ disabled: !podeEnviar }}
            style={[styles.sendBtn, { backgroundColor: podeEnviar ? colors.primaryStrong : colors.surface }]}
          >
            <Ionicons name="send" size={sizes.icon.md} color={podeEnviar ? colors.onPrimary : colors.textMuted} />
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, onPress, nome }: { label: string; onPress: () => void; nome: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} haptic="medium" accessibilityRole="button" accessibilityLabel={`Enviar “${label}” para ${nome}`} style={[styles.chip, { backgroundColor: colors.surfaceRaised }]}>
      <Text variant="bodySmall" weight="semibold">
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
 * paciente ("Estou bem", enviado pela tela do computador): teal, com remetente
 * e hora. Do servidor (escalonamento sem confirmação): âmbar, com alerta.
 */
function SystemNote({ m, nome, nova }: { m: Message; nome: string; nova: boolean }) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const doPaciente = m.sender === 'paciente';
  const fg = doPaciente ? colors.accentText : colors.warningText;
  const icon: keyof typeof Ionicons.glyphMap = doPaciente ? 'checkmark-circle' : 'alert-circle';
  const remetente = doPaciente ? nome : 'IrisFlow';
  return (
    <Animated.View
      entering={nova ? entrada.suave() : undefined}
      style={[styles.systemNote, { backgroundColor: colors.surface }]}
      accessible
      accessibilityLabel={`${remetente}: ${m.text}, às ${hm(m.created_at)}`}
    >
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
 * Uma linha da conversa (mock 07): o que {nome} escreveu com o olhar num balão
 * à esquerda — a última fala maior, em Sora —; o que o cuidador manda, balão
 * azul à direita, com o estado do envio embaixo.
 */
function Linha({ m, nome, respostaDe, nova, grande, onTentarDeNovo }: { m: Message; nome: string; respostaDe: Map<string, Message>; nova: boolean; grande: boolean; onTentarDeNovo: () => void }) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const mine = m.sender === 'cuidador';

  if (m.kind === 'sistema') return <SystemNote m={m} nome={nome} nova={nova} />;
  // Pergunta sim/não do cuidador e a resposta do paciente a ela (21/10/2026).
  if (ehPerguntaSimNao(m)) return <CartaoDaPergunta m={m} resposta={respostaDe.get(m.id) ?? null} nome={nome} />;
  const resposta = lerResposta(m);
  if (resposta?.pergunta) return <CartaoDaResposta m={m} lado={resposta.resposta} pergunta={resposta.pergunta} nome={nome} />;

  const sim = m.kind === 'simnao' && m.text.trim().toLowerCase().startsWith('s');
  const tipo = !mine && m.kind === 'frase' ? 'frase pronta' : !mine && m.kind === 'pictograma' ? 'pictograma' : null;
  const envio = mine ? estadoDoEnvio(m) : null;
  const rotulo = `${mine ? 'Você' : nome}${tipo ? `, ${tipo}` : ''}: ${m.text}. ${hm(m.created_at)}${envio ? `, ${envio.texto}` : ''}`;
  const corDoEnvio = envio?.tom === 'accent' ? colors.accentText : envio?.tom === 'danger' ? colors.dangerText : colors.textMuted;

  return (
    <Animated.View entering={nova ? entrada.mensagem(mine) : undefined} layout={entrada.layout()} style={[styles.linha, mine && styles.linhaMinha]}>
      {mine ? (
        <PressableScale
          disabled={m.envio !== 'falhou'}
          onPress={onTentarDeNovo}
          haptic={m.envio === 'falhou' ? 'medium' : false}
          accessibilityRole={m.envio === 'falhou' ? 'button' : undefined}
          accessibilityLabel={rotulo}
          accessibilityHint={m.envio === 'falhou' ? 'Toque para enviar de novo' : undefined}
          style={styles.colMinha}
          testID={m.envio ? `balao-${m.envio}` : undefined}
        >
          <View style={[styles.balao, styles.balaoMeu, { backgroundColor: colors.primaryStrong, opacity: m.envio === 'enviando' ? 0.75 : 1 }]}>
            <Text variant="body" tone="onPrimary">
              {m.text}
            </Text>
          </View>
          <View style={[styles.meta, styles.metaMinha]}>
            {m.envio === 'falhou' ? <Ionicons name="refresh" size={sizes.icon.xs} color={corDoEnvio} /> : m.spoken ? <Ionicons name="volume-high" size={sizes.icon.xs} color={corDoEnvio} /> : null}
            <Text variant="caption" weight={envio?.tom === 'muted' ? 'medium' : 'semibold'} style={{ color: corDoEnvio }}>
              {envio?.texto}
            </Text>
          </View>
        </PressableScale>
      ) : (
        <View style={styles.colDele} accessible accessibilityLabel={rotulo}>
          <View style={[styles.balao, styles.balaoDele, { backgroundColor: colors.surface }]}>
            {m.kind === 'simnao' ? (
              <View style={styles.simNao}>
                <Ionicons name={sim ? 'checkmark-circle' : 'close-circle'} size={sizes.icon.xl} color={sim ? colors.accentText : colors.dangerText} />
                <Text variant="display" style={{ color: sim ? colors.accentText : colors.dangerText }}>
                  {m.text}
                </Text>
              </View>
            ) : (
              <Text variant={grande ? 'fala' : 'body'} weight={grande ? 'headingSemibold' : undefined}>
                {m.text}
              </Text>
            )}
          </View>
          <Text variant="caption" tone="muted" style={styles.metaDele}>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: layout.gutter, paddingBottom: spacing.md, borderBottomWidth: sizes.border },
  headerWho: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.touch },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xxs },
  dot: { width: sizes.dot, height: sizes.dot, borderRadius: radius.pill },
  listContent: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, gap: spacing.md, flexGrow: 1 },
  day: { alignSelf: 'center', marginVertical: spacing.xs },
  systemNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg },
  linha: { flexDirection: 'row' },
  linhaMinha: { justifyContent: 'flex-end' },
  colMinha: { maxWidth: '80%', alignItems: 'flex-end' },
  colDele: { maxWidth: '84%', alignItems: 'flex-start' },
  balao: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg },
  balaoMeu: { borderBottomRightRadius: radius.xs },
  balaoDele: { borderBottomLeftRadius: radius.xs },
  simNao: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaDele: { marginTop: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  metaMinha: { justifyContent: 'flex-end' },
  composer: { paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  aviso: { paddingHorizontal: layout.gutter },
  chips: { paddingHorizontal: layout.gutter, gap: spacing.sm },
  chip: { minHeight: sizes.touch - spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm + 2, paddingHorizontal: layout.gutter },
  input: {
    flex: 1,
    minHeight: sizes.button.md,
    maxHeight: sizes.composerMax,
    borderRadius: radius.xl - 4,
    borderWidth: sizes.borderThick,
    paddingHorizontal: spacing.lg + 2,
    paddingTop: spacing.md + 2,
    paddingBottom: spacing.md + 2,
    fontFamily: fonts.regular,
    fontSize: typeScale.body.fontSize,
  },
  sendBtn: { width: sizes.button.md, height: sizes.button.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
