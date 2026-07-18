-- T Pay Split Bill Supabase schema
-- Public clients may create/read payment requests. Payment-state mutations are
-- intentionally reserved for the server-side Arc receipt verifier.

create extension if not exists "pgcrypto";

create table if not exists public.split_bills (
  id uuid primary key default gen_random_uuid(),
  note text,
  total_usdc numeric(20, 2) not null check (total_usdc > 0),
  people_count integer not null check (people_count > 0 and people_count <= 100),
  auto_divide boolean not null default true,
  complete_by_total boolean not null default true,
  status text not null default 'open' check (status in ('open', 'complete', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  receiver_wallet text not null check (receiver_wallet ~* '^0x[0-9a-f]{40}$'),
  received_usdc numeric(20, 2) not null default 0 check (received_usdc >= 0)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  split_bill_id uuid not null references public.split_bills(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  wallet text check (wallet is null or wallet = '' or wallet ~* '^0x[0-9a-f]{40}$'),
  amount_usdc numeric(20, 2) not null check (amount_usdc > 0),
  paid boolean not null default false,
  paid_at timestamptz,
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.participants
  add column if not exists payer_wallet text check (payer_wallet is null or payer_wallet = '' or payer_wallet ~* '^0x[0-9a-f]{40}$'),
  add column if not exists amount_paid_usdc numeric(20, 2) check (amount_paid_usdc is null or amount_paid_usdc >= 0);
create index if not exists idx_split_bills_status_created on public.split_bills(status, created_at desc);
create index if not exists idx_split_bills_receiver on public.split_bills(lower(receiver_wallet));
create index if not exists idx_participants_bill on public.participants(split_bill_id);
create index if not exists idx_participants_paid on public.participants(split_bill_id, paid);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists split_bills_touch_updated_at on public.split_bills;
create trigger split_bills_touch_updated_at
before update on public.split_bills
for each row execute function public.touch_updated_at();

drop trigger if exists participants_touch_updated_at on public.participants;
create trigger participants_touch_updated_at
before update on public.participants
for each row execute function public.touch_updated_at();

create or replace function public.refresh_split_bill_status(target_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bill record;
  paid_total numeric(20, 2);
  all_paid boolean;
begin
  select * into bill from public.split_bills where id = target_bill_id;
  if not found then
    return;
  end if;

  if bill.status in ('cancelled', 'expired') then
    return;
  end if;

  if bill.expires_at is not null and now() > bill.expires_at and bill.status = 'open' then
    update public.split_bills set status = 'expired' where id = target_bill_id;
    return;
  end if;

  if bill.complete_by_total then
    if bill.received_usdc >= bill.total_usdc then
      update public.split_bills set status = 'complete', received_usdc = bill.total_usdc where id = target_bill_id;
    else
      update public.split_bills set status = 'open' where id = target_bill_id and status = 'complete';
    end if;
  else
    select coalesce(bool_and(paid), false) into all_paid from public.participants where split_bill_id = target_bill_id;
    if all_paid then
      update public.split_bills set status = 'complete' where id = target_bill_id;
    else
      update public.split_bills set status = 'open' where id = target_bill_id and status = 'complete';
    end if;
  end if;
end;
$$;

create or replace function public.mark_participant_paid(
  p_participant_id uuid,
  p_tx_hash text default null,
  p_amount_usdc numeric default null,
  p_payer_wallet text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_record record;
  bill_record record;
  recognition_amount numeric(20, 2);
begin
  select * into participant_record from public.participants where id = p_participant_id;
  if not found then
    raise exception 'Participant not found';
  end if;

  select * into bill_record from public.split_bills where id = participant_record.split_bill_id;
  if not found then
    raise exception 'Split bill not found';
  end if;

  if bill_record.status <> 'open' then
    raise exception 'Split bill is not open';
  end if;

  recognition_amount := least(coalesce(p_amount_usdc, participant_record.amount_usdc), participant_record.amount_usdc);

  update public.participants
  set paid = true,
      paid_at = coalesce(paid_at, now()),
      tx_hash = coalesce(p_tx_hash, tx_hash),
      payer_wallet = coalesce(p_payer_wallet, payer_wallet),
      amount_paid_usdc = coalesce(p_amount_usdc, amount_usdc)
  where id = p_participant_id;

  if bill_record.complete_by_total then
    update public.split_bills
    set received_usdc = least(total_usdc, received_usdc + recognition_amount)
    where id = participant_record.split_bill_id;
  end if;

  perform public.refresh_split_bill_status(participant_record.split_bill_id);
end;
$$;

create or replace function public.record_split_received(
  p_split_bill_id uuid,
  p_amount_usdc numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.split_bills
  set received_usdc = least(total_usdc, received_usdc + greatest(p_amount_usdc, 0))
  where id = p_split_bill_id and status = 'open';

  perform public.refresh_split_bill_status(p_split_bill_id);
end;
$$;

create or replace function public.expire_open_split_bills()
returns void
language sql
security definer
as $$
  update public.split_bills
  set status = 'expired'
  where status = 'open'
    and expires_at is not null
    and now() > expires_at;
$$;

alter table public.split_bills enable row level security;
alter table public.participants enable row level security;

-- The Expo anon client can create/read requests, but it must never be able to
-- claim that a payment happened. Verified settlement is installed by the
-- 20260713_harden_split_payment_authority.sql follow-up migration.
drop policy if exists "split_bills_public_select" on public.split_bills;
create policy "split_bills_public_select" on public.split_bills for select to anon using (true);

drop policy if exists "split_bills_public_insert" on public.split_bills;
create policy "split_bills_public_insert" on public.split_bills for insert to anon with check (true);

drop policy if exists "split_bills_public_update" on public.split_bills;

drop policy if exists "participants_public_select" on public.participants;
create policy "participants_public_select" on public.participants for select to anon using (true);

drop policy if exists "participants_public_insert" on public.participants;
create policy "participants_public_insert" on public.participants for insert to anon with check (true);

drop policy if exists "participants_public_update" on public.participants;

revoke update, delete on public.split_bills from anon, authenticated;
revoke update, delete on public.participants from anon, authenticated;

revoke execute on function public.refresh_split_bill_status(uuid) from public, anon, authenticated;
revoke execute on function public.mark_participant_paid(uuid, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.record_split_received(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.expire_open_split_bills() from public, anon, authenticated;

grant execute on function public.refresh_split_bill_status(uuid) to service_role;
grant execute on function public.mark_participant_paid(uuid, text, numeric, text) to service_role;
grant execute on function public.record_split_received(uuid, numeric) to service_role;
grant execute on function public.expire_open_split_bills() to service_role;

alter table public.split_bills replica identity full;
alter table public.participants replica identity full;

-- Enable realtime for both tables. Ignore duplicate publication errors if already added.
do $$
begin
  begin
    alter publication supabase_realtime add table public.split_bills;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.participants;
  exception when duplicate_object then null;
  end;
end $$;

