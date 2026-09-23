/**
 * Config dinâmica mínima por cima de app.json (tudo o mais mora lá).
 *
 * Existe por um motivo só: o push no ANDROID (Expo → FCM) exige o
 * `google-services.json` do Firebase no build, e esse arquivo NÃO é
 * versionado (.gitignore). Ele chega ao build de duas formas:
 *
 *   - EAS Build: variável de ambiente do tipo ARQUIVO `GOOGLE_SERVICES_JSON`
 *       eas env:create --environment production --name GOOGLE_SERVICES_JSON \
 *         --type file --value ./google-services.json --visibility secret
 *     (repita para preview/development). O EAS grava o arquivo e põe o
 *     caminho na variável.
 *   - Local (`npx expo prebuild`/`run:android`): o arquivo em app/google-services.json.
 *
 * Sem nenhum dos dois o build sai normalmente, mas SEM push no Android — os
 * alertas chegam só com o app aberto (realtime). Ver o README da raiz,
 * "Hospedagem e publicação" → "App do cuidador (EAS)".
 *
 * Observação: com este arquivo presente, `eas init` e `eas update:configure`
 * não editam app.json sozinhos — eles imprimem o projectId/URL para você
 * colar em app.json (`extra.eas.projectId` e `updates.url`).
 */
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined);

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
