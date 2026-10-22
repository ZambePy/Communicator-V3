import { Link } from 'react-router-dom'
import { Button } from './Button'
import { Icon } from './Icon'
import { useDownloads } from '@/hooks/useDownloads'
import { LOJAS } from '@/lib/lojas'
import { diaEMes } from '@/lib/lancamento'
import './baixar-apk.css'

/**
 * O botão de baixar o app do cuidador para Android (APK da beta).
 *
 * Existe por causa de um defeito relatado em 18/10/2026: no celular, nenhum
 * "baixar o app" do site levava ao APK. Os botões levavam a /baixar, onde só
 * havia o selo do Google Play "em breve" — que é navegação, não download — e
 * o código QR (/app) jogava o Android numa seção da página do app onde o APK
 * era uma palavra no meio de uma frase. Agora o APK é um botão, nos três
 * lugares (/baixar, /app e /cuidador), com o passo a passo de instalação.
 *
 * O link abre na MESMA aba: o arquivo vem do GitHub com
 * `Content-Disposition: attachment`, e o navegador baixa sem sair da página.
 */
type Props = {
  /** O download só abre no lançamento da beta (a mesma trava do computador). */
  lancou: boolean
  /** Data do lançamento, para o aviso de espera. */
  liberaEm: string
  /** Sem o passo a passo — para lugares estreitos. */
  compacto?: boolean
  /**
   * O arquivo, quando quem chama já sabe qual é (o painel de download usa o do
   * último release). Sem ele, vale o link configurado (VITE_APP_CUIDADOR_URL).
   */
  url?: string
}

/** Navegadores embutidos (Instagram, Facebook, Line, WebView) costumam ignorar downloads. */
export function emNavegadorEmbutido(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|; wv\)/i.test(ua)
}

export function BaixarApk({ lancou, liberaEm, compacto = false, url }: Props) {
  const arquivo = url ?? LOJAS.apk
  if (!arquivo) return null
  if (!lancou) {
    return (
      <p className="baixar-apk__espera">
        <Icon name="cadeado" size={18} /> O app para Android sai no dia do lançamento, {diaEMes(liberaEm)}.
      </p>
    )
  }
  return (
    <div className="baixar-apk">
      <Button href={arquivo} externo={false} size="lg" icon={<Icon name="download" size={20} />}>
        Baixar para Android
      </Button>
      <p className="baixar-apk__tamanho">Arquivo APK, cerca de 110 MB. Prefira o Wi-Fi.</p>
      {emNavegadorEmbutido() && (
        <p className="baixar-apk__aviso" role="note">
          Você abriu esta página por dentro de outro aplicativo, que não baixa arquivos. Toque nos três pontinhos e
          escolha <strong>Abrir no Chrome</strong>.
        </p>
      )}
      {!compacto && (
        <ol className="baixar-apk__passos">
          <li>Toque em <strong>Baixar para Android</strong>. O download segue na barra de notificações.</li>
          <li>Abra o arquivo baixado.</li>
          <li>
            Se o Android pedir, permita <strong>instalar apps desta fonte</strong> e toque em Instalar.
          </li>
        </ol>
      )}
    </div>
  )
}

/**
 * O botão do APK com o arquivo do último release (useDownloads), e não só o
 * link fixo: release publicado sem o APK vira um aviso, em vez de um botão que
 * daria 404 (relato de 19/10/2026). Antes de a consulta voltar — e se ela
 * falhar —, vale o link configurado, como nos instaladores do computador.
 */
export function ApkDoRelease(props: Omit<Props, 'url'>) {
  const { apk } = useDownloads()
  if (apk.situacao === 'nao-oferecido') return null
  if (apk.situacao === 'fora-do-release') {
    return (
      <p className="baixar-apk__fora" role="status">
        O app para Android não está na versão publicada agora. Se precisar dele, fale com a equipe
        pelo{' '}
        <Link to="/contato" className="link-ok">
          contato
        </Link>
        .
      </p>
    )
  }
  return <BaixarApk {...props} url={apk.url} />
}
