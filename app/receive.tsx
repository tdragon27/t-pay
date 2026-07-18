import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useWalletStore } from '@/store/walletStore';
import { Colors, FontFamily, FontSize, Spacing, Radius } from '@/constants/theme';
import { copyWalletAddress } from '@/utils/copyWalletAddress';
import { safeBack } from '@/utils/navigation';
import { SUPPORTED_ARC_TESTNET_TOKENS, isSupportedArcTokenSymbol, type SupportedArcTokenSymbol } from '@/constants/tokens';

const { width } = Dimensions.get('window');
const QR_SIZE = Math.min(width - 80, 260);

export default function ReceiveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ asset?: string }>();
  const initialAsset: SupportedArcTokenSymbol = isSupportedArcTokenSymbol(params.asset) ? params.asset : 'USDC';
  const [selectedAsset, setSelectedAsset] = useState<SupportedArcTokenSymbol>(initialAsset);
  const selectedToken = useMemo(
    () => SUPPORTED_ARC_TESTNET_TOKENS.find((token) => token.symbol === selectedAsset) ?? SUPPORTED_ARC_TESTNET_TOKENS[0],
    [selectedAsset],
  );
  const { address } = useWalletStore();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);

  useEffect(() => {
    opacity.value = withDelay(100, withTiming(1, { duration: 400 }));
    scale.value = withDelay(100, withSpring(1, { damping: 16 }));
  }, [opacity, scale]);

  const qrStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const copyAddress = async () => {
    await copyWalletAddress(address, { subtitle: `Ready to receive ${selectedAsset} on Arc Testnet.` });
  };

  const shareAddress = async () => {
    if (!address) return;
    await Share.share({
      message: `Send ${selectedAsset} (Arc Testnet test asset) to: ${address}`,
      title: 'My T Pay Address',
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack(router)} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Receive {selectedAsset}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.container}>
        <View style={styles.networkBadge}>
          <View style={[styles.networkDot, { backgroundColor: selectedToken.accent }]} />
          <Text style={styles.networkText}>Arc Testnet · {selectedAsset}</Text>
        </View>
        <View style={styles.assetSelector}>
          {SUPPORTED_ARC_TESTNET_TOKENS.map((token) => {
            const active = token.symbol === selectedAsset;
            return (
              <TouchableOpacity
                key={token.symbol}
                style={[styles.assetChip, active && { borderColor: token.accent, backgroundColor: token.accent + '1F' }]}
                onPress={() => setSelectedAsset(token.symbol)}
                activeOpacity={0.82}
              >
                <Text style={[styles.assetChipText, active && { color: token.accent }]}>{token.symbol}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Animated.View style={[styles.qrCard, qrStyle]}>
          {address ? (
            <QRCode value={address} size={QR_SIZE} color={Colors.text1} backgroundColor={Colors.surface} quietZone={16} />
          ) : (
            <View style={[{ width: QR_SIZE, height: QR_SIZE }, styles.qrPlaceholder]} />
          )}

          <View style={styles.qrLogoWrap}>
            <LinearGradient colors={['#19E6FF', '#2775CA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.qrLogo}>
              <Text style={styles.qrLogoText}>TP</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        <View style={styles.addressContainer}>
          <Text style={styles.addressLabel}>Your Wallet Address</Text>
          <TouchableOpacity style={styles.addressPill} onPress={copyAddress} activeOpacity={0.7}>
            <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
              {address || 'Loading...'}
            </Text>
            <View style={styles.copyChip}>
              <Ionicons name="copy-outline" size={14} color={Colors.primary} />
              <Text style={styles.copyChipText}>Copy</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.text3} />
          <Text style={styles.infoText}>
            Only send {selectedAsset} on Arc Testnet to this address. Do not send mainnet assets or unsupported networks.
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={copyAddress}>
            <View style={[styles.actionIcon, { backgroundColor: Colors.primaryGlow }]}>
              <Ionicons name="copy-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Copy</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={shareAddress}>
            <View style={[styles.actionIcon, { backgroundColor: Colors.successBg }]}>
              <Ionicons name="share-outline" size={20} color={Colors.success} />
            </View>
            <Text style={styles.actionLabel}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeBtn: { padding: 8, width: 40 },
  headerTitle: { fontFamily: FontFamily.displaySemiBold, fontSize: FontSize.lg, color: Colors.text1, letterSpacing: -0.2 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.lg },
  networkBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
  },
  networkDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.success },
  assetSelector: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: -8 },
  assetChip: { borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.elevated, paddingHorizontal: 13, paddingVertical: 8 },
  assetChipText: { color: Colors.text2, fontSize: FontSize.xs, fontWeight: '800' },
  networkText: { fontSize: FontSize.xs, color: Colors.text2, fontWeight: '500', letterSpacing: 0.5 },
  qrCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: 20, borderWidth: 1, borderColor: Colors.border,
    position: 'relative', alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 8,
  },
  qrPlaceholder: { backgroundColor: Colors.elevated, borderRadius: Radius.md },
  qrLogoWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', pointerEvents: 'none' },
  qrLogo: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qrLogoText: { fontSize: 15, fontWeight: '800', color: '#061018', letterSpacing: -0.4 },
  addressContainer: { width: '100%', gap: 8, alignItems: 'center' },
  addressLabel: { fontSize: FontSize.xs, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.8 },
  addressPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.elevated,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingVertical: 12, paddingLeft: 16,
    paddingRight: 12, width: '100%', gap: 8,
  },
  addressText: { fontSize: FontSize.sm, color: Colors.text1, fontFamily: FontFamily.mono, flex: 1 },
  copyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
  },
  copyChipText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: Spacing.sm },
  infoText: { fontSize: FontSize.xs, color: Colors.text3, flex: 1, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: Spacing.xl },
  actionBtn: { alignItems: 'center', gap: 8 },
  actionIcon: { width: 52, height: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  actionLabel: { fontSize: FontSize.xs, color: Colors.text2, fontWeight: '500' },
});



