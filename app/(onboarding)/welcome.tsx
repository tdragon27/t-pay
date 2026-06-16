// app/(onboarding)/welcome.tsx
// Premium testnet onboarding screen for T Pay.

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const compact = height < 720;
  const narrow = width < 380;

  const brandOpacity = useSharedValue(0);
  const brandY = useSharedValue(20);
  const heroOpacity = useSharedValue(0);
  const heroY = useSharedValue(16);
  const btnsOpacity = useSharedValue(0);
  const glowScale = useSharedValue(1);

  useEffect(() => {
    brandOpacity.value = withDelay(120, withTiming(1, { duration: 650 }));
    brandY.value = withDelay(120, withTiming(0, { duration: 650, easing: Easing.out(Easing.cubic) }));
    heroOpacity.value = withDelay(420, withTiming(1, { duration: 600 }));
    heroY.value = withDelay(420, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
    btnsOpacity.value = withDelay(760, withTiming(1, { duration: 520 }));
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [brandOpacity, brandY, btnsOpacity, glowScale, heroOpacity, heroY]);

  const brandStyle = useAnimatedStyle(() => ({
    opacity: brandOpacity.value,
    transform: [{ translateY: brandY.value }],
  }));

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroY.value }],
  }));

  const buttonsStyle = useAnimatedStyle(() => ({ opacity: btnsOpacity.value }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#07080E', '#0B0F1C', '#08090F']}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.bgGrid} pointerEvents="none">
        <View style={[styles.softOrb, styles.softOrbTop]} />
        <View style={[styles.softOrb, styles.softOrbBottom]} />
      </View>

      <View style={[styles.content, compact && styles.contentCompact]}>
        <Animated.View style={[styles.brandBlock, brandStyle, compact && styles.brandBlockCompact]}>
          <Animated.View style={[styles.logoGlow, glowStyle]} />
          <LinearGradient
            colors={['rgba(0, 212, 255, 0.28)', 'rgba(39, 117, 202, 0.12)', 'rgba(255,255,255,0.02)']}
            style={styles.logoHalo}
          >
            <LinearGradient
              colors={['#19E6FF', '#2775CA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoCard}
            >
              <Text style={styles.logoMark}>A</Text>
            </LinearGradient>
          </LinearGradient>

          <Text style={styles.brandName}>T Pay</Text>
          <View style={styles.testnetBadge}>
            <View style={styles.badgeDot} />
            <Text style={styles.testnetText}>TESTNET</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.heroBlock, heroStyle]}>
          <Text style={[styles.heroLine, narrow && styles.heroLineNarrow]}>Send assets on Arc.</Text>
          <Text style={[styles.heroLine, narrow && styles.heroLineNarrow]}>Bridge-ready payments.</Text>
          <Text style={[styles.heroLine, styles.heroAccent, narrow && styles.heroLineNarrow]}>USDC gas.</Text>
          <Text style={styles.subcopy}>
            Self-custodial testnet wallet for Arc, Circle's stablecoin-native L1.
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.actions, buttonsStyle]}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(onboarding)/create-wallet')}
          activeOpacity={0.88}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={['#19E6FF', '#00BFE8', '#2775CA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryGradient}
          >
            <Text style={styles.primaryText}>Create New Wallet</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/(onboarding)/import-wallet')}
          activeOpacity={0.82}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Import Existing Wallet</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Testnet assets only. You control your keys and recovery phrase.
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07080E',
    paddingHorizontal: 24,
  },
  bgGrid: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  softOrb: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.42,
  },
  softOrbTop: {
    top: -120,
    right: -120,
    backgroundColor: 'rgba(0, 212, 255, 0.11)',
  },
  softOrbBottom: {
    left: -160,
    bottom: 110,
    backgroundColor: 'rgba(39, 117, 202, 0.09)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 42,
    paddingBottom: 18,
  },
  contentCompact: {
    paddingTop: 18,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 52,
  },
  brandBlockCompact: {
    marginBottom: 34,
  },
  logoGlow: {
    position: 'absolute',
    top: -34,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(0, 212, 255, 0.13)',
  },
  logoHalo: {
    width: 96,
    height: 96,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  logoCard: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00D4FF',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  logoMark: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  brandName: {
    color: '#F6F8FF',
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  testnetBadge: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 212, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.26)',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#19E6FF',
  },
  testnetText: {
    color: '#8EEBFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.35,
  },
  heroBlock: {
    alignItems: 'center',
    width: '100%',
  },
  heroLine: {
    color: '#F6F8FF',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -1.15,
    textAlign: 'center',
  },
  heroLineNarrow: {
    fontSize: 31,
    lineHeight: 37,
  },
  heroAccent: {
    color: '#19E6FF',
  },
  subcopy: {
    maxWidth: 330,
    marginTop: 18,
    color: '#9B9DB8',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    paddingBottom: 18,
    gap: 12,
  },
  primaryButton: {
    width: '100%',
    minHeight: 58,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#00D4FF',
    shadowOpacity: 0.26,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  primaryGradient: {
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  primaryText: {
    color: '#061018',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  secondaryButton: {
    width: '100%',
    minHeight: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  secondaryText: {
    color: '#EEF2FF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.05,
  },
  disclaimer: {
    marginTop: 6,
    color: '#676B86',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
});


