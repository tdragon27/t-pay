-- T Pay Split Bill payment metadata follow-up migration.
-- Safe to run multiple times. Adds payer/amount-paid fields used by the app debugger
-- and overpaid/underpaid display, then replaces the RPC with the new optional argument.

alter table public.participants
  add column if not exists payer_wallet text check (payer_wallet is null or payer_wallet = '' or payer_wallet ~* '^0x[0-9a-f]{40}$');

alter table public.participants
  add column if not exists amount_paid_usdc numeric(20, 2) check (amount_paid_usdc is null or amount_paid_usdc >= 0);

drop function if exists public.mark_participant_paid(uuid, text, numeric);

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
