import { AberturaHome } from '@/components/home/AberturaHome'
import { Capitulos } from '@/components/home/Capitulos'
import { ContrastePreco } from '@/components/home/ContrastePreco'
import { CondicoesHome } from '@/components/home/CondicoesHome'
import { CuidadorDestaque } from '@/components/home/CuidadorDestaque'
import { DoOlharAoClique } from '@/components/home/DoOlharAoClique'
import { EquipeHome } from '@/components/home/EquipeHome'
import { ExperimenteOlhar } from '@/components/home/ExperimenteOlhar'
import { MedidoHome } from '@/components/home/MedidoHome'
import { PlanosEPerguntas } from '@/components/home/PlanosEPerguntas'
import { PranchaHome } from '@/components/home/PranchaHome'
import { PrivacidadeEmCamadas } from '@/components/home/PrivacidadeEmCamadas'
import { CallToAction } from '@/components/sections/CallToAction'
import { ListaDeModulos } from '@/components/v3/ListaDeModulos'
import { MODULOS_NA_HOME } from '@/data/home'
import { MODULOS_EM_TELA } from '@/data/produto'
import '@/components/home/home.css'
import '@/components/home/faixas.css'

/* A home (redesenho de 01/11/2026, "O Aro que Fecha"): a íris da marca na
   abertura (em camadas, que olha para o ponteiro), a frase da prancha com
   recortes das telas, a peça viva "Segure o olhar" (a frase sai em voz alta), a gravação real com os
   três passos, do olhar ao clique (a história presa à rolagem), as telas do app, o preço no azul da marca, o que foi medido com
   as ressalvas, a privacidade em três camadas, para quem é, quem cuida, a equipe, a beta com as perguntas e
   o fecho, em que a íris volta. O círculo da íris é o único motivo da página. */
export default function Home() {
  return (
    <div className="home">
      <AberturaHome />
      <PranchaHome />
      <ExperimenteOlhar />
      <Capitulos />
      <DoOlharAoClique />
      <ListaDeModulos modulos={MODULOS_EM_TELA} titulo={MODULOS_NA_HOME.titulo} texto={MODULOS_NA_HOME.texto} link={MODULOS_NA_HOME.link} />
      <ContrastePreco variante="faixa" />
      <MedidoHome />
      <PrivacidadeEmCamadas />
      <CondicoesHome />
      <CuidadorDestaque />
      <EquipeHome />
      <PlanosEPerguntas />
      <CallToAction texto={false} iris />
    </div>
  )
}
