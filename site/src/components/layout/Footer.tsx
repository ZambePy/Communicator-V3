import { Link } from 'react-router-dom'
import { Logo } from './Logo'
import { RelogioAoVivo } from '@/components/v3/RelogioAoVivo'
import { BETA, BETA_CTA, BRAND, CONDITIONS_SHORT, RODAPE_AO_VIVO } from '@/data/content'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { resetConsent } from '@/lib/consent'
import { diaEMes } from '@/lib/lancamento'
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
      { to: '/meu-computador', label: 'Meu computador funciona?' },
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

/**
 * O rodapé de todas as páginas. Desde a rodada 3 (21/10/2026), como no vídeo
 * de referência, tem uma linha com o relógio ao vivo (hora de Brasília) e desde
 * quando a beta está no ar: o dia do lançamento, o mesmo do selo da beta
 * (beta_program.launch_at, com a reserva do content.ts). O relógio é pequeno
 * de propósito (auditoria P2-17): informa, não decora.
 */
export function Footer() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const dia = diaEMes(program.launchAt)

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
