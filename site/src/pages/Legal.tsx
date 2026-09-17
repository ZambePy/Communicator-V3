import { PageHead } from '@/components/layout/PageHead'
import { Reveal } from '@/components/effects/Reveal'
import { BRAND } from '@/data/content'

type Block = { h: string; p: string[] }

const PRIVACIDADE: Block[] = [
  {
    h: 'As três camadas de privacidade',
    p: [
      'Primeira camada, o rastreamento ocular: 100% local. As imagens captadas pela webcam, os marcos faciais extraídos de cada quadro, os dados de calibração e os registros brutos de sessão são processados e permanecem exclusivamente no dispositivo do usuário. Nada disso é transmitido pela rede, em nenhuma hipótese, nem com consentimento.',
      'Segunda camada, o que sai do dispositivo quando existe conta vinculada: o texto que o paciente escolheu enviar, os alertas que ele mesmo disparou e indicadores agregados de uso, usados para o painel do cuidador, o suporte e a continuidade da assinatura. É conteúdo que a pessoa decidiu comunicar, não observação feita sobre ela.',
      'Terceira camada, os dois módulos que dependem de autorização expressa por funcionalidade, concedida separadamente e revogável a qualquer momento: a clonagem de voz, porque o áudio de referência é dado biométrico, e o chatbot integrado, porque a composição assistida de frases envolve um serviço externo. Enquanto a autorização não é dada, o módulo simplesmente não funciona, e revogá-la desliga o módulo e apaga o que ele guardava.',
      'Manter o rastreamento inteiro no dispositivo retira o dado biométrico do tráfego em vez de administrá-lo por política interna, o que reduz o risco na origem. Isso não elimina as obrigações da Lei Geral de Proteção de Dados, e a IrisFlow trata as demais bases de dados sob esse regime.',
    ],
  },
  {
    h: 'Quais dados a IrisFlow trata',
    p: [
      'Dados de conta e de contratação: nome, e-mail, telefone, documento e informação de pagamento do responsável que assina, além do primeiro nome e do perfil de uso da pessoa que vai operar a solução.',
      'Dados de suporte que o próprio usuário ou o cuidador enviar ao descrever um problema. Como esses relatos frequentemente descrevem a condição de saúde, são tratados como dado pessoal sensível.',
      'Dados técnicos do dispositivo e da sessão, como identificador de instalação, sistema operacional e indicadores agregados de uso. Não incluem imagem, marco facial nem registro bruto de rastreamento.',
      'O texto que o paciente escolheu enviar e os alertas que ele disparou, quando há conta vinculada, para que cheguem ao cuidador e fiquem no histórico que a própria família consulta.',
      'Amostras de voz fornecidas pela família para a clonagem de voz, tratadas apenas sob autorização expressa e específica para essa funcionalidade. São dado biométrico, e por isso são apagadas após a geração do modelo, salvo pedido expresso em contrário.',
      'As frases enviadas ao chatbot integrado, quando esse módulo é autorizado à parte. Sem essa autorização, nenhuma frase do usuário sai do dispositivo para composição assistida.',
    ],
  },
  {
    h: 'Consentimento quando o titular não consegue assiná-lo',
    p: [
      'Em muitos casos o titular dos dados é uma pessoa que não consegue assinar, digitar nem falar, e o consentimento é prestado por um responsável. Isso não se resolve com um botão de aceite na tela.',
      'A IrisFlow registra quem consentiu, em nome de quem e quando, verifica a legitimidade de quem presta o consentimento e mantém mecanismo de revogação que produz exclusão efetiva e confirmada.',
    ],
  },
  {
    h: 'O que a IrisFlow não faz',
    p: [
      'Não vende, aluga nem compartilha dados pessoais com terceiros para fins publicitários.',
      'Não armazena, em servidor, imagem de rosto, de olho ou de ambiente, marco facial, dado de calibração ou registro bruto de sessão. Esses dados não têm caminho de saída do dispositivo.',
      'Não ativa a clonagem de voz nem o chatbot integrado por padrão, nem os mantém ligados depois que a autorização daquela funcionalidade é revogada.',
      'Não condiciona o funcionamento do núcleo de rastreamento, do teclado ou das frases rápidas à conexão com a internet.',
      'Não permite que a voz clonada reproduza texto arbitrário. Ela só vocaliza conteúdo produzido pelo próprio usuário dentro do fluxo de comunicação do sistema, e essa restrição é implementada no programa, não apenas prometida em contrato.',
    ],
  },
  {
    h: 'Verificação por terceiro',
    p: [
      'Antes do lançamento comercial, a aplicação passa por verificação externa de tráfego de rede, com o resultado publicado. A promessa de que nenhuma imagem sai do dispositivo precisa ser comprovada por quem não trabalha aqui.',
      'Permanecem públicos a documentação técnica, o protocolo de medição de acurácia e os relatórios de precisão com as condições em que foram obtidos. O núcleo de calibração é proprietário desde a virada para a fase comercial.',
    ],
  },
  {
    h: 'Direitos do titular',
    p: [
      'O titular pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade e eliminação dos dados, além de revogar consentimento a qualquer momento, pelo e-mail de contato abaixo.',
      'O pedido de eliminação de conta remove os dados de contratação e encerra a assinatura sem multa.',
    ],
  },
  {
    h: 'Contato do encarregado',
    p: [
      `O encarregado pelo tratamento de dados pessoais é a Diretoria de Marketing e Financeiro. Pedidos relacionados a dados pessoais devem ser enviados para ${BRAND.email}, com resposta em até quinze dias.`,
    ],
  },
]

const TERMOS: Block[] = [
  {
    h: 'Objeto',
    p: [
      'Estes termos regem o uso da plataforma de comunicação assistiva por rastreamento ocular desenvolvida pela IrisFlow, licenciada por assinatura mensal e entregue como aplicação instalável para Windows, macOS e Linux.',
    ],
  },
  {
    h: 'Período de avaliação e cobrança',
    p: [
      'Toda nova conta começa com período de avaliação gratuito, sem exigência de cartão para iniciar. A primeira cobrança ocorre apenas ao fim desse período, caso o assinante não cancele antes.',
      'A assinatura é mensal, sem fidelidade, sem taxa de adesão e sem multa por cancelamento. O cancelamento pode ser feito pelo painel da conta a qualquer momento e produz efeito ao fim do ciclo já pago.',
    ],
  },
  {
    h: 'Limites declarados do produto',
    p: [
      'A IrisFlow entrega controle pleno dentro das próprias telas e controle do cursor do sistema operacional em nível funcional. Interfaces de terceiros com alvos pequenos, menus densos ou elementos que exigem arraste preciso permanecem fora do alcance confortável do rastreamento por webcam.',
      'As medições de precisão realizadas até aqui envolveram um único operador da equipe, em equipamento doméstico, com a cabeça em posição estável, e ainda não foram replicadas com pacientes do público-alvo. O desempenho real varia com a câmera, a iluminação, a distância e o quadro clínico.',
      'A IrisFlow é um recurso de comunicação e de autonomia, sem finalidade de diagnóstico, de monitoramento de condição clínica ou de decisão terapêutica. A leitura preliminar da equipe é que o produto fica fora do escopo da RDC 657/2022 da Anvisa, e a confirmação formal desse enquadramento junto à agência é tarefa do primeiro ano de operação.',
      'A IrisFlow não substitui avaliação clínica e não deve ser o único meio disponível para pedido de socorro em situação de risco à vida.',
    ],
  },
  {
    h: 'Responsabilidades do assinante',
    p: [
      'Manter o equipamento em condições mínimas de funcionamento, incluindo webcam operante e iluminação adequada.',
      'Não redistribuir, sublicenciar ou realizar engenharia reversa dos componentes proprietários da solução.',
      'Informar dados verdadeiros no cadastro, especialmente o e-mail, que é o canal de acesso à conta.',
    ],
  },
  {
    h: 'Suporte e evolução',
    p: [
      'Enquanto a assinatura estiver ativa, o assinante recebe atualizações contínuas e suporte pelo canal de e-mail informado no site.',
      'As funcionalidades listadas neste site como em realização (assistente de conversação e clonagem de voz) são previsões de roteiro e não constituem obrigação contratual de prazo. Ambas dependem de autorização expressa e revogável do assinante para funcionar. O plano Voz só entra em comercialização quando o módulo de clonagem de voz for validado.',
    ],
  },
  {
    h: 'Foro e alterações',
    p: [
      'Alterações destes termos serão comunicadas por e-mail com antecedência mínima de trinta dias, e o assinante que não concordar pode cancelar sem custo.',
      'Fica eleito o foro do domicílio do consumidor para dirimir controvérsias, conforme o Código de Defesa do Consumidor.',
    ],
  },
]

function LegalPage({
  eyebrow,
  title,
  lead,
  blocks,
}: {
  eyebrow: string
  title: string
  lead: string
  blocks: Block[]
}) {
  return (
    <>
      <PageHead eyebrow={eyebrow} title={title} lead={lead} />
      <section className="section">
        <div className="container container--narrow">
          {blocks.map((b, i) => (
            <Reveal key={b.h} anim="up" delay={i * 70}>
              <div style={{ marginBottom: 'var(--sp-6)' }}>
                <h2 style={{ fontSize: '1.32rem', marginBottom: 'var(--sp-3)' }}>{b.h}</h2>
                {b.p.map((text) => (
                  <p key={text.slice(0, 30)}>{text}</p>
                ))}
              </div>
            </Reveal>
          ))}
          <Reveal anim="fade">
            <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>
              Documento de referência para o ambiente de demonstração deste site. Antes de entrar
              em produção, precisa passar por revisão jurídica.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  )
}

export function Privacidade() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de privacidade"
      lead="O rastreamento ocular é 100% local e nunca sai do computador do usuário. O que sai, com conta vinculada, é o texto que o paciente escolheu enviar, os alertas e indicadores agregados — e dois módulos só funcionam sob autorização expressa e revogável. Esta política descreve as três camadas em detalhe."
      blocks={PRIVACIDADE}
    />
  )
}

export function Termos() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Termos de uso"
      lead="Condições da assinatura, limites declarados do produto e responsabilidades de cada parte."
      blocks={TERMOS}
    />
  )
}
