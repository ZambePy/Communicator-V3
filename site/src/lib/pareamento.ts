/* ============================================================
   Código do QR que conecta o celular do cuidador (pedido do dono de
   19/10/2026: "conectar o celular do cuidador por QR code, sem digitar
   código nem senha").

   O computador do paciente mostra um QR com o endereço
   /parear#t=<código>. A página /parear (pages/Parear.tsx) é só a ponte
   até o app do cuidador: abre `irisflow://parear?t=<código>` e, se o app
   não abrir, explica e oferece o download.

   O código abre a conta da família por até 3 minutos. Por isso:
   - vem no FRAGMENTO (#t=), que o navegador nunca manda ao servidor: não
     aparece no log da hospedagem nem no cabeçalho Referer dos arquivos
     que a página carrega;
   - é lido e TIRADO da barra de endereço antes de o React montar
     (capturarCodigoDoEndereco, chamada no main.tsx). Assim as
     estatísticas (o beacon do Cloudflare lê o endereço, e só carrega
     depois do primeiro desenho) e o histórico do navegador ficam com
     "/parear", sem o código;
   - fica só na memória desta aba: nada de localStorage, sessionStorage
     ou cookie;
   - a página não faz pedido nenhum com ele. Quem o troca pela conta é o
     app (Edge Function parear-celular).
   ============================================================ */

import { PACOTE_ANDROID } from './lojas'

/** 32 bytes em base64url: 43 caracteres (o formato de supabase/functions/desktop-sync/codigoDoCelular.ts). */
export const FORMATO_DO_CODIGO = /^[A-Za-z0-9_-]{43}$/

export const ROTA_DO_PAREAMENTO = '/parear'

/** Marca do endereço de volta quando o Android não acha o app (S.browser_fallback_url). */
export const MARCA_SEM_APP = '#sem-app'

let capturado: string | null = null

/** O valor de `t` no fragmento (`#t=…`) ou, por garantia, na busca (`?t=…`). */
function valorDeT(hash: string, search: string): string | null {
  const doFragmento = new URLSearchParams(hash.replace(/^#/, '')).get('t')
  if (doFragmento !== null) return doFragmento
  return new URLSearchParams(search).get('t')
}

/** O código do endereço, se tiver o formato certo (nada fora dele chega a um link). */
export function lerCodigo(hash: string, search: string): string | null {
  const t = valorDeT(hash, search)
  return t !== null && FORMATO_DO_CODIGO.test(t) ? t : null
}

/**
 * Na rota /parear: guarda o código na memória e o apaga da barra de endereço
 * (history.replaceState — sem recarregar e sem entrada nova no histórico).
 * Chamada no main.tsx, antes de o React montar: nem as estatísticas nem o
 * roteador chegam a ver o código. Endereço com `t=` fora do formato também é
 * limpo (nunca fica nada parecido com um código na barra).
 */
export function capturarCodigoDoEndereco(janela: Pick<Window, 'location' | 'history'> = window): void {
  const { pathname, hash, search } = janela.location
  if (pathname.replace(/\/+$/, '') !== ROTA_DO_PAREAMENTO) return
  if (valorDeT(hash, search) === null) return
  capturado = lerCodigo(hash, search)
  janela.history.replaceState(janela.history.state, '', ROTA_DO_PAREAMENTO)
}

/** O código lido do endereço nesta aba (ou null: aberta sem código, ou recarregada). */
export function codigoCapturado(): string | null {
  return capturado
}

/** Só para os testes. */
export function esquecerCodigo(): void {
  capturado = null
}

function exigirFormato(codigo: string): string {
  if (!FORMATO_DO_CODIGO.test(codigo)) throw new Error('código de pareamento fora do formato')
  return codigo
}

/** O link do app (scheme `irisflow`, app/app.json). */
export function linkDoApp(codigo: string): string {
  return `irisflow://parear?t=${exigirFormato(codigo)}`
}

/**
 * No Android, o mesmo link como "intent" com o PACOTE do app: só o IrisFlow
 * Cuidador o recebe — outro app instalado que diga tratar `irisflow://` não
 * pega o código no caminho. Sem o app, o Chrome volta para `voltarPara`
 * (esta página com #sem-app), que explica e oferece o download. O formato do
 * código é conferido antes: um `;` ou `#` mudaria o sentido do intent.
 */
export function linkDoAndroid(codigo: string, voltarPara: string): string {
  return (
    `intent://parear?t=${exigirFormato(codigo)}#Intent;scheme=irisflow;package=${PACOTE_ANDROID};` +
    `S.browser_fallback_url=${encodeURIComponent(voltarPara)};end`
  )
}

/**
 * Navegador por dentro de outro app (Instagram, Facebook, Line, WebView):
 * costuma não abrir outro app nem baixar arquivo, e alguns injetam scripts
 * na página. A página pede para ler o código de novo pela câmera do celular.
 */
export function emNavegadorDeOutroApp(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|; wv\)/i.test(ua)
}

/** Abre o link do app (separada para os testes trocarem). */
export function abrirNoApp(link: string): void {
  window.location.href = link
}
