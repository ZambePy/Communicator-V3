import * as Haptics from 'expo-haptics';

/**
 * Retorno tátil com nome de intenção, para as telas não escolherem estilo a esmo.
 * Todas as chamadas engolem a rejeição: aparelho sem motor de vibração, web ou
 * permissão ausente não podem derrubar a ação que pediu o toque.
 */
export const haptics = {
  /** Toque comum em botão ou item. */
  toque() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  /** Ação principal (enviar, entrar, confirmar). */
  firme() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  },
  /** Mudou a seleção (seletor segmentado, sensibilidade, tema). */
  selecao() {
    Haptics.selectionAsync().catch(() => undefined);
  },
  /** Deu certo e ficou gravado. */
  sucesso() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  /** Atenção: aviso da sessão, remoção. */
  aviso() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  },
  /** Falhou, ou pedido de socorro. */
  erro() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  },
};

/**
 * Ids das mensagens que já vibraram neste celular. A mesma mensagem pode chegar
 * por dois caminhos quase juntos (o tempo real e o push com a Conversa aberta):
 * ela vibra uma vez só.
 */
const vibradas: string[] = [];

/** Mensagem nova do paciente: vibra uma vez por mensagem. Devolve se vibrou agora. */
export function vibrarPorMensagem(id: string | null | undefined): boolean {
  if (!id || vibradas.includes(id)) return false;
  vibradas.push(id);
  if (vibradas.length > 50) vibradas.shift();
  haptics.sucesso();
  return true;
}
