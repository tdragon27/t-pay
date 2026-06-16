// components/ActionButtons.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Quick-action button row shown on the Home screen below the balance card.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, FontSize, Spacing } from '@/constants/theme';

interface Action {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
  bgColor: string;
}

const ACTIONS: Action[] = [
  {
    label: 'Send',
    icon:  'arrow-up-outline',
    route: '/send',
    color: Colors.primary,
    bgColor: Colors.primaryGlow,
  },
  {
    label: 'Receive',
    icon:  'arrow-down-outline',
    route: '/receive',
    color: Colors.success,
    bgColor: Colors.successBg,
  },
  {
    label: 'Bridge',
    icon:  'swap-horizontal-outline',
    route: '/bridge',
    color: Colors.warning,
    bgColor: Colors.warningBg,
  },
  {
    label: 'History',
    icon:  'time-outline',
    route: '/(tabs)/portfolio',
    color: Colors.usdcLight,
    bgColor: 'rgba(91, 163, 245, 0.12)',
  },
];

function ActionButton({ action, index }: { action: Action; index: number }) {
  const router = useRouter();
  const translateY = useSharedValue(20);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    translateY.value = withDelay(200 + index * 60, withSpring(0, { damping: 18 }));
    opacity.value = withDelay(200 + index * 60, withTiming(1, { duration: 300 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.9, { damping: 15 }, () => {
      scale.value = withSpring(1);
    });
    router.push(action.route as any);
  };

  return (
    <Animated.View style={[styles.actionWrapper, animStyle]}>
      <Animated.View style={pressStyle}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          <View style={[styles.iconCircle, { backgroundColor: action.bgColor }]}>
            <Ionicons name={action.icon} size={22} color={action.color} />
          </View>
          <Text style={styles.actionLabel}>{action.label}</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

export function ActionButtons() {
  return (
    <View style={styles.container}>
      {ACTIONS.map((action, i) => (
        <ActionButton key={action.label} action={action} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  actionWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  actionBtn: {
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionLabel: {
    fontSize: FontSize.xs,
    color: Colors.text2,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
