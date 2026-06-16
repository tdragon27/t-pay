import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useWalletStore } from '@/store/walletStore';
import { CachedTransaction, loadCachedTransactions } from '@/utils/storage';
import { loadPendingTxs, PendingTx } from '@/services/pendingTxService';
import { loadActivityItems, type UnifiedActivityItem } from '@/services/activityService';
import { findContactByAddress } from '@/services/contactService';
import { shortenAddress, shortenHash } from '@/utils/format';

type HistoryFilter = 'all' | 'send' | 'receive' | 'bridge' | 'swap' | 'invoice' | 'split' | 'recurring' | 'market' | 'request';
type HistoryRow = {
  id: string;
  type: HistoryFilter;
  hash: string;
  amount: string;
  counterparty?: string;
  contactName?: string;
  status: string;
  timestamp: number;
  source: 'cache' | 'pending' | 'activity';
};

const FILTERS: HistoryFilter[] = ['all', 'send', 'receive', 'split', 'invoice', 'bridge', 'swap', 'request', 'recurring', 'market'];

function rowFromCached(tx: CachedTransaction): HistoryRow {
  return { id: tx.hash, type: tx.type, hash: tx.hash, amount: `${tx.value} USDC`, counterparty: tx.type === 'send' ? tx.to : tx.from, status: tx.status, timestamp: tx.timestamp, source: 'cache' };
}

function rowFromPending(tx: PendingTx): HistoryRow {
  return { id: tx.txHash, type: tx.type as HistoryFilter, hash: tx.txHash, amount: String(tx.metadata?.amount ?? tx.label), counterparty: String(tx.metadata?.to ?? ''), status: tx.status, timestamp: tx.createdAt, source: 'pending' };
}

function rowFromActivity(item: UnifiedActivityItem): HistoryRow {
  const type: HistoryFilter = item.sourceFeature === 'fx' ? 'swap' : item.sourceFeature === 'merchant' ? 'invoice' : item.sourceFeature === 'split' ? 'split' : item.sourceFeature === 'passport' ? 'market' : item.sourceFeature;
  return {
    id: item.id,
    type,
    hash: item.txHash ?? item.id,
    amount: item.amount ? `${item.amount} ${item.token ?? 'USDC'}` : item.label,
    counterparty: item.counterparty,
    status: item.status,
    timestamp: item.timestamp,
    source: 'activity',
  };
}

function statusRank(status: string) {
  if (status === 'confirmed' || status === 'success' || status === 'paid') return 4;
  if (status === 'pending') return 3;
  if (status === 'failed') return 2;
  if (status === 'cancelled') return 1;
  return 0;
}

function historyDedupeKey(row: HistoryRow) {
  return row.hash.startsWith('0x') ? `tx:${row.hash.toLowerCase()}` : `id:${row.id}`;
}

function dedupeHistoryRows(rows: HistoryRow[]) {
  const map = new Map<string, HistoryRow>();
  for (const row of rows) {
    const key = historyDedupeKey(row);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, row);
      continue;
    }

    const rowRank = statusRank(row.status);
    const previousRank = statusRank(previous.status);
    if (rowRank > previousRank || (rowRank === previousRank && row.timestamp >= previous.timestamp)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
}
function csvEscape(value: unknown) {
  const raw = String(value ?? '');
  return raw.includes(',') || raw.includes('"') || raw.includes('\n') ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export default function HistoryScreen() {
  const router = useRouter();
  const address = useWalletStore((state) => state.address);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  async function hydrate() {
    if (!address) return;
    setLoading(true);
    const [cached, pending, activity] = await Promise.all([loadCachedTransactions(address), loadPendingTxs(), loadActivityItems()]);
    const merged = dedupeHistoryRows([...activity.map(rowFromActivity), ...pending.map(rowFromPending), ...cached.map(rowFromCached)]);
    const withContacts = await Promise.all(merged.map(async (row) => {
      const contact = await findContactByAddress(row.counterparty);
      return { ...row, contactName: contact?.name };
    }));
    setRows(withContacts);
    setLoading(false);
  }

  useEffect(() => { void hydrate(); }, [address]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== 'all' && row.type !== filter) return false;
      if (!needle) return true;
      return row.hash.toLowerCase().includes(needle)
        || row.amount.toLowerCase().includes(needle)
        || (row.counterparty ?? '').toLowerCase().includes(needle)
        || (row.contactName ?? '').toLowerCase().includes(needle);
    });
  }, [filter, query, rows]);

  async function exportCsv() {
    const headers = ['type', 'txHash', 'counterparty', 'contactName', 'amount', 'status', 'timestamp', 'source'];
    const body = visible.map((row) => [row.type, row.hash, row.counterparty, row.contactName, row.amount, row.status, new Date(row.timestamp).toISOString(), row.source].map(csvEscape).join(','));
    const csv = [headers.join(','), ...body].join('\n');
    await Clipboard.setStringAsync(csv);
    await Share.share({ title: 'T Pay history export', message: csv });
    Toast.show({ type: 'success', text1: 'History exported', text2: `${visible.length} rows copied/shared as CSV.` });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => safeBack(router)}><Ionicons name="arrow-back" size={22} color={Colors.text1} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>History</Text><Text style={styles.subtitle}>Search, filter, inspect, and export wallet activity.</Text></View>
        <TouchableOpacity style={styles.iconBtn} onPress={hydrate}><Ionicons name="refresh-outline" size={20} color={Colors.primary} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Input label="Search" value={query} onChangeText={setQuery} placeholder="Address, hash, amount, contact..." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((item) => <TouchableOpacity key={item} style={[styles.filter, filter === item && styles.filterActive]} onPress={() => setFilter(item)}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></TouchableOpacity>)}
        </ScrollView>
        <Button label="Export Filtered CSV" variant="secondary" disabled={visible.length === 0} onPress={exportCsv} />
        {loading ? <Text style={styles.loadingText}>Loading history...</Text> : null}
        {!loading && visible.length === 0 ? <Card style={styles.emptyCard}><Ionicons name="receipt-outline" size={34} color={Colors.text3} /><Text style={styles.emptyTitle}>No matching transactions</Text><Text style={styles.emptyText}>Try another filter or send/receive on Arc Testnet first.</Text></Card> : null}
        {visible.map((row) => (
          <Card key={`${row.source}_${row.id}`} style={styles.rowCard}>
            <View style={[styles.typeIcon, row.status === 'pending' && styles.pendingIcon]}><Ionicons name={row.status === 'pending' ? 'time-outline' : row.type === 'send' ? 'arrow-up-outline' : row.type === 'receive' ? 'arrow-down-outline' : 'swap-horizontal-outline'} size={18} color={row.status === 'pending' ? Colors.warning : Colors.primary} /></View>
            <View style={styles.rowMeta}>
              <Text style={styles.rowTitle}>{row.type.toUpperCase()} - {row.amount}</Text>
              <Text style={styles.rowSub}>{row.contactName ?? (row.counterparty ? shortenAddress(row.counterparty, 5) : 'No counterparty')}</Text>
              <Text style={styles.rowHash}>{shortenHash(row.hash)} - {new Date(row.timestamp).toLocaleString()}</Text>
            </View>
            <Text style={[styles.status, row.status === 'pending' ? styles.statusPending : row.status === 'failed' ? styles.statusFailed : styles.statusOk]}>{row.status}</Text>
          </Card>
        ))}
        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: 12 },
  iconBtn: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  title: { color: Colors.text1, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: Colors.text2, fontSize: FontSize.sm, marginTop: 2 },
  content: { padding: Spacing.md, gap: Spacing.md },
  filters: { gap: 8, paddingRight: 6 },
  filter: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: Radius.full, backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  filterActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  filterText: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase' },
  filterTextActive: { color: Colors.primary },
  loadingText: { color: Colors.text2, textAlign: 'center', padding: 16 },
  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  emptyText: { color: Colors.text2, textAlign: 'center', lineHeight: 20 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)' },
  pendingIcon: { backgroundColor: Colors.warningBg, borderColor: 'rgba(255,181,71,0.2)' },
  rowMeta: { flex: 1, gap: 3 },
  rowTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800' },
  rowSub: { color: Colors.text2, fontSize: FontSize.xs },
  rowHash: { color: Colors.text3, fontSize: 11, fontFamily: 'SpaceMono-Regular' },
  status: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  statusPending: { color: Colors.warning },
  statusFailed: { color: Colors.error },
  statusOk: { color: Colors.success },
});






