-- Execute no SQL Editor do Supabase

create extension if not exists pgcrypto;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  saldo numeric(14,2) null,
  orcamento_diario numeric(14,2) not null default 0,
  ultima_execucao timestamptz null,
  store_version bigint not null default 0,
  last_debit_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_updated_at on public.stores;
create trigger trg_touch_updated_at
before update on public.stores
for each row execute function public.touch_updated_at();

create table if not exists public.meta (
  id int primary key default 1,
  last_global_run_at timestamptz null,
  updated_at timestamptz not null default now()
);
insert into public.meta (id) values (1) on conflict do nothing;

create table if not exists public.history (
  id bigserial primary key,
  ts timestamptz not null default now(),
  actor text not null,
  type text not null,
  store_id uuid null,
  store_name text null,
  payload jsonb not null default '{}'::jsonb
);

-- Função de débito diário (08:00). Marca SEM SALDO quando saldo < orçamento.
create or replace function public.debit_daily(p_actor text)
returns void language plpgsql as $$
declare
  s record;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- evita rodar mais de 1x por dia
  if exists (select 1 from public.meta where id=1 and last_global_run_at is not null
             and (last_global_run_at at time zone 'America/Sao_Paulo')::date = v_today) then
    return;
  end if;

  for s in
    select * from public.stores where coalesce(orcamento_diario,0) > 0 and (last_debit_date is distinct from v_today)
  loop
    if s.saldo is null then
      -- sem saldo importado, nada
      continue;
    end if;

    if s.saldo >= s.orcamento_diario then
      update public.stores
        set saldo = (s.saldo - s.orcamento_diario),
            ultima_execucao = v_now,
            last_debit_date = v_today,
            store_version = store_version + 1
      where id = s.id;

      insert into public.history(actor,type,store_id,store_name,payload)
      values (p_actor,'debit',s.id,s.nome,
        jsonb_build_object('from', s.saldo, 'to', (s.saldo - s.orcamento_diario), 'orcamentoDiario', s.orcamento_diario));
    else
      -- insuficiente: vira SEM SALDO
      update public.stores
        set saldo = null,
            ultima_execucao = v_now,
            last_debit_date = v_today,
            store_version = store_version + 1
      where id = s.id;

      insert into public.history(actor,type,store_id,store_name,payload)
      values (p_actor,'debit',s.id,s.nome,
        jsonb_build_object('from', s.saldo, 'to', null, 'orcamentoDiario', s.orcamento_diario, 'reason','insufficient'));
    end if;
  end loop;

  update public.meta set last_global_run_at = v_now, updated_at = v_now where id=1;

  insert into public.history(actor,type,payload)
  values (p_actor,'debit_run', jsonb_build_object('ranAt', v_now));
end $$;
