-- Close anonymous Split Bill payment-state mutation paths.
-- Safe to apply after the 20260518 migrations and safe to rerun.

begin;

drop policy if exists "split_bills_public_update" on public.split_bills;
drop policy if exists "participants_public_update" on public.participants;

revoke update, delete on public.split_bills from anon, authenticated;
revoke update, delete on public.participants from anon, authenticated;

revoke execute on function public.refresh_split_bill_status(uuid) from public, anon, authenticated;
revoke execute on function public.mark_participant_paid(uuid, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.record_split_received(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.expire_open_split_bills() from public, anon, authenticated;

grant execute on function public.refresh_split_bill_status(uuid) to service_role;
grant execute on function public.expire_open_split_bills() to service_role;

create table if not exists public.split_payment_receipts (
  tx_hash text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  split_bill_id uuid not null references public.split_bills(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  chain_id bigint not null check (chain_id = 5042002),
  token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
  payer_wallet text not null check (payer_wallet ~ '^0x[0-9a-f]{40}$'),
  receiver_wallet text not null check (receiver_wallet ~ '^0x[0-9a-f]{40}$'),
  amount_usdc numeric(38, 18) not null check (amount_usdc > 0),
  block_number bigint not null check (block_number > 0),
  verified_at timestamptz not null default now()
);

create index if not exists idx_split_payment_receipts_bill
  on public.split_payment_receipts(split_bill_id, verified_at desc);

alter table public.split_payment_receipts enable row level security;
revoke all on public.split_payment_receipts from public, anon, authenticated;
grant select, insert on public.split_payment_receipts to service_role;

create or replace function public.apply_verified_split_payment(
  p_split_bill_id uuid,
  p_participant_id uuid,
  p_tx_hash text,
  p_chain_id bigint,
  p_token_address text,
  p_payer_wallet text,
  p_receiver_wallet text,
  p_amount_usdc numeric,
  p_block_number bigint
)
returns table(applied boolean, current_status text, current_received_usdc numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  bill_record public.split_bills%rowtype;
  participant_record public.participants%rowtype;
  existing_receipt public.split_payment_receipts%rowtype;
  normalized_tx_hash text := lower(trim(p_tx_hash));
  normalized_token text := lower(trim(p_token_address));
  normalized_payer text := lower(trim(p_payer_wallet));
  normalized_receiver text := lower(trim(p_receiver_wallet));
  next_participant_paid numeric(38, 18);
begin
  if normalized_tx_hash !~ '^0x[0-9a-f]{64}$' then
    raise exception 'Invalid transaction hash';
  end if;
  if p_chain_id <> 5042002 then
    raise exception 'Wrong chain';
  end if;
  if normalized_token <> '0x3600000000000000000000000000000000000000' then
    raise exception 'Wrong payment token';
  end if;
  if normalized_payer !~ '^0x[0-9a-f]{40}$' or normalized_receiver !~ '^0x[0-9a-f]{40}$' then
    raise exception 'Invalid payment address';
  end if;
  if p_amount_usdc is null or p_amount_usdc <= 0 then
    raise exception 'Payment amount must be positive';
  end if;
  if p_block_number is null or p_block_number <= 0 then
    raise exception 'Confirmed block is required';
  end if;

  select * into bill_record
  from public.split_bills
  where id = p_split_bill_id
  for update;

  if not found then
    raise exception 'Split bill not found';
  end if;
  if lower(bill_record.receiver_wallet) <> normalized_receiver then
    raise exception 'Receipt receiver does not match split bill';
  end if;
  if bill_record.status in ('complete', 'expired', 'cancelled') then
    raise exception 'Split bill does not accept payments';
  end if;
  if bill_record.expires_at is not null and now() > bill_record.expires_at then
    update public.split_bills set status = 'expired' where id = p_split_bill_id;
    raise exception 'Split bill is expired';
  end if;

  if p_participant_id is not null then
    select * into participant_record
    from public.participants
    where id = p_participant_id and split_bill_id = p_split_bill_id
    for update;

    if not found then
      raise exception 'Split participant not found';
    end if;
  end if;

  select * into existing_receipt
  from public.split_payment_receipts
  where tx_hash = normalized_tx_hash;

  if found then
    if existing_receipt.split_bill_id = p_split_bill_id
       and existing_receipt.participant_id is not distinct from p_participant_id then
      return query
        select false, b.status, b.received_usdc
        from public.split_bills b where b.id = p_split_bill_id;
      return;
    end if;
    raise exception 'Transaction hash has already been used';
  end if;

  begin
    insert into public.split_payment_receipts (
      tx_hash, split_bill_id, participant_id, chain_id, token_address,
      payer_wallet, receiver_wallet, amount_usdc, block_number
    ) values (
      normalized_tx_hash, p_split_bill_id, p_participant_id, p_chain_id, normalized_token,
      normalized_payer, normalized_receiver, p_amount_usdc, p_block_number
    );
  exception when unique_violation then
    raise exception 'Transaction hash has already been used';
  end;

  update public.split_bills
  set received_usdc = least(total_usdc, received_usdc + p_amount_usdc)
  where id = p_split_bill_id;

  if p_participant_id is not null then
    next_participant_paid := coalesce(participant_record.amount_paid_usdc, 0) + p_amount_usdc;
    update public.participants
    set amount_paid_usdc = next_participant_paid,
        paid = next_participant_paid >= amount_usdc,
        paid_at = case when next_participant_paid >= amount_usdc then coalesce(paid_at, now()) else paid_at end,
        tx_hash = normalized_tx_hash,
        payer_wallet = normalized_payer
    where id = p_participant_id;
  end if;

  perform public.refresh_split_bill_status(p_split_bill_id);

  return query
    select true, b.status, b.received_usdc
    from public.split_bills b where b.id = p_split_bill_id;
end;
$$;

revoke execute on function public.apply_verified_split_payment(
  uuid, uuid, text, bigint, text, text, text, numeric, bigint
) from public, anon, authenticated;
grant execute on function public.apply_verified_split_payment(
  uuid, uuid, text, bigint, text, text, text, numeric, bigint
) to service_role;

commit;
