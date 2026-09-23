/**
 * Verificação da conexão com o Supabase (e dos instaladores no GitHub).
 *
 *   npm run check
 *
 * Lê o .env.local (ou o .env), bate no projeto e diz o que está pronto e
 * o que falta. Não escreve nada no banco: só consultas de leitura e a
 * configuração pública de autenticação. O esquema vem das migrações de
 * ../supabase/migrations/ (README da raiz, seção "Supabase (supabase/)").
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const RAIZ = process.cwd()

/* ---------- saída ---------- */
const cor = (c, t) => `\x1b[${c}m${t}\x1b[0m`
const ok = (t) => console.log(`${cor(32, '  ok  ')} ${t}`)
const falha = (t) => console.log(`${cor(31, ' falha')} ${t}`)
const aviso = (t) => console.log(`${cor(33, ' aviso')} ${t}`)
/** O que a chave anônima não consegue conferir, mas precisa estar certo no painel. */
const info = (t) => console.log(`${cor(36, '  info')} ${t}`)
const titulo = (t) => console.log(`\n${cor(1, t)}`)

let problemas = 0
let encerrar = false
const registrar = (grave, texto) => {
  if (grave) {
    problemas += 1
    falha(texto)
  } else {
    aviso(texto)
  }
}

/* ---------- 1. variáveis de ambiente ---------- */
titulo('1. Variáveis de ambiente')

function lerEnv() {
  // .env.local tem precedência sobre .env, como no Vite
  const vars = {}
  for (const nome of ['.env', '.env.local']) {
    const caminho = resolve(RAIZ, nome)
    if (!existsSync(caminho)) continue
    for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  return vars
}

const env = lerEnv()
const url = env.VITE_SUPABASE_URL
const chave = env.VITE_SUPABASE_ANON_KEY

if (!existsSync(resolve(RAIZ, '.env.local')) && !existsSync(resolve(RAIZ, '.env'))) {
  falha('Nem .env.local nem .env existem. Rode: cp .env.example .env.local')
  process.exit(1)
}

if (!url) {
  falha('VITE_SUPABASE_URL vazia no .env.local / .env')
} else if (/\/rest\/v1/.test(url)) {
  registrar(
    true,
    'VITE_SUPABASE_URL tem /rest/v1 no fim. Use só a URL do projeto: ' +
      url.replace(/\/rest\/v1\/?$/, ''),
  )
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  registrar(true, `VITE_SUPABASE_URL com formato estranho: ${url}`)
} else {
  ok(`VITE_SUPABASE_URL = ${url}`)
}

if (!chave) {
  falha('VITE_SUPABASE_ANON_KEY vazia no .env.local / .env')
} else if (chave.includes('service_role')) {
  falha('VITE_SUPABASE_ANON_KEY parece ser a service_role. NUNCA use ela aqui: ela ignora a RLS e iria para o bundle público.')
} else {
  ok(`VITE_SUPABASE_ANON_KEY = ${chave.slice(0, 12)}… (${chave.length} caracteres)`)
}

if (!url || !chave) {
  console.log('\nPreencha as duas em Project Settings > API e rode de novo.')
  process.exit(1)
}

const base = url.replace(/\/$/, '')
const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` }

async function pedir(caminho) {
  try {
    const r = await fetch(`${base}${caminho}`, { headers: cabecalhos })
    const texto = await r.text()
    let corpo = null
    try {
      corpo = JSON.parse(texto)
    } catch {
      corpo = texto
    }
    return { status: r.status, corpo }
  } catch (e) {
    return { status: 0, corpo: e.message }
  }
}

/* ---------- 2. o projeto responde ---------- */
titulo('2. Conexão')

// Não use /rest/v1/ como sonda: essa raiz só aceita a service_role e
// devolve 401 mesmo com a chave anônima correta.
const conf = await pedir('/auth/v1/settings')

if (conf.status === 0) {
  falha(`Não foi possível alcançar ${base} (${conf.corpo})`)
  console.log('\nConfira se a URL é a do projeto, sem /rest/v1 no fim.')
  process.exitCode = 1
  encerrar = true
} else if (conf.status === 401) {
  falha('O projeto respondeu 401: a chave anônima não confere com esta URL.')
  process.exitCode = 1
  encerrar = true
} else {
  ok(`o projeto respondeu (HTTP ${conf.status})`)
}

if (encerrar) {
  console.log(`\n${cor(31, 'Conexão falhou; as demais checagens foram puladas.')}`)
  process.exit()
}

/* ---------- 3. o esquema foi aplicado ---------- */
titulo('3. Esquema')

// As migrações de ../supabase/migrations/ entram na ordem do nome; a base
// (planos, perfis, assinaturas, RLS, RPCs do site) é a
// 20260923022346_schema_base.sql.
const MIGRACOES =
  'Aplique as migrações de supabase/migrations/ na ordem do nome ' +
  '(`supabase db push` com o projeto vinculado, ou cada arquivo no SQL Editor).'

const planos = await pedir('/rest/v1/plans?select=id,name,price_brl,trial_days')
if (planos.status === 404 || planos.corpo?.code === '42P01') {
  registrar(true, `tabela \`plans\` não existe. ${MIGRACOES}`)
} else if (planos.status !== 200) {
  registrar(true, `leitura de \`plans\` falhou: ${JSON.stringify(planos.corpo)}`)
} else if (!Array.isArray(planos.corpo) || planos.corpo.length === 0) {
  registrar(
    true,
    '`plans` existe mas está vazia: o INSERT do fim de 20260923022346_schema_base.sql não rodou.',
  )
} else {
  const p = planos.corpo[0]
  ok(`plano encontrado: ${p.name}, R$ ${p.price_brl}, ${p.trial_days} dias de avaliação`)
}

/* ---------- 3b. instaladores (GitHub Releases) ----------
   Os botões de download do site não leem o banco: vêm do último release
   do GitHub (src/lib/releases.ts), e só os sistemas de
   VITE_RELEASES_AVAILABLE ganham botão. Aqui se confere se o release tem
   o arquivo de cada sistema liberado. Nada disto derruba a verificação:
   a API pública do GitHub tem limite de 60 pedidos por hora por IP. */
titulo('3b. Instaladores (GitHub Releases)')

// Os mesmos padrões de src/lib/releases.ts (DEFAULT_RELEASES_REPO e DEFAULT_AVAILABLE).
const repoCru = (env.VITE_RELEASES_REPO ?? '').trim()
const repoMatch = repoCru.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i)
const repo = repoMatch ? `${repoMatch[1]}/${repoMatch[2]}` : 'ZambePy/Blinkv1'
const liberados = new Set()
for (const parte of (env.VITE_RELEASES_AVAILABLE ?? '').toLowerCase().split(/[\s,;]+/)) {
  if (parte === 'windows' || parte === 'win') liberados.add('windows')
  else if (parte === 'macos' || parte === 'mac' || parte === 'osx') liberados.add('macos')
  else if (parte === 'linux') liberados.add('linux')
}
if (liberados.size === 0) liberados.add('windows')

const EXTENSOES = { windows: ['.exe'], macos: ['.dmg'], linux: ['.appimage', '.deb'] }
try {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (r.status === 404) {
    aviso(`${repo}: nenhum release publicado. Os botões de download mostram "Em breve".`)
  } else if (r.status === 403 || r.status === 429) {
    aviso('a API do GitHub recusou agora (limite de pedidos). Tente de novo mais tarde.')
  } else if (!r.ok) {
    aviso(`a API do GitHub respondeu HTTP ${r.status} para ${repo}.`)
  } else {
    const release = await r.json()
    const nomes = (release.assets ?? []).map((a) => String(a.name ?? '').toLowerCase())
    const tem = (os) => nomes.some((n) => EXTENSOES[os].some((e) => n.endsWith(e)))
    ok(`${repo}: último release ${release.tag_name ?? '(sem tag)'}`)
    for (const os of ['windows', 'macos', 'linux']) {
      if (liberados.has(os) && tem(os)) ok(`${os}: liberado e com instalador no release`)
      else if (liberados.has(os)) {
        aviso(`${os}: liberado em VITE_RELEASES_AVAILABLE, mas sem instalador no release (o botão mostra "Em breve").`)
      } else if (tem(os)) {
        info(`${os}: o release tem o arquivo, mas o sistema não está em VITE_RELEASES_AVAILABLE — o site segue dizendo "em preparação".`)
      }
    }
  }
} catch (e) {
  aviso(`não foi possível consultar o GitHub (${e.message}).`)
}

/* ---------- 4. RLS ---------- */
titulo('4. Row Level Security')

// A chave anônima não pode enxergar nada em profiles. Se vier linha, a
// RLS não está ligada e os dados dos assinantes estão abertos.
const perfis = await pedir('/rest/v1/profiles?select=id')
if (perfis.status === 200 && Array.isArray(perfis.corpo) && perfis.corpo.length > 0) {
  registrar(
    true,
    `GRAVE: a chave anônima leu ${perfis.corpo.length} linha(s) de \`profiles\`. ` +
      'A RLS não está ativa. Rode de novo a seção 14 de ' +
      'supabase/migrations/20260923022346_schema_base.sql.',
  )
} else if (perfis.status === 200) {
  ok('`profiles` não devolve nada para a chave anônima, como esperado')
} else if (perfis.status === 401 || perfis.status === 403) {
  ok('`profiles` bloqueada para a chave anônima')
} else {
  registrar(true, `resposta inesperada em \`profiles\`: ${JSON.stringify(perfis.corpo)}`)
}

const assinaturas = await pedir('/rest/v1/subscriptions?select=id')
if (assinaturas.status === 200 && Array.isArray(assinaturas.corpo) && assinaturas.corpo.length > 0) {
  registrar(true, 'GRAVE: `subscriptions` legível sem autenticação.')
} else {
  ok('`subscriptions` fechada para a chave anônima')
}

/* ---------- 5. autenticação ---------- */
titulo('5. Autenticação')

if (conf.status !== 200 || typeof conf.corpo !== 'object') {
  aviso('não foi possível ler a configuração de autenticação')
} else {
  if (conf.corpo.disable_signup) {
    registrar(true, 'cadastro desabilitado no projeto (Allow new users to sign up está off).')
  } else {
    ok('cadastro de novos usuários liberado')
  }

  // Na mesma tela do painel ficam dois interruptores, um logo abaixo do
  // outro: "Enable Email provider" (o de cima) precisa estar ligado; o de
  // baixo, "Confirm email", pode ficar como preferir (ver abaixo).
  if (conf.corpo.external?.email === false) {
    registrar(
      true,
      'O provedor de e-mail está DESLIGADO. Sem ele não há login por senha. ' +
        'Ligue "Enable Email provider" em Authentication > Sign In / Providers > Email ' +
        '(o interruptor de cima).',
    )
  } else {
    ok('provedor de e-mail e senha ativo')
  }

  // mailer_autoconfirm true = "Confirm email" desligado. Os dois modos
  // funcionam no site: desligado, a inscrição da beta segue direto; ligado,
  // o link do e-mail volta para /entrar e a inscrição é concluída na /beta.
  ok(
    conf.corpo.mailer_autoconfirm === true
      ? '"Confirm email" desligado: a inscrição da beta segue direto'
      : '"Confirm email" ligado: a inscrição termina depois do clique no link do e-mail',
  )

  // Valem nos dois modos (a recuperação de senha sempre manda e-mail), e a
  // chave anônima não consegue ler nenhum dos dois.
  info(
    'Authentication > URL Configuration: Site URL = a origem do site, e Redirect URLs com ' +
      '<site>/entrar e <site>/nova-senha (o "esqueci a senha" do site e o do app do cuidador ' +
      'levam para /nova-senha).',
  )
  info(
    'Authentication > Emails: sem SMTP próprio, o servidor padrão do Supabase tem limite ' +
      'baixo de envio e só entrega para endereços da equipe do projeto — isso vale para a ' +
      'confirmação de cadastro e para a recuperação de senha.',
  )
}

/* ---------- 6. funções ---------- */
titulo('6. Funções do banco')

// Sem sessão, a função tem que recusar com 28000. Um 404 aqui significa
// que ela não foi criada.
const rpc = await fetch(`${base}/rest/v1/rpc/request_cancellation`, {
  method: 'POST',
  headers: { ...cabecalhos, 'Content-Type': 'application/json' },
  body: '{}',
})
const rpcCorpo = await rpc.json().catch(() => ({}))

if (rpc.status === 404) {
  registrar(
    true,
    '`request_cancellation` não existe: 20260923022346_schema_base.sql não rodou até o fim.',
  )
} else if (rpcCorpo?.message?.includes('autenticado') || rpc.status === 401 || rpc.status === 403) {
  ok('as funções existem e recusam chamada sem autenticação')
} else {
  aviso(`resposta inesperada da RPC (HTTP ${rpc.status}): ${JSON.stringify(rpcCorpo)}`)
}

/* ---------- resultado ---------- */
console.log()
if (problemas === 0) {
  console.log(cor(32, 'Tudo pronto. Rode `npm run dev` e faça uma inscrição em /beta.'))
} else {
  console.log(cor(31, `${problemas} item(ns) para resolver antes de testar o fluxo.`))
  process.exitCode = 1
}
