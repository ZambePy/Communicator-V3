// Metro padrão do Expo + serializador do Sentry (grava o "debug ID" no bundle,
// que casa o erro com o source map enviado no EAS Build). Sem DSN/token o
// efeito é só esse carimbo — nada é enviado.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
