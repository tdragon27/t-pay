// hooks/useArcWallet.ts ? v1.1.1 fix
// -----------------------------------------------------------------------------
// Primary hook: initialises the wallet session from SecureStore.
// Call this once at the root layout level.
// -----------------------------------------------------------------------------

import { useEffect, useCallback, useRef } from 'react';
import { privateKeyToAccount } from 'viem/accounts';
import { loadPrivateKey, wipeWallet } from '@/lib/wallet';
import { saveAddress, clearAllStorage } from '@/utils/storage';
import { useWalletStore } from '@/store/walletStore';
import type { Hex } from 'viem';

// OK: FIX: Timeout safety net ? if loadPrivateKey() is treo over 5s,
// setLoaded(true) váº«n Ä‘Æ°á»£c gá»i Ä‘á»ƒ thoÃ¡t khá»i mÃ n hÃ¬nh spinner.
const INIT_TIMEOUT_MS = 5_000;

export function useArcWallet() {
  const { setAddress, setLoaded, reset } = useWalletStore();
  const loadedRef = useRef(false); // prevent double setLoaded

  const markLoaded = useCallback(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      setLoaded(true);
    }
  }, [setLoaded]);

  const initWallet = useCallback(async () => {
    // OK: Safety net: force setLoaded(true) after INIT_TIMEOUT_MS
    const timer = setTimeout(() => {
      console.warn('[useArcWallet] init timed out ? forcing loaded state');
      markLoaded();
    }, INIT_TIMEOUT_MS);

    try {
      const pk = await loadPrivateKey();
      if (!pk) {
        markLoaded();
        return;
      }
      const account = privateKeyToAccount(pk as Hex);
      setAddress(account.address);
      await saveAddress(account.address);
    } catch (e) {
      console.error('[useArcWallet] init error', e);
    } finally {
      clearTimeout(timer);
      markLoaded(); // always call, ref prevents duplicates
    }
  }, [markLoaded, setAddress]);

  const disconnectWallet = useCallback(async () => {
    await wipeWallet();
    await clearAllStorage();
    reset();
  }, [reset]);

  useEffect(() => {
    initWallet();
  }, []);

  return { initWallet, disconnectWallet };
}
