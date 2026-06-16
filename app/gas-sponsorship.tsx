import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Card } from '@/components/ui/Card';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { getGasSponsorshipStatus } from '@/services/gasSponsorshipService';

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.statusRow}>
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle-outline'} size={20} color={ok ? Colors.success : Colors.warning} />
      <View style={{ flex: 1 }}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function GasSponsorshipScreen() {
  const router = useRouter();
  const status = useMemo(() => getGasSponsorshipStatus(), []);
  const accent = status.status === 'ready' ? Colors.success : status.status === 'disabled' ? Colors.text3 : Colors.warning;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gas Sponsorship</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={[styles.heroCard, { borderColor: `${accent}44` }]}>
          <View style={[styles.heroIcon, { backgroundColor: `${accent}18` }]}>
            <Ionicons name="sparkles-outline" size={26} color={accent} />
          </View>
          <Text style={styles.heroEyebrow}>Smart wallet readiness</Text>
          <Text style={styles.heroTitle}>{status.status.toUpperCase()}</Text>
          <Text style={styles.heroSub}>{status.message}</Text>
        </Card>

        <Card style={styles.cardGap}>
          <Text style={styles.sectionTitle}>Arc execution model</Text>
          <Text style={styles.bodyText}>Arc uses native USDC for gas. Normal T Pay transactions stay live even when sponsorship is disabled. Sponsored transactions should only be enabled after a tested smart-wallet/paymaster flow is wired end-to-end.</Text>
        </Card>

        <Card style={styles.cardGap}>
          <Text style={styles.sectionTitle}>Readiness checklist</Text>
          <StatusRow label="Circle App Kit" value={status.appKitReady ? 'Configured' : 'Missing app kit key'} ok={status.appKitReady} />
          <StatusRow label="Paymaster URL" value={status.paymasterUrl ?? 'Not configured'} ok={Boolean(status.paymasterUrl)} />
          <StatusRow label="Smart wallet flag" value={status.smartWalletEnabled ? 'Enabled' : 'Disabled'} ok={status.smartWalletEnabled} />
          <StatusRow label="Sponsorship flag" value={status.enabled ? 'Enabled' : 'Disabled'} ok={status.enabled} />
          <StatusRow label="Arc chain" value={`Testnet ${status.chainId}`} ok />
        </Card>

        {status.missing.length > 0 && (
          <Card style={styles.warningCard}>
            <Ionicons name="construct-outline" size={20} color={Colors.warning} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.warningTitle}>Missing configuration</Text>
              {status.missing.map((item) => <Text key={item} style={styles.warningText}>- {item}</Text>)}
            </View>
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
  heroCard: { alignItems: 'center', gap: 10, backgroundColor: '#10161F' },
  heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  heroEyebrow: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  heroTitle: { color: Colors.text1, fontSize: 28, fontWeight: '800' },
  heroSub: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  cardGap: { gap: 12 },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  bodyText: { color: Colors.text2, fontSize: FontSize.sm, lineHeight: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#1E1E2A' },
  statusLabel: { color: Colors.text1, fontSize: FontSize.sm, fontWeight: '700' },
  statusValue: { color: Colors.text2, fontSize: FontSize.xs, marginTop: 2 },
  warningCard: { flexDirection: 'row', gap: 10, backgroundColor: Colors.warningBg, borderColor: 'rgba(255,181,71,0.28)' },
  warningTitle: { color: Colors.warning, fontSize: FontSize.sm, fontWeight: '800' },
  warningText: { color: Colors.warning, fontSize: FontSize.xs, lineHeight: 18 },
});




