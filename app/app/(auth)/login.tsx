import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button, Card, GradientHeader, IrisLogo, PressableScale, Screen, Text } from '@/components';
import { siteRoute } from '@/lib/config';
import { useApp } from '@/store/AppProvider';
import { fonts, radius, spacing, useTheme } from '@/theme';

export default function Login() {
  const { colors } = useTheme();
  const router = useRouter();
  const { signIn, requestPasswordReset, isDemo, error: appError } = useApp();
  const [email, setEmail] = useState(isDemo ? 'mariana@exemplo.com' : '');
  const [password, setPassword] = useState(isDemo ? 'demo' : '');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Fluxo "Esqueci minha senha": `enviando` bloqueia o toque duplo; `enviado` mostra a mensagem neutra. */
  const [reset, setReset] = useState<'ocioso' | 'enviando' | 'enviado'>('ocioso');

  const submit = async () => {
    if (!email || !password) {
      setError('Informe e-mail e senha.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError((e as Error).message);
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
    if (!alvo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alvo)) {
      setError('Digite seu e-mail no campo acima para receber o link de redefinição.');
      return;
    }
    setError(null);
    setReset('enviando');
    try {
      await requestPasswordReset(alvo);
      setReset('enviado');
    } catch (e) {
      setReset('ocioso');
      setError((e as Error).message);
    }
  };

  const input = [styles.input, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }];

  // O erro local (desta tentativa de login) tem prioridade; na falta dele
  // mostramos o que o AppProvider guardou — por exemplo a falha ao ler a
  // sessão do SecureStore, que é o motivo de o app ter caído aqui.
  const aviso = error ?? appError;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen padded={false} keyboardShouldPersistTaps="handled">
        <GradientHeader overlap={60}>
          <PressableScale onPress={() => router.back()} hitSlop={12} style={{ alignSelf: 'flex-start' }}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </PressableScale>
          <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
            <IrisLogo size={80} onDark />
            <Text variant="h1" tone="onPrimary" style={{ marginTop: spacing.md }}>
              Bem-vindo de volta
            </Text>
            <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
              Entre com a conta criada no site da IrisFlow (a mesma da beta)
            </Text>
          </View>
        </GradientHeader>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: -50 }}>
          <Card index={0} padding={spacing.xl}>
            <Text variant="label" tone="muted">
              E-mail
            </Text>
            <TextInput
              style={input}
              value={email}
              onChangeText={setEmail}
              placeholder="voce@exemplo.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <Text variant="label" tone="muted" style={{ marginTop: spacing.lg }}>
              Senha
            </Text>
            <View>
              <TextInput style={[input, { paddingRight: 48 }]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.textMuted} secureTextEntry={!show} autoComplete="password" textContentType="password" onSubmitEditing={submit} />
              <PressableScale onPress={() => setShow((s) => !s)} style={styles.eye} hitSlop={10}>
                <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textMuted} />
              </PressableScale>
            </View>

            {aviso && (
              <Animated.View entering={FadeInDown.duration(300)} style={[styles.error, { backgroundColor: colors.dangerTint }]}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text variant="bodySmall" tone="danger" style={{ flex: 1 }}>
                  {aviso}
                </Text>
              </Animated.View>
            )}

            {reset === 'enviado' && (
              <Animated.View entering={FadeInDown.duration(300)} style={[styles.error, { backgroundColor: colors.accentTint }]}>
                <Ionicons name="mail-unread-outline" size={18} color={colors.accentDeep} />
                <Text variant="bodySmall" style={{ flex: 1, color: colors.accentDeep }}>
                  Se existir uma conta com este e-mail, enviamos o link para redefinir a senha. Ele abre no navegador, no site da IrisFlow; defina a senha nova lá e volte aqui para entrar.
                </Text>
              </Animated.View>
            )}

            <Button title="Entrar" size="lg" loading={loading} onPress={submit} style={{ marginTop: spacing.xl }} icon="arrow-forward" />
            <PressableScale onPress={() => void esqueci()} disabled={reset === 'enviando'} style={{ alignSelf: 'center', marginTop: spacing.lg, opacity: reset === 'enviando' ? 0.6 : 1 }} hitSlop={10} accessibilityRole="button">
              <Text variant="bodySmall" tone="primary" weight="semibold">
                {reset === 'enviando' ? 'Enviando link…' : reset === 'enviado' ? 'Enviar o link de novo' : 'Esqueci minha senha'}
              </Text>
            </PressableScale>
            {/* A conta nasce no site (página Beta); o app não cadastra ninguém. */}
            <PressableScale onPress={() => void Linking.openURL(siteRoute('/beta')).catch(() => undefined)} style={{ alignSelf: 'center', marginTop: spacing.md }} hitSlop={10} accessibilityRole="link">
              <Text variant="caption" tone="muted" center>
                Ainda não tem conta? <Text variant="caption" tone="primary" weight="semibold">Inscreva-se na beta no site</Text>
              </Text>
            </PressableScale>
          </Card>

          {isDemo && (
            <Card index={1} tone="accent" style={{ marginTop: spacing.lg }}>
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                <Ionicons name="flask-outline" size={22} color={colors.accentDeep} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" weight="semibold">
                    Modo demonstração
                  </Text>
                  <Text variant="caption" tone="muted">
                    Sem Supabase configurado. Toque em Entrar com qualquer senha para explorar o app com um paciente simulado.
                  </Text>
                </View>
              </View>
            </Card>
          )}

          <Text variant="caption" tone="muted" center style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.lg }}>
            Nenhuma imagem da câmera ou dado de calibração sai do computador do paciente. Este app recebe apenas mensagens, alertas e métricas agregadas.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: { height: 54, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 16, fontFamily: fonts.regular, borderWidth: 1, marginTop: spacing.sm },
  eye: { position: 'absolute', right: spacing.md, top: spacing.sm + 15 },
  error: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', padding: spacing.md, borderRadius: radius.sm, marginTop: spacing.lg },
});
