/* ---------------- verificação de compatibilidade ----------------
   Requisitos declarados: mínimo 8 GB de memória e 4 núcleos;
   recomendado 16 GB e 8 núcleos. O que o navegador consegue medir daqui
   é pouco e precisa ser dito como é: `deviceMemory` só existe em navegadores
   baseados em Chromium e é deliberadamente arredondada e limitada em 8 GB
   pela especificação, então 16 GB é indistinguível de 8 GB por esta via.
   Nada aqui pede permissão de câmera: a webcam só é testada de verdade na
   primeira calibração, dentro do aplicativo.

   Usada pelas páginas /sucesso e /beta, que mostram o mesmo bloco.
   ---------------------------------------------------------------- */

import { BRAND } from '@/data/content'

export type Nivel = 'recomendado' | 'minimo' | 'abaixo'

export type Diagnostico = {
  nivel: Nivel
  titulo: string
  texto: string
  linhas: { rotulo: string; valor: string }[]
}

export const MIN_NUCLEOS = 4
export const REC_NUCLEOS = 8
export const MIN_MEMORIA = 8
/** Teto que a Device Memory API reporta, por especificação. */
export const TETO_REPORTADO = 8

export function diagnosticar(): Diagnostico {
  const nav = navigator as Navigator & { deviceMemory?: number }

  /* `navigator.mediaDevices` não existe em contexto NÃO seguro: aberta por
     http comum ou pelo IP da rede local, a página não enxerga a câmera de
     computador nenhum, novo ou velho. Antes isso caía no mesmo ramo da câmera
     ausente e virava o veredito "abaixo do mínimo", com o texto afirmando que
     a máquina era antiga demais — um diagnóstico sobre o endereço vendido
     como diagnóstico sobre o hardware. Os dois casos agora são separados. */
  const contextoSeguro = window.isSecureContext
  const temCamera =
    typeof nav.mediaDevices !== 'undefined' &&
    typeof nav.mediaDevices.getUserMedia === 'function'
  /** Nada se pode afirmar sobre a câmera: o obstáculo é o endereço da página. */
  const cameraNaoVerificada = !temCamera && !contextoSeguro
  /** Só este caso é, de fato, um veredito sobre a máquina. */
  const cameraIndisponivel = !temCamera && contextoSeguro

  const nucleos = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 0
  const memoria = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null

  const linhas = [
    {
      rotulo: 'Acesso à webcam pelo navegador',
      valor: temCamera
        ? 'disponível'
        : cameraNaoVerificada
          ? 'não verificado — a página não está num endereço seguro'
          : 'indisponível neste navegador',
    },
    {
      rotulo: 'Núcleos de processamento',
      valor: nucleos > 0 ? `${nucleos} (mínimo ${MIN_NUCLEOS}, recomendado ${REC_NUCLEOS})` : 'não informado pelo navegador',
    },
    {
      rotulo: 'Memória',
      valor:
        memoria === null
          ? 'não informada por este navegador'
          : memoria >= TETO_REPORTADO
            ? `${TETO_REPORTADO} GB ou mais (o navegador não reporta acima disso)`
            : `cerca de ${memoria} GB (mínimo ${MIN_MEMORIA} GB)`,
    },
  ]

  const memoriaAbaixo = memoria !== null && memoria < MIN_MEMORIA
  const nucleosAbaixo = nucleos > 0 && nucleos < MIN_NUCLEOS

  // Ressalva que acompanha qualquer veredito quando a câmera não pôde ser
  // checada: ela fala do endereço da página, nunca do computador.
  const ressalvaCamera = cameraNaoVerificada
    ? 'A verificação da webcam não pôde ser feita aqui: esta página foi aberta num endereço não seguro (http comum ou IP de rede local), e nesse caso o navegador esconde a câmera de qualquer site. Isso não diz nada sobre este computador — abra o site por https para conferir essa parte.'
    : ''

  if (cameraIndisponivel || memoriaAbaixo || nucleosAbaixo) {
    const motivo = cameraIndisponivel
      ? 'Este navegador está num endereço seguro e ainda assim não expõe a câmera, o que costuma indicar um computador ou um sistema antigo demais. Vale tentar a instalação assim mesmo, mas espere taxa de quadros baixa e calibração instável.'
      : `Este computador fica abaixo do mínimo de ${MIN_MEMORIA} GB de memória e ${MIN_NUCLEOS} núcleos. O aplicativo provavelmente abre, porém com taxa de quadros baixa, atraso perceptível entre o olhar e o cursor e mais recalibrações. Antes de assinar, teste bastante durante a avaliação.`

    return {
      nivel: 'abaixo',
      titulo: 'Abaixo do mínimo',
      texto: ressalvaCamera ? `${motivo} ${ressalvaCamera}` : motivo,
      linhas,
    }
  }

  // A memória o navegador ou não informa, ou informa limitada a 8 GB. Em
  // nenhum dos dois casos dá para afirmar que a máquina tem os 16 GB
  // recomendados, e a frase diz isso em vez de deduzir.
  const ressalvaMemoria =
    memoria === null
      ? 'Este navegador não informa a memória instalada, então a parte de memória do requisito não foi verificada aqui.'
      : `O navegador não reporta memória acima de ${TETO_REPORTADO} GB, então os 16 GB recomendados não dá para confirmar por esta via.`

  if (nucleos >= REC_NUCLEOS) {
    return {
      nivel: 'recomendado',
      titulo: 'Compatível',
      texto: `Pelo que dá para medir daqui, este computador atende ao recomendado em processamento: ${nucleos} núcleos, contra os ${REC_NUCLEOS} recomendados. Espere rastreamento fluido, com o cursor acompanhando o olhar sem atraso perceptível. ${ressalvaMemoria}${ressalvaCamera ? ` ${ressalvaCamera}` : ''}`,
      linhas,
    }
  }

  const parteNucleos =
    nucleos > 0
      ? `Este computador atende ao mínimo de ${MIN_NUCLEOS} núcleos, mas fica abaixo dos ${REC_NUCLEOS} recomendados.`
      : 'Este navegador não informou o número de núcleos, então nada foi descartado nem confirmado no processamento.'

  return {
    nivel: 'minimo',
    titulo: 'No mínimo',
    texto: `${parteNucleos} ${ressalvaMemoria} O ${BRAND.product} roda nessa faixa, com taxa de quadros mais baixa e alguma variação de precisão em sessões longas. Fechar outros programas pesados durante o uso faz diferença real aqui.${ressalvaCamera ? ` ${ressalvaCamera}` : ''}`,
    linhas,
  }
}
