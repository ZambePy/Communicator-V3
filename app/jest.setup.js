/**
 * Preparação comum dos testes (referenciado em `jest.setupFiles`, no package.json).
 *
 * Só o que TODOS os testes precisam. Mocks de módulos específicos de um teste
 * (cliente Supabase, `useApp`, `expo-constants`) ficam no próprio arquivo de
 * teste, ao lado do que eles distorcem — assim quem lê o teste vê o que é falso.
 */

// Reanimated 4: substitui os worklets por versões síncronas em JS. Sem isto,
// qualquer componente com `useAnimatedStyle` (PressableScale, StatusPill,
// anéis do EmergencyOverlay) quebra ao montar no jsdom/node.
require('react-native-reanimated').setUpTests();

// Insets zerados e frame fixo — o overlay lê `useSafeAreaInsets()` para o padding.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// O ThemeProvider (importado por `@/theme`, que quase tudo importa) lê a
// preferência de tema do AsyncStorage no mount. O mock oficial guarda em memória.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Módulos nativos sem contraparte em Node. Cada um vira uma promessa resolvida:
// o código de produção já ignora as rejeições, e aqui só interessa que não explodam.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Sentry: módulo nativo. O app só o liga com EXPO_PUBLIC_SENTRY_DSN, mas o
// import acontece sempre (src/lib/sentry.ts); aqui tudo vira no-op observável.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: jest.fn((C) => C),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  ErrorBoundary: ({ children }) => children,
}));

// expo-updates: sem binário nativo no Node. Mesma forma da API usada pelo app.
jest.mock('expo-updates', () => ({
  isEnabled: false,
  isEmbeddedLaunch: true,
  channel: null,
  updateId: null,
  runtimeVersion: null,
  createdAt: null,
  checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(async () => ({ isNew: false })),
  reloadAsync: jest.fn(async () => undefined),
}));
