import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import { Button, CampoDeCodigo, IconButton, Notice, PassosDoCadastro, Screen, Text, TextField } from '@/components';
import { ehErro } from '@/data/types';
import { CadastroDaPessoa } from '@/features/CadastroDaPessoa';
import { legalLinks } from '@/lib/config';
import { haptics } from '@/lib/haptics';
import { marcarTutorialVisto } from '@/lib/tutorial';
import { useApp } from '@/store/AppProvider';
import { sizes, spacing, useEntrada, useTheme } from '@/theme';
import { ESPERA_DO_REENVIO_S, relogio, SENHA_MINIMA } from '@/utils/cadastro';
import { mensagemDeErro } from '@/utils/errors';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Passo = 1 | 2 | 3;

/**
 * Criar conta DENTRO do app (31/10/2026; antes o botão abria o site). Três
 * passos na mesma tela (mock 03-05), com a sequência exata do site:
 *  1. nome, e-mail e senha → `auth.signUp` (com `buyer_name`, `newsletter` e
 *     `terms_accepted_at`);
 *  2. os 4 números do e-mail → `confirmar_codigo` → `verifyOtp` (a sessão abre
 *     aqui) → a senha do passo 1 é regravada;
 *  3. para quem é → `complete_beta_registration`.
 * A guarda de rotas deixa esta tela seguir até o fim depois que a sessão abre.
 */
export default function CriarConta() {
  const router = useRouter();
  const entrada = useEntrada();
  const { colors } = useTheme();
  const { cadastrar, confirmarCodigo, reenviarCodigo } = useApp();
  const [passo, setPasso] = useState<Passo>(1);

  // passo 1
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  // Quem cria a conta precisa ser adulto (LGPD art. 14); a pessoa acompanhada pode ser menor.
  const [maioridade, setMaioridade] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [criando, setCriando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [jaTemConta, setJaTemConta] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const senhaRef = useRef<TextInput>(null);

  // passo 2
  const [codigo, setCodigo] = useState('');
  const [conferindo, setConferindo] = useState(false);
  const [erroDoCodigo, setErroDoCodigo] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [restante, setRestante] = useState(0);
  const [reenviando, setReenviando] = useState(false);
  const [avisoDoReenvio, setAvisoDoReenvio] = useState<string | null>(null);

  useEffect(() => {
    if (passo !== 2 || restante <= 0) return;
    const t = setTimeout(() => setRestante((r) => r - 1), 1_000);
    return () => clearTimeout(t);
  }, [passo, restante]);

  const erros = {
    nome: tentou && !nome.trim() ? 'Escreva seu nome.' : null,
    email: tentou && !EMAIL_VALIDO.test(email.trim()) ? 'Confira o e-mail.' : null,
    senha: tentou && senha.length < SENHA_MINIMA ? `Use pelo menos ${SENHA_MINIMA} caracteres.` : null,
    maioridade: tentou && !maioridade ? 'A conta precisa ser criada por um adulto. Se você é menor de idade, peça ao responsável.' : null,
  };

  const criar = async () => {
    setTentou(true);
    if (criando || !nome.trim() || !EMAIL_VALIDO.test(email.trim()) || senha.length < SENHA_MINIMA || !maioridade) {
      haptics.aviso();
      return;
    }
    setCriando(true);
    setFalha(null);
    setJaTemConta(false);
    try {
      const r = await cadastrar({ nome, email, senha, maioridade });
      void marcarTutorialVisto();
      if (r === 'sessao') {
        setPasso(3);
      } else {
        setCodigo('');
        setErroDoCodigo(null);
        setRestante(ESPERA_DO_REENVIO_S);
        setPasso(2);
      }
    } catch (e) {
      haptics.erro();
      if (ehErro(e, 'EmailJaCadastrado')) setJaTemConta(true);
      else setFalha(mensagemDeErro(e, 'Não deu para criar a conta agora. Tente de novo.'));
    } finally {
      setCriando(false);
    }
  };

  const conferir = async (v: string) => {
    if (conferindo || bloqueado || v.length !== 4) return;
    setConferindo(true);
    setErroDoCodigo(null);
    try {
      await confirmarCodigo(email, v, senha);
      setPasso(3);
    } catch (e) {
      haptics.erro();
      setCodigo('');
      if (ehErro(e, 'CodigoBloqueado')) setBloqueado(true);
      setErroDoCodigo(ehErro(e, 'CodigoIncorreto') || ehErro(e, 'CodigoBloqueado') ? (e as Error).message : mensagemDeErro(e, 'Não deu para conferir agora. Tente de novo.'));
    } finally {
      setConferindo(false);
    }
  };

  const reenviar = async () => {
    if (reenviando || restante > 0) return;
    setReenviando(true);
    setAvisoDoReenvio(null);
    try {
      await reenviarCodigo(email);
      setRestante(ESPERA_DO_REENVIO_S);
      setAvisoDoReenvio('Mandamos de novo.');
    } catch (e) {
      setAvisoDoReenvio(mensagemDeErro(e, 'Não deu para mandar agora.'));
    } finally {
      setReenviando(false);
    }
  };

  const voltar = () => {
    if (passo === 2) {
      setPasso(1);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  };

  const abrir = (url: string) => void Linking.openURL(url).catch(() => undefined);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Screen contentContainerStyle={styles.conteudo}>
        <PassosDoCadastro passo={passo} onVoltar={passo < 3 ? voltar : undefined} />

        {passo === 1 ? (
          <Animated.View key="passo-1" entering={entrada.passo()} exiting={entrada.passoSaida()} style={styles.flex}>
            <Text variant="h1" accessibilityRole="header">
              Crie sua conta
            </Text>
            <TextField
              label="Seu nome"
              value={nome}
              onChangeText={setNome}
              placeholder="Nome e sobrenome"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              submitBehavior="submit"
              error={erros.nome}
              style={styles.campo}
            />
            <TextField
              ref={emailRef}
              label="E-mail"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setJaTemConta(false);
              }}
              placeholder="seu@email.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => senhaRef.current?.focus()}
              submitBehavior="submit"
              error={erros.email ?? (jaTemConta ? 'Este e-mail já tem conta.' : null)}
              style={styles.campo}
            />
            <TextField
              ref={senhaRef}
              label="Senha"
              value={senha}
              onChangeText={setSenha}
              placeholder={`Pelo menos ${SENHA_MINIMA} caracteres`}
              secureTextEntry={!mostrarSenha}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={() => void criar()}
              error={erros.senha}
              right={<IconButton icon={mostrarSenha ? 'eye-off-outline' : 'eye-outline'} accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setMostrarSenha((m) => !m)} />}
              style={styles.campo}
            />
            <Text variant="caption" tone="muted" style={styles.dica}>
              É a mesma conta que você vai usar no computador da pessoa.
            </Text>
            {/* A linha inteira liga e desliga (alvo de 64 pt), e o leitor de tela a lê como um interruptor só. */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: maioridade }}
              accessibilityLabel="Tenho 18 anos ou mais"
              onPress={() => setMaioridade((m) => !m)}
              style={styles.maioridade}
              testID="maioridade"
            >
              <Text variant="body" style={styles.flex}>
                Tenho 18 anos ou mais
              </Text>
              <Switch
                value={maioridade}
                onValueChange={setMaioridade}
                trackColor={{ true: colors.primary, false: colors.border }}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
              />
            </Pressable>
            {erros.maioridade ? (
              <Text variant="bodySmall" tone="danger" accessibilityLiveRegion="polite" testID="erro-da-maioridade">
                {erros.maioridade}
              </Text>
            ) : null}
            {jaTemConta ? (
              <Button title="Entrar com este e-mail" variant="secondary" onPress={() => router.replace({ pathname: '/(auth)/login', params: { email: email.trim().toLowerCase() } })} style={styles.campo} />
            ) : null}
            {falha ? <Notice tone="danger" text={falha} style={styles.campo} testID="falha-da-conta" /> : null}

            <View style={styles.baixo}>
              <Text variant="caption" tone="muted" center style={styles.termos}>
                Ao continuar, você aceita os{' '}
                <Text variant="caption" tone="primary" weight="semibold" accessibilityRole="link" onPress={() => abrir(legalLinks.terms)} style={styles.sublinhado}>
                  Termos
                </Text>{' '}
                e a{' '}
                <Text variant="caption" tone="primary" weight="semibold" accessibilityRole="link" onPress={() => abrir(legalLinks.privacy)} style={styles.sublinhado}>
                  Política de privacidade
                </Text>
                .
              </Text>
              <Button title="Continuar" size="lg" loading={criando} onPress={() => void criar()} />
            </View>
          </Animated.View>
        ) : passo === 2 ? (
          <Animated.View key="passo-2" entering={entrada.passo()} exiting={entrada.passoSaida()} style={styles.flex}>
            <Text variant="h1" accessibilityRole="header">
              Confira seu e-mail
            </Text>
            <Text variant="body" tone="muted" style={styles.subtitulo}>
              Digite os 4 números que mandamos para {email.trim().toLowerCase()}.
            </Text>
            <View style={styles.codigo}>
              <CampoDeCodigo
                value={codigo}
                onChange={(v) => {
                  setCodigo(v);
                  if (v.length < 4) setErroDoCodigo(null);
                }}
                onCompleto={(v) => void conferir(v)}
                erro={Boolean(erroDoCodigo)}
                editavel={!bloqueado && !conferindo}
              />
            </View>
            {erroDoCodigo ? (
              <Text variant="bodySmall" tone="danger" style={styles.dica} accessibilityLiveRegion="assertive" testID="erro-do-codigo">
                {erroDoCodigo}
              </Text>
            ) : null}
            <Text variant="caption" tone="muted" style={styles.dica} accessibilityLiveRegion="polite">
              Não chegou? Olhe o spam ou{' '}
              {restante > 0 ? (
                <Text variant="caption" tone="muted">
                  mande de novo em {relogio(restante)}
                </Text>
              ) : (
                <Text variant="caption" tone="primary" weight="semibold" accessibilityRole="button" onPress={() => void reenviar()} style={styles.sublinhado}>
                  {reenviando ? 'mandando…' : 'mande de novo'}
                </Text>
              )}
              .
            </Text>
            {avisoDoReenvio ? (
              <Text variant="caption" tone="muted" style={styles.dica}>
                {avisoDoReenvio}
              </Text>
            ) : null}
            <View style={styles.baixo}>
              <Button title="Confirmar" size="lg" loading={conferindo} disabled={codigo.length !== 4 || bloqueado} onPress={() => void conferir(codigo)} />
            </View>
          </Animated.View>
        ) : (
          <Animated.View key="passo-3" entering={entrada.passo()} style={styles.flex}>
            <CadastroDaPessoa onPronto={() => router.replace('/(tabs)')} />
          </Animated.View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  conteudo: { flexGrow: 1 },
  campo: { marginTop: spacing.lg },
  subtitulo: { marginTop: spacing.md },
  dica: { marginTop: spacing.md },
  maioridade: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizes.row, marginTop: spacing.md },
  codigo: { marginTop: spacing.xxxl },
  baixo: { marginTop: 'auto', paddingTop: spacing.xxxl, gap: spacing.md },
  termos: { paddingHorizontal: spacing.md },
  sublinhado: { textDecorationLine: 'underline' },
});
