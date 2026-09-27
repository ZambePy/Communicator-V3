import { LOJAS, SELOS_OFICIAIS } from '@/lib/lojas'
import './selos-das-lojas.css'

/** Um aparelho genérico — não é o logotipo de nenhuma das lojas. */
function IconeCelular() {
  return (
    <svg className="selo__icone" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

type Props = {
  /** `claro` para fundo escuro (selos com contorno claro). */
  tom?: 'escuro' | 'claro'
  className?: string
}

/**
 * Os selos do IrisFlow Cuidador nas duas lojas. Com os selos em
 * public/badges/ (ver vite.config.ts), usa as imagens da Apple e do Google;
 * sem eles, botões próprios, só com o nome das lojas. O da App Store fica
 * "em breve" até existir o endereço do app lá (src/lib/lojas.ts). Os rótulos
 * para leitor de tela são os mesmos nos dois modos.
 */
export function SelosDasLojas({ tom = 'escuro', className = '' }: Props) {
  const appStore = LOJAS.appStore ?? '/cuidador#disponibilidade'
  const emBreve = LOJAS.appStore === null
  const externo = { target: '_blank', rel: 'noopener noreferrer' } as const
  const rotuloApple = emBreve ? 'App Store, para iPhone: em breve' : 'Baixar na App Store, para iPhone'
  const rotuloGoogle = 'Baixar no Google Play, para Android'

  return (
    <div className={`selos selos--${tom} ${className}`.trim()}>
      {SELOS_OFICIAIS ? (
        <>
          <a
            className="selo selo--oficial selo--apple"
            href={appStore}
            {...(emBreve ? {} : externo)}
            aria-label={rotuloApple}
          >
            <img src="/badges/app-store.svg" alt="" width={134} height={44} />
            {emBreve && <span className="selo__breve">em breve</span>}
          </a>
          <a className="selo selo--oficial selo--google" href={LOJAS.googlePlay} {...externo} aria-label={rotuloGoogle}>
            <img src="/badges/google-play.png" alt="" width={134} height={44} />
          </a>
        </>
      ) : (
        <>
          <a
            className="selo selo--proprio"
            href={appStore}
            {...(emBreve ? {} : externo)}
            aria-label={rotuloApple}
          >
            <IconeCelular />
            <span className="selo__textos">
              <span className="selo__linha">iPhone</span>
              <span className="selo__loja">App Store</span>
            </span>
            {emBreve && <span className="selo__breve">em breve</span>}
          </a>
          <a className="selo selo--proprio" href={LOJAS.googlePlay} {...externo} aria-label={rotuloGoogle}>
            <IconeCelular />
            <span className="selo__textos">
              <span className="selo__linha">Android</span>
              <span className="selo__loja">Google Play</span>
            </span>
          </a>
        </>
      )}
    </div>
  )
}
