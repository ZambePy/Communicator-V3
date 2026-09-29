import { Link } from 'react-router-dom'
import { Logo } from './Logo'
import { BETA, BETA_CTA, BRAND, CONDITIONS_SHORT } from '@/data/content'
import { resetConsent } from '@/lib/consent'
import './footer.css'

const COLUMNS = [
  {
    title: 'Produto',
    links: [
      { to: '/solucao', label: 'IrisFlow Communicator' },
      { to: '/cuidador', label: 'IrisFlow Cuidador' },
      { to: '/como-funciona', label: 'Como funciona' },
      { to: '/planos', label: 'Planos' },
      { to: '/baixar', label: 'Baixar' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { to: '/sobre', label: 'Sobre a IrisFlow' },
      // Durante a beta, a porta de entrada é /beta.
      ...(BETA.ativo ? [{ to: BETA_CTA.to, label: 'Programa beta' }] : []),
      { to: '/contato#validacao', label: 'Programa de validação' },
      { to: '/acessibilidade', label: 'Acessibilidade' },
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

export function Footer() {
  return (
    <footer className="footer on-dark" data-sticky-hide>
      <div className="container footer__inner">
        <div className="footer__brand">
          <Logo variant="full" tone="negativo" size="md" />
          <p className="footer__tagline">{BRAND.tagline}</p>
          <p className="footer__note">
            Comunicação e controle do computador pelo olhar para pessoas com{' '}
            {CONDITIONS_SHORT}, usando a webcam que já está em casa. Nenhuma imagem sai do
            computador. Feita por três pessoas, no Brasil, para famílias brasileiras.
          </p>
          <div className="footer__social">
            <a href={BRAND.instagram} target="_blank" rel="noreferrer noopener">
              Instagram
            </a>
            <a href={BRAND.linkedin} target="_blank" rel="noreferrer noopener">
              LinkedIn
            </a>
            <a href={`mailto:${BRAND.email}`}>E-mail</a>
          </div>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} className="footer__col" aria-label={col.title}>
            <h2>{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.to + l.label}>
                  <Link to={l.to} className="underline-grow">
                    {l.label}
                  </Link>
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
      </div>

      <div className="container footer__bottom">
        <p>© {new Date().getFullYear()} IrisFlow. Todos os direitos reservados.</p>
        <p className="footer__disclaimer">
          Produto de tecnologia assistiva em estágio de validação. As medições de precisão feitas
          até aqui envolveram um único operador da equipe, em ambiente controlado, e ainda não
          foram replicadas com pacientes do público-alvo.
        </p>
      </div>
    </footer>
  )
}
