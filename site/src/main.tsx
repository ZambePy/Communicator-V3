import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ouvirFalhaDePreCarregamento } from './lib/recargaAposDeploy'
import './styles/global.css'

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
