import { useEffect } from 'react'
import { SelosDasLojas } from '@/components/ui/SelosDasLojas'
import { ApkDoRelease } from '@/components/ui/BaixarApk'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { ehAndroid, ehIOS } from '@/lib/aparelho'
import { LOJAS } from '@/lib/lojas'
// Quem chega pelo código QR entra direto aqui, sem passar por /baixar.
import './baixar.css'
import { FundoDaPagina } from '@/components/layout/FundoDaPagina'

/**
 * /app — o endereço do código QR da página do IrisFlow Cuidador. No celular
 * vai direto para a loja do aparelho. Enquanto o app não está no Google Play,
 * o Android FICA aqui e vê o botão do APK da beta: antes ia para a seção de
 * disponibilidade da página do app, onde o APK era uma palavra no meio de uma
 * frase, e quem lia o QR não conseguia baixar (relato de 18/10/2026). O
 * iPhone sem App Store vai para a disponibilidade, como antes. No computador,
 * fica e mostra os selos.
 */
export default function AbrirApp() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const androidComApk = ehAndroid() && !LOJAS.googlePlay && LOJAS.apk !== null

  useEffect(() => {
    if (ehAndroid()) {
      if (LOJAS.googlePlay) window.location.replace(LOJAS.googlePlay)
      else if (!LOJAS.apk) window.location.replace('/cuidador#disponibilidade')
    } else if (ehIOS()) window.location.replace(LOJAS.appStore ?? '/cuidador#disponibilidade')
  }, [])

  return (
    <section className="section on-raised abrir-app">
      <FundoDaPagina variante="calmo" />
      <div className="container container--narrow center">
        <h1 className="titulo-capitulo abrir-app__titulo">Baixe o IrisFlow Cuidador</h1>
        {androidComApk ? (
          <>
            <p className="texto-capitulo abrir-app__texto">
              O app ainda não está no Google Play. Na beta, ele é instalado direto por este arquivo:
            </p>
            <div className="abrir-app__apk">
              <ApkDoRelease lancou={lancou} liberaEm={program.launchAt} />
            </div>
          </>
        ) : (
          <>
            <p className="texto-capitulo abrir-app__texto">
              No celular, este endereço abre a loja certa sozinho. Aqui, escolha a sua:
            </p>
            <SelosDasLojas className="abrir-app__selos" />
          </>
        )}
      </div>
    </section>
  )
}
