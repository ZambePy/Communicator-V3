/**
 * Captura da tela inicial do app desktop (menu do paciente) para o hero da
 * home — as imagens de public/produto/ e as caixas dos botões que a
 * ilustração (src/components/sections/GazeStory.tsx) mira.
 *
 * Refaça quando o layout do menu mudar. O código do produto não é tocado:
 * a captura roda numa CÓPIA do app, no build de produção, sem .env (o app
 * usa então o serviço local de licença e a conta de teste dele).
 *
 * 1. Cópia do app, fora do repositório (sem node_modules, dist e .env*):
 *
 *      mkdir -p /tmp/irisflow-snap && cd <raiz do repositório>
 *      tar --exclude=node_modules --exclude=dist --exclude='.env*' \
 *        -cf - frontend src package.json tsconfig.json | tar -xf - -C /tmp/irisflow-snap
 *      ln -s "$PWD/node_modules" /tmp/irisflow-snap/node_modules
 *      ln -s "$PWD/frontend/node_modules" /tmp/irisflow-snap/frontend/node_modules
 *
 * 2. Build e servidor da cópia:
 *
 *      cd /tmp/irisflow-snap/frontend && npx vite build
 *      npx vite preview --port 4190 --strictPort --host 127.0.0.1
 *
 * 3. Um vídeo curto com um rosto, para a câmera falsa do Chromium. Sem rosto
 *    o app mostra "Rosto não encontrado" e esmaece a interface. Qualquer foto
 *    de rosto de frente serve (use uma com autorização; o vídeo fica só na
 *    máquina). O ruído e o leve balanço evitam um quadro congelado:
 *
 *      FILTRO="scale=680:510:force_original_aspect_ratio=increase,crop=680:510"
 *      FILTRO="$FILTRO,crop=640:480:'20+6*sin(n/5)':'15+4*cos(n/7)',noise=alls=6:allf=t,format=yuv420p"
 *      ffmpeg -loop 1 -i rosto.jpg -t 2 -r 30 -vf "$FILTRO" /tmp/irisflow-snap/rosto.y4m
 *
 * 4. A captura, de dentro de site/ (Playwright não é dependência do site;
 *    use uma instalação existente, por exemplo
 *    `npm i -g playwright && npx playwright install chromium`):
 *
 *      ROSTO_Y4M=/tmp/irisflow-snap/rosto.y4m \
 *      PLAYWRIGHT_MODULE="$(npm root -g)/playwright" \
 *      node scripts/capturar-tela-do-app.mjs
 *
 *    O caminho é o do produto — apresentação, login, ativação, termo e
 *    cadastro do paciente — e termina com a navegação interna para o menu:
 *    no primeiro uso o app seguiria para o preparo do ambiente e a
 *    calibração, que não dá para fazer com câmera falsa (e, no navegador, a
 *    licença local não sobrevive a um recarregamento). Por isso o menu
 *    aparece como "Sem calibração".
 *
 * Saída: public/produto/tela-inicial-1600.webp e -800.webp (WebP sem
 * metadados) e, no terminal, o bloco BOTOES para colar no GazeStory.tsx.
 */

import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const APP = process.env.APP_URL || 'http://127.0.0.1:4190/'
const ROSTO = process.env.ROSTO_Y4M
// Conta de teste do serviço local de licença do app (só existe sem as
// variáveis do Supabase no build).
const EMAIL = process.env.APP_EMAIL || 'admin@irisflow.com'
const SENHA = process.env.APP_SENHA || 'irisflow2026'
const SAIDA = resolve(process.cwd(), 'public/produto')
const TELA = { w: 1600, h: 900 }

/** Botões do menu (prefixo do aria-label, que é "Título: descrição"). */
const BOTOES = {
  comunicacao: 'Comunicação',
  teclado: 'Teclado Virtual',
  computador: 'Computador',
  configuracoes: 'Configurações',
  lazer: 'Lazer e bem-estar',
  conversa: 'Conversa',
  descanso: 'Modo Descanso',
  voz: 'Controle de Voz',
  acessibilidade: 'Acessibilidade',
}

if (!ROSTO) {
  console.error('Defina ROSTO_Y4M com o vídeo do rosto (passo 3 no início deste arquivo).')
  process.exit(1)
}

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${ROSTO}`,
  ],
})
const context = await browser.newContext({
  viewport: { width: TELA.w, height: TELA.h },
  deviceScaleFactor: 2,
  locale: 'pt-BR',
  colorScheme: 'dark',
})
const page = await context.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(e.message))

// Cada tela tem animação de entrada: esperar a rota e um instante antes de
// agir evita cliques que caem na transição.
const pausa = () => page.waitForTimeout(900)

await page.goto(APP, { waitUntil: 'networkidle' })
const comecar = page.getByRole('button', { name: 'Começar' })
await comecar.waitFor({ timeout: 20000 })
await pausa()
await comecar.click()
await page.getByLabel('E-mail').waitFor()
await pausa()
await page.getByLabel('E-mail').fill(EMAIL)
await page.getByLabel('Senha', { exact: true }).fill(SENHA)
await page.getByRole('button', { name: 'Entrar', exact: true }).click()
await page.waitForURL(/#\/activated/, { timeout: 20000 })
await pausa()
await page.getByRole('button', { name: 'Continuar' }).click()
await page.waitForURL(/#\/consent/, { timeout: 20000 })
await pausa()
await page.getByLabel(/Li e concordo/).check()
await page.getByRole('button', { name: 'Concordar e continuar' }).click()
await page.waitForURL(/#\/profiles/, { timeout: 20000 })
await pausa()
await page.getByRole('button', { name: 'Novo paciente' }).click()
await pausa()
await page.getByLabel(/^Nome/).fill('João')
await page.getByLabel(/^Condição/).fill('ELA')
await page.getByRole('button', { name: 'Criar perfil' }).click()
await pausa()
await page.getByRole('button', { name: /João|Iniciar sessão/ }).first().click()
await page.waitForTimeout(3000)

// Navegação interna (mesmo documento), a mesma que o app faz ao ir ao menu.
await page.evaluate(() => {
  window.location.hash = '#/menu'
})
await page.waitForURL(/#\/menu/, { timeout: 20000 })
await page.getByRole('button', { name: /^Comunicação:/ }).waitFor()
await page.waitForFunction(() => document.documentElement.dataset.gaze === 'ok', null, { timeout: 30000 })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(2500) // entrada da rota e selos assentados

const sobreposicoes = await page.evaluate(() =>
  [...document.querySelectorAll('[role=alert],[role=dialog],[role=status]')]
    .filter((e) => e.offsetParent !== null)
    .map((e) => (e.textContent || '').trim().slice(0, 80)),
)
if (sobreposicoes.length || erros.length) {
  console.error('A tela não está limpa:', JSON.stringify({ sobreposicoes, erros }))
  await browser.close()
  process.exit(1)
}

const png = await page.screenshot()

const caixas = {}
for (const [id, nome] of Object.entries(BOTOES)) {
  const c = await page.getByRole('button', { name: new RegExp(`^${nome}:`) }).boundingBox()
  const f = (v, total) => +(v / total).toFixed(4)
  caixas[id] = { x: f(c.x, TELA.w), y: f(c.y, TELA.h), w: f(c.width, TELA.w), h: f(c.height, TELA.h) }
}

// WebP pelo próprio Chromium: reduz pela metade a cada passo (3200 → 1600
// → 800), o que preserva o texto.
const conversor = await context.newPage()
const webp = await conversor.evaluate(async (b64) => {
  const img = new Image()
  img.src = `data:image/png;base64,${b64}`
  await img.decode()
  let origem = img
  const out = {}
  for (const w of [1600, 800]) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = Math.round((w * img.naturalHeight) / img.naturalWidth)
    const g = c.getContext('2d', { alpha: false })
    g.imageSmoothingQuality = 'high'
    g.drawImage(origem, 0, 0, c.width, c.height)
    out[w] = c.toDataURL('image/webp', 0.9).split(',')[1]
    origem = c
  }
  return out
}, png.toString('base64'))

/**
 * O codificador do Chromium embute um perfil de cor (bloco ICCP). Sem
 * transparência nem animação, o WebP volta ao formato simples: cabeçalho e
 * o bloco da imagem, nenhum metadado.
 */
function semMetadados(arquivo) {
  const blocos = []
  for (let i = 12; i < arquivo.length; ) {
    const tamanho = arquivo.readUInt32LE(i + 4)
    const fim = i + 8 + tamanho + (tamanho & 1)
    blocos.push({ tipo: arquivo.toString('ascii', i, i + 4), dados: arquivo.subarray(i, fim) })
    i = fim
  }
  const imagem = blocos.filter((b) => b.tipo === 'VP8 ' || b.tipo === 'VP8L')
  if (imagem.length !== 1 || blocos.some((b) => b.tipo === 'ALPH' || b.tipo === 'ANIM')) {
    throw new Error(`WebP inesperado: ${blocos.map((b) => b.tipo).join(', ')}`)
  }
  const cabecalho = Buffer.alloc(12)
  cabecalho.write('RIFF', 0, 'ascii')
  cabecalho.writeUInt32LE(4 + imagem[0].dados.length, 4)
  cabecalho.write('WEBP', 8, 'ascii')
  return Buffer.concat([cabecalho, imagem[0].dados])
}

for (const w of [1600, 800]) {
  const arquivo = resolve(SAIDA, `tela-inicial-${w}.webp`)
  const dados = semMetadados(Buffer.from(webp[w], 'base64'))
  writeFileSync(arquivo, dados)
  console.log(`${arquivo}: ${Math.round(dados.length / 1024)} KB`)
}

console.log('\nCaixas dos botões (fração da tela) para o BOTOES do GazeStory.tsx:')
for (const [id, c] of Object.entries(caixas)) {
  console.log(`  ${id}: { x: ${c.x}, y: ${c.y}, w: ${c.w}, h: ${c.h} },`)
}

await browser.close()
