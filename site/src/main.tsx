import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ouvirFalhaDePreCarregamento } from './lib/recargaAposDeploy'
import { capturarCodigoDoEndereco } from './lib/pareamento'
import { irParaODominioOficial } from './seo/hostCanonico'
import { resolveSiteUrl } from './seo/site'
import './styles/global.css'

// Aberto no endereço do Cloudflare Pages (irisflow-communicator.pages.dev)?
// Vai para o mesmo caminho no domínio oficial antes de montar qualquer coisa
// (login, Supabase), para a sessão nascer no domínio certo. Vem antes da
// captura do código do QR: o fragmento (#t=...) viaja junto no redirecionamento
// e é capturado já no domínio; capturado aqui, ficaria preso no pages.dev.
if (!irParaODominioOficial(resolveSiteUrl(import.meta.env.VITE_SITE_URL))) {
  // /parear#t=<código> (QR do computador, 19/10/2026): o código sai da barra de
  // endereço ANTES de qualquer outra coisa — roteador, estatísticas, histórico.
  capturarCodigoDoEndereco()

  // Pedaço de rota que sumiu num deploy (aba aberta com a versão anterior):
  // recarrega o endereço uma vez em vez de deixar a página vazia.
  ouvirFalhaDePreCarregamento()

  const root = document.getElementById('root')
  if (!root) throw new Error('Elemento #root não encontrado em index.html')

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
