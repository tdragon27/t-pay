// hooks/useSend.ts - handles Arc Testnet ERC-20 sends for supported T Pay assets

import { useState, useCallback } from 'react';
import { isAddress, parseUnits, type Hex } from 'viem';
import { createArcWalletClient, getPublicClient, ERC20_ABI } from '@/lib/viemClient';
import { sendUsdcWithAppKit } from '@/lib/arcAppKit';
import { ARC_TESTNET_DEFAULTS } from '@/constants/chains';
import { getArcTestnetToken, type SupportedArcTokenSymbol } from '@/constants/tokens';
import { loadPrivateKey } from '@/lib/wallet';
import { ensureCriticalAuth } from '@/services/securityService';
import { addPendingTx, markPendingTx } from '@/services/pendingTxService';
import { createPaymentIntent, updatePaymentIntent } from '@/services/paymentIntentService';
import { recordActivity } from '@/services/activityService';
import { recordNotification } from '@/services/notificationService';
import { formatTokenAmount } from '@/utils/format';

// Arc docs used: https://docs.arc.io/app-kit/send
// App Kit is kept for USDC send readiness; direct ERC-20 transfer is the safe
// path for all configured Arc Testnet assets (USDC, EURC, cirBTC).

export type SendStatus = 'idle' | 'signing' | 'broadcasting' | 'confirming' | 'success' | 'error';

export interface SendResult {
  txHash: string;
  status: 'success' | 'error';
  error?: string;
}

interface SendTokenOptions {
  tokenSymbol?: SupportedArcTokenSymbol;
}

function compactErrorMessage(err: any) {
  const message = err?.shortMessage ?? err?.message ?? 'Transaction failed. Please try again.';
  if (typeof message !== 'string') return 'Transaction failed. Please try again.';
  return message.split('\n')[0]?.trim() || 'Transaction failed. Please try again.';
}

export function useSend() {
  const [status, setStatus] = useState<SendStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendToken = useCallback(async (
    toAddress: string,
    amountStr: string,
    options: SendTokenOptions = {},
  ): Promise<SendResult> => {
    setStatus('idle');
    setError(null);
    setTxHash(null);

    const token = getArcTestnetToken(options.tokenSymbol ?? 'USDC');
    const tokenSymbol = token.symbol;
    let hash: Hex | null = null;
    let intentId: string | undefined;
    let senderAddress: `0x${string}` | undefined;
    const normalizedAmount = amountStr.trim();

    try {
      if (!isAddress(toAddress)) throw new Error('Recipient address is not a valid EVM address.');
      const unlocked = await ensureCriticalAuth();
      if (!unlocked) throw new Error('Wallet unlock is required before sending.');

      const pk = await loadPrivateKey();
      if (!pk) throw new Error('Wallet not found. Please import or create a wallet.');

      const amount = parseUnits(normalizedAmount, token.decimals);
      if (amount <= 0n) throw new Error('Amount must be greater than 0.');

      setStatus('signing');
      const publicClient = getPublicClient();
      const walletClient = createArcWalletClient(pk as Hex);
      const account = walletClient.account!;
      senderAddress = account.address;

      const intent = await createPaymentIntent({
        type: 'transfer',
        amount: normalizedAmount,
        tokenSymbol,
        receiverWallet: toAddress as `0x${string}`,
        senderWallet: account.address,
        chainId: Number(process.env.EXPO_PUBLIC_ARC_CHAIN_ID ?? ARC_TESTNET_DEFAULTS.CHAIN_ID),
        note: `Arc Testnet ${tokenSymbol} transfer`,
        label: `Send ${normalizedAmount} ${tokenSymbol}`,
      });
      intentId = intent.id;

      const balance = await publicClient.readContract({
        address: token.contractAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      }) as bigint;

      if (amount > balance) {
        throw new Error(`Insufficient balance. You have ${formatTokenAmount(balance, token.decimals, token.displayDecimals)} ${tokenSymbol}.`);
      }

      await publicClient.simulateContract({
        address: token.contractAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [toAddress as `0x${string}`, amount],
        account: account.address,
      });

      setStatus('broadcasting');
      if (tokenSymbol === 'USDC') {
        try {
          hash = (await sendUsdcWithAppKit(pk, toAddress, normalizedAmount)) as Hex;
        } catch {
          hash = await walletClient.writeContract({
            account,
            chain: null,
            address: token.contractAddress,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [toAddress as `0x${string}`, amount],
          });
        }
      } else {
        hash = await walletClient.writeContract({
          account,
          chain: null,
          address: token.contractAddress,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [toAddress as `0x${string}`, amount],
        });
      }

      setTxHash(hash);
      await addPendingTx({
        txHash: hash,
        type: 'send',
        label: `Send ${normalizedAmount} ${tokenSymbol}`,
        explorerUrl: `${process.env.EXPO_PUBLIC_ARC_EXPLORER ?? ARC_TESTNET_DEFAULTS.EXPLORER_URL}/tx/${hash}`,
        metadata: { to: toAddress, amount: normalizedAmount, token: tokenSymbol, paymentIntentId: intentId },
      });

      await updatePaymentIntent(intentId, { status: 'pending', txHash: hash });
      await recordActivity({
        id: `intent_${intentId}`,
        type: 'send',
        amount: normalizedAmount,
        token: tokenSymbol,
        direction: 'outgoing',
        status: 'pending',
        timestamp: Date.now(),
        txHash: hash,
        sourceFeature: 'send',
        counterparty: toAddress,
        label: `Send ${normalizedAmount} ${tokenSymbol}`,
        paymentIntentId: intentId,
      });

      setStatus('confirming');
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      await markPendingTx(hash, 'confirmed');
      await updatePaymentIntent(intentId, { status: 'confirmed', txHash: hash, paidAt: Date.now() });
      await recordActivity({
        id: `intent_${intentId}`,
        type: 'send',
        amount: normalizedAmount,
        token: tokenSymbol,
        direction: 'outgoing',
        status: 'confirmed',
        timestamp: Date.now(),
        txHash: hash,
        sourceFeature: 'send',
        counterparty: toAddress,
        label: `Send ${normalizedAmount} ${tokenSymbol}`,
        paymentIntentId: intentId,
      });
      void recordNotification({
        type: 'payment',
        title: 'Payment sent',
        message: `${normalizedAmount} ${tokenSymbol} sent on Arc Testnet.`,
        route: '/history',
        data: { txHash: hash, to: toAddress, amount: normalizedAmount, token: tokenSymbol },
        silent: true,
      });
      setStatus('success');

      return { txHash: hash, status: 'success' };
    } catch (err: any) {
      if (hash) await markPendingTx(hash, 'failed');
      const message = compactErrorMessage(err);

      if (intentId) {
        await updatePaymentIntent(intentId, { status: 'failed', txHash: hash ?? undefined, failureReason: message });
        await recordActivity({
          id: `intent_${intentId}`,
          type: 'send',
          amount: normalizedAmount,
          token: tokenSymbol,
          direction: 'outgoing',
          status: 'failed',
          timestamp: Date.now(),
          txHash: hash ?? undefined,
          sourceFeature: 'send',
          counterparty: toAddress,
          label: `Send ${normalizedAmount} ${tokenSymbol}`,
          paymentIntentId: intentId,
          metadata: { error: message, senderAddress },
        });
      }

      void recordNotification({
        type: 'payment',
        title: 'Payment failed',
        message,
        route: '/send',
        data: { txHash: hash, to: toAddress, amount: normalizedAmount, token: tokenSymbol },
        silent: true,
      });
      setError(message);
      setStatus('error');
      return { txHash: '', status: 'error', error: message };
    }
  }, []);

  const sendUsdc = useCallback((toAddress: string, amountStr: string) => sendToken(toAddress, amountStr, { tokenSymbol: 'USDC' }), [sendToken]);

  const reset = useCallback(() => {
    setStatus('idle');
    setTxHash(null);
    setError(null);
  }, []);

  return { sendToken, sendUsdc, status, txHash, error, reset };
}

