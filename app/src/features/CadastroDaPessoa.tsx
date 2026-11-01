import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, ChoiceChips, Notice, Text, TextField } from '@/components';
import { Condition, ehErro, Relation } from '@/data/types';
import { useApp } from '@/store/AppProvider';
import { spacing } from '@/theme';
import { mensagemDeErro } from '@/utils/errors';
import { CONDICOES, nomeDaPessoaValido, RELACOES } from '@/utils/pessoa';

interface Props {
  /** Depois de gravar (o cadastro leva ao início). */
  onPronto?: () => void;
  /** Texto do botão. */
  acao?: string;
}

/**
 * "Para quem é o IrisFlow?" (mock 05): o passo 3 do cadastro e, para a conta
 * que existe sem pessoa cadastrada, a tela no lugar das abas (antes ela mandava
 * para o site). Grava pela mesma RPC do site, `complete_beta_registration`.
 */
export function CadastroDaPessoa({ onPronto, acao = 'Pronto, entrar no app' }: Props) {
  const { completarCadastro } = useApp();
  const [nome, setNome] = useState('');
  const [relacao, setRelacao] = useState<Relation | null>(null);
  const [condicao, setCondicao] = useState<Condition | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<{ texto: string; fechado: boolean } | null>(null);
  const [tentou, setTentou] = useState(false);

  const erroDoNome = tentou && !nomeDaPessoaValido(nome) ? 'Escreva como você chama a pessoa (2 letras ou mais).' : null;
  const erroDaRelacao = tentou && !relacao ? 'Escolha uma opção.' : null;

  const salvar = async () => {
    setTentou(true);
    if (salvando || !nomeDaPessoaValido(nome) || !relacao) return;
    setSalvando(true);
    setFalha(null);
    try {
      await completarCadastro({ userName: nome, relation: relacao, condition: condicao });
      onPronto?.();
    } catch (e) {
      const fechado = ehErro(e, 'CadastroFechado');
      setFalha({ texto: fechado ? (e as Error).message : mensagemDeErro(e, 'Não deu para salvar agora. Tente de novo.'), fechado });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text variant="h1" accessibilityRole="header">
        Para quem é o IrisFlow?
      </Text>
      <TextField
        label="Como você chama essa pessoa"
        value={nome}
        onChangeText={setNome}
        placeholder="Ex.: Carlos, Vó, Zé"
        autoCapitalize="words"
        returnKeyType="done"
        error={erroDoNome}
        style={styles.campo}
      />
      <View style={styles.campo}>
        <Text variant="bodySmall" weight="semibold" style={styles.rotulo}>
          Ela é sua
        </Text>
        <ChoiceChips<Relation> value={relacao as Relation} onChange={setRelacao} options={RELACOES} accessibilityLabel="A pessoa é sua" />
        {erroDaRelacao ? (
          <Text variant="caption" tone="danger" style={styles.erro} accessibilityLiveRegion="polite">
            {erroDaRelacao}
          </Text>
        ) : null}
      </View>
      <View style={styles.campo}>
        <Text variant="bodySmall" weight="semibold" style={styles.rotulo}>
          Condição (opcional)
        </Text>
        <ChoiceChips<Condition> opcional value={condicao} onChange={setCondicao} options={CONDICOES} accessibilityLabel="Condição, opcional" />
      </View>
      {falha ? <Notice tone={falha.fechado ? 'warning' : 'danger'} text={falha.texto} style={styles.campo} testID="falha-do-cadastro" /> : null}
      <Button title={acao} size="lg" loading={salvando} onPress={() => void salvar()} style={styles.botao} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1 },
  campo: { marginTop: spacing.xl },
  rotulo: { marginBottom: spacing.sm },
  erro: { marginTop: spacing.xs },
  botao: { marginTop: spacing.xxxl },
});
