// services/faucetService.ts ? v1.2.2
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeOpenUrl } from '@/utils/safeOpenUrl';

// OK: FIX: DOMException does not exist trong React Native/Hermes
// DÃ¹ng Error thÃ´ng thÆ°á»ng thay tháº¿
function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new Error(`Request timed out after ${ms}ms`));
    }
  }, ms);
  return controller.signal;
}

export type FaucetStatus = 'idle' | 'requesting' | 'opened' | 'success' | 'failed' | 'cooldown';

export interface FaucetProvider {
  id:          string;
  name:        string;
  url:         string;
  chainIds:    number[];
  apiEndpoint?: string;
  cooldownMs:  number;
}

export interface FaucetResult {
  provider:  string;
  txHash?:   string;
  amount:    string;
  chainId:   number;
  timestamp: number;
  status:    'opened' | 'success' | 'failed';
  error?:    string;
}

export const FAUCET_PROVIDERS: FaucetProvider[] = [
  { id: 'circle_official', name: 'Circle Official Faucet',  url: 'https://faucet.circle.com/',                   chainIds: [5042002, 84532, 11155111, 421614, 80002], cooldownMs: 24 * 60 * 60 * 1000 },
  { id: 'alchemy_sepolia', name: 'Alchemy Sepolia Faucet',  url: 'https://sepoliafaucet.com/',                    chainIds: [11155111],                                cooldownMs: 24 * 60 * 60 * 1000 },
  { id: 'base_sepolia',    name: 'Base Sepolia Faucet',     url: 'https://faucet.quicknode.com/base/sepolia',     chainIds: [84532],                                   cooldownMs: 12 * 60 * 60 * 1000 },
  { id: 'polygon_amoy',   name: 'Polygon Amoy Faucet',     url: 'https://faucet.polygon.technology/',            chainIds: [80002],                                   cooldownMs: 12 * 60 * 60 * 1000 },
];

const COOLDOWN_KEY = 'tpay_faucet_cooldowns_v1';
const HISTORY_KEY  = 'tpay_faucet_history_v1';

async function getCooldowns(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(COOLDOWN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function setCooldown(key: string, expiresAt: number): Promise<void> {
  const map = await getCooldowns();
  map[key]  = expiresAt;
  await AsyncStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
}

async function saveHistory(result: FaucetResult): Promise<void> {
  try {
    const raw  = await AsyncStorage.getItem(HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as FaucetResult[]) : [];
    list.unshift(result);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {}
}

class FaucetService {
  getProviders(chainId: number): FaucetProvider[] {
    return FAUCET_PROVIDERS.filter((p) => p.chainIds.includes(chainId));
  }

  async isOnCooldown(providerId: string, address: string): Promise<boolean> {
    const map = await getCooldowns();
    const key = `${providerId}_${address.toLowerCase()}`;
    return (map[key] ?? 0) > Date.now();
  }

  async cooldownRemaining(providerId: string, address: string): Promise<number> {
    const map = await getCooldowns();
    const key = `${providerId}_${address.toLowerCase()}`;
    return Math.max(0, Math.ceil(((map[key] ?? 0) - Date.now()) / 1000));
  }

  async getHistory(): Promise<FaucetResult[]> {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  async claimFaucet(
    address:     string,
    chainId:     number = 5042002,
    openBrowser: boolean = true,
  ): Promise<FaucetResult> {
    const providers = this.getProviders(chainId);

    if (providers.length === 0) {
      return { provider: 'none', amount: '0', chainId, timestamp: Date.now(), status: 'failed', error: `No faucet supports chain ${chainId}` };
    }

    for (const provider of providers) {
      if (await this.isOnCooldown(provider.id, address)) continue;

      if (provider.apiEndpoint) {
        try {
          const res = await fetch(provider.apiEndpoint, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ address, chainId }),
            signal:  createTimeoutSignal(12_000),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.txHash) {
              const result: FaucetResult = {
                provider:  provider.name,
                txHash:    data.txHash,
                amount:    data.amount ?? '10.00',
                chainId,
                timestamp: Date.now(),
                status:    'success',
              };
              await setCooldown(`${provider.id}_${address.toLowerCase()}`, Date.now() + provider.cooldownMs);
              await saveHistory(result);
              return result;
            }
          }
        } catch {}
      }
    }

    const best = providers[0];
    if (openBrowser) await safeOpenUrl(best.url, best.name);

    const result: FaucetResult = {
      provider: best.name,
      amount: '0',
      chainId,
      timestamp: Date.now(),
      status: 'opened',
      error: 'Circle Faucet opened. Complete the claim in the browser; T Pay will show the transaction after it appears on-chain.',
    };
    await saveHistory(result);
    await setCooldown(`${best.id}_${address.toLowerCase()}`, Date.now() + 15_000);
    return result;
  }
}

export const faucetService = new FaucetService();

