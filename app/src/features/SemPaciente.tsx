import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, EmptyState, Screen } from '@/components';
import { siteRoute } from '@/lib/config';
import { useApp } from '@/store/AppProvider';
import { spacing } from '@/theme';

/**
 * Conta sem paciente cadastrado.
 *
 * Acontece quando a pessoa criou o login mas não terminou a inscrição da beta
 * no site (e-mail a confirmar, ou vagas encerradas no meio do caminho). Antes,
 * todas as abas ficavam em esqueleto de carregamento para sempre, a conversa
 * "enviava" sem enviar e os ajustes diziam "Salvo" sem salvar — sem nenhuma
 * pista do que fazer. Aqui a tela diz o que falta, leva ao site e deixa
 * recarregar ou sair.
 */
export function SemPaciente() {
  const { profile, refresh, signOut } = useApp();
  const [atualizando, setAtualizando] = useState(false);

  const atualizar = async () => {
    setAtualizando(true);
    try {
      await refresh();
    } finally {
      setAtualizando(false);
    }
  };

  return (
    <Screen contentContainerStyle={styles.centro}>
      <EmptyState
        icon="person-add-outline"
        title="Falta cadastrar o paciente"
        body={`${profile?.email ? `A conta ${profile.email}` : 'Esta conta'} ainda não tem um paciente. Termine a inscrição da beta no site, com este mesmo e-mail, e depois toque em Atualizar.`}
        action={{ label: 'Abrir a inscrição no site', icon: 'open-outline', onPress: () => void Linking.openURL(siteRoute('/beta')).catch(() => undefined) }}
      />
      <View style={styles.acoes}>
        <Button title="Atualizar" icon="refresh" loading={atualizando} onPress={() => void atualizar()} />
        <Button title="Sair da conta" variant="ghost" icon="log-out-outline" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centro: { flexGrow: 1, justifyContent: 'center' },
  acoes: { gap: spacing.sm, marginTop: spacing.lg },
});
