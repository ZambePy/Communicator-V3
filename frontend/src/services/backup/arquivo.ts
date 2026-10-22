/**
 * O arquivo de backup em si (rodada 3, 21/10/2026): o nome, o download e a
 * leitura do arquivo que a pessoa escolhe para restaurar.
 */

import { TAMANHO_MAXIMO_DO_BACKUP_BYTES } from '@tracker/backup/protocolo';
import { ErroDeBackup } from './erro';
import { TAMANHO_MAXIMO_EM_MB } from './formato';

const doisDigitos = (n: number): string => String(n).padStart(2, '0');

/** Data e hora de AQUI: quem salvou às 22h de 21/10 não pode ler 22/10 só porque em UTC já virou. */
function dataLocal(d: Date): string {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

export function nomeDoArquivoDeBackup(agora: Date): string {
  return `irisflow-backup-${dataLocal(agora)}.json`;
}

/** A cópia que o navegador baixa antes de restaurar: leva a hora, porque podem ser duas no mesmo dia. */
export function nomeDaCopiaBaixada(agora: Date): string {
  return `irisflow-copia-de-seguranca-${dataLocal(agora)}-${doisDigitos(agora.getHours())}${doisDigitos(agora.getMinutes())}.json`;
}

/** Baixa o texto como arquivo. No aplicativo instalado, o sistema abre o "Salvar como". */
export function baixarTexto(nome: string, texto: string): void {
  const blob = new Blob([texto], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Lê o arquivo escolhido e devolve o conteúdo (ainda sem confiar nele: quem
 * decide se é um backup é `validarBackup`). Recusa pelo tamanho ANTES de abrir:
 * carregar centenas de MB na memória para depois recusar trava a tela.
 */
export async function lerArquivoDeBackup(arquivo: Pick<File, 'size' | 'text'>): Promise<unknown> {
  if (arquivo.size > TAMANHO_MAXIMO_DO_BACKUP_BYTES) {
    throw new ErroDeBackup('grande-demais', `Este arquivo é grande demais para ser um backup do IrisFlow (o máximo é ${TAMANHO_MAXIMO_EM_MB} MB).`);
  }
  let texto: string;
  try {
    texto = await arquivo.text();
  } catch (e) {
    console.warn('[backup] não foi possível abrir o arquivo escolhido:', e);
    throw new ErroDeBackup('invalido', 'Não foi possível abrir o arquivo escolhido. Tente de novo.');
  }
  try {
    // O Bloco de Notas põe um BOM no começo ao salvar; JSON.parse não o aceita.
    return JSON.parse(texto.replace(/^\uFEFF/, '')) as unknown;
  } catch {
    throw new ErroDeBackup('invalido', 'Este arquivo não é um backup do IrisFlow: o conteúdo está ilegível ou foi cortado.');
  }
}
