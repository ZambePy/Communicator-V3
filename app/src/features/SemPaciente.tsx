import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Screen } from '@/components';
import { useApp } from '@/store/AppProvider';
import { spacing } from '@/theme';
import { CadastroDaPessoa } from './CadastroDaPessoa';

/**
 * Conta sem pessoa cadastrada (criou a conta e parou no meio, ou as vagas da
 * beta fecharam no caminho). Desde 31/10/2026 a pessoa é cadastrada aqui mesmo,
 * com o passo 3 do cadastro — antes a tela mandava terminar a inscrição no site.
 * Puxar para baixo recarrega (cadastrou pelo site enquanto isso).
 */
export function SemPaciente() {
  const { refresh, signOut } = useApp();
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
    <Screen refreshing={atualizando} onRefresh={() => void atualizar()} contentContainerStyle={styles.conteudo}>
      <View style={styles.topo} />
      <CadastroDaPessoa acao="Pronto" />
      <View style={styles.sair}>
        <Button title="Sair da conta" variant="ghost" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  conteudo: { flexGrow: 1 },
  topo: { height: spacing.xxl },
  sair: { marginTop: spacing.md },
});
