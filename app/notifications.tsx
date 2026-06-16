import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type TPayNotification,
} from '@/services/notificationService';
import { timeAgo } from '@/utils/format';

function iconFor(type: TPayNotification['type']): keyof typeof Ionicons.glyphMap {
  if (type === 'payment') return 'checkmark-circle-outline';
  if (type === 'bridge') return 'swap-horizontal-outline';
  if (type === 'security') return 'shield-checkmark-outline';
  if (type === 'invoice') return 'receipt-outline';
  return 'notifications-outline';
}

function colorFor(type: TPayNotification['type']) {
  if (type === 'payment') return Colors.success;
  if (type === 'bridge') return Colors.primary;
  if (type === 'security') return Colors.warning;
  if (type === 'invoice') return '#8B79FF';
  return Colors.text2;
}

function openRoute(router: ReturnType<typeof useRouter>, route?: string) {
  if (!route) return;
  if (route.startsWith('/pay?')) {
    const invoiceId = /invoiceId=([^&]+)/.exec(route)?.[1];
    router.push({ pathname: '/pay' as any, params: { invoiceId: invoiceId ? decodeURIComponent(invoiceId) : undefined } });
    return;
  }
  router.push(route as any);
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<TPayNotification[]>([]);

  async function hydrate() {
    setItems(await getNotifications());
  }

  useEffect(() => {
    hydrate();
  }, []);

  async function handleOpen(item: TPayNotification) {
    await markNotificationRead(item.id);
    await hydrate();
    openRoute(router, item.route);
  }

  async function handleClear() {
    Alert.alert('Clear notifications?', 'This only clears local in-app notifications on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearNotifications();
          await hydrate();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={hydrate} style={styles.iconBtn}>
          <Ionicons name="refresh-outline" size={20} color={Colors.text2} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Local testnet inbox</Text>
          <Text style={styles.heroTitle}>Payment, bridge, invoice, and security events in one place.</Text>
          <Text style={styles.heroSub}>This is an in-app notification center. Push/webhook delivery can be enabled after a hosted backend is available.</Text>
          <View style={styles.actionRow}>
            <Button label="Mark Read" variant="secondary" onPress={async () => { await markAllNotificationsRead(); await hydrate(); }} style={{ flex: 1 }} />
            <Button label="Clear" variant="ghost" onPress={handleClear} style={{ flex: 1 }} />
          </View>
        </Card>

        {items.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="notifications-outline" size={34} color={Colors.text3} />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySub}>Create an invoice, pay, bridge, or export a key event to see updates here.</Text>
          </Card>
        ) : (
          <Card style={styles.listCard}>
            {items.map((item, index) => {
              const accent = colorFor(item.type);
              return (
                <TouchableOpacity key={item.id} style={[styles.row, index < items.length - 1 && styles.rowBorder]} onPress={() => handleOpen(item)} activeOpacity={0.75}>
                  <View style={[styles.rowIcon, { backgroundColor: `${accent}18` }]}>
                    <Ionicons name={iconFor(item.type)} size={20} color={accent} />
                  </View>
                  <View style={styles.rowMeta}>
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      {!item.read && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.rowMessage}>{item.message}</Text>
                    <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
                  </View>
                  {item.route ? <Ionicons name="chevron-forward" size={17} color={Colors.text3} /> : null}
                </TouchableOpacity>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, paddingBottom: Spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  headerTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  heroCard: { gap: 10, backgroundColor: '#10161F', borderColor: '#203244' },
  heroEyebrow: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  heroTitle: { color: Colors.text1, fontSize: 23, lineHeight: 29, fontWeight: '800' },
  heroSub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  emptyCard: { alignItems: 'center', gap: 10, paddingVertical: 34 },
  emptyTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  emptySub: { color: Colors.text2, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  listCard: { paddingVertical: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#1E1E2A' },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowMeta: { flex: 1, gap: 3 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowTitle: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: Radius.full, backgroundColor: Colors.primary },
  rowMessage: { color: Colors.text2, fontSize: FontSize.xs, lineHeight: 17 },
  rowTime: { color: Colors.text3, fontSize: 11 },
});


