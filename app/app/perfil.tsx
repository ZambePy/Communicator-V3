import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar, FolhaDeEdicao, GrupoDeLinhas, IconButton, LinhaDeValor, Screen, Text } from '@/components';
import { useApp } from '@/store/AppProvider';
import { spacing } from '@/theme';
import { firstName } from '@/utils/format';
import { formatarCelular, resumoDaPessoa, resumoDosComputadores, soDigitos } from '@/utils/pessoa';

type Campo = 'nome' | 'celular' | null;

/**
 * Meu perfil (31/10/2026, mock 09): o cuidador tem um perfil próprio. Nome e
 * celular se editam aqui (`profiles`, RLS `profiles_update_own`); o e-mail é o
 * da conta e só se lê. Sem foto: as iniciais numa cor que é sempre a mesma
 * (nenhuma biblioteca de imagem é dependência do app).
 */
export default function Perfil() {
  const router = useRouter();
  const { profile, patient, devices, atualizarPerfil } = useApp();
  const [editando, setEditando] = useState<Campo>(null);
  const nomeDaPessoa = patient ? firstName(patient.user_name) : null;

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="chevron-back" variant="tinted" accessibilityLabel="Voltar" onPress={() => router.back()} />
      </View>

      <View style={styles.topo}>
        <Avatar name={profile?.buyer_name} chave={profile?.id} size="lg" umaLetra />
        <Text variant="h1" center accessibilityRole="header" style={styles.nome}>
          {profile?.buyer_name ?? 'Meu perfil'}
        </Text>
        {nomeDaPessoa ? (
          <Text variant="bodySmall" tone="muted" center>
            Cuida de {nomeDaPessoa}
          </Text>
        ) : null}
      </View>

      <GrupoDeLinhas titulo="Sobre você">
        <LinhaDeValor rotulo="Nome" valor={profile?.buyer_name ?? ''} onPress={() => setEditando('nome')} accessibilityHint="Toque para mudar" testID="perfil-nome" />
        <LinhaDeValor rotulo="Celular" valor={profile?.phone ? formatarCelular(profile.phone) : 'Adicionar'} tom={profile?.phone ? 'muted' : 'default'} onPress={() => setEditando('celular')} accessibilityHint="Toque para mudar" testID="perfil-celular" />
        <LinhaDeValor rotulo="E-mail" valor={profile?.email ?? ''} />
      </GrupoDeLinhas>

      {patient ? (
        <GrupoDeLinhas titulo="A pessoa">
          <LinhaDeValor rotulo={patient.user_name} valor={resumoDaPessoa(patient)} onPress={() => router.push('/paciente')} />
          <LinhaDeValor rotulo="Computadores" valor={resumoDosComputadores(devices)} onPress={() => router.push('/paciente')} />
        </GrupoDeLinhas>
      ) : null}

      <FolhaDeEdicao
        visivel={editando === 'nome'}
        titulo="Seu nome"
        rotulo="Nome"
        valorInicial={profile?.buyer_name ?? ''}
        autoCapitalize="words"
        validar={(v) => (v.trim() ? null : 'Escreva seu nome.')}
        onSalvar={(v) => atualizarPerfil({ buyer_name: v })}
        onFechar={() => setEditando(null)}
      />
      <FolhaDeEdicao
        visivel={editando === 'celular'}
        titulo="Seu celular"
        rotulo="Celular com DDD"
        valorInicial={profile?.phone ? formatarCelular(profile.phone) : ''}
        placeholder="(11) 9 8765-4321"
        teclado="phone-pad"
        validar={(v) => {
          const d = soDigitos(v);
          return d.length === 0 || d.length === 10 || d.length === 11 ? null : 'Use DDD e número: 10 ou 11 dígitos.';
        }}
        onSalvar={(v) => atualizarPerfil({ phone: soDigitos(v) || null })}
        onFechar={() => setEditando(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', marginBottom: spacing.sm },
  topo: { alignItems: 'center', gap: spacing.xxs },
  nome: { marginTop: spacing.md },
});
