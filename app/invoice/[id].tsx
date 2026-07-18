import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import * as ExpoLinking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { invoiceService, type DisplayCurrency, type Invoice } from '@/services/invoiceService';
import { useWalletStore } from '@/store/walletStore';
import { shortenAddress } from '@/utils/format';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ensureCriticalAuth } from '@/services/securityService';

function formatDate(value: Date | null) {
  if (!value) return 'No due date';
  return value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatLocalCurrency(amount: number, currency: DisplayCurrency) {
  try {
    return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'VND' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function statusAccent(status: Invoice['status']) {
  if (status === 'Paid') return Colors.success;
  if (status === 'Cancelled') return Colors.error;
  if (status === 'Overdue') return Colors.warning;
  return Colors.primary;
}

function invoiceLink(id: number) {
  return ExpoLinking.createURL(`/invoice/${id}`);
}

function buildInvoiceHtml(invoice: Invoice) {
  const meta = invoice.meta;
  const currency = (meta?.displayCurrency ?? 'USD') as DisplayCurrency;
  const exchangeRate = meta?.exchangeRate ?? 1;
  const lineItems = meta?.lineItems ?? [];
  const displayTotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const accent = statusAccent(invoice.status);
  const rows = lineItems
    .map(
      (item) => `
        <tr>
          <td>${item.description}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">${formatLocalCurrency(item.unitPrice, currency)}</td>
          <td style="text-align:right">${formatLocalCurrency(item.quantity * item.unitPrice, currency)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #10131c; }
        h1 { margin: 0; font-size: 28px; }
        .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: ${accent}22; color: ${accent}; }
        .panel { background: #f6f8fb; border-radius: 16px; padding: 18px; margin-bottom: 20px; }
        .label { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #74839a; margin-bottom: 4px; }
        .value { font-size: 14px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        th { color: #74839a; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; text-align: left; }
        .totals { margin-left: auto; width: 280px; margin-top: 16px; }
        .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
        .totals-main { font-weight: 800; font-size: 18px; border-top: 2px solid #d8dee8; margin-top: 8px; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="top">
        <div>
          <h1>${meta?.issuerName ?? 'T Pay Invoice'}</h1>
          <div style="color:#74839a;margin-top:6px">Invoice ${invoice.invoiceNumber}</div>
        </div>
        <span class="badge">${invoice.status}</span>
      </div>

      <div class="panel">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px">
          <div>
            <div class="label">From</div>
            <div class="value">${meta?.issuerName ?? '-'}</div>
            <div style="font-size:12px;color:#74839a">${invoice.creator}</div>
          </div>
          <div>
            <div class="label">Bill To</div>
            <div class="value">${meta?.clientName ?? '-'}</div>
            <div style="font-size:12px;color:#74839a">${(meta?.clientEmail ?? invoice.payer) || '-'}</div>
          </div>
          <div>
            <div class="label">Due Date</div>
            <div class="value">${formatDate(invoice.dueAt)}</div>
            <div style="font-size:12px;color:#74839a">Onchain ID #${invoice.id}</div>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align:center">Qty</th>
            <th style="text-align:right">Unit</th>
            <th style="text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="totals">
        ${currency !== 'USD' ? `<div class="totals-row"><span>Display total</span><span>${formatLocalCurrency(displayTotal, currency)}</span></div>` : ''}
        ${currency !== 'USD' ? `<div class="totals-row"><span>Rate</span><span>1 USDC = ${exchangeRate} ${currency}</span></div>` : ''}
        <div class="totals-row totals-main"><span>Total due</span><span>$${invoice.amountUsdc.toFixed(2)} USDC</span></div>
      </div>

      ${meta?.notes ? `<div class="panel" style="margin-top:20px"><div class="label">Notes</div><div>${meta.notes}</div></div>` : ''}
    </body>
  </html>`;
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const address = useWalletStore((state) => state.address);
  const { isOffline } = useNetworkStatus();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'pay' | 'remind' | 'cancel' | 'pdf' | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const next = await invoiceService.fetchInvoice(Number(id));
      setInvoice(next);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const canPay = useMemo(() => {
    if (!invoice || !address) return false;
    return invoice.status === 'Pending' && address.toLowerCase() !== invoice.creator.toLowerCase();
  }, [address, invoice]);

  const canRemind = useMemo(() => {
    if (!invoice || !address) return false;
    if (address.toLowerCase() !== invoice.creator.toLowerCase()) return false;
    if (invoice.status !== 'Pending') return false;
    return !invoice.lastReminder || Date.now() - invoice.lastReminder.getTime() > 24 * 60 * 60 * 1000;
  }, [address, invoice]);

  const canCancel = useMemo(() => {
    if (!invoice || !address) return false;
    return invoice.status === 'Pending' && address.toLowerCase() === invoice.creator.toLowerCase();
  }, [address, invoice]);

  async function handlePay() {
    if (!invoice) return;
    if (isOffline) return Alert.alert('Read-only mode', 'Reconnect internet before paying an invoice.');
    const unlocked = await ensureCriticalAuth();
    if (!unlocked) return Alert.alert('Unlock required', 'PIN or biometric unlock is required before paying.');
    setBusy('pay');
    const result = await invoiceService.payInvoice(invoice.id, invoice.amountUsdc);
    setBusy(null);

    if (!result.success) {
      Alert.alert('Payment failed', result.error);
      return;
    }

    Alert.alert('Payment sent', 'Invoice payment was submitted successfully on Arc.');
    await load();
  }

  async function handleReminder() {
    if (!invoice) return;
    if (isOffline) return Alert.alert('Read-only mode', 'Reconnect internet before sending a reminder.');
    const unlocked = await ensureCriticalAuth();
    if (!unlocked) return Alert.alert('Unlock required', 'PIN or biometric unlock is required before sending a reminder.');
    setBusy('remind');
    const result = await invoiceService.sendReminder(invoice.id);
    setBusy(null);

    if (!result.success) {
      Alert.alert('Unable to send reminder', result.error);
      return;
    }

    Alert.alert('Reminder sent', 'A reminder event was emitted for this invoice.');
    await load();
  }

  async function handleCancel() {
    if (!invoice) return;
    if (isOffline) return Alert.alert('Read-only mode', 'Reconnect internet before cancelling an invoice.');
    const unlocked = await ensureCriticalAuth();
    if (!unlocked) return Alert.alert('Unlock required', 'PIN or biometric unlock is required before cancelling.');
    setBusy('cancel');
    const result = await invoiceService.cancelInvoice(invoice.id);
    setBusy(null);

    if (!result.success) {
      Alert.alert('Unable to cancel payment request', result.error);
      return;
    }

    Alert.alert('Payment request cancelled', 'This invoice is now closed.');
    await load();
  }

  async function handleShare() {
    if (!invoice) return;
    const url = invoiceLink(invoice.id);
    await Share.share({
      title: `Invoice ${invoice.invoiceNumber}`,
      message: `Please review invoice ${invoice.invoiceNumber} for $${invoice.amountUsdc.toFixed(2)} USDC.\n${url}`,
      url,
    });
  }

  async function handlePdf() {
    if (!invoice) return;
    setBusy('pdf');
    try {
      const { uri } = await Print.printToFileAsync({ html: buildInvoiceHtml(invoice) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf' });
      } else {
        Alert.alert('PDF created', uri);
      }
    } catch (error: any) {
      Alert.alert('Unable to export PDF', error?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>Loading invoice...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!invoice) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={28} color={Colors.warning} />
          <Text style={styles.centerText}>Invoice not found.</Text>
          <Button label="Go Back" variant="secondary" fullWidth={false} onPress={() => safeBack(router)} />
        </View>
      </SafeAreaView>
    );
  }

  const accent = statusAccent(invoice.status);
  const meta = invoice.meta;
  const displayCurrency = (meta?.displayCurrency ?? 'USD') as DisplayCurrency;
  const displayTotal = meta?.lineItems?.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => safeBack(router)}>
          <Ionicons name="arrow-back" size={22} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invoice</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color={Colors.text1} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handlePdf}>
            <Ionicons name="document-text-outline" size={20} color={Colors.text1} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Card style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroEyebrow}>{meta?.issuerName ?? 'T Pay Invoice'}</Text>
              <Text style={styles.heroTitle}>{invoice.invoiceNumber}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: `${accent}18`, borderColor: `${accent}35` }]}>
              <Text style={[styles.statusBadgeText, { color: accent }]}>{invoice.status}</Text>
            </View>
          </View>
          <Text style={styles.heroAmount}>${invoice.amountUsdc.toFixed(2)} USDC</Text>
          <Text style={styles.heroSub}>{displayCurrency !== 'USD' ? formatLocalCurrency(displayTotal, displayCurrency) : 'Settles directly in USDC on Arc'}</Text>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Parties</Text>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Issuer</Text><Text style={styles.detailValue}>{meta?.issuerName || shortenAddress(invoice.creator, 6)}</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Client</Text><Text style={styles.detailValue}>{meta?.clientName || 'Open invoice'}</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Payer wallet</Text><Text style={styles.detailValue}>{invoice.payer ? shortenAddress(invoice.payer, 6) : 'Any wallet'}</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Due date</Text><Text style={styles.detailValue}>{formatDate(invoice.dueAt)}</Text></View>
          {invoice.paidAt ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Paid on</Text><Text style={styles.detailValue}>{formatDate(invoice.paidAt)}</Text></View> : null}
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Line Items</Text>
          {(meta?.lineItems ?? []).length === 0 ? (
            <Text style={styles.emptyText}>No line items were stored for this invoice.</Text>
          ) : (
            (meta?.lineItems ?? []).map((item, index) => (
              <View key={`${item.description}-${index}`} style={styles.lineItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineItemTitle}>{item.description}</Text>
                  <Text style={styles.lineItemHint}>Qty {item.quantity}</Text>
                </View>
                <Text style={styles.lineItemValue}>{formatLocalCurrency(item.quantity * item.unitPrice, displayCurrency)}</Text>
              </View>
            ))
          )}

          <View style={styles.totalDivider} />
          {displayCurrency !== 'USD' ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Display total</Text><Text style={styles.detailValue}>{formatLocalCurrency(displayTotal, displayCurrency)}</Text></View> : null}
          {displayCurrency !== 'USD' ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Exchange rate</Text><Text style={styles.detailValue}>1 USDC = {meta?.exchangeRate ?? 1} {displayCurrency}</Text></View> : null}
          <View style={styles.detailRow}><Text style={styles.detailLabel}>Settlement total</Text><Text style={[styles.detailValue, { color: Colors.primary }]}>${invoice.amountUsdc.toFixed(2)} USDC</Text></View>
        </Card>

        {meta?.notes ? (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesText}>{meta.notes}</Text>
          </Card>
        ) : null}

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.buttonStack}>
            {canPay ? <Button label={isOffline ? 'Offline - Pay Disabled' : busy === 'pay' ? 'Paying...' : 'Pay Invoice'} onPress={handlePay} loading={busy === 'pay'} disabled={isOffline} /> : null}
            {canRemind ? <Button label={busy === 'remind' ? 'Sending...' : 'Send Reminder'} variant="secondary" onPress={handleReminder} loading={busy === 'remind'} /> : null}
            {canCancel ? <Button label={isOffline ? 'Offline - Cancel Disabled' : busy === 'cancel' ? 'Cancelling...' : 'Cancel Invoice'} variant="danger" onPress={handleCancel} loading={busy === 'cancel'} disabled={isOffline} /> : null}
            <Button label={busy === 'pdf' ? 'Exporting...' : 'Export PDF'} variant="ghost" onPress={handlePdf} loading={busy === 'pdf'} />
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: Spacing.lg },
  centerText: { color: Colors.text2, fontSize: FontSize.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 64 },
  heroCard: { gap: 10 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  heroEyebrow: { color: Colors.text2, fontSize: FontSize.sm },
  heroTitle: { color: Colors.text1, fontSize: FontSize.xl, fontWeight: '800', marginTop: 4 },
  heroAmount: { color: Colors.primary, fontSize: 32, fontWeight: '800' },
  heroSub: { color: Colors.text2, fontSize: FontSize.sm },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  statusBadgeText: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase' },
  sectionCard: { gap: 14 },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '700' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  detailLabel: { color: Colors.text2, fontSize: FontSize.sm },
  detailValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  emptyText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  lineItemRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  lineItemTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '600' },
  lineItemHint: { color: Colors.text3, fontSize: FontSize.xs, marginTop: 4 },
  lineItemValue: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '700' },
  totalDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  notesText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  buttonStack: { gap: 10 },
});








