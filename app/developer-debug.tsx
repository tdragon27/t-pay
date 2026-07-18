import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Colors, FontFamily, FontSize, Radius, Spacing } from '@/constants/theme';
import { ARC_CONTRACTS, ARC_OFFICIAL_CONTRACTS, arcTestnet } from '@/constants/chains';
import { useWalletStore } from '@/store/walletStore';
import { checkArcRpcHealth, type ArcRpcHealth } from '@/services/arcHealthService';
import { getSupabaseStatus } from '@/services/supabaseClient';
import { loadBalanceCache, type BalanceCacheSnapshot } from '@/services/balanceCacheService';
import { loadPaymentIntents } from '@/services/paymentIntentService';
import { loadActivityItems } from '@/services/activityService';
import { loadPendingTxs } from '@/services/pendingTxService';
import { loadSplitBills } from '@/services/splitBillService';
import { loadMerchantInvoices } from '@/services/merchantService';
import { isArcAppKitConfigured, isArcAppKitSwapAvailable } from '@/lib/arcAppKit';
import { shortenAddress } from '@/utils/format';
import { safeBack } from '@/utils/navigation';

function configured(value?: string | null) {
  return Boolean(value && value.trim() && value !== '0x...' && !value.toLowerCase().includes('your_'));
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.debugRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} selectable>{value}</Text>
    </View>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  const color = ok ? Colors.success : Colors.warning;
  return <Text style={[styles.pill, { color, borderColor: color + '55', backgroundColor: color + '18' }]}>{label}</Text>;
}

export default function DeveloperDebugScreen() {
  const router = useRouter();
  const { address, usdcBalanceFormatted } = useWalletStore();
  const [rpcHealth, setRpcHealth] = useState<ArcRpcHealth | null>(null);
  const [balanceCache, setBalanceCache] = useState<BalanceCacheSnapshot | null>(null);
  const [counts, setCounts] = useState({ intents: 0, activity: 0, pending: 0, splits: 0, invoices: 0 });
  const [loading, setLoading] = useState(false);

  const supabaseStatus = getSupabaseStatus();
  const appKitConfigured = isArcAppKitConfigured();
  const swapConfigured =
    isArcAppKitSwapAvailable('USDC', 'EURC') ||
    configured(process.env.EXPO_PUBLIC_TPAY_BACKEND_URL) ||
    configured(ARC_CONTRACTS.DEX_ROUTER);
  const unifiedBalanceConfigured = appKitConfigured;

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const [cache, intents, activity, pending, splits, invoices] = await Promise.all([
        loadBalanceCache(address),
        loadPaymentIntents({ wallet: address, limit: 20 }),
        loadActivityItems({ limit: 20 }),
        loadPendingTxs(),
        loadSplitBills().catch(() => []),
        address ? loadMerchantInvoices({ merchantAddress: address, preferBackend: true }).catch(() => []) : Promise.resolve([]),
      ]);
      setBalanceCache(cache);
      setCounts({
        intents: intents.length,
        activity: activity.length,
        pending: pending.length,
        splits: splits.length,
        invoices: invoices.length,
      });
    } finally {
      setLoading(false);
    }
  }, [address]);

  const refreshRpc = useCallback(async () => {
    setLoading(true);
    try {
      const health = await checkArcRpcHealth();
      setRpcHealth(health);
      Toast.show({ type: health.status === 'offline' ? 'error' : 'success', text1: health.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void hydrate();
    void refreshRpc();
  }, [hydrate, refreshRpc]);

  async function copyReport() {
    const report = [
      'Developer Debug - Testnet Only',
      'Secrets: redacted. No seed phrase, private key, or API key is included.',
      'Wallet: ' + (address ? shortenAddress(address, 8) : 'not connected'),
      'Chain ID: ' + String(arcTestnet.id),
      'RPC: ' + (rpcHealth?.status || 'unchecked') + ' - ' + (rpcHealth?.message || ''),
      'Supabase: ' + (supabaseStatus.configured ? 'configured' : 'missing'),
      'App Kit: ' + (appKitConfigured ? 'configured' : 'missing'),
      'Swap: ' + (swapConfigured ? 'configured' : 'missing'),
      'Unified Balance: ' + (unifiedBalanceConfigured ? 'configured' : 'missing'),
      'Arc Memo: official testnet predeploy configured',
      'Arc Batch: official Multicall3From predeploy configured',
      'Cached balance: ' + (balanceCache ? balanceCache.totalUsdc + ' USDC' : 'none'),
      'Counts: ' + JSON.stringify(counts),
    ].join('\n');
    await Clipboard.setStringAsync(report);
    Toast.show({ type: 'success', text1: 'Debug report copied' });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => safeBack(router)}>
          <Ionicons name="arrow-back" size={22} color={Colors.text1} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Developer Debug</Text>
          <Text style={styles.subtitle}>Testnet only - sensitive values redacted</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.banner}>
          <Ionicons name="construct-outline" size={22} color={Colors.warning} />
          <Text style={styles.bannerText}>Developer Debug - Testnet Only</Text>
        </Card>

        <View style={styles.buttonRow}>
          <Button label="Refresh" loading={loading} onPress={hydrate} style={styles.button} />
          <Button label="Check RPC" variant="secondary" loading={loading} onPress={refreshRpc} style={styles.button} />
        </View>
        <Button label="Copy Debug Report" variant="secondary" onPress={copyReport} />

        <Text style={styles.section}>Environment</Text>
        <Card>
          <DebugRow label="Wallet" value={address ? shortenAddress(address, 8) : 'Not connected'} />
          <DebugRow label="Chain ID" value={String(arcTestnet.id)} />
          <DebugRow label="Arc Testnet" value="Enabled - testnet assets only" />
          <DebugRow label="RPC" value={(rpcHealth?.status || 'unchecked') + ' - ' + (rpcHealth?.message || 'Not checked')} />
          <View style={styles.statusRow}>
            <StatusPill label={supabaseStatus.configured ? 'Supabase configured' : 'Supabase missing'} ok={supabaseStatus.configured} />
            <StatusPill label={appKitConfigured ? 'App Kit configured' : 'App Kit missing'} ok={appKitConfigured} />
            <StatusPill label={swapConfigured ? 'Swap configured' : 'Swap missing'} ok={swapConfigured} />
            <StatusPill label={unifiedBalanceConfigured ? 'Unified Balance ready' : 'Unified Balance missing'} ok={unifiedBalanceConfigured} />
            <StatusPill label="Arc Memo configured" ok={Boolean(ARC_OFFICIAL_CONTRACTS.MEMO)} />
            <StatusPill label="Batch payouts configured" ok={Boolean(ARC_OFFICIAL_CONTRACTS.MULTICALL3_FROM)} />
          </View>
        </Card>

        <Text style={styles.section}>Local State</Text>
        <Card>
          <DebugRow label="Live wallet balance" value={usdcBalanceFormatted + ' USDC'} />
          <DebugRow label="Cached balance" value={balanceCache ? balanceCache.totalUsdc + ' USDC' : 'None'} />
          <DebugRow label="Pending intents" value={String(counts.intents)} />
          <DebugRow label="Pending txs" value={String(counts.pending)} />
          <DebugRow label="Activity records" value={String(counts.activity)} />
          <DebugRow label="Split bills" value={String(counts.splits)} />
          <DebugRow label="Merchant invoices" value={String(counts.invoices)} />
        </Card>
        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: 12 },
  iconBtn: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  title: { color: Colors.text1, fontFamily: FontFamily.displayBold, fontSize: 28, letterSpacing: -0.35 },
  subtitle: { color: Colors.text2, fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: 2 },
  content: { padding: Spacing.md, gap: Spacing.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.warningBg, borderColor: '#FFB54744' },
  bannerText: { color: Colors.warning, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md },
  buttonRow: { flexDirection: 'row', gap: 10 },
  button: { flex: 1 },
  section: { color: Colors.text2, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, letterSpacing: 0.2, marginTop: 6 },
  debugRow: { gap: 5, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLabel: { color: Colors.text3, fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs },
  rowValue: { color: Colors.text1, fontFamily: FontFamily.mono, fontSize: FontSize.xs, lineHeight: 20 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
  pill: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 5, overflow: 'hidden', fontFamily: FontFamily.bodySemiBold, fontSize: 10 },
});

