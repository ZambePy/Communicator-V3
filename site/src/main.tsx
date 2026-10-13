import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ouvirFalhaDePreCarregamento } from './lib/recargaAposDeploy'
import { irParaODominioOficial } from './seo/hostCanonico'
import { resolveSiteUrl } from './seo/site'
import './styles/global.css'

// Aberto no endereço do Cloudflare Pages (irisflow-communicator.pages.dev)?
// Vai para o mesmo caminho no domínio oficial antes de montar qualquer coisa
// (login, Supabase), para a sessão nascer no domínio certo.
if (!irParaODominioOficial(resolveSiteUrl(import.meta.env.VITE_SITE_URL))) {
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
