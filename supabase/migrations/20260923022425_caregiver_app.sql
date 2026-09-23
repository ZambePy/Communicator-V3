-- Nome original: 20260904_caregiver_app.sql (escrita em 04/09/2026); renomeada para a versão 20260923022425, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — App do Cuidador
-- Migração: tabelas de comunicação, sessão, alertas e ajuste remoto.
--
-- Pressupõe o schema já existente do site (profiles, beneficiaries,
-- subscriptions, plans). Todas as tabelas têm RLS: o cuidador (auth.uid())
-- só acessa registros dos beneficiários vinculados ao seu profile.
-- O desktop IrisFlow escreve usando a Edge Function `desktop-sync`
-- (service role) autenticada pela device_key do dispositivo.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helper: beneficiário pertence ao cuidador logado ----------
create or replace function public.is_my_beneficiary(b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.beneficiaries
    where id = b and profile_id = auth.uid()
  );
$$;

-- ---------- enums ----------
do $$ begin
  create type public.session_status_t as enum ('calibrating','active','paused','ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.filter_preset_t as enum ('estavel','balanceado','responsivo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.keyboard_layout_t as enum ('frequencia','alfabetico','qwerty');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fatigue_t as enum ('ok','atencao','alta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.drift_t as enum ('nenhum','lento','erratico');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.help_kind_t as enum ('ajuda','emergencia','postura','fadiga','recalibracao','dispositivo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.msg_sender_t as enum ('paciente','cuidador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.msg_kind_t as enum ('texto','frase','pictograma','simnao','sistema');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.phrase_category_t as enum ('necessidades','conforto','social','saude','outra');
exception when duplicate_object then null; end $$;

-- ---------- devices ----------
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  name text not null default 'Computador',
  os public.release_os_t not null default 'windows',
  app_version text not null default '',
  device_key_hash text not null,                -- sha256 da chave que o desktop usa na Edge Function
  last_seen_at timestamptz not null default now(),
  camera_ok boolean not null default false,
  tracker_ok boolean not null default false,
  calibrated boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.devices is 'Computadores com a IrisFlow instalada, vinculados a um beneficiário. Heartbeat a cada 30 s.';
create index if not exists devices_beneficiary_idx on public.devices(beneficiary_id);

-- ---------- sessions ----------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  status public.session_status_t not null default 'calibrating',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  calibration_error_px numeric(6,1),
  calibration_error_deg numeric(4,2),
  calibration_seconds numeric(5,1),
  hit_rate_150px numeric(4,3) check (hit_rate_150px is null or (hit_rate_150px >= 0 and hit_rate_150px <= 1)),
  posture_drift_px numeric(6,1) not null default 0,
  drift_kind public.drift_t not null default 'nenhum',
  blink_rate_bpm numeric(5,1),
  fatigue public.fatigue_t not null default 'ok',
  dwell_ms smallint not null default 1500 check (dwell_ms in (800,1500,2500)),
  filter_preset public.filter_preset_t not null default 'balanceado',
  utterances integer not null default 0,
  chars_typed integer not null default 0,
  help_requests integer not null default 0,
  modules_used text[] not null default '{}',
  -- condições de captura registradas junto ao resultado (exigência do plano, tópico 1.1)
  capture_conditions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
comment on table public.sessions is 'Sessões de uso da IrisFlow. Só métricas agregadas — nunca imagem ou vetor de calibração (privacidade por arquitetura).';
create index if not exists sessions_beneficiary_started_idx on public.sessions(beneficiary_id, started_at desc);

-- ---------- help_requests ----------
create table if not exists public.help_requests (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  kind public.help_kind_t not null,
  message text not null default '',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id),
  escalated_at timestamptz,
  resolved_at timestamptz
);
comment on table public.help_requests is 'Pedidos de ajuda/emergência e avisos do sistema (postura, fadiga, recalibração). Escalonamento automático se não houver resposta em emergency_timeout_s.';
create index if not exists help_requests_beneficiary_idx on public.help_requests(beneficiary_id, created_at desc);

-- ---------- messages ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  sender public.msg_sender_t not null,
  kind public.msg_kind_t not null default 'texto',
  text text not null check (length(btrim(text)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  spoken boolean not null default false
);
comment on table public.messages is 'Conversa cuidador ↔ paciente. Mensagens do cuidador aparecem na tela do desktop e são vocalizadas (spoken=true).';
create index if not exists messages_beneficiary_idx on public.messages(beneficiary_id, created_at);

-- ---------- quick_phrases ----------
create table if not exists public.quick_phrases (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 120),
  category public.phrase_category_t not null default 'outra',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.quick_phrases is 'Frases rápidas exibidas na tela do paciente; editadas pelo cuidador no app.';

-- ---------- patient_settings ----------
create table if not exists public.patient_settings (
  beneficiary_id uuid primary key references public.beneficiaries(id) on delete cascade,
  dwell_ms smallint not null default 1500 check (dwell_ms in (800,1500,2500)),
  filter_preset public.filter_preset_t not null default 'balanceado',
  keyboard_layout public.keyboard_layout_t not null default 'frequencia',
  sensitivity smallint not null default 5 check (sensitivity between 1 and 10),
  voice text not null default 'pt-BR padrão',
  emergency_timeout_s smallint not null default 45 check (emergency_timeout_s between 15 and 300),
  emergency_contacts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
comment on table public.patient_settings is 'Ajuste remoto de parâmetros (roadmap médio prazo do plano). O desktop lê e aplica na próxima sessão ou imediatamente via realtime.';

-- ---------- push_tokens ----------
create table if not exists public.push_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null default 'expo',
  created_at timestamptz not null default now()
);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists sessions_touch on public.sessions;
create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists patient_settings_touch on public.patient_settings;
create trigger patient_settings_touch before update on public.patient_settings
  for each row execute function public.touch_updated_at();

-- ---------- contador de pedidos de ajuda na sessão ----------
create or replace function public.bump_session_help_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.session_id is not null and new.kind in ('ajuda','emergencia') then
    update public.sessions set help_requests = help_requests + 1 where id = new.session_id;
  end if;
  return new;
end $$;

drop trigger if exists help_requests_bump on public.help_requests;
create trigger help_requests_bump after insert on public.help_requests
  for each row execute function public.bump_session_help_count();

-- ---------- RLS ----------
alter table public.devices enable row level security;
alter table public.sessions enable row level security;
alter table public.help_requests enable row level security;
alter table public.messages enable row level security;
alter table public.quick_phrases enable row level security;
alter table public.patient_settings enable row level security;
alter table public.push_tokens enable row level security;

-- leitura: tudo do beneficiário do cuidador
drop policy if exists "cuidador lê devices" on public.devices;
create policy "cuidador lê devices" on public.devices for select using (public.is_my_beneficiary(beneficiary_id));

drop policy if exists "cuidador lê sessions" on public.sessions;
create policy "cuidador lê sessions" on public.sessions for select using (public.is_my_beneficiary(beneficiary_id));

drop policy if exists "cuidador lê help_requests" on public.help_requests;
create policy "cuidador lê help_requests" on public.help_requests for select using (public.is_my_beneficiary(beneficiary_id));
drop policy if exists "cuidador reconhece help_requests" on public.help_requests;
create policy "cuidador reconhece help_requests" on public.help_requests for update
  using (public.is_my_beneficiary(beneficiary_id)) with check (public.is_my_beneficiary(beneficiary_id));

drop policy if exists "cuidador lê messages" on public.messages;
create policy "cuidador lê messages" on public.messages for select using (public.is_my_beneficiary(beneficiary_id));
drop policy if exists "cuidador envia messages" on public.messages;
create policy "cuidador envia messages" on public.messages for insert
  with check (public.is_my_beneficiary(beneficiary_id) and sender = 'cuidador');
drop policy if exists "cuidador marca lidas" on public.messages;
create policy "cuidador marca lidas" on public.messages for update
  using (public.is_my_beneficiary(beneficiary_id)) with check (public.is_my_beneficiary(beneficiary_id));

drop policy if exists "cuidador gerencia frases" on public.quick_phrases;
create policy "cuidador gerencia frases" on public.quick_phrases for all
  using (public.is_my_beneficiary(beneficiary_id)) with check (public.is_my_beneficiary(beneficiary_id));

drop policy if exists "cuidador gerencia settings" on public.patient_settings;
create policy "cuidador gerencia settings" on public.patient_settings for all
  using (public.is_my_beneficiary(beneficiary_id)) with check (public.is_my_beneficiary(beneficiary_id));

drop policy if exists "dono gerencia push_tokens" on public.push_tokens;
create policy "dono gerencia push_tokens" on public.push_tokens for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- realtime ----------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.help_requests;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.sessions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.devices;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.patient_settings;
exception when duplicate_object then null; end $$;

-- Para que o realtime entregue o registro inteiro nas atualizações:
alter table public.messages replica identity full;
alter table public.sessions replica identity full;
alter table public.devices replica identity full;
alter table public.help_requests replica identity full;
