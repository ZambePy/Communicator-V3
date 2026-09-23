import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAccount } from '@/context/AccountContext'

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
   ============================================================ */

export function EncaminharRecuperacaoDeSenha() {
  const { recuperandoSenha, concluirRecuperacaoDeSenha } = useAccount()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!recuperandoSenha) return
    if (pathname === '/nova-senha') concluirRecuperacaoDeSenha()
    else navigate('/nova-senha', { replace: true })
  }, [recuperandoSenha, pathname, navigate, concluirRecuperacaoDeSenha])

  return null
}
