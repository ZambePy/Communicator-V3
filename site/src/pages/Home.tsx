import { HeroProduto } from '@/components/home/HeroProduto'
import { Capitulos } from '@/components/home/Capitulos'
import { ContrastePreco } from '@/components/home/ContrastePreco'
import { CuidadorDestaque } from '@/components/home/CuidadorDestaque'
import { PlanosResumo } from '@/components/home/PlanosResumo'
import { Faq } from '@/components/sections/Faq'
import { ArcoDeCondicoes } from '@/components/v3/ArcoDeCondicoes'
import { ChamadaFinal } from '@/components/v3/ChamadaFinal'
import { CartoesNumerados } from '@/components/v3/CartoesNumerados'
import { Atmosfera } from '@/components/fundo/Atmosfera'
import { ListaDeModulos } from '@/components/v3/ListaDeModulos'
import {
  CONDICOES_NO_ARCO,
  MODULOS_NA_HOME,
  O_QUE_UM_OLHAR_FAZ,
  PARA_QUEM_O_OLHAR,
  PERGUNTAS_DA_HOME,
  RECURSOS_DO_OLHAR,
} from '@/data/home'
import { MODULOS_EM_TELA } from '@/data/produto'
import '@/components/home/home.css'

/* A home: a abertura e o monitor com a gravação real dividem o mesmo fundo
   vivo (Atmosfera); depois, o que um olhar faz, os módulos, o preço, para
   quem, quem cuida, planos, perguntas e a chamada final. */
export default function Home() {
  return (
    <div className="v3">
      <div className="home-topo">
        <Atmosfera variante="abertura" />
        <div className="home-topo__conteudo">
          <HeroProduto />
          <Capitulos />
        </div>
      </div>
      <CartoesNumerados itens={RECURSOS_DO_OLHAR} titulo={O_QUE_UM_OLHAR_FAZ.titulo} texto={O_QUE_UM_OLHAR_FAZ.texto} />
      <ListaDeModulos modulos={MODULOS_EM_TELA} titulo={MODULOS_NA_HOME.titulo} texto={MODULOS_NA_HOME.texto} link={MODULOS_NA_HOME.link} />
      <ContrastePreco />
      <ArcoDeCondicoes condicoes={CONDICOES_NO_ARCO} titulo={PARA_QUEM_O_OLHAR.titulo} texto={PARA_QUEM_O_OLHAR.texto} />
      <CuidadorDestaque />
      <PlanosResumo />
      <div className="on-raised">
        <Faq perguntas={PERGUNTAS_DA_HOME} verTodas="/planos#perguntas" />
      </div>
      <ChamadaFinal />
    </div>
  )
}
