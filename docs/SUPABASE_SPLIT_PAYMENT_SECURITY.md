# Supabase Split Payment Security

This patch replaces client-asserted Split Bill payment state with an Arc Testnet
receipt verifier. The Expo app never receives the Supabase service-role key.

## Security boundary

- `anon` may create and read Split Bill requests.
- `anon` cannot update `split_bills` or `participants` payment state.
- `anon` cannot call `mark_participant_paid`, `record_split_received`, or the
  new settlement function.
- `verify-split-payment` checks the Arc chain ID, successful receipt, official
  Arc Testnet USDC contract, receiver, transfer amount, and unique transaction
  hash before using `service_role` to settle the bill atomically.

## Deploy

From the repository root with the Supabase CLI authenticated:

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase secrets set ARC_RPC_URL=https://rpc.testnet.arc.network
supabase functions deploy verify-split-payment
```

Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into hosted Edge
Functions. Never copy `SUPABASE_SERVICE_ROLE_KEY` into the Expo `.env` file or
commit it to Git.

## Verify privileges

Run in Supabase SQL Editor after deployment:

```sql
select
  has_table_privilege('anon', 'public.split_bills', 'UPDATE') as anon_can_update_bills,
  has_table_privilege('anon', 'public.participants', 'UPDATE') as anon_can_update_participants,
  has_function_privilege(
    'anon',
    'public.mark_participant_paid(uuid,text,numeric,text)',
    'EXECUTE'
  ) as anon_can_mark_paid,
  has_function_privilege(
    'anon',
    'public.record_split_received(uuid,numeric)',
    'EXECUTE'
  ) as anon_can_record_total;
```

All four values must be `false`.

## Runtime validation

1. Create a Split Bill from the app.
2. Pay its USDC link on Arc Testnet.
3. Confirm the payment appears after the transaction receipt succeeds.
4. Submit the same transaction again; the received total must not increase.
5. Try a transaction for another receiver or token; verification must reject it.

If the Edge Function is unavailable after an onchain payment succeeds, the app
keeps a local receipt-backed update and shows that shared Split sync is pending.
It never writes an unverified payment claim to Supabase.
