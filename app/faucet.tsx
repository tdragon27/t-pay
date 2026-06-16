// app/faucet.tsx
// -----------------------------------------------------------------------------
// v1.1.0 - In-app Faucet Helper
// Guides the user to get testnet assets from Circle's official faucet.
// Shows wallet address prominently (copy + QR), step-by-step instructions,
// then opens https://faucet.circle.com/ in the browser pre-ready.
// -----------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useWalletStore } from '@/store/walletStore';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { safeOpenUrl } from '@/utils/safeOpenUrl';
import { copyWalletAddress } from '@/utils/copyWalletAddress';

const { width } = Dimensions.get('window');
const QR_SIZE   = Math.min(width - 120, 200);

const FAUCET_URL = 'https://faucet.circle.com/';

// --- Step card ----------------------------------------------------------------

interface StepProps {
  num:    number;
  title:  string;
  desc:   string;
  accent: string;
}

function StepCard({ num, title, desc, accent }: StepProps) {
  return (
    <View style={styles.stepCard}>
      <View style={[styles.stepNum, { backgroundColor: accent + '20', borderColor: accent + '50' }]}>
        <Text style={[styles.stepNumText, { color: accent }]}>{num}</Text>
      </View>
      <View style={styles.stepText}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

// --- Main Screen --------------------------------------------------------------

export default function FaucetScreen() {
  const router  = useRouter();
  const { address } = useWalletStore();
  const [copied, setCopied] = useState(false);

  // Entrance animation
  const cardAnim = useSharedValue(0);
  useEffect(() => {
    cardAnim.value = withDelay(150, withSpring(1, { damping: 16 }));
  }, []);
  const cardStyle = useAnimatedStyle(() => ({
    opacity:   withTiming(cardAnim.value, { duration: 300 }),
    transform: [{ scale: 0.92 + cardAnim.value * 0.08 }],
  }));

  async function handleCopy() {
    const ok = await copyWalletAddress(address, { subtitle: 'Paste it on faucet.circle.com' });
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function handleOpenFaucet() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void safeOpenUrl(FAUCET_URL, 'Circle Faucet');
  }

  const shortAddr = address
    ? `${address.slice(0, 10)}...${address.slice(-8)}`
    : '?';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => safeBack(router)}
          style={styles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 4, right: 20 }}
        >
          <Ionicons name="close" size={24} color={Colors.text1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Testnet Faucet</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero badge */}
        <View style={styles.heroBadgeRow}>
          <View style={styles.heroBadge}>
            <View style={styles.heroBadgeDot} />
            <Text style={styles.heroBadgeText}>Circle Official Faucet</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Get Free Testnet Assets</Text>
        <Text style={styles.subtitle}>
          Circle's faucet gives you free USDC, EURC, and cirBTC on Arc Testnet.
          Follow the steps below to fund your wallet.
        </Text>

        {/* QR + Address Card */}
        <Animated.View style={[styles.addressCard, cardStyle]}>
          {/* Glow orb */}
          <View style={styles.cardOrb} />

          <Text style={styles.addressCardLabel}>YOUR WALLET ADDRESS</Text>

          {/* QR Code */}
          {address ? (
            <View style={styles.qrWrap}>
              <QRCode
                value={address}
                size={QR_SIZE}
                color={Colors.text1}
                backgroundColor="transparent"
                quietZone={8}
              />
            </View>
          ) : null}

          {/* Address pill */}
          <TouchableOpacity
            style={[styles.addressPill, copied && styles.addressPillCopied]}
            onPress={handleCopy}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8 }}
          >
            <Text style={styles.addressPillText} numberOfLines={1}>
              {shortAddr}
            </Text>
            <View style={[styles.copyChip, copied && styles.copyChipDone]}>
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={13}
                color={copied ? Colors.success : Colors.primary}
              />
              <Text style={[styles.copyChipText, copied && { color: Colors.success }]}>
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Steps */}
        <Text style={styles.stepsHeader}>How to get testnet assets</Text>

        <View style={styles.stepsWrap}>
          <StepCard
            num={1}
            title="Copy your address"
            desc="Tap the address card above to copy your wallet address to clipboard."
            accent="#00D4FF"
          />
          <View style={styles.stepConnector} />
          <StepCard
            num={2}
            title="Open Circle Faucet"
            desc='Tap "Open faucet.circle.com" below - it will open in your browser.'
            accent="#8B79FF"
          />
          <View style={styles.stepConnector} />
          <StepCard
            num={3}
            title="Select Arc Testnet"
            desc="On the faucet page, choose Arc Testnet and select USDC, EURC, or cirBTC."
            accent="#FFB547"
          />
          <View style={styles.stepConnector} />
          <StepCard
            num={4}
            title="Paste & request"
            desc="Paste your address, complete the CAPTCHA, and request the selected test asset."
            accent="#00E88F"
          />
        </View>

        {/* Info note */}
        <View style={styles.infoRow}>
          <Ionicons name="information-circle-outline" size={15} color={Colors.text3} />
          <Text style={styles.infoText}>
            The faucet supports USDC, EURC, and cirBTC on Arc Testnet. These are testnet assets only and have no real-world value.
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={handleOpenFaucet}
          activeOpacity={0.85}
          hitSlop={{ top: 8, bottom: 8 }}
        >
          <LinearGradient
            colors={['#8B79FF', '#5B4FCC']}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="water-outline" size={20} color="#fff" />
            <Text style={styles.ctaBtnText}>Open faucet.circle.com</Text>
            <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Secondary: copy first */}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={handleCopy}
          activeOpacity={0.8}
          hitSlop={{ top: 4, bottom: 4 }}
        >
          <Ionicons name="copy-outline" size={16} color={Colors.primary} />
          <Text style={styles.secondaryBtnText}>
            {copied ? 'Address copied' : 'Copy address first, then open faucet'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: Platform.OS === 'ios' ? 32 : 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  closeBtn:    { padding: 8, width: 40 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text1 },
  scroll:      { paddingHorizontal: 20, paddingTop: 24, gap: 0 },

  // Hero badge
  heroBadgeRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(139,121,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(139,121,255,0.3)',
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5,
  },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#8B79FF' },
  heroBadgeText:{ fontFamily: 'SpaceMono-Regular', fontSize: 11, color: '#8B79FF', letterSpacing: 0.5 },

  // Title
  title: {
    fontWeight: '700', fontSize: 26,
    color: Colors.text1, textAlign: 'center', marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text2, textAlign: 'center', lineHeight: 22,
    marginBottom: 28,
  },

  // Address card
  addressCard: {
    backgroundColor: '#0C1628',
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: '#1E2D40',
    alignItems: 'center', gap: 16,
    overflow: 'hidden', position: 'relative',
    marginBottom: 28,
  },
  cardOrb: {
    position: 'absolute', top: -40, right: -40,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(139,121,255,0.06)',
  },
  addressCardLabel: {
    fontFamily: 'SpaceMono-Regular', fontSize: 10,
    color: Colors.text3, letterSpacing: 1.5,
  },
  qrWrap: {
    padding: 12, backgroundColor: '#1A1A26',
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
  },
  addressPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.elevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 11, paddingLeft: 14, paddingRight: 10,
    width: '100%', gap: 8,
  },
  addressPillCopied: { borderColor: Colors.success + '60' },
  addressPillText: {
    fontFamily: 'SpaceMono-Regular', fontSize: 13,
    color: Colors.text1, flex: 1,
  },
  copyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryGlow,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)',
  },
  copyChipDone:  { backgroundColor: Colors.successBg, borderColor: 'rgba(0,232,143,0.3)' },
  copyChipText:  { fontSize: 11, color: Colors.primary, fontWeight: '600' },

  // Steps
  stepsHeader: {
    fontWeight: '700', fontSize: 15,
    color: Colors.text1, marginBottom: 16,
  },
  stepsWrap: { gap: 0, marginBottom: 24 },
  stepCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: 14,
  },
  stepConnector: {
    width: 1, height: 12,
    backgroundColor: Colors.border,
    marginLeft: 22,
  },
  stepNum: {
    width: 32, height: 32, borderRadius: 10,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumText:  { fontWeight: '700', fontSize: 15 },
  stepText:     { flex: 1, gap: 3 },
  stepTitle:    { fontWeight: '700', fontSize: 14, color: Colors.text1 },
  stepDesc:     { fontSize: 13, color: Colors.text2, lineHeight: 19 },

  // Info
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 12,
    color: Colors.text3, flex: 1, lineHeight: 18,
  },

  // CTA
  ctaBtn:       { borderRadius: Radius.lg, overflow: 'hidden', marginBottom: 12 },
  ctaGradient:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18, borderRadius: Radius.lg,
  },
  ctaBtnText:   { fontWeight: '700', fontSize: 16, color: '#fff' },

  // Secondary
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, backgroundColor: 'rgba(0,212,255,0.04)',
  },
  secondaryBtnText: { fontWeight: '500', fontSize: 14, color: Colors.primary },
});




