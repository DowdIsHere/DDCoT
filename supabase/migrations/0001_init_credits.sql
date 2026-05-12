-- DDCoT: credits + transforms schema (step 2)
-- Run this in the Supabase SQL Editor (Project → SQL → New query → Run)

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

create table if not exists public.credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 5,         -- 5 free transforms on signup
  overage_limit int not null default -5,  -- soft overage: 5 transforms past zero
  updated_at timestamptz not null default now()
);

create table if not exists public.transforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,6),
  profile_name text,
  created_at timestamptz not null default now()
);

create index if not exists transforms_user_created_idx on public.transforms(user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- Users can read their own rows. All writes go through the
-- service_role key on the server (which bypasses RLS).
-- ─────────────────────────────────────────────────────────────

alter table public.credits enable row level security;
alter table public.transforms enable row level security;

drop policy if exists "own credits" on public.credits;
create policy "own credits" on public.credits
  for select using (auth.uid() = user_id);

drop policy if exists "own transforms" on public.transforms;
create policy "own transforms" on public.transforms
  for select using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Auto-create a credits row when a new auth user signs up
-- ─────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credits (user_id, balance)
  values (new.id, 5)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Atomic credit decrement with soft-overage gate
-- Returns (new_balance, ok). ok=false means the user has hit the
-- overage floor and must purchase credits before continuing.
-- ─────────────────────────────────────────────────────────────

create or replace function public.use_credit(p_user_id uuid)
returns table(new_balance int, ok boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_balance int;
  cur_limit int;
begin
  select balance, overage_limit
    into cur_balance, cur_limit
    from public.credits
    where user_id = p_user_id
    for update;

  if cur_balance is null then
    -- Defensive: row should exist via trigger, but if not, create it
    insert into public.credits (user_id, balance) values (p_user_id, 5);
    cur_balance := 5;
    cur_limit := -5;
  end if;

  if cur_balance <= cur_limit then
    return query select cur_balance, false;
    return;
  end if;

  update public.credits
    set balance = balance - 1,
        updated_at = now()
    where user_id = p_user_id;

  return query select cur_balance - 1, true;
end;
$$;

-- Refund a credit (used when the downstream Anthropic call fails after we decremented)
create or replace function public.refund_credit(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_bal int;
begin
  update public.credits
    set balance = balance + 1,
        updated_at = now()
    where user_id = p_user_id
    returning balance into new_bal;
  return new_bal;
end;
$$;

-- Grant N credits (used by Stripe webhook in step 4)
create or replace function public.grant_credits(p_user_id uuid, p_amount int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_bal int;
begin
  insert into public.credits (user_id, balance)
    values (p_user_id, p_amount)
    on conflict (user_id) do update
      set balance = public.credits.balance + p_amount,
          updated_at = now()
    returning balance into new_bal;
  return new_bal;
end;
$$;
