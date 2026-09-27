import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAccount } from '@/context/AccountContext'
import { ENDERECO_INICIAL } from '@/lib/supabase'

/* ============================================================
   Link de recuperação de senha → /nova-senha, de qualquer página.

   O e-mail de redefinição leva para /nova-senha quando o `redirectTo`
   está na lista de Redirect URLs do painel do Supabase. Fora da lista —
   ou num painel configurado só com a Site URL — o Supabase manda para a
   página inicial, e a pessoa via a home logada sem saber onde trocar a
   senha. O evento PASSWORD_RECOVERY (AccountContext) é o sinal de que
   a sessão aberta é de recuperação; aqui ele vira navegação.

   A navegação só acontece depois do evento, e o evento só sai depois de
   o supabase-js ler os tokens do endereço e salvar a sessão: trocar de
   rota antes disso apagaria o fragmento com os tokens.

   O supabase-js repassa o evento a TODAS as abas abertas do site. Só a aba
   que abriu com o link (type=recovery no endereço inicial) muda de página;
   as outras só baixam a marca — levá-las junto descartava o que estava
   sendo escrito nelas (um contato, a pesquisa).
   ============================================================ */

/** Esta aba abriu o site pelo link de nova senha? */
export function abriuComLinkDeRecuperacao(endereco: string = ENDERECO_INICIAL): boolean {
  return /(?:^|[?#&])type=recovery(?:&|$)/.test(endereco)
}

/**
 * Esta aba abriu pelo link de CONVITE da equipe (modelo padrão do Supabase:
 * tokens no fragmento, com type=invite)? A pessoa convidada entra sem senha,
 * então vai criar a primeira em /nova-senha — uma vez só.
 */
export function abriuComConvite(endereco: string = ENDERECO_INICIAL): boolean {
  return /(?:^|[?#&])type=invite(?:&|$)/.test(endereco) && !/token_hash=/.test(endereco)
}

let convitePendente = abriuComConvite()

export function EncaminharRecuperacaoDeSenha() {
  const { recuperandoSenha, concluirRecuperacaoDeSenha, authenticated } = useAccount()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!convitePendente || !authenticated) return
    convitePendente = false
    if (pathname !== '/nova-senha') navigate('/nova-senha?convite=1', { replace: true })
  }, [authenticated, pathname, navigate])

  useEffect(() => {
    if (!recuperandoSenha) return
    if (pathname === '/nova-senha' || !abriuComLinkDeRecuperacao()) concluirRecuperacaoDeSenha()
    else navigate('/nova-senha', { replace: true })
  }, [recuperandoSenha, pathname, navigate, concluirRecuperacaoDeSenha])

  return null
}
