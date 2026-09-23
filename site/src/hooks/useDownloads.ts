import { useEffect, useMemo, useState } from 'react'
import {
  availableOS,
  buildDownloads,
  buildDownloadsFromRelease,
  detectOS,
  platformsText,
  RELEASES_AVAILABLE,
  RELEASES_PAGE,
  RELEASES_REPO,
  type OS,
  type PlatformDownload,
  type ReleaseSnapshot,
} from '@/lib/releases'
import { fetchLatestRelease, readCachedRelease } from '@/lib/latestRelease'

/**
 * De onde veio a disponibilidade dos instaladores (sempre limitada aos
 * sistemas de VITE_RELEASES_AVAILABLE):
 * - `github`: do último release, consultado agora (ou há menos de 10 min);
 * - `fallback`: a API falhou ou estourou o limite, vale VITE_RELEASES_AVAILABLE;
 * - `pending`: a consulta ainda não voltou; enquanto isso, também o estático.
 */
export type DownloadsStatus = 'github' | 'fallback' | 'pending'

export type Downloads = {
  /** Windows, macOS e Linux, com o sistema do visitante primeiro. */
  platforms: PlatformDownload[]
  /** Sistema detectado pelo navegador (null no celular ou se não der para saber). */
  detected: OS | null
  /** Página do GitHub com todas as versões. */
  releasesPage: string
  status: DownloadsStatus
  /** Frases de plataforma coerentes com os botões ("Windows 10/11 (macOS e Linux em preparação)"). */
  platformsText: ReturnType<typeof platformsText>
}

/** Leitura do navegador isolada, para os testes poderem trocar. */
function currentOS(): OS | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return detectOS(nav.userAgent ?? '', nav.userAgentData?.platform ?? nav.platform ?? '')
}

type Estado = { status: DownloadsStatus; snapshot: ReleaseSnapshot | null }

function estadoInicial(): Estado {
  const guardado = readCachedRelease(RELEASES_REPO)
  if (!guardado) return { status: 'pending', snapshot: null }
  return guardado.snapshot
    ? { status: 'github', snapshot: guardado.snapshot }
    : { status: 'fallback', snapshot: null }
}

/**
 * Links dos instaladores com o sistema do visitante destacado e posto na
 * frente. A disponibilidade vem do último release do GitHub
 * (src/lib/latestRelease.ts); até a resposta chegar — e se ela falhar —,
 * vale a configuração do build. Vários painéis na mesma página dividem um
 * único pedido.
 */
export function useDownloads(): Downloads {
  const detected = useMemo(currentOS, [])
  const [estado, setEstado] = useState<Estado>(estadoInicial)

  useEffect(() => {
    if (estado.status !== 'pending') return
    let vivo = true
    void fetchLatestRelease(RELEASES_REPO).then((snapshot) => {
      if (!vivo) return
      setEstado(snapshot ? { status: 'github', snapshot } : { status: 'fallback', snapshot: null })
    })
    return () => {
      vivo = false
    }
  }, [estado.status])

  return useMemo(() => {
    const all = estado.snapshot
      ? buildDownloadsFromRelease(estado.snapshot, RELEASES_AVAILABLE)
      : buildDownloads(RELEASES_REPO, RELEASES_AVAILABLE)
    const platforms = detected
      ? [...all.filter((p) => p.os === detected), ...all.filter((p) => p.os !== detected)]
      : all
    return {
      platforms,
      detected,
      releasesPage: RELEASES_PAGE,
      status: estado.status,
      platformsText: platformsText(availableOS(all)),
    }
  }, [estado, detected])
}
