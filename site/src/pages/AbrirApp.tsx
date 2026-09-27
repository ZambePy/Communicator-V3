import { useEffect } from 'react'
import { SelosDasLojas } from '@/components/ui/SelosDasLojas'
import { ehAndroid, ehIOS } from '@/lib/aparelho'
import { LOJAS } from '@/lib/lojas'

/**
 * /app — o endereço do código QR da página do IrisFlow Cuidador. No celular
 * vai direto para a loja do aparelho; enquanto o app não está na loja, para a
 * seção de disponibilidade (onde fica o APK da beta, a partir do lançamento).
 * No computador, fica e mostra os selos.
 */
export default function AbrirApp() {
  useEffect(() => {
    if (ehAndroid()) window.location.replace(LOJAS.googlePlay ?? '/cuidador#disponibilidade')
    else if (ehIOS()) window.location.replace(LOJAS.appStore ?? '/cuidador#disponibilidade')
  }, [])

  return (
    <section className="section on-raised abrir-app">
      <div className="container container--narrow center">
        <h1 className="titulo-capitulo abrir-app__titulo">Baixe o IrisFlow Cuidador</h1>
        <p className="texto-capitulo abrir-app__texto">
          No celular, este endereço abre a loja certa sozinho. Aqui, escolha a sua:
        </p>
        <SelosDasLojas className="abrir-app__selos" />
      </div>
    </section>
  )
}
