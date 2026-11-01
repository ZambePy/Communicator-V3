import { AberturaHome } from '@/components/home/AberturaHome'
import { Capitulos } from '@/components/home/Capitulos'
import { ContrastePreco } from '@/components/home/ContrastePreco'
import { CondicoesHome } from '@/components/home/CondicoesHome'
import { CuidadorDestaque } from '@/components/home/CuidadorDestaque'
import { PlanosEPerguntas } from '@/components/home/PlanosEPerguntas'
import { CallToAction } from '@/components/sections/CallToAction'
import { ListaDeModulos } from '@/components/v3/ListaDeModulos'
import { MODULOS_NA_HOME } from '@/data/home'
import { MODULOS_EM_TELA } from '@/data/produto'
import '@/components/home/home.css'
import '@/components/home/faixas.css'

/* A home (redesenho de 31/10/2026, na identidade escura da IrisFlow): a
   abertura com o teclado em demonstração, a gravação real com os três passos,
   as telas do app, o preço no azul da marca, para quem é, quem cuida, a beta
   com as perguntas e o fecho, que corre para o rodapé. As faixas trocam de
   tom de marinho em vez de um marinho chapado só (faixas.css). */
export default function Home() {
  return (
    <div className="home">
      <AberturaHome />
      <Capitulos />
      <ListaDeModulos modulos={MODULOS_EM_TELA} titulo={MODULOS_NA_HOME.titulo} texto={MODULOS_NA_HOME.texto} link={MODULOS_NA_HOME.link} />
      <ContrastePreco variante="faixa" />
      <CondicoesHome />
      <CuidadorDestaque />
      <PlanosEPerguntas />
      <CallToAction texto={false} />
    </div>
  )
}
