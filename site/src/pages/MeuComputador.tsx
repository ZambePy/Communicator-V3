import { useState } from 'react'
import { PageHead } from '@/components/layout/PageHead'
import { Capitulo } from '@/components/pagina/Blocos'
import { CompatCheck } from '@/components/sections/CompatCheck'
import { CallToAction } from '@/components/sections/CallToAction'
import { CAMERA_MINIMA, FPS_IDEAL, MIN_MEMORIA, MIN_NUCLEOS, REC_NUCLEOS, type NivelDoVeredito } from '@/utils/compat'
import './meu-computador.css'
import { FundoDaPagina } from '@/components/layout/FundoDaPagina'

/** A tabela preliminar do README ("Hardware do paciente"), em palavras de casa. */
const REQUISITOS: { item: string; minimo: string; recomendado: string }[] = [
  { item: 'Sistema', minimo: 'Windows 10, de 64 bits', recomendado: 'Windows 11' },
  {
    item: 'Câmera',
    minimo: `${CAMERA_MINIMA.largura}×${CAMERA_MINIMA.altura}, ${FPS_IDEAL} quadros por segundo`,
    recomendado: '1920×1080, perto do rosto',
  },
  {
    item: 'Processador',
    minimo: `${MIN_NUCLEOS} núcleos (Intel de 8ª geração, Ryzen 2000 ou melhor)`,
    recomendado: `${REC_NUCLEOS} núcleos`,
  },
  {
    item: 'Placa de vídeo',
    minimo: 'A que o computador já tem',
    recomendado: 'Com WebGPU, que acelera o rastreamento',
  },
  { item: 'Memória', minimo: `${MIN_MEMORIA} GB`, recomendado: '16 GB (a voz personalizada pede 16 GB)' },
  { item: 'Luz', minimo: 'De frente para o rosto, sem janela atrás', recomendado: 'E um apoio para a cabeça' },
]

/**
 * /meu-computador — "Meu computador funciona?" (pedido do dono, 19/10/2026).
 * O teste no navegador, antes de baixar: a câmera com a imagem e a taxa de
 * quadros reais, a placa de vídeo (WebGPU), a versão do Windows, a memória e
 * os núcleos, com o veredito em linguagem simples (components/sections/
 * CompatCheck.tsx). Embaixo, a tabela do que o IrisFlow precisa. Os botões de
 * download do site levam para cá.
 */
export default function MeuComputador() {
  // O fecho depende do veredito: "baixe agora" só quando o computador atende
  // (auditoria de 21/10/2026, P2-9 e P2-16). Antes do teste da câmera, ou com um
  // impedimento, o caminho é conversar com a equipe.
  const [nivel, setNivel] = useState<NivelDoVeredito>('falta-camera')

  return (
    <>
      <FundoDaPagina />
      <PageHead
        eyebrow="Antes de baixar"
        title="Meu computador funciona?"
        lead="Um teste rápido, aqui no navegador: sistema, câmera, placa de vídeo, processador e memória. Nada é enviado, e a câmera só liga quando você pedir."
      />

      <section className="faixa on-raised meu-computador" aria-label="O teste">
        <div className="container">
          <CompatCheck titulo={null} aoMudarVeredito={setNivel} />
        </div>
      </section>

      <section className="faixa on-dark" aria-labelledby="requisitos-titulo">
        <div className="container">
          <Capitulo
            id="requisitos-titulo"
            titulo="O que o IrisFlow precisa."
            texto="Esta tabela é preliminar e vira a oficial no lançamento. Uma câmera boa e luz no rosto pesam mais que um processador rápido."
          />
          {/* Região que rola de lado no celular: focável, com nome próprio (o do
              h2 já é o da seção, e dois marcos com o mesmo nome confundem o
              leitor de tela). */}
          <div className="requisitos" role="region" aria-label="Tabela de requisitos" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Item</span>
                  </th>
                  <th scope="col">Mínimo</th>
                  <th scope="col">Recomendado</th>
                </tr>
              </thead>
              <tbody>
                {REQUISITOS.map((r) => (
                  <tr key={r.item}>
                    <th scope="row">{r.item}</th>
                    <td>{r.minimo}</td>
                    <td>{r.recomendado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {nivel === 'funciona' ? (
        <CallToAction
          titulo={['Seu computador atende.', 'Baixe agora.']}
          texto="Instale o IrisFlow, faça a calibração com a pessoa sentada onde vai usar e veja. É grátis na beta e não pede cartão."
        />
      ) : nivel === 'lento' ? (
        <CallToAction
          titulo={['Dá para tentar.', 'Baixe a beta e veja.']}
          texto="Pode ficar lento, e só o uso mostra. A beta é gratuita e não pede cartão."
        />
      ) : (
        <CallToAction
          titulo="Ficou com dúvida sobre o computador?"
          texto="Conte qual é o computador e a equipe responde caso a caso. Quando o teste der certo, é só baixar."
          principal={{ label: 'Falar com a equipe', to: '/contato' }}
          secundario={false}
        />
      )}
    </>
  )
}
