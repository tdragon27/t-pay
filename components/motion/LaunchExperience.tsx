import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { TpayMark } from '@/components/brand/TpayMark';
import { Colors, FontFamily } from '@/constants/theme';

const LOGO_ANIMATION = require('../../assets/animations/launch-logo.json');

export function LaunchExperience() {
  const reduceMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);

  return (
    <LinearGradient colors={['#06141B', Colors.bg, '#0A0914']} style={styles.screen}>
      <View style={styles.glow} />
      <View style={styles.logoStage}>
        {!failed ? (
          <LottieView
            source={LOGO_ANIMATION}
            autoPlay={!reduceMotion}
            loop={!reduceMotion}
            progress={reduceMotion ? 0.58 : undefined}
            style={styles.animation}
            onAnimationFailure={() => setFailed(true)}
          />
        ) : null}
        <View style={styles.logoMark}>
          <TpayMark size={112} glow />
        </View>
      </View>
      <Text style={styles.title}>T Pay</Text>
      <View style={styles.networkPill}>
        <View style={styles.networkDot} />
        <Text style={styles.networkText}>ARC TESTNET</Text>
      </View>
      <Text style={styles.detail}>Preparing your wallet</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(53,213,244,0.075)',
  },
  logoStage: {
    width: 232,
    height: 232,
    alignItems: 'center',
    justifyContent: 'center',
  },
  animation: {
    ...StyleSheet.absoluteFillObject,
    width: 232,
    height: 232,
    opacity: 0.78,
  },
  logoMark: { zIndex: 2 },
  title: {
    color: Colors.text1,
    fontFamily: FontFamily.displayBold,
    fontSize: 32,
    letterSpacing: -0.8,
    marginTop: -4,
  },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 11,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(53,213,244,0.09)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(131,233,251,0.24)',
  },
  networkDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#59E0C5' },
  networkText: {
    color: '#83E9FB',
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  detail: {
    color: Colors.text3,
    fontFamily: FontFamily.body,
    fontSize: 12,
    marginTop: 10,
  },
});
