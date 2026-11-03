# Publica o APK novo do app do cuidador no release atual do Communicator-V3.
# Usa a API do GitHub com o login que o Git ja guarda neste PC (o token nao e
# exibido nem gravado). Guarda antes uma copia do APK que esta no ar
# (pasta _apk_anterior) e, se o envio falhar, devolve a copia ao release.
# Registro completo em publicar-apk-cuidador.log (na raiz do IrisFlow V2).

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$raiz = Split-Path -Parent $PSScriptRoot
$log = Join-Path $raiz 'publicar-apk-cuidador.log'
Start-Transcript -Path $log -Force | Out-Null

$BUILD_ID = '159026c3-6467-40f0-a2b4-72c51eb38280'
$REPO = 'ZambePy/Communicator-V3'
$NOME = 'IrisFlow-Cuidador.apk'
$API = "https://api.github.com/repos/$REPO"

function Parar($msg) { Write-Host "PAROU: $msg" -ForegroundColor Red; Stop-Transcript | Out-Null; exit 1 }

function Enviar($arquivo, $releaseId, $h) {
  $u = "https://uploads.github.com/repos/$REPO/releases/$releaseId/assets?name=$NOME"
  Invoke-RestMethod -Method Post -Uri $u -Headers $h -ContentType 'application/vnd.android.package-archive' -InFile $arquivo -TimeoutSec 900 -ErrorAction Stop
}

try {
  Write-Host '== 1. Login do GitHub guardado pelo Git'
  $saida = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
  $tok = ($saida | Where-Object { $_ -like 'password=*' }) -replace '^password=', ''
  if (-not $tok) { Parar 'o Git nao tem login do GitHub guardado' }
  $h = @{ Authorization = "Bearer $tok"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'irisflow-publicar-apk'; 'X-GitHub-Api-Version' = '2022-11-28' }
  $rel = Invoke-RestMethod -Uri "$API/releases/latest" -Headers $h -ErrorAction Stop
  Write-Host "release atual: $($rel.tag_name)"

  Write-Host '== 2. Link do APK no EAS'
  Set-Location (Join-Path $raiz 'app')
  $json = npx --yes eas-cli build:view $BUILD_ID --json 2>$null | Out-String
  $build = $json | ConvertFrom-Json -ErrorAction Stop
  Write-Host ("status: {0} | perfil: {1} | plataforma: {2}" -f $build.status, $build.buildProfile, $build.platform)
  if ($build.status -ne 'FINISHED') { Parar "build nao terminou (status $($build.status))" }
  # So APK de teste: o perfil production gera .aab, que tambem e zip e passaria
  # no teste do "PK" la embaixo, mas nao instala no celular.
  if ($build.buildProfile -ne 'preview') { Parar "o build nao e do perfil preview (perfil $($build.buildProfile))" }
  if ($build.platform -ne 'ANDROID') { Parar "o build nao e Android (plataforma $($build.platform))" }
  Write-Host ("versao: {0} | commit: {1}" -f $build.appVersion, $build.gitCommitHash)
  $url = $build.artifacts.buildUrl
  if (-not $url) { $url = $build.artifacts.applicationArchiveUrl }
  if (-not $url) { Parar 'build sem link de APK' }
  Write-Host "link: $url"

  Write-Host '== 3. Baixar o APK novo'
  $tmp = Join-Path $env:TEMP 'irisflow-apk-novo'
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $novo = Join-Path $tmp $NOME
  Invoke-WebRequest -Uri $url -OutFile $novo -UseBasicParsing -ErrorAction Stop
  $bytes = [System.IO.File]::ReadAllBytes($novo)
  if ($bytes.Length -lt 1MB -or $bytes[0] -ne 0x50 -or $bytes[1] -ne 0x4B) { Parar 'o arquivo baixado nao e um APK' }
  Write-Host ("APK novo: {0:N1} MB" -f ($bytes.Length / 1MB))

  Write-Host '== 4. Copia do APK que esta no ar'
  $bkp = Join-Path $raiz "_apk_anterior\$($rel.tag_name)"
  New-Item -ItemType Directory -Force -Path $bkp | Out-Null
  $antigoArq = Join-Path $bkp $NOME
  $antigo = $rel.assets | Where-Object { $_.name -eq $NOME }
  if ($antigo) {
    Invoke-WebRequest -Uri $antigo.browser_download_url -OutFile $antigoArq -UseBasicParsing -ErrorAction Stop
    Write-Host ("copia guardada: {0:N1} MB em {1}" -f ((Get-Item $antigoArq).Length / 1MB), $bkp)
  } else { Write-Host 'aviso: o release nao tinha APK antes' }

  Write-Host '== 5. Publicar'
  if ($antigo) { Invoke-RestMethod -Method Delete -Uri "$API/releases/assets/$($antigo.id)" -Headers $h -ErrorAction Stop | Out-Null }
  try {
    $r = Enviar $novo $rel.id $h
    Write-Host ("enviado: {0} ({1:N1} MB)" -f $r.name, ($r.size / 1MB))
  } catch {
    Write-Host "envio falhou: $($_.Exception.Message)" -ForegroundColor Red
    if ($antigo) { Enviar $antigoArq $rel.id $h | Out-Null; Write-Host 'o APK anterior foi devolvido ao release' }
    Parar 'APK novo nao publicado'
  }
  $corpo = @{ name = 'IRISFLOW_APK_CUIDADOR_URL'; value = $url } | ConvertTo-Json
  try { Invoke-RestMethod -Method Patch -Uri "$API/actions/variables/IRISFLOW_APK_CUIDADOR_URL" -Headers $h -Body $corpo -ContentType 'application/json' -ErrorAction Stop | Out-Null; Write-Host 'variavel IRISFLOW_APK_CUIDADOR_URL atualizada' }
  catch {
    try { Invoke-RestMethod -Method Post -Uri "$API/actions/variables" -Headers $h -Body $corpo -ContentType 'application/json' -ErrorAction Stop | Out-Null; Write-Host 'variavel IRISFLOW_APK_CUIDADOR_URL criada' }
    catch { Write-Host "aviso: nao consegui gravar a variavel IRISFLOW_APK_CUIDADOR_URL ($($_.Exception.Message))" }
  }

  Write-Host '== 6. Conferencia'
  $rel2 = Invoke-RestMethod -Uri "$API/releases/latest" -Headers $h -ErrorAction Stop
  $a = $rel2.assets | Where-Object { $_.name -eq $NOME }
  Write-Host ("no ar em {0}: {1} - {2:N1} MB" -f $rel2.tag_name, $a.name, ($a.size / 1MB))
  Write-Host "OK: https://github.com/$REPO/releases/latest/download/$NOME" -ForegroundColor Green
} catch {
  Parar $_.Exception.Message
}
Stop-Transcript | Out-Null
