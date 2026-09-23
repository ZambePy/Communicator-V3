import * as Updates from 'expo-updates';
import { appVersion } from './config';

/**
 * Linha "sobre" do rodapé dos Ajustes: versão de loja + de onde veio o JS.
 * Suporte precisa disso para saber se o cuidador está com a atualização OTA
 * (EAS Update) mais recente ou ainda com o código embutido no build.
 *
 *   "1.0.0"                              → dev / Expo Go / updates desligado
 *   "1.0.0 · production · embutida"      → build de loja, sem OTA aplicada
 *   "1.0.0 · production · a1b2c3d4"      → rodando a atualização a1b2c3d4…
 */
export function buildInfo(): string {
  const partes = [appVersion()];
  if (Updates.isEnabled) {
    if (Updates.channel) partes.push(Updates.channel);
    partes.push(Updates.isEmbeddedLaunch || !Updates.updateId ? 'embutida' : Updates.updateId.slice(0, 8));
  }
  return partes.join(' · ');
}
