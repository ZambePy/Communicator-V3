/**
 * O texto técnico do Supabase/fetch não pode chegar à tela: o cuidador precisa
 * saber o que houve e o que fazer. Mensagens que o próprio app já escreveu em
 * português passam intactas.
 */
import { mensagemDeErro, tipoDeFalha } from './errors';

describe('mensagemDeErro', () => {
  it('traduz falhas de rede em "sem internet"', () => {
    for (const bruto of ['TypeError: Network request failed', 'Failed to fetch', 'timeout of 10000ms exceeded', 'Load failed']) {
      expect(tipoDeFalha(new Error(bruto))).toBe('offline');
      expect(mensagemDeErro(new Error(bruto))).toMatch(/Sem internet/);
    }
  });

  it('traduz sessão vencida e recusa da RLS sem mostrar o nome do erro', () => {
    expect(mensagemDeErro(new Error('JWT expired'))).toMatch(/sessão expirou/);
    const rls = mensagemDeErro({ message: 'new row violates row-level security policy for table "messages"' });
    expect(rls).toMatch(/não tem permissão/);
    expect(rls).not.toMatch(/row-level|violates/);
  });

  it('traduz limite de envios', () => {
    expect(mensagemDeErro(new Error('Email rate limit exceeded'))).toMatch(/Aguarde alguns minutos/);
  });

  it('mantém as mensagens que o app já escreveu em português', () => {
    expect(mensagemDeErro(new Error('E-mail ou senha incorretos.'))).toBe('E-mail ou senha incorretos.');
    expect(mensagemDeErro('Confirme seu e-mail antes de entrar.')).toBe('Confirme seu e-mail antes de entrar.');
  });

  it('usa a alternativa para qualquer outro texto técnico', () => {
    expect(mensagemDeErro(new Error('PGRST116'), 'Não deu.')).toBe('Não deu.');
    expect(mensagemDeErro(new Error('Unexpected token < in JSON'), 'Não deu.')).toBe('Não deu.');
    expect(mensagemDeErro(undefined, 'Não deu.')).toBe('Não deu.');
  });
});
