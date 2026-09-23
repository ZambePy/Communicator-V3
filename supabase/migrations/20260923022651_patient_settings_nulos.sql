-- Nome original: 20260922_patient_settings_nulos.sql (escrita em 22/09/2026); renomeada para a versão 20260923022651, a registrada no histórico de migrações do projeto em produção.
-- 2026-09-22 — patient_settings: "o cuidador nunca definiu" ≠ "o padrão".
--
-- Problema: as colunas de rastreamento nasciam NOT NULL DEFAULT (dwell 1500,
-- filtro balanceado, teclado frequencia, sensibilidade 5). Bastava a linha
-- existir — criada pelo app do cuidador ao abrir Ajustes, ou por um upsert —
-- para o desktop receber, por realtime, "dwell_ms = 1500" e SOBRESCREVER o
-- tempo de fixação que o paciente escolheu localmente. O app e o desktop já
-- tratam NULL como "não definido" (app: controles sem seleção; desktop:
-- `aplicarAjustesRemotos` só aplica campos não nulos). Esta migração faz o
-- banco poder dizer NULL.
--
-- `emergency_timeout_s` e `emergency_contacts` continuam NOT NULL DEFAULT:
-- o cron de escalonamento usa `coalesce(ps.emergency_timeout_s, 45)` e o app
-- mostra 45 s como padrão real, não como "não definido".
--
-- Idempotente: `drop not null` / `drop default` não falham se já aplicados.

alter table public.patient_settings
  alter column dwell_ms        drop not null,
  alter column dwell_ms        drop default,
  alter column filter_preset   drop not null,
  alter column filter_preset   drop default,
  alter column keyboard_layout drop not null,
  alter column keyboard_layout drop default,
  alter column sensitivity     drop not null,
  alter column sensitivity     drop default;

comment on column public.patient_settings.dwell_ms is
  'NULL = o cuidador nunca definiu; o desktop mantém o valor local do paciente.';
comment on column public.patient_settings.filter_preset is
  'NULL = o cuidador nunca definiu; o desktop mantém o preset local.';
comment on column public.patient_settings.keyboard_layout is
  'NULL = o cuidador nunca definiu.';
comment on column public.patient_settings.sensitivity is
  'NULL = o cuidador nunca definiu.';

-- Linhas antigas criadas pelo `ensureSettings` (removido do app em 22/09) com
-- os quatro padrões e nunca editadas não têm como ser distinguidas de um
-- cuidador que escolheu exatamente esses valores. Como o dano de aplicar
-- 1500/balanceado por cima do local é maior que o de "perder" uma escolha
-- que coincide com o padrão, elas viram NULL. Uma escolha diferente do padrão
-- em QUALQUER coluna preserva a linha inteira.
update public.patient_settings
   set dwell_ms = null, filter_preset = null, keyboard_layout = null, sensitivity = null
 where dwell_ms = 1500
   and filter_preset = 'balanceado'
   and keyboard_layout = 'frequencia'
   and sensitivity = 5;
