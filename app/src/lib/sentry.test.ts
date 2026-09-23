/**
 * Sentry: desligado sem DSN e, ligado, sem dado pessoal nem conteúdo do
 * paciente nos eventos. O módulo nativo está mockado em jest.setup.js.
 */
import * as Sentry from '@sentry/react-native';

describe('sem EXPO_PUBLIC_SENTRY_DSN', () => {
  it('initSentry não inicializa nada', () => {
    jest.isolateModules(() => {
      delete process.env.EXPO_PUBLIC_SENTRY_DSN;
      const m = require('./sentry') as typeof import('./sentry');
      expect(m.sentryEnabled).toBe(false);
      m.initSentry();
      m.reportError(new Error('x'));
    });
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('com DSN', () => {
  const DSN = 'https://abc123@o123.ingest.sentry.io/456';
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  it('inicializa com sendDefaultPii desligado e sem capturas de tela', () => {
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
      const m = require('./sentry') as typeof import('./sentry');
      expect(m.sentryEnabled).toBe(true);
      m.initSentry();
    });
    const opts = (Sentry.init as jest.Mock).mock.calls[0][0];
    expect(opts).toEqual(
      expect.objectContaining({ dsn: DSN, sendDefaultPii: false, attachScreenshot: false, attachViewHierarchy: false, tracesSampleRate: 0 }),
    );
  });
});

describe('limpeza dos eventos', () => {
  const { scrubText, scrubEvent, scrubBreadcrumb } = require('./sentry') as typeof import('./sentry');

  it('troca e-mail, telefone, JWT, token de push e UUID por marcadores', () => {
    const s = scrubText(
      'falhou para mariana@exemplo.com (11) 91234-5678 eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2 ExponentPushToken[xyz] 3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    );
    expect(s).toBe('falhou para [email] [telefone] [jwt] ExponentPushToken[…] [uuid]');
  });

  it('descarta breadcrumbs de console (podem ter texto de mensagem) e corta a query das URLs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'Mensagem: estou com dor' })).toBeNull();
    const b = scrubBreadcrumb({
      category: 'fetch',
      data: { method: 'POST', url: 'https://x.supabase.co/rest/v1/messages?beneficiary_id=eq.123', status_code: 201, body: '{"text":"estou com dor"}' },
    });
    expect(b?.data).toEqual({ method: 'POST', url: 'https://x.supabase.co/rest/v1/messages', status_code: 201 });
  });

  it('remove usuário, extra e corpo da requisição do evento', () => {
    const e = scrubEvent({
      type: undefined,
      user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4' },
      extra: { message: { text: 'quero água' } },
      request: { url: 'https://x/rest/v1/messages?select=*', method: 'GET', data: '{"text":"quero água"}' },
      exception: { values: [{ type: 'Error', value: 'falha ao enviar para joao@x.com' }] },
    });
    expect(e.user).toBeUndefined();
    expect(e.extra).toBeUndefined();
    expect(e.request).toEqual({ url: 'https://x/rest/v1/messages', method: 'GET' });
    expect(e.exception?.values?.[0].value).toBe('falha ao enviar para [email]');
  });
});
