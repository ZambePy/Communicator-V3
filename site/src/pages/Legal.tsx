/* ============================================================
   Política de privacidade e Termos de uso.

   VERSÃO BETA — REVISE COM UM ADVOGADO ANTES DO LANÇAMENTO COMERCIAL.
   O texto descreve o que o sistema faz hoje (conferido no código e nas
   tabelas de ../supabase): rastreamento 100 % local, conta e mensagens no
   Supabase, estatísticas sem cookie. Não substitui revisão jurídica, e
   não deve ganhar promessa que o produto não cumpra.
   ============================================================ */

import { Link } from 'react-router-dom'
import { PageHead } from '@/components/layout/PageHead'
import { Reveal } from '@/components/effects/Reveal'
import { BRAND } from '@/data/content'
import './legal.css'

type Block = { id: string; h: string; p?: string[]; list?: string[]; after?: string[] }

/** Data da versão em vigor dos dois documentos. */
const ATUALIZADO_EM = '23 de setembro de 2026'

const PRIVACIDADE: Block[] = [
  {
    id: 'quem-somos',
    h: '1. Quem é responsável pelos seus dados',
    p: [
      `A IrisFlow é a controladora dos dados pessoais tratados por este site, pelo aplicativo IrisFlow Communicator (computador) e pelo app do cuidador (celular). Para qualquer assunto sobre dados pessoais — inclusive falar com o encarregado (DPO) — escreva para ${BRAND.email}.`,
      'O IrisFlow está em fase beta: o produto, e esta política com ele, ainda estão mudando. Quando algo relevante mudar, avisamos por e-mail quem tem conta.',
    ],
  },
  {
    id: 'local',
    h: '2. O que nunca sai do seu computador',
    p: [
      'O rastreamento ocular roda inteiro no computador onde o IrisFlow Communicator está instalado. As imagens da webcam, os pontos do rosto extraídos de cada quadro, os dados de calibração e os registros brutos de sessão são processados ali e não são enviados para a internet — nem para nós, nem para ninguém.',
      'Este site não acessa a sua câmera. A verificação de compatibilidade da página da beta só consulta se o navegador oferece acesso à webcam, sem ligá-la.',
    ],
  },
  {
    id: 'o-que-guardamos',
    h: '3. O que guardamos e para quê',
    p: ['Guardamos apenas o necessário para a conta, o app do cuidador e o suporte funcionarem:'],
    list: [
      'Conta e inscrição na beta: nome e e-mail de quem se inscreve; telefone e CPF, se você quiser informar (os dois são opcionais na beta); a senha, que fica com o serviço de autenticação e não é legível pela equipe; nome de quem vai usar, a relação com essa pessoa, a condição principal, o sistema do computador, o profissional que acompanha (opcional), como conheceu a IrisFlow e as suas escolhas de contato. Servem para criar a conta, liberar o aplicativo, ajustar o perfil inicial e falar com você sobre a beta.',
      'Mensagens e alertas: o texto que a pessoa escolheu enviar pelo IrisFlow, as respostas do cuidador e os pedidos de ajuda ou de emergência, para chegarem ao celular do cuidador e ficarem no histórico que a família consulta.',
      'Configurações e frases: ajustes do aplicativo (tempo de fixação, estabilidade do cursor, voz) e as frases rápidas e textos que o cuidador cadastra.',
      'Dados técnicos e de uso agregado: o computador vinculado (nome, sistema, versão do aplicativo e se câmera, rastreamento e calibração estão funcionando) e números de cada sessão — duração, qualidade da calibração, quantidade de frases e de caracteres, pedidos de ajuda e módulos usados. Nunca imagem, vídeo ou o conteúdo digitado fora das mensagens enviadas.',
      'Relatórios de erro: quando o aplicativo falha, ou quando você toca em “Enviar relatório”, ele envia dados técnicos (versão, erro, números), sem conteúdo do paciente.',
      'Formulário de contato: nome, e-mail, perfil e a mensagem, para responder você.',
      'Notificações do app do cuidador: o identificador do celular usado para entregar os avisos.',
    ],
  },
  {
    id: 'sensiveis',
    h: '4. Dados de saúde',
    p: [
      'A condição principal informada na inscrição, e muitas vezes o conteúdo das mensagens e dos pedidos de suporte, revelam informação de saúde — dado pessoal sensível pela LGPD. Tratamos esses dados só para as finalidades acima, com o consentimento específico que você dá ao se inscrever, e nunca para publicidade.',
      'Em muitos casos quem usa o IrisFlow não consegue assinar nem digitar, e o consentimento é dado por um responsável. Quando a pessoa que usa é criança ou adolescente, a conta é criada e gerida por um responsável legal, e os dados são tratados no melhor interesse dela.',
    ],
  },
  {
    id: 'bases-legais',
    h: '5. Bases legais',
    list: [
      'Execução de contrato e procedimentos preliminares (art. 7º, V, da LGPD): conta, inscrição na beta, aplicativo, app do cuidador e suporte.',
      'Consentimento (art. 7º, I, e art. 11, I): dados de saúde, contato para retorno sobre a beta e envio de novidades — cada um pode ser revogado a qualquer momento.',
      'Legítimo interesse (art. 7º, IX): estatísticas anônimas de visita ao site, segurança e prevenção de abuso.',
      'Cumprimento de obrigação legal (art. 7º, II), quando uma lei exigir guardar ou informar algum dado.',
    ],
  },
  {
    id: 'operadores',
    h: '6. Com quem os dados são compartilhados',
    p: [
      'Não vendemos, não alugamos e não compartilhamos dados pessoais para publicidade. Usamos fornecedores que tratam dados em nosso nome, só para operar o serviço:',
    ],
    list: [
      'Supabase — banco de dados e autenticação (conta, mensagens, configurações, uso agregado).',
      'Cloudflare — hospedagem deste site e estatísticas de visita sem cookies.',
      'GitHub — hospedagem dos instaladores. Nas páginas com a área de downloads, o seu navegador consulta a API pública do GitHub (sem cookies e sem informar de qual página veio) para saber quais instaladores estão publicados; ao baixar, acessa o github.com. Nos dois casos vale a política de privacidade do GitHub.',
      'Serviços de notificação do celular (Expo, Apple e Google) — entrega dos avisos do app do cuidador.',
      'Google (Gmail) — o e-mail da equipe; o que você nos escreve passa por ele.',
    ],
    after: [
      'Alguns desses fornecedores mantêm servidores fora do Brasil. Nesses casos a transferência internacional se apoia nas garantias contratuais dos próprios fornecedores, nos termos do art. 33 da LGPD.',
    ],
  },
  {
    id: 'cookies',
    h: '7. Cookies, armazenamento local e estatísticas',
    p: [
      'Este site não usa cookies de publicidade nem de rastreamento. No seu navegador ficam apenas: a sessão de login (para você continuar conectado), a sua escolha sobre estatísticas, pequenas preferências de interface, como ter fechado a barra de atalho no celular, a lista de instaladores publicados (por até 10 minutos, só na aba aberta) e, quando o cadastro pede confirmação por e-mail, um rascunho da inscrição na beta — sem CPF, telefone ou condição de saúde —, que é apagado ao concluir a inscrição ou ao sair da conta e perde a validade em 48 horas.',
      'Para saber quantas pessoas visitam cada página usamos o Cloudflare Web Analytics, que não grava cookies, não cria identificador do visitante e mostra só números agregados. Você pode recusar essas estatísticas no aviso que aparece na primeira visita ou, depois, em “Preferências de cookies”, no rodapé; com a recusa, o script de estatísticas nem é carregado.',
    ],
  },
  {
    id: 'retencao',
    h: '8. Por quanto tempo',
    p: [
      'Os dados da conta, as mensagens, as configurações e o uso agregado ficam enquanto a conta existir. Se você pedir a exclusão, apagamos em até 15 dias, exceto o que a lei nos obrigar a manter, pelo prazo que ela exigir.',
      'Mensagens do formulário de contato e relatórios de erro são guardados pelo tempo necessário para responder e resolver o assunto.',
    ],
  },
  {
    id: 'seguranca',
    h: '9. Segurança',
    p: [
      'A comunicação com o site, o aplicativo e o banco é cifrada (HTTPS), e cada conta só enxerga os próprios dados, por regras de acesso aplicadas no banco. Nenhum sistema é infalível: se acontecer um incidente de segurança que possa causar risco ou dano relevante, comunicaremos a Autoridade Nacional de Proteção de Dados (ANPD) e as pessoas afetadas, como manda a lei.',
    ],
  },
  {
    id: 'direitos',
    h: '10. Seus direitos',
    p: ['Pela LGPD (art. 18), você pode, a qualquer momento:'],
    list: [
      'confirmar se tratamos seus dados e ter acesso a eles;',
      'corrigir dados incompletos, inexatos ou desatualizados;',
      'pedir anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;',
      'pedir a portabilidade dos dados;',
      'saber com quem compartilhamos seus dados;',
      'revogar o consentimento e pedir a eliminação dos dados tratados com base nele;',
      'se opor a um tratamento feito com base em legítimo interesse.',
    ],
    after: [
      `Basta escrever para ${BRAND.email}, de preferência do e-mail da conta. Respondemos em até 15 dias. Você também pode reclamar à ANPD.`,
    ],
  },
  {
    id: 'futuro',
    h: '11. Módulos futuros',
    p: [
      'A clonagem de voz e o assistente de conversação ainda estão em desenvolvimento e não fazem parte da beta atual. Antes de serem liberados, esta política será atualizada, e cada um só funcionará com uma autorização específica, que poderá ser revogada a qualquer momento.',
    ],
  },
]

const TERMOS: Block[] = [
  {
    id: 'aceitacao',
    h: '1. Aceitação',
    p: [
      'Estes termos valem para o uso deste site, do aplicativo IrisFlow Communicator e do app do cuidador, oferecidos pela IrisFlow. Ao criar uma conta ou usar o aplicativo, você declara que leu e concorda com eles e com a Política de privacidade.',
    ],
  },
  {
    id: 'o-que-e',
    h: '2. O que é o IrisFlow',
    p: [
      'O IrisFlow é um recurso de comunicação e de autonomia: transforma o movimento dos olhos, captado por uma webcam comum, em texto, voz sintetizada e controle do computador.',
      'Não é um dispositivo médico, não tem finalidade de diagnóstico, de monitoramento clínico ou de decisão terapêutica, e não substitui avaliação de profissionais de saúde. Não use o IrisFlow como o único meio de pedir socorro em situação de risco à vida.',
    ],
  },
  {
    id: 'beta',
    h: '3. Programa beta',
    list: [
      'A beta é gratuita, sem cartão e sem cobrança, até a data informada na página da beta.',
      'É um software em desenvolvimento: pode ter falhas, mudar de comportamento e ficar indisponível por períodos. Ele recebe atualizações frequentes, que o próprio aplicativo baixa e instala automaticamente.',
      'O aplicativo abre em tela cheia, para os alvos ficarem grandes e nada distrair o olhar.',
      'Pedimos retorno sobre o uso, mas responder é opcional.',
      'Podemos alterar ou encerrar a beta avisando com antecedência por e-mail. Ao fim dela, nada é cobrado automaticamente: qualquer plano pago depende de contratação expressa sua.',
    ],
  },
  {
    id: 'conta',
    h: '4. Conta',
    list: [
      'A conta deve ser criada por um adulto — a própria pessoa que vai usar ou o responsável por ela — com dados verdadeiros, em especial o e-mail, que é o canal de acesso.',
      'O mesmo e-mail e senha abrem o aplicativo do computador e o app do cuidador. Guarde a senha com cuidado e avise a equipe se suspeitar de uso indevido.',
      'Você pode pedir o encerramento da conta a qualquer momento pelo e-mail da equipe.',
    ],
  },
  {
    id: 'licenca',
    h: '5. Licença de uso',
    p: [
      'Concedemos uma licença pessoal, não exclusiva, intransferível e revogável para instalar e usar o IrisFlow durante a beta. Não é permitido redistribuir, sublicenciar, vender, fazer engenharia reversa dos componentes proprietários (como o núcleo de calibração) nem usar o produto para fins ilícitos.',
      'A marca IrisFlow e o código proprietário pertencem à IrisFlow. Componentes publicados como abertos seguem as próprias licenças.',
    ],
  },
  {
    id: 'limites',
    h: '6. Limites do produto',
    list: [
      'A precisão depende da câmera, da iluminação, da distância, da posição da cabeça e do quadro clínico de quem usa.',
      'As medições de precisão feitas até aqui envolveram um único operador da equipe, em ambiente controlado, e ainda não foram replicadas com pacientes do público-alvo.',
      'O controle do sistema operacional é funcional, não milimétrico: alvos muito pequenos, menus densos e arraste preciso ficam fora do alcance confortável do rastreamento por webcam.',
    ],
  },
  {
    id: 'planos',
    h: '7. Planos pagos futuros',
    p: [
      'Os preços de planos exibidos no site durante a beta são previsões, não uma oferta: podem mudar até o lançamento e não podem ser contratados agora. Quando a contratação abrir, as condições — preço, período de avaliação e cancelamento — serão apresentadas antes, conforme o Código de Defesa do Consumidor.',
    ],
  },
  {
    id: 'responsabilidade',
    h: '8. Responsabilidade',
    p: [
      'Trabalhamos para o IrisFlow funcionar bem, mas, por ser uma versão beta gratuita, não garantimos disponibilidade contínua nem ausência de erros. Nada nestes termos afasta direitos que o Código de Defesa do Consumidor assegura a você.',
    ],
  },
  {
    id: 'alteracoes',
    h: '9. Alterações, lei e foro',
    p: [
      'Mudanças relevantes nestes termos serão avisadas por e-mail com antecedência mínima de 30 dias; se não concordar, você pode encerrar a conta sem custo.',
      'Estes termos seguem a lei brasileira. Fica eleito o foro do domicílio do consumidor.',
      `Dúvidas: ${BRAND.email}.`,
    ],
  },
]

function LegalPage({
  eyebrow,
  title,
  lead,
  blocks,
  other,
}: {
  eyebrow: string
  title: string
  lead: string
  blocks: Block[]
  other: { to: string; label: string }
}) {
  return (
    <>
      <PageHead eyebrow={eyebrow} title={title} lead={lead} />
      <section className="section">
        <div className="container container--narrow legal">
          <p className="legal__meta">
            Versão para o período de beta · atualizada em {ATUALIZADO_EM}
          </p>

          <nav className="legal__toc" aria-label="Nesta página">
            <ol>
              {blocks.map((b) => (
                <li key={b.id}>
                  <a href={`#${b.id}`}>{b.h.replace(/^\d+\.\s*/, '')}</a>
                </li>
              ))}
            </ol>
          </nav>

          {blocks.map((b, i) => (
            <Reveal key={b.id} anim="up" delay={Math.min(i, 4) * 60}>
              <div className="legal__block" id={b.id}>
                <h2 className="legal__h">{b.h}</h2>
                {b.p?.map((text) => <p key={text.slice(0, 40)}>{text}</p>)}
                {b.list && (
                  <ul className="legal__list">
                    {b.list.map((text) => (
                      <li key={text.slice(0, 40)}>{text}</li>
                    ))}
                  </ul>
                )}
                {b.after?.map((text) => <p key={text.slice(0, 40)}>{text}</p>)}
              </div>
            </Reveal>
          ))}

          <p className="legal__other">
            Veja também: <Link to={other.to}>{other.label}</Link>.
          </p>
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
      lead="O rastreamento ocular roda no seu computador e nenhuma imagem da câmera sai dele. Aqui está, sem letra miúda, o que guardamos para a conta e o app do cuidador funcionarem, com quem, por quanto tempo e como exercer seus direitos pela LGPD."
      blocks={PRIVACIDADE}
      other={{ to: '/termos', label: 'Termos de uso' }}
    />
  )
}

export function Termos() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Termos de uso"
      lead="As regras de uso do site e do IrisFlow Communicator durante a beta: o que o produto é e não é, seus limites e as responsabilidades de cada parte."
      blocks={TERMOS}
      other={{ to: '/privacidade', label: 'Política de privacidade' }}
    />
  )
}
