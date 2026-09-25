import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { EncaminharRecuperacaoDeSenha } from '@/components/layout/EncaminharRecuperacaoDeSenha'
import { Layout } from '@/components/layout/Layout'
import { AccountProvider } from '@/context/AccountContext'
import { BETA } from '@/data/content'
import { ROUTE_LOADERS } from '@/routes'

/* Cada página em seu próprio pedaço: o primeiro carregamento traz apenas
   a home, e o resto chega sob demanda. A tabela de carregadores mora em
   routes.ts porque o pré-carregamento ao passar o mouse usa a mesma. */
const Home = lazy(ROUTE_LOADERS['/'])
const Solucao = lazy(ROUTE_LOADERS['/solucao'])
const ComoFunciona = lazy(ROUTE_LOADERS['/como-funciona'])
const Acessibilidade = lazy(ROUTE_LOADERS['/acessibilidade'])
const Planos = lazy(ROUTE_LOADERS['/planos'])
const Sobre = lazy(ROUTE_LOADERS['/sobre'])
const Contato = lazy(ROUTE_LOADERS['/contato'])
const Beta = lazy(ROUTE_LOADERS['/beta'])
const Cadastro = lazy(ROUTE_LOADERS['/cadastro'])
const Pagamento = lazy(ROUTE_LOADERS['/pagamento'])
const Sucesso = lazy(ROUTE_LOADERS['/sucesso'])
const Entrar = lazy(ROUTE_LOADERS['/entrar'])
const RecuperarSenha = lazy(ROUTE_LOADERS['/recuperar-senha'])
const NovaSenha = lazy(ROUTE_LOADERS['/nova-senha'])
const Conta = lazy(ROUTE_LOADERS['/conta'])
const Perfil = lazy(ROUTE_LOADERS['/perfil'])
const ConfirmarEmail = lazy(ROUTE_LOADERS['/confirmar-email'])
const NotFound = lazy(() => import('@/pages/NotFound'))
const Privacidade = lazy(ROUTE_LOADERS['/privacidade'])
const Termos = lazy(ROUTE_LOADERS['/termos'])

export default function App() {
  return (
    <AccountProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {/* link do e-mail de nova senha caiu em outra página: leva a /nova-senha */}
        <EncaminharRecuperacaoDeSenha />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="solucao" element={<Solucao />} />
            <Route path="como-funciona" element={<ComoFunciona />} />
            <Route path="acessibilidade" element={<Acessibilidade />} />
            <Route path="planos" element={<Planos />} />
            <Route path="sobre" element={<Sobre />} />
            <Route path="contato" element={<Contato />} />

            {/* programa beta (README da raiz, seção "Site (site/)"): criar conta →
                confirmar e-mail → pesquisa rápida → download */}
            <Route path="beta" element={<Beta />} />
            {/* destino do link de confirmação do e-mail: abre a sessão no
                aparelho onde o link foi clicado e agradece */}
            <Route path="confirmar-email" element={<ConfirmarEmail />} />
            {/* "Meu perfil": dados da conta, respostas da pesquisa e download */}
            <Route path="perfil" element={<Perfil />} />

            {/* fluxo de contratação. Durante a beta a compra fica
                indisponível e as três telas mandam para /beta; os
                arquivos continuam existindo — desligar a beta é trocar
                BETA.ativo no content.ts. */}
            <Route
              path="cadastro"
              element={BETA.ativo ? <Navigate to="/beta" replace /> : <Cadastro />}
            />
            <Route
              path="pagamento"
              element={BETA.ativo ? <Navigate to="/beta" replace /> : <Pagamento />}
            />
            <Route
              path="sucesso"
              element={BETA.ativo ? <Navigate to="/beta" replace /> : <Sucesso />}
            />
            <Route path="entrar" element={<Entrar />} />
            <Route path="recuperar-senha" element={<RecuperarSenha />} />
            {/* destino do link do e-mail de redefinição (redirectTo) */}
            <Route path="nova-senha" element={<NovaSenha />} />
            {/* Durante a beta o painel da conta é o /perfil. O endereço /conta
                continua valendo: o aplicativo desktop e e-mails antigos
                apontam para ele. */}
            <Route
              path="conta"
              element={BETA.ativo ? <Navigate to="/perfil" replace /> : <Conta />}
            />

            {/* legal */}
            <Route path="privacidade" element={<Privacidade />} />
            <Route path="termos" element={<Termos />} />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AccountProvider>
  )
}
