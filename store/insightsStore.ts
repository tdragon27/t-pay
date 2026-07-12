// store/insightsStore.ts
// -----------------------------------------------------------------------------
// Zustand store for activity insights ? aggregated from tx history + flow runs.
// -----------------------------------------------------------------------------

import { create } from 'zustand';
import type { CachedTransaction } from '@/utils/storage';
import type { FlowRun } from '@/services/taskEngine';

export interface InsightsState {
  totalTxCount:    number;
  totalVolume:     number;     // USD (testnet)
  chainsUsed:      number[];
  activityScore:   number;     // 0?100
  sendCount:       number;
  receiveCount:    number;
  bridgeCount:     number;
  faucetCount:     number;
  lastActivity:    number;     // timestamp
  streakDays:      number;
  isLoaded:        boolean;
  // actions
  computeFromHistory: (txs: CachedTransaction[], flows: FlowRun[]) => void;
}

function computeActivityScore(
  txCount: number,
  bridgeCount: number,
  streakDays: number,
): number {
  const base    = Math.min(txCount * 5, 40);       // max 40 pts from tx count
  const bridge  = Math.min(bridgeCount * 10, 30);  // max 30 pts from bridges
  const streak  = Math.min(streakDays * 5, 30);    // max 30 pts from streaks
  return Math.min(base + bridge + streak, 100);
}

function computeStreak(txs: CachedTransaction[]): number {
  if (txs.length === 0) return 0;
  const sorted = [...txs].sort((a, b) => b.timestamp - a.timestamp);
  let streak   = 1;
  let prev     = new Date(sorted[0].timestamp * 1000);
  prev.setHours(0, 0, 0, 0);

  for (let i = 1; i < sorted.length; i++) {
    const cur = new Date(sorted[i].timestamp * 1000);
    cur.setHours(0, 0, 0, 0);
    const diffDays = (prev.getTime() - cur.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) { streak++; prev = cur; }
    else if (diffDays > 1) break;
  }
  return streak;
}

export const useInsightsStore = create<InsightsState>((set) => ({
  totalTxCount:   0,
  totalVolume:    0,
  chainsUsed:     [],
  activityScore:  0,
  sendCount:      0,
  receiveCount:   0,
  bridgeCount:    0,
  faucetCount:    0,
  lastActivity:   0,
  streakDays:     0,
  isLoaded:       false,

  computeFromHistory: (txs: CachedTransaction[], flows: FlowRun[]) => {
    const sendCount    = txs.filter((t) => t.type === 'send').length;
    const receiveCount = txs.filter((t) => t.type === 'receive').length;
    const bridgeCount  = flows.reduce((a, f) => a + f.tasks.filter((t) => t.type === 'bridge' && t.status === 'success').length, 0);
    const faucetCount  = flows.reduce((a, f) => a + f.tasks.filter((t) => t.type === 'faucet' && t.status === 'success').length, 0);

    const totalVolume  = txs.reduce((acc, tx) => acc + (parseFloat(tx.value) || 0), 0);
    const chainsUsed   = [5042002];

    const streakDays    = computeStreak(txs);
    const totalTxCount  = txs.length + bridgeCount + faucetCount;
    const activityScore = computeActivityScore(totalTxCount, bridgeCount, streakDays);
    const lastActivity  = txs.length > 0
      ? Math.max(...txs.map((t) => t.timestamp))
      : 0;

    set({
      totalTxCount, totalVolume, chainsUsed, activityScore,
      sendCount, receiveCount, bridgeCount, faucetCount,
      lastActivity, streakDays, isLoaded: true,
    });
  },
}));
