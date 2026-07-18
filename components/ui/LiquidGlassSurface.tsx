import React, { useEffect } from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Glass, Motion } from '@/constants/theme';
import { AnimatedGlassBorder } from '@/components/ui/AnimatedGlassBorder';

type GlassTone = 'regular' | 'clear' | 'accent';

interface LiquidGlassSurfaceProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  tone?: GlassTone;
  intensity?: number;
  sheen?: boolean;
  sheenDelay?: number;
  animatedBorder?: boolean;
  borderIntensity?: 'subtle' | 'hero';
  borderDuration?: number;
  borderRadius?: number;
}

const TONE_OVERLAY: Record<GlassTone, string> = {
  regular: Glass.regular,
  clear: Glass.clear,
  accent: Glass.accent,
};

/**
 * A restrained Liquid Glass surface for floating controls and navigation.
 * Content cards should continue to use solid or standard translucent materials.
 */
export function LiquidGlassSurface({
  children,
  style,
  contentStyle,
  tone = 'regular',
  intensity = 48,
  sheen = false,
  sheenDelay = 180,
  animatedBorder = false,
  borderIntensity = 'subtle',
  borderDuration = 9000,
  borderRadius = 18,
}: LiquidGlassSurfaceProps) {
  const reduceMotion = useReducedMotion();
  const sheenProgress = useSharedValue(0);

  useEffect(() => {
    if (!sheen || reduceMotion) return undefined;
    sheenProgress.value = 0;
    sheenProgress.value = withDelay(
      sheenDelay,
      withTiming(1, { duration: Motion.sheen, easing: Easing.out(Easing.cubic) }),
    );
    return () => cancelAnimation(sheenProgress);
  }, [reduceMotion, sheen, sheenDelay, sheenProgress]);

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheenProgress.value, [0, 0.12, 0.76, 1], [0, 0.42, 0.34, 0]),
    transform: [
      { translateX: interpolate(sheenProgress.value, [0, 1], [-160, 460]) },
      { rotate: '18deg' },
    ],
  }));

  return (
    <View style={[styles.frame, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          tint="dark"
          intensity={intensity}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidFallback]} />
      )}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: TONE_OVERLAY[tone] }]}
        pointerEvents="none"
      />
      <View style={styles.topHighlight} pointerEvents="none" />
      <AnimatedGlassBorder
        borderRadius={borderRadius}
        duration={borderDuration}
        enabled={animatedBorder}
        intensity={borderIntensity}
      />
      {sheen && !reduceMotion ? (
        <Animated.View style={[styles.sheen, sheenStyle]} pointerEvents="none">
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(220,249,255,0.18)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Glass.border,
    backgroundColor: 'rgba(12,17,24,0.58)',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  androidFallback: {
    backgroundColor: 'rgba(17,23,32,0.94)',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Glass.highlight,
  },
  sheen: {
    position: 'absolute',
    top: -38,
    bottom: -38,
    width: 72,
  },
  content: {
    flex: 1,
  },
});
