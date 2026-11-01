import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, ChoiceChips, FolhaDeEdicao, GrupoDeLinhas, IconButton, LinhaDeValor, ListRow, Notice, Screen, StatusPill, Text } from '@/components';
import { Condition, Relation } from '@/data/types';
import { useApp } from '@/store/AppProvider';
import { radius, sizes, spacing, useTheme } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { firstName, timeAgo } from '@/utils/format';
import { CONDICOES, nomeDaPessoaValido, RELACOES, resumoDaPessoa } from '@/utils/pessoa';

/**
 * A pessoa (31/10/2026): nome, relação e condição se editam aqui
 * (`beneficiaries`, RLS `beneficiaries_update_own`); embaixo, os computadores
 * da conta, com o desvínculo de antes.
 */
export default function Paciente() {
  const { colors } = useTheme();
  const router = useRouter();
  const { patient, beneficiaries, selectPatient, devices, can, revokeDevice, atualizarPaciente } = useApp();
  const [falha, setFalha] = useState<string | null>(null);
  const [falhaDoPerfil, setFalhaDoPerfil] = useState<string | null>(null);
  const [editandoNome, setEditandoNome] = useState(false);
  const nome = patient ? firstName(patient.user_name) : 'a pessoa';

  const salvar = async (mudanca: Parameters<typeof atualizarPaciente>[0]) => {
    setFalhaDoPerfil(null);
    try {
      await atualizarPaciente(mudanca);
    } catch (e) {
      setFalhaDoPerfil(mensagemDeErro(e, 'Não deu para salvar agora. Tente de novo.'));
    }
  };

  const desvincular = (id: string) => {
    setFalha(null);
    revokeDevice(id).catch((e: unknown) => setFalha(mensagemDeErro(e, 'Não foi possível desvincular agora.')));
  };

  const confirmarDesvinculo = (id: string, name: string) => {
    const texto = `${name} deixa de enviar mensagens e pedidos. Para voltar, entre de novo no computador com esta conta.`;
    if (Platform.OS === 'web') return desvincular(id);
    Alert.alert('Desvincular este computador?', texto, [
      { text: 'Manter', style: 'cancel' },
      { text: 'Desvincular', style: 'destructive', onPress: () => desvincular(id) },
    ]);
  };

  // Valores do banco fora das opções da tela ('irmao', 'proprio', 'pc'…) continuam valendo: nenhum chip fica marcado.
  const relacao = patient && RELACOES.some((r) => r.value === patient.relation) ? patient.relation : null;
  const condicao = patient && CONDICOES.some((c) => c.value === patient.condition) ? patient.condition : null;

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="chevron-back" variant="tinted" accessibilityLabel="Voltar" onPress={() => router.back()} />
      </View>

      <View style={styles.topo}>
        <Avatar name={patient?.user_name} chave={patient?.id} size="lg" umaLetra />
        <Text variant="h1" center accessibilityRole="header" style={styles.nome}>
          {patient?.user_name ?? 'A pessoa'}
        </Text>
        {patient ? (
          <Text variant="bodySmall" tone="muted" center>
            {resumoDaPessoa(patient)}
          </Text>
        ) : null}
      </View>

      {beneficiaries.length > 1 ? (
        <GrupoDeLinhas titulo="Quem você acompanha">
          {beneficiaries.map((b) => (
            <LinhaDeValor key={b.id} rotulo={b.user_name} valor={b.id === patient?.id ? 'Agora' : 'Trocar'} tom={b.id === patient?.id ? 'accent' : 'muted'} onPress={() => selectPatient(b.id)} />
          ))}
        </GrupoDeLinhas>
      ) : null}

      {patient ? (
        <>
          <GrupoDeLinhas titulo="Sobre a pessoa">
            <LinhaDeValor rotulo="Como você chama" valor={patient.user_name} onPress={() => setEditandoNome(true)} accessibilityHint="Toque para mudar" />
          </GrupoDeLinhas>
          <Text variant="bodySmall" weight="semibold" tone="muted" style={styles.rotulo}>
            Ela é sua
          </Text>
          <ChoiceChips<Relation> value={relacao as Relation} onChange={(v) => void salvar({ relation: v })} options={RELACOES} accessibilityLabel="A pessoa é sua" />
          <Text variant="bodySmall" weight="semibold" tone="muted" style={styles.rotulo}>
            Condição (opcional)
          </Text>
          <ChoiceChips<Condition> opcional value={condicao} onChange={(v) => void salvar({ condition: v ?? 'prefiro-nao' })} options={CONDICOES} accessibilityLabel="Condição, opcional" />
          {falhaDoPerfil ? <Notice tone="danger" title="Não foi salvo" text={falhaDoPerfil} style={styles.notice} /> : null}
        </>
      ) : null}

      <Text variant="bodySmall" weight="semibold" tone="muted" accessibilityRole="header" style={styles.rotulo}>
        Computadores
      </Text>
      {falha ? <Notice tone="danger" title="Não foi possível desvincular" text={falha} style={styles.notice} /> : null}
      {devices.length === 0 ? (
        <View style={[styles.vazio, { backgroundColor: colors.surface }]}>
          <Ionicons name="desktop-outline" size={sizes.icon.md} color={colors.textMuted} />
          <Text variant="body" tone="muted" style={styles.flex}>
            No computador de {nome}, abra o IrisFlow e entre com esta conta.
          </Text>
        </View>
      ) : (
        <View style={[styles.computadores, { backgroundColor: colors.surface }]}>
          {devices.map((d, i) => (
            <ListRow
              key={d.id}
              icon={d.revoked_at ? 'close-circle-outline' : 'desktop-outline'}
              title={d.name}
              subtitle={d.revoked_at ? `Desvinculado ${timeAgo(d.revoked_at)}` : d.online ? 'Ligado agora' : `Visto ${timeAgo(d.last_seen_at)}`}
              tone={d.revoked_at ? 'muted' : d.online ? 'accent' : 'muted'}
              onPress={d.revoked_at ? undefined : () => confirmarDesvinculo(d.id, d.name)}
              accessibilityHint={d.revoked_at ? undefined : 'Toque para desvincular'}
              right={<StatusPill label={d.revoked_at ? 'Removido' : d.online ? 'Ligado' : 'Desligado'} tone={d.revoked_at ? 'muted' : d.online ? 'accent' : 'muted'} live={d.online && !d.revoked_at} />}
              last={i === devices.length - 1}
            />
          ))}
        </View>
      )}
      {devices.some((d) => !d.revoked_at) && !can('multiplos_dispositivos') ? (
        <Text variant="caption" tone="muted" style={styles.dica}>
          No plano Essencial, entrar em outro computador desvincula o anterior.
        </Text>
      ) : null}

      <FolhaDeEdicao
        visivel={editandoNome}
        titulo="Como você chama a pessoa"
        rotulo="Nome ou apelido"
        valorInicial={patient?.user_name ?? ''}
        autoCapitalize="words"
        validar={(v) => (nomeDaPessoaValido(v) ? null : 'Use 2 letras ou mais.')}
        onSalvar={(v) => atualizarPaciente({ user_name: v })}
        onFechar={() => setEditandoNome(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: { flexDirection: 'row', marginBottom: spacing.sm },
  topo: { alignItems: 'center', gap: spacing.xxs },
  nome: { marginTop: spacing.md },
  rotulo: { marginTop: spacing.xxl, marginBottom: spacing.sm },
  notice: { marginTop: spacing.md },
  vazio: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg - 2 },
  computadores: { borderRadius: radius.lg - 2, overflow: 'hidden' },
  dica: { marginTop: spacing.sm },
});
