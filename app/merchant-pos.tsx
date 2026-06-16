import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Button } from '@/components/ui/Button';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { getMerchantInvoiceById, subscribeToMerchantInvoice, type MerchantInvoice } from '@/services/merchantService';
import { formatCurrency, shortenAddress } from '@/utils/format';

const QR_SIZE = Math.min(Dimensions.get('window').width - 88, 260);
const QR_SHELL_SIZE = QR_SIZE + 44;

function statusColor(status: MerchantInvoice['status']) {
  if (status === 'paid') return Colors.success;
  if (status === 'expired') return Colors.warning;
  if (status === 'cancelled') return Colors.error;
  return Colors.primary;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return 'Expired';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function MerchantPosScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invoiceId?: string }>();
  const [invoice, setInvoice] = useState<MerchantInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  const remainingMs = invoice ? Math.max(0, invoice.expiresAt - now) : 0;
  const accent = invoice ? statusColor(invoice.status) : Colors.primary;
  const isPaid = invoice?.status === 'paid';
  const isOpen = invoice?.status === 'open' && remainingMs > 0;

  const posSubtitle = useMemo(() => {
    if (!invoice) return 'Waiting for invoice details';
    if (invoice.status === 'paid') return 'Payment confirmed on Arc. You can hand over the goods/service.';
    if (invoice.status === 'expired') return 'This invoice has expired. Generate a new QR for the customer.';
    if (invoice.status === 'cancelled') return 'This invoice was cancelled.';
    return 'Keep this screen open while the customer scans and pays.';
  }, [invoice]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      if (!params.invoiceId) {
        setError('Missing invoice id. Open POS mode from a selected merchant invoice.');
        setLoading(false);
        return;
      }

      const found = await getMerchantInvoiceById(params.invoiceId);
      if (!active) return;
      if (!found) setError('Invoice not found. Sync backend or create a new invoice.');
      else setInvoice(found);
      setLoading(false);
    }

    hydrate();
    return () => {
      active = false;
    };
  }, [params.invoiceId]);

  useEffect(() => {
    if (!params.invoiceId) return;
    return subscribeToMerchantInvoice(params.invoiceId, (nextInvoice) => {
      if (!nextInvoice) return;
      setInvoice(nextInvoice);
      if (nextInvoice.status === 'paid') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 2_000);
  }, [params.invoiceId]);

  async function copyLink() {
    if (!invoice) return;
    await Clipboard.setStringAsync(invoice.deepLink);
    Toast.show({ type: 'success', text1: 'Payment link copied', text2: invoice.id });
  }

  async function shareLink() {
    if (!invoice) return;
    await Share.share({ title: 'T Pay POS Invoice', message: `${invoice.label}\n${invoice.deepLink}` });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Loading POS invoice...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !invoice) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text1} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>POS Mode</Text>
          <View style={{ width: 42 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={34} color={Colors.error} />
          <Text style={styles.errorText}>{error ?? 'Invoice unavailable.'}</Text>
          <Button label="Back to Merchant" onPress={() => router.replace('/merchant' as any)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>POS Mode</Text>
        <TouchableOpacity onPress={copyLink} style={styles.iconBtn}>
          <Ionicons name="copy-outline" size={19} color={Colors.text2} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <LinearGradient colors={['#102B36', '#0A0A0F']} style={[styles.statusCard, { borderColor: `${accent}55` }]}>
          <View style={[styles.statusIcon, { backgroundColor: `${accent}1F`, borderColor: `${accent}55` }]}>
            <Ionicons name={isPaid ? 'checkmark-circle-outline' : 'qr-code-outline'} size={32} color={accent} />
          </View>
          <Text style={styles.statusTitle}>{isPaid ? 'Paid' : invoice.status === 'open' ? 'Waiting for payment' : invoice.status}</Text>
          <Text style={styles.statusSubtitle}>{posSubtitle}</Text>
        </LinearGradient>

        <View style={styles.amountBlock}>
          <Text style={styles.amount}>{invoice.amount} {invoice.tokenSymbol}</Text>
          <Text style={styles.displayAmount}>{formatCurrency(Number(invoice.displayAmount || 0), invoice.displayCurrency)}</Text>
          <Text style={styles.label}>{invoice.label}</Text>
        </View>

        <View style={[styles.qrShell, isPaid && styles.qrShellPaid]}>
          {isPaid ? (
            <View style={styles.paidOverlay}>
              <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
              <Text style={styles.paidOverlayText}>Settled</Text>
            </View>
          ) : (
            <QRCode value={invoice.qrValue} size={QR_SIZE} color={Colors.text1} backgroundColor={Colors.surface} />
          )}
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Expires in</Text>
            <Text style={[styles.metaValue, { color: isOpen ? Colors.warning : accent }]}>{formatCountdown(remainingMs)}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Mode</Text>
            <Text style={styles.metaValue}>{invoice.settleMode}</Text>
          </View>
          <View style={styles.metaBoxWide}>
            <Text style={styles.metaLabel}>Merchant</Text>
            <Text style={styles.metaValue}>{shortenAddress(invoice.merchantAddress, 7)}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button label="Share" variant="secondary" onPress={shareLink} style={{ flex: 1 }} />
          <Button label="Payer View" onPress={() => router.push({ pathname: '/pay' as any, params: { invoiceId: invoice.id } })} style={{ flex: 1 }} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.sm },
  iconBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  headerTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  body: { flex: 1, padding: Spacing.md, gap: Spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: Spacing.lg },
  loadingText: { color: Colors.text2, fontSize: FontSize.sm },
  errorText: { color: Colors.error, fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  statusCard: { borderRadius: 28, padding: Spacing.lg, alignItems: 'center', gap: 9, borderWidth: 1 },
  statusIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  statusTitle: { color: Colors.text1, fontSize: 24, fontWeight: '800', textTransform: 'capitalize' },
  statusSubtitle: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  amountBlock: { alignItems: 'center', gap: 5 },
  amount: { color: Colors.text1, fontSize: 42, lineHeight: 48, fontWeight: '800', letterSpacing: -1.4 },
  displayAmount: { color: Colors.primary, fontSize: FontSize.lg, fontWeight: '800' },
  label: { color: Colors.text2, fontSize: FontSize.sm, textAlign: 'center' },
  qrShell: { alignSelf: 'center', width: QR_SHELL_SIZE, height: QR_SHELL_SIZE, borderRadius: 34, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  qrShellPaid: { backgroundColor: Colors.successBg, borderColor: 'rgba(0,232,143,0.32)' },
  paidOverlay: { alignItems: 'center', gap: 10 },
  paidOverlayText: { color: Colors.success, fontSize: 26, fontWeight: '800' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaBox: { flex: 1, minWidth: '47%', padding: 14, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  metaBoxWide: { width: '100%', padding: 14, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  metaLabel: { color: Colors.text3, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  metaValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 'auto' },
});




