/**
 * Verificação da conexão com o Supabase.
 *
 *   npm run check
 *
 * Lê o .env.local, bate no projeto e diz o que está pronto e o que
 * falta. Não escreve nada no banco: só consultas de leitura e a
 * configuração pública de autenticação.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const RAIZ = process.cwd()

/* ---------- saída ---------- */
const cor = (c, t) => `\x1b[${c}m${t}\x1b[0m`
const ok = (t) => console.log(`${cor(32, '  ok  ')} ${t}`)
const falha = (t) => console.log(`${cor(31, ' falha')} ${t}`)
const aviso = (t) => console.log(`${cor(33, ' aviso')} ${t}`)
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

if (!existsSync(resolve(RAIZ, '.env.local'))) {
  falha('.env.local não existe. Rode: cp .env.example .env.local')
  process.exit(1)
}

if (!url) {
  falha('VITE_SUPABASE_URL vazia no .env.local')
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
  falha('VITE_SUPABASE_ANON_KEY vazia no .env.local')
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

const planos = await pedir('/rest/v1/plans?select=id,name,price_brl,trial_days')
if (planos.status === 404 || planos.corpo?.code === '42P01') {
  registrar(true, 'tabela `plans` não existe. Rode supabase/schema.sql no SQL Editor.')
} else if (planos.status !== 200) {
  registrar(true, `leitura de \`plans\` falhou: ${JSON.stringify(planos.corpo)}`)
} else if (!Array.isArray(planos.corpo) || planos.corpo.length === 0) {
  registrar(true, '`plans` existe mas está vazia. O INSERT do fim do schema.sql não rodou.')
} else {
  const p = planos.corpo[0]
  ok(`plano encontrado: ${p.name}, R$ ${p.price_brl}, ${p.trial_days} dias de avaliação`)
}

const releases = await pedir('/rest/v1/app_releases?select=os,download_url')
if (releases.status === 200 && Array.isArray(releases.corpo)) {
  const semUrl = releases.corpo.filter((r) => r.download_url === '#').length
  if (releases.corpo.length === 0) {
    aviso('`app_releases` vazia: os botões de download ficam sem destino.')
  } else if (semUrl > 0) {
    aviso(`${semUrl} de ${releases.corpo.length} instaladores ainda com URL '#'.`)
  } else {
    ok('instaladores com URL publicada')
  }
} else {
  registrar(true, 'tabela `app_releases` inacessível')
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
      'A RLS não está ativa. Rode a seção 14 do schema.sql.',
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
  // outro. Desligar o de cima tira o login por senha do ar; o que
  // precisa ser desligado é o de baixo.
  if (conf.corpo.external?.email === false) {
    registrar(
      true,
      'O provedor de e-mail está DESLIGADO. Sem ele não há login por senha. ' +
        'Ligue "Enable Email provider" em Authentication > Sign In / Providers > Email ' +
        '(o interruptor de cima) e desligue apenas "Confirm email" (o de baixo).',
    )
  } else {
    ok('provedor de e-mail e senha ativo')
  }

  // mailer_autoconfirm true = "Confirm email" desligado
  if (conf.corpo.mailer_autoconfirm === true) {
    ok('"Confirm email" desligado: o cadastro segue direto para o checkout')
  } else {
    registrar(
      true,
      '"Confirm email" LIGADO. O signUp não devolve sessão e o cadastro para antes do ' +
        'checkout. Desligue em Authentication > Sign In / Providers > Email.',
    )
  }
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
  registrar(true, '`request_cancellation` não existe. O schema.sql não rodou até o fim.')
} else if (rpcCorpo?.message?.includes('autenticado') || rpc.status === 401 || rpc.status === 403) {
  ok('as funções existem e recusam chamada sem autenticação')
} else {
  aviso(`resposta inesperada da RPC (HTTP ${rpc.status}): ${JSON.stringify(rpcCorpo)}`)
}

/* ---------- resultado ---------- */
console.log()
if (problemas === 0) {
  console.log(cor(32, 'Tudo pronto. Rode `npm run dev` e crie uma conta em /cadastro.'))
} else {
  console.log(cor(31, `${problemas} item(ns) para resolver antes de testar o fluxo.`))
  process.exitCode = 1
}
