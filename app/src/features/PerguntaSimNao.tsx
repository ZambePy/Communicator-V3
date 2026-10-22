import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { Notice, PressableScale, Text } from '@/components';
import type { Message } from '@/data/types';
import { radius, sizes, spacing, useEntrada, useTheme } from '@/theme';
import { hm } from '@/utils/format';
import { lerResposta, MAXIMO_DA_PERGUNTA, type LadoDaResposta } from '@/utils/perguntaSimNao';

/**
 * Pergunta sim/não do cuidador na Conversa (pedido de 21/10/2026): compor a
 * pergunta e mostrar a resposta ligada a ela. A pergunta aparece grande na
 * tela do computador, e o paciente responde olhando para um lado — NÃO à
 * esquerda, SIM à direita.
 */

const PALAVRA: Record<LadoDaResposta, string> = { sim: 'SIM', nao: 'NÃO' };

/** O chip que liga o campo para uma pergunta de sim ou não (e desliga, se tocado de novo). */
export function ChipDaPergunta({ ativo, onPress, disabled, nome }: { ativo: boolean; onPress: () => void; disabled?: boolean; nome: string }) {
  const { colors } = useTheme();
  const fg = ativo ? colors.onPrimary : colors.primary;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={`Escrever uma pergunta de sim ou não para ${nome}`}
      accessibilityState={{ selected: ativo, disabled }}
      style={[styles.chip, { backgroundColor: ativo ? colors.primaryStrong : colors.surfaceAlt }]}
    >
      <Ionicons name="help-circle-outline" size={sizes.icon.sm} color={fg} />
      <Text variant="bodySmall" weight="semibold" style={{ color: fg }}>
        Pergunta sim/não
      </Text>
    </PressableScale>
  );
}

/** A explicação, logo acima do campo, enquanto ele está no modo pergunta. */
export function DicaDaPergunta({ nome }: { nome: string }) {
  return (
    <Text variant="caption" tone="muted" style={styles.dica}>
      {nome} vê a pergunta grande na tela do computador e responde olhando para um lado: esquerda é NÃO, direita é SIM.
    </Text>
  );
}

/**
 * O texto que já estava no campo passa do limite da pergunta: o envio fica
 * desligado e o aviso diz quanto passa. Nada é apagado sem o cuidador ver; ele
 * apaga o excesso, ou desliga o chip e manda como mensagem.
 */
export function AvisoDoLimiteDaPergunta({ excesso }: { excesso: number }) {
  const letras = excesso === 1 ? 'letra' : 'letras';
  return (
    <Notice
      tone="warning"
      title="Pergunta comprida demais"
      text={`A pergunta aceita até ${MAXIMO_DA_PERGUNTA} letras, e este texto passa em ${excesso}. Apague ${excesso} ${letras} para enviar, ou desligue “Pergunta sim/não” para mandar como mensagem.`}
      style={styles.aviso}
      testID="aviso-do-limite-da-pergunta"
    />
  );
}

/**
 * A pergunta que o cuidador mandou, no lado dele da conversa, com o que
 * aconteceu: respondida (e com qual resposta), ou ainda esperando.
 */
export function CartaoDaPergunta({ m, resposta, nome }: { m: Message; resposta: Message | null; nome: string }) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const lado = resposta ? lerResposta(resposta)?.resposta ?? null : null;
  const estado = lado
    ? `Respondida: ${PALAVRA[lado]}, às ${hm(resposta!.created_at)}`
    : m.spoken
      ? 'Mostrada na tela, sem resposta'
      : `Esperando a resposta de ${nome}`;
  const cor = lado === 'sim' ? colors.accentText : lado === 'nao' ? colors.dangerText : colors.textMuted;
  return (
    <Animated.View
      entering={entrada.suave()}
      testID="pergunta-sim-nao"
      style={styles.linhaMinha}
      accessible
      accessibilityLabel={`Você perguntou: ${m.text}. ${estado}. ${hm(m.created_at)}`}
    >
      <View style={styles.colMinha}>
        <View style={[styles.meta, styles.metaMinha]}>
          <Ionicons name="help-circle" size={sizes.icon.xs} color={colors.primary} />
          <Text variant="caption" tone="primary" weight="semibold">
            Pergunta de sim ou não
          </Text>
        </View>
        <View style={[styles.balao, { backgroundColor: colors.primaryStrong }]}>
          <Text variant="body" tone="onPrimary">
            {m.text}
          </Text>
        </View>
        <View style={[styles.meta, styles.metaMinha]}>
          <Text variant="caption" tone="muted">
            {hm(m.created_at)}
          </Text>
          <Ionicons name={lado === 'sim' ? 'checkmark-circle' : lado === 'nao' ? 'close-circle' : 'time-outline'} size={sizes.icon.xs} color={cor} />
          <Text variant="caption" weight={lado ? 'semibold' : undefined} style={{ color: cor }}>
            {estado}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * A resposta do paciente a uma pergunta, em destaque: o SIM ou o NÃO grande,
 * com a pergunta que ela responde citada logo acima — no lugar da conversa em
 * que ela chegou, onde o cuidador está olhando.
 */
export function CartaoDaResposta({ m, lado, pergunta, nome }: { m: Message; lado: LadoDaResposta; pergunta: string; nome: string }) {
  const { colors } = useTheme();
  const entrada = useEntrada();
  const sim = lado === 'sim';
  const fg = sim ? colors.accentText : colors.dangerText;
  return (
    <Animated.View
      entering={entrada.suave()}
      testID="resposta-da-pergunta"
      style={[styles.resposta, { backgroundColor: sim ? colors.accentTint : colors.dangerTint, borderLeftColor: sim ? colors.accent : colors.danger }]}
      accessible
      accessibilityLabel={`${nome} respondeu ${PALAVRA[lado]} à sua pergunta: ${pergunta}. ${hm(m.created_at)}`}
    >
      <Text variant="caption" weight="semibold" style={{ color: fg }}>
        {nome} respondeu à sua pergunta
      </Text>
      <Text variant="bodySmall" tone="muted" style={styles.citacao}>
        {`“${pergunta}”`}
      </Text>
      <View style={styles.simNao}>
        <Ionicons name={sim ? 'checkmark-circle' : 'close-circle'} size={sizes.icon.xl} color={fg} />
        <Text variant="display" style={{ color: fg }}>
          {PALAVRA[lado]}
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        {hm(m.created_at)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radius.md },
  dica: { paddingHorizontal: spacing.lg },
  aviso: { marginHorizontal: spacing.lg },
  linhaMinha: { flexDirection: 'row', justifyContent: 'flex-end' },
  colMinha: { maxWidth: '82%' },
  balao: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, borderBottomRightRadius: radius.xs },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.xs, paddingHorizontal: spacing.xs },
  metaMinha: { justifyContent: 'flex-end' },
  resposta: { alignSelf: 'stretch', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderLeftWidth: sizes.accentBar },
  citacao: { fontStyle: 'italic' },
  simNao: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
