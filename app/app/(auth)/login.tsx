import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, IconButton, IrisLogo, Notice, PressableScale, Screen, Text, TextField } from '@/components';
import { CONTA_DE_TESTE, legalLinks, siteRoute } from '@/lib/config';
import { haptics } from '@/lib/haptics';
import { useApp } from '@/store/AppProvider';
import { sizes, spacing, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { colors } = useTheme();
  const router = useRouter();
  const { signIn, requestPasswordReset, error: appError } = useApp();
  // Em desenvolvimento (Expo Go / dev client) os campos já vêm com a conta de
  // teste real da beta; em build de produção, vazios. Sem aviso nem botão extra.
  const [email, setEmail] = useState<string>(__DEV__ ? CONTA_DE_TESTE.email : '');
  const [password, setPassword] = useState<string>(__DEV__ ? CONTA_DE_TESTE.senha : '');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Fluxo "Esqueci minha senha": `enviando` bloqueia o toque duplo; `enviado` mostra a mensagem neutra. */
  const [reset, setReset] = useState<'ocioso' | 'enviando' | 'enviado'>('ocioso');
  const senhaRef = useRef<TextInput>(null);

  const submit = async () => {
    if (loading) return;
    if (!email.trim() || !password) {
      haptics.aviso();
      setError('Preencha o e-mail e a senha para entrar.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      haptics.erro();
      setError(mensagemDeErro(e, 'Não foi possível entrar agora. Tente de novo em instantes.'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Reaproveita o e-mail já digitado no campo acima — sem tela nova nem prompt.
   * A resposta de sucesso é a mesma exista ou não a conta ("se existir…"): a
   * tela de login não pode servir para descobrir quem é cliente. A senha nova
   * é definida no site, então o texto avisa que o link abre no navegador.
   */
  const esqueci = async () => {
    if (reset === 'enviando') return;
    const alvo = email.trim();
    if (!alvo || !EMAIL_VALIDO.test(alvo)) {
      haptics.aviso();
      setError('Digite seu e-mail acima para receber o link de nova senha.');
      return;
    }
    setError(null);
    setReset('enviando');
    try {
      await requestPasswordReset(alvo);
      haptics.sucesso();
      setReset('enviado');
    } catch (e) {
      setReset('ocioso');
      setError(mensagemDeErro(e, 'Não foi possível enviar o link agora. Tente de novo em instantes.'));
    }
  };

  // O erro local (desta tentativa de login) tem prioridade; na falta dele
  // mostramos o que o AppProvider guardou — por exemplo a falha ao ler a
  // sessão guardada, que é o motivo de o app ter caído aqui.
  const aviso = error ?? (appError ? mensagemDeErro(appError, 'Entre de novo para continuar.') : null);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-back" accessibilityLabel="Voltar" onPress={() => router.back()} variant="tinted" />
        </View>

        <View style={styles.hero}>
          <IrisLogo size={sizes.logo.md} spinning={false} />
          <Text variant="h1" accessibilityRole="header" style={styles.title}>
            Que bom ter você aqui
          </Text>
          <Text variant="body" tone="muted">
            Entre com a sua conta IrisFlow.
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="E-mail"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => senhaRef.current?.focus()}
            submitBehavior="submit"
          />
          <TextField
            ref={senhaRef}
            label="Senha"
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            placeholder="Sua senha"
            secureTextEntry={!show}
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            right={<IconButton icon={show ? 'eye-off-outline' : 'eye-outline'} accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setShow((s) => !s)} />}
          />

          {aviso ? <Notice tone="danger" text={aviso} testID="login-erro" /> : null}
          {reset === 'enviado' ? (
            <Notice tone="success" icon="mail-unread-outline" title="Link enviado" text="Se houver uma conta com este e-mail, o link chega em instantes. Ele abre no navegador: crie a nova senha lá e volte para entrar." />
          ) : null}

          <Button title="Entrar" size="lg" loading={loading} onPress={() => void submit()} style={styles.cta} />
          <Button
            title={reset === 'enviando' ? 'Enviando o link…' : reset === 'enviado' ? 'Enviar o link de novo' : 'Esqueci minha senha'}
            variant="ghost"
            disabled={reset === 'enviando'}
            onPress={() => void esqueci()}
          />
        </View>

        <View style={styles.footer}>
          <PressableScale onPress={() => void Linking.openURL(siteRoute('/beta')).catch(() => undefined)} accessibilityRole="link" style={styles.link}>
            <Text variant="bodySmall" tone="muted" center>
              Ainda não tem conta?{' '}
              <Text variant="bodySmall" tone="primary" weight="semibold">
                Inscreva-se na beta
              </Text>
            </Text>
          </PressableScale>
          <View style={styles.privacy}>
            <Ionicons name="shield-checkmark-outline" size={sizes.icon.sm} color={colors.accentText} />
            <Text variant="caption" tone="muted" style={styles.flexShrink}>
              Imagens da câmera nunca saem do computador do paciente.
            </Text>
          </View>
          {/* Política acessível ANTES do login também (as lojas conferem). */}
          <PressableScale onPress={() => void Linking.openURL(legalLinks.privacy).catch(() => undefined)} accessibilityRole="link" style={styles.link}>
            <Text variant="caption" tone="primary" weight="semibold" center>
              Política de privacidade
            </Text>
          </PressableScale>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  nav: { flexDirection: 'row' },
  hero: { marginTop: spacing.xl, gap: spacing.xs },
  title: { marginTop: spacing.lg },
  form: { marginTop: spacing.xxxl, gap: spacing.lg },
  cta: { marginTop: spacing.xs },
  footer: { marginTop: spacing.xxxl, alignItems: 'center', gap: spacing.xs },
  link: { minHeight: sizes.touch, justifyContent: 'center', paddingHorizontal: spacing.md },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.md },
});
