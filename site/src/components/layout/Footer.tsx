import { Link } from 'react-router-dom'
import { Logo } from './Logo'
import { Button } from '@/components/ui/Button'
import { RelogioAoVivo } from '@/components/v3/RelogioAoVivo'
import { BETA, BETA_CTA, BRAND, CONDITIONS_SHORT, RODAPE_AO_VIVO } from '@/data/content'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { resetConsent } from '@/lib/consent'
import { diaEMes } from '@/lib/lancamento'
import './footer.css'

type LinkDoRodape = { to?: string; href?: string; label: string }

const COLUMNS: { title: string; links: LinkDoRodape[] }[] = [
  {
    title: 'Produto',
    links: [
      { to: '/solucao', label: 'IrisFlow Communicator' },
      { to: '/cuidador', label: 'IrisFlow Cuidador' },
      { to: '/planos', label: 'Planos' },
      { to: '/baixar', label: 'Baixar' },
    ],
  },
  {
    title: 'Recursos',
    links: [
      { to: '/como-funciona', label: 'Como funciona' },
      { to: '/meu-computador', label: 'Meu computador funciona?' },
      { to: '/acessibilidade', label: 'Acessibilidade' },
      { href: BRAND.code, label: 'Código aberto' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { to: '/sobre', label: 'Sobre a IrisFlow' },
      // Durante a beta, a porta de entrada é /beta.
      ...(BETA.ativo ? [{ to: BETA_CTA.to, label: 'Programa beta' }] : []),
      { to: '/contato#validacao', label: 'Programa de validação' },
      { to: '/contato', label: 'Contato' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacidade', label: 'Política de privacidade' },
      { to: '/termos', label: 'Termos de uso' },
    ],
  },
]

/**
 * O rodapé de todas as páginas. Redesenho de 01/11/2026 (pedido do dono: sem
 * o nome gigante no fim e com mais conteúdo):
 *
 * - em cima, um painel com a marca, a assinatura, o que é o produto e as duas
 *   portas de entrada (o programa no computador e o app de quem cuida);
 * - no meio, quatro colunas de links e o contato (e-mail e redes);
 * - embaixo, a hora de Brasília, desde quando a beta está no ar, os direitos e
 *   a ressalva das medições, que acompanha o site inteiro.
 *
 * O relógio é pequeno de propósito (auditoria P2-17): informa, não decora.
 */
export function Footer() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const dia = diaEMes(program.launchAt)

  return (
    <footer className="footer on-dark" data-sticky-hide>
      <div className="container">
        <div className="footer__painel">
          <div className="footer__brand">
            <Logo variant="full" tone="negativo" size="md" />
            <p className="footer__tagline">{BRAND.tagline}</p>
            <p className="footer__note">
              Comunicação e controle do computador pelo olhar para pessoas com {CONDITIONS_SHORT}, usando a
              webcam que já está em casa. Nenhuma imagem sai do computador.
            </p>
          </div>
          <div className="footer__portas">
            {BETA.ativo && !lancou ? (
              <Button to={BETA_CTA.to} size="lg">
                {BETA_CTA.label}
              </Button>
            ) : (
              <Button to="/baixar" size="lg">
                Baixar o IrisFlow Communicator
              </Button>
            )}
            <Button to="/cuidador" size="lg" variant="secondary">
              Conhecer o app de quem cuida
            </Button>
          </div>
        </div>
      </div>

      <div className="container footer__inner">
        {COLUMNS.map((col) => (
          <nav key={col.title} className="footer__col" aria-label={col.title}>
            <h2>{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={(l.to ?? l.href) + l.label}>
                  {l.to ? (
                    <Link to={l.to} className="underline-grow">
                      {l.label}
                    </Link>
                  ) : (
                    <a href={l.href} className="underline-grow" target="_blank" rel="noreferrer noopener">
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
              {col.title === 'Legal' && (
                <li>
                  <button type="button" className="footer__linkbtn underline-grow" onClick={resetConsent}>
                    Preferências de cookies
                  </button>
                </li>
              )}
            </ul>
          </nav>
        ))}

        <div className="footer__col footer__contato">
          <h2>Fale com a equipe</h2>
          <a className="footer__email underline-grow" href={`mailto:${BRAND.email}`}>
            {BRAND.email}
          </a>
          <p className="footer__lugar">Feito em São Paulo, para famílias brasileiras.</p>
          <div className="footer__social">
            <a href={BRAND.instagram} target="_blank" rel="noreferrer noopener">
              Instagram
            </a>
            <a href={BRAND.linkedin} target="_blank" rel="noreferrer noopener">
              LinkedIn
            </a>
          </div>
        </div>
      </div>

      <div className="container footer__ao-vivo">
        <RelogioAoVivo />
        {BETA.ativo && dia && (
          <p className="footer__beta">
            <span className="footer__beta-ponto" aria-hidden="true" />
            {lancou ? `${RODAPE_AO_VIVO.betaNoAr} ${dia}` : `${RODAPE_AO_VIVO.betaAbre} ${dia}`}
          </p>
        )}
      </div>

      <div className="container footer__bottom">
        <p>© {new Date().getFullYear()} IrisFlow. Todos os direitos reservados. Código aberto, sob a GPL-3.0.</p>
        <p className="footer__disclaimer">
          Produto de tecnologia assistiva em estágio de validação. As medições de precisão feitas
          até aqui envolveram um único operador da equipe, em ambiente controlado, e ainda não
          foram replicadas com pacientes do público-alvo.
        </p>
      </div>
    </footer>
  )
}
