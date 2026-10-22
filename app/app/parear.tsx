import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Notice, Screen, Text } from '@/components';
import { haptics } from '@/lib/haptics';
import { codigoDoLink, entrarComCodigo, MENSAGENS, type FalhaDoPareamento } from '@/lib/pareamento';
import { getSupabase } from '@/lib/supabase';
import { useApp } from '@/store/AppProvider';
import { spacing } from '@/theme';

/**
 * `irisflow://parear?t=<código>` — o celular entra na conta da família pelo
 * código QR do computador, sem senha (pedido do dono de 19/10/2026; o caminho
 * inteiro está em src/lib/pareamento.ts).
 *
 * Nunca entra sozinho: o link pode ter vindo de outro app ou de uma mensagem,
 * e não só da câmera. A tela pergunta e só usa o código depois do toque em
 * "Conectar este celular". Celular que já está numa conta não troca de conta
 * por aqui — trocar tiraria dele os avisos de socorro da família atual sem
 * ninguém perceber; para isso, sair em Ajustes primeiro.
 *
 * Feita só com os componentes do app (Screen, Text, Button, Notice), sem cor
 * própria: acompanha o tema.
 */

/** Depois de entrar, quanto a confirmação fica na tela antes de ir para o início. */
export const ESPERA_ANTES_DO_INICIO_MS = 1_200;

export default function Parear() {
  const params = useLocalSearchParams<{ t?: string | string[] }>();
  const codigo = codigoDoLink(params.t);
  const { ready, user, patient } = useApp();
  const router = useRouter();
  const [fase, setFase] = useState<'pergunta' | 'entrando' | 'conectado'>('pergunta');
  const [falha, setFalha] = useState<FalhaDoPareamento | null>(null);
  const [paciente, setPaciente] = useState<string | null>(null);
  // Se já havia conta quando a tela abriu (e não a que esta tela acabou de abrir).
  const logadoAoAbrir = useRef<boolean | null>(null);
  if (ready && logadoAoAbrir.current === null) logadoAoAbrir.current = Boolean(user);

  // Entrou: a confirmação fica um instante e o app segue para o início. Só com
  // o usuário já no AppProvider — antes disso a guarda de rotas mandaria para
  // as boas-vindas.
  useEffect(() => {
    if (fase !== 'conectado' || !user) return;
    const t = setTimeout(() => router.replace('/(tabs)'), ESPERA_ANTES_DO_INICIO_MS);
    return () => clearTimeout(t);
  }, [fase, user, router]);

  const conectar = async () => {
    if (!codigo || fase !== 'pergunta') return;
    setFase('entrando');
    setFalha(null);
    const r = await entrarComCodigo(getSupabase(), codigo);
    if (r.ok) {
      haptics.sucesso();
      setPaciente(r.paciente);
      setFase('conectado');
    } else {
      haptics.erro();
      setFalha(r.falha);
      setFase('pergunta');
    }
  };

  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!ready) {
    return (
      <Screen>
        <Text variant="body" tone="muted" style={styles.topo}>
          Abrindo…
        </Text>
      </Screen>
    );
  }

  if (logadoAoAbrir.current) {
    return (
      <Screen>
        <View style={styles.bloco}>
          <Text variant="h1" accessibilityRole="header">
            Este celular já está conectado
          </Text>
          <Text variant="body" tone="muted">
            {patient?.user_name
              ? `Ele já recebe os avisos de ${patient.user_name}.`
              : 'Ele já está na conta de uma família.'}{' '}
            Para entrar em outra conta, saia em Ajustes e aponte a câmera para o código de novo.
          </Text>
          <Button title="Ir para o início" size="lg" onPress={() => router.replace('/(tabs)')} />
        </View>
      </Screen>
    );
  }

  if (fase === 'conectado') {
    return (
      <Screen>
        <View style={styles.bloco}>
          <Text variant="h1" accessibilityRole="header">
            Pronto, este celular está conectado
          </Text>
          <Notice
            tone="success"
            text={paciente ? `Agora ele recebe os avisos de ${paciente}. Abrindo o início…` : 'Agora ele recebe os avisos da família. Abrindo o início…'}
          />
          <Button title="Ir para o início" size="lg" onPress={() => router.replace('/(tabs)')} />
        </View>
      </Screen>
    );
  }

  if (!codigo) {
    return (
      <Screen>
        <View style={styles.bloco}>
          <Text variant="h1" accessibilityRole="header">
            Este link não tem um código válido
          </Text>
          <Text variant="body" tone="muted">
            No computador do paciente, abra Configurações e clique em Mostrar o código. Depois aponte a câmera do celular para
            ele.
          </Text>
          <Button title="Entrar com e-mail e senha" size="lg" onPress={() => router.replace('/(auth)/login')} />
          <Button title="Voltar" variant="ghost" onPress={voltar} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.bloco}>
        <Text variant="h1" accessibilityRole="header">
          Conectar este celular?
        </Text>
        <Text variant="body" tone="muted">
          O computador do paciente mostrou um código para este celular entrar na conta da família, sem senha. Ele passa a
          receber os avisos e a conversa do paciente.
        </Text>
        <Notice tone="info" text="Continue só se foi você quem apontou a câmera para o código agora." />
        {falha ? <Notice tone="danger" text={MENSAGENS[falha]} testID="parear-erro" /> : null}
        <Button title="Conectar este celular" size="lg" loading={fase === 'entrando'} onPress={() => void conectar()} />
        <Button title="Agora não" variant="ghost" disabled={fase === 'entrando'} onPress={voltar} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topo: { marginTop: spacing.xxxl },
  bloco: { marginTop: spacing.xxxl, gap: spacing.lg },
});
