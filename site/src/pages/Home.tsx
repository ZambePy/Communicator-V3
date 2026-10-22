import { HeroProduto } from '@/components/home/HeroProduto'
import { Capitulos } from '@/components/home/Capitulos'
import { ContrastePreco } from '@/components/home/ContrastePreco'
import { CuidadorDestaque } from '@/components/home/CuidadorDestaque'
import { PlanosResumo } from '@/components/home/PlanosResumo'
import { Faq } from '@/components/sections/Faq'
import { ArcoDeCondicoes } from '@/components/v3/ArcoDeCondicoes'
import { ChamadaFinal } from '@/components/v3/ChamadaFinal'
import { CartoesNumerados } from '@/components/v3/CartoesNumerados'
import { CursorDeFixacao } from '@/components/v3/CursorDeFixacao'
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

/* A home (rodada 3, 21/10/2026), sem efeitos: o produto de verdade é a estrela.
   O dono recusou o fundo "de efeito" do v3 (grade, feixe de luz, marca d'água,
   olho de partículas e aurora; 21/10/2026, "parece feito por IA"): o fundo é o
   marinho da marca, chapado.

   abertura (o título e o monitor, que sobe uma vez) → a gravação real no
   monitor, com os capítulos e "Testar com o meu olhar" → o que um olhar faz
   (seis cartões; ao lado, a tela real do cartão ativo) → os módulos com a tela
   real → o preço do aparelho que ele substitui → para quem (o arco) → quem
   cuida (celular) → planos → perguntas → a chamada final, no azul da marca.

   Tudo dentro de um .v3 (o marinho por baixo). As faixas alternam entre o
   marinho da marca (#0B1B3A) e o marinho fundo (#081530), para marcar o ritmo
   sem enfeite: abertura e gravação (marca), cartões (fundo), módulos (marca),
   preço (fundo), arco (marca), quem cuida (fundo), planos e perguntas (marca). A privacidade, que tinha faixa
   própria, virou o cartão 04 (e segue nas perguntas). O teclado animado foi
   para "Como funciona".

   Efeitos de fundo e animações (pedido do dono, 21/10/2026, depois de aprovar
   o desenho: "só falta o efeito de fundo e mais animações"). O conceito é
   "o olhar percorre a página" e tudo nasce do produto: os 13 pontos da
   calibração atrás da abertura, a luz que segue o ponteiro como o ponto de
   olhar (LuzDoOlhar, que desde a rodada 4 mora no Layout e vale para o site todo), o anel de fixação que enche nos passos, o
   traço do arco, a frase que chega ao celular e o anel que percorre os 13
   pontos na chamada final. Continuam fora, por pedido dele: o olho de
   partículas, a grade, o feixe de luz, a marca d'água e a aurora. */
export default function Home() {
  return (
    <div className="v3">
      <CursorDeFixacao />
      <HeroProduto />
      <Capitulos />
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
