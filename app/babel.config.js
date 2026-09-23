module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      // Bundle de produção (`eas build` release, `eas update`, `expo export`
      // rodam com NODE_ENV=production): some com console.log/info/debug —
      // custam CPU na ponte e podem vazar dado em logcat/Console do Mac.
      // `error` e `warn` ficam: são o que o Sentry e o suporte leem.
      // Em desenvolvimento e no Jest (NODE_ENV=test) nada muda.
      production: {
        plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
      },
    },
  };
};
