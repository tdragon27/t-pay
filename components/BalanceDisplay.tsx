// components/BalanceDisplay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Hero balance card shown at the top of the Home screen.
// Animates on mount and hides balance on toggle.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '@/store/walletStore';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { shortenAddress } from '@/utils/format';
import { copyWalletAddress } from '@/utils/copyWalletAddress';

export function BalanceDisplay() {
  const {
    address,
    usdcBalanceFormatted,
    isBalanceLoading,
    hideBalance,
    setHideBalance,
  } = useWalletStore();

  const translateY = useSharedValue(20);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);

  useEffect(() => {
    translateY.value = withDelay(100, withSpring(0, { damping: 18 }));
    opacity.value = withDelay(100, withTiming(1, { duration: 400 }));
    scale.value = withDelay(100, withSpring(1, { damping: 18 }));
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const copyAddress = async () => {
    await copyWalletAddress(address);
  };

  return (
    <Animated.View style={[styles.container, cardStyle]}>
      <LinearGradient
        colors={['#14142280', '#0A0A0F80']}
        style={styles.gradient}
      >
        {/* Network badge */}
        <View style={styles.networkBadge}>
          <View style={styles.networkDot} />
          <Text style={styles.networkLabel}>Arc Testnet</Text>
        </View>

        {/* Balance */}
        <View style={styles.balanceRow}>
          {isBalanceLoading && !usdcBalanceFormatted ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Text style={styles.balance} numberOfLines={1} adjustsFontSizeToFit>
              {hideBalance
                ? '••••••'
                : `$${usdcBalanceFormatted}`}
            </Text>
          )}

          <TouchableOpacity
            onPress={() => setHideBalance(!hideBalance)}
            style={styles.eyeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={hideBalance ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={Colors.text2}
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.currency}>USDC · Arc Testnet</Text>

        {/* Address chip */}
        <TouchableOpacity style={styles.addressChip} onPress={copyAddress} activeOpacity={0.7}>
          <Ionicons name="wallet-outline" size={13} color={Colors.text2} />
          <Text style={styles.addressText}>
            {address ? shortenAddress(address, 6) : '—'}
          </Text>
          <Ionicons name="copy-outline" size={13} color={Colors.text3} />
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2A3A',
    marginHorizontal: Spacing.md,
  },
  gradient: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 4,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  networkDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  networkLabel: {
    fontSize: FontSize.xs,
    color: Colors.text2,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  balance: {
    fontSize: FontSize.hero,
    fontWeight: '700',
    color: Colors.text1,
    letterSpacing: -1,
    flex: 1,
  },
  eyeBtn: {
    padding: 4,
  },
  currency: {
    fontSize: FontSize.sm,
    color: Colors.text2,
    fontWeight: '500',
    marginBottom: 12,
  },
  addressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.elevated,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addressText: {
    fontSize: FontSize.xs,
    color: Colors.text2,
    fontFamily: 'SpaceMono-Regular',
    letterSpacing: 0.5,
  },
});
