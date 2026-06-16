// components/ui/Button.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Primary button component with multiple variants, loading state, haptics.
//
// v2 upgrades:
//   • Default hitSlop = { top: 10, bottom: 10, left: 8, right: 8 }
//     (ensures every button has a ≥ 48 dp easy-tap area, even if visually
//      smaller — e.g. ghost / icon buttons)
//   • hitSlop is fully configurable via the `hitSlop` prop
//   • Both gradient (primary) and flat variants receive the hitSlop
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  type TouchableOpacityProps,
  type Insets,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, FontSize, Spacing } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<TouchableOpacityProps, 'hitSlop'> {
  variant?:  ButtonVariant;
  label:     string;
  loading?:  boolean;
  fullWidth?: boolean;
  icon?:     React.ReactNode;
  /**
   * Extend the touchable area beyond the visual bounds.
   * Defaults to { top: 10, bottom: 10, left: 8, right: 8 } — giving every
   * button at least ~68 dp of vertical tap area on a 56 dp base.
   * Pass `null` to disable the default.
   */
  hitSlop?: Insets | null;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Default hit-slop gives comfortable tap targets on all variants
const DEFAULT_HIT_SLOP: Insets = { top: 10, bottom: 10, left: 8, right: 8 };

// ─── Component ────────────────────────────────────────────────────────────────

export function Button({
  variant    = 'primary',
  label,
  loading    = false,
  fullWidth  = true,
  icon,
  onPress,
  disabled,
  style,
  hitSlop    = DEFAULT_HIT_SLOP,
  ...rest
}: ButtonProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = (e: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.96, { damping: 15 }, () => {
      scale.value = withSpring(1);
    });
    onPress?.(e);
  };

  const isDisabled = disabled || loading;
  // hitSlop: respect null (disable), fall through to default otherwise
  const resolvedHitSlop = hitSlop ?? undefined;

  // ── Primary variant (gradient) ───────────────────────────────────────────
  if (variant === 'primary') {
    return (
      <AnimatedTouchable
        style={[animStyle, fullWidth && styles.fullWidth, style]}
        onPress={handlePress}
        disabled={isDisabled}
        activeOpacity={0.9}
        hitSlop={resolvedHitSlop}
        {...rest}
      >
        <LinearGradient
          colors={
            isDisabled
              ? ['#2A2A3A', '#2A2A3A']
              : [Colors.primary, Colors.primaryDim]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.gradient, isDisabled && styles.disabled]}
        >
          {loading ? (
            <ActivityIndicator color={Colors.bg} size="small" />
          ) : (
            <View style={styles.inner}>
              {icon && <View style={styles.iconWrap}>{icon}</View>}
              <Text style={[styles.label, styles.labelPrimary]}>{label}</Text>
            </View>
          )}
        </LinearGradient>
      </AnimatedTouchable>
    );
  }

  // ── Flat variants ────────────────────────────────────────────────────────
  const variantStyle = {
    secondary: styles.secondary,
    ghost:     styles.ghost,
    danger:    styles.danger,
  }[variant];

  const labelStyle = {
    secondary: styles.labelSecondary,
    ghost:     styles.labelGhost,
    danger:    styles.labelDanger,
  }[variant];

  return (
    <AnimatedTouchable
      style={[
        styles.base,
        variantStyle,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        animStyle,
        style,
      ]}
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={0.8}
      hitSlop={resolvedHitSlop}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={Colors.text2} size="small" />
      ) : (
        <View style={styles.inner}>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          <Text style={[styles.label, labelStyle]}>{label}</Text>
        </View>
      )}
    </AnimatedTouchable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    height:         56,   // ≥ 48 dp Android/iOS guideline (+ hitSlop adds more)
    borderRadius:   Radius.lg,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  fullWidth: {
    width: '100%',
  },

  // Primary (gradient wrapper mirrors base dimensions exactly)
  gradient: {
    height:         56,
    borderRadius:   Radius.lg,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    width:          '100%',
  },

  // Flat variants
  secondary: {
    backgroundColor: Colors.elevated,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  ghost: {
    backgroundColor: Colors.transparent,
  },
  danger: {
    backgroundColor: Colors.errorBg,
    borderWidth:     1,
    borderColor:     Colors.error,
  },

  disabled: {
    opacity: 0.5,
  },

  // Inner layout
  inner: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  iconWrap: {
    marginRight: 2,
  },

  // Label variants
  label: {
    fontSize:      FontSize.md,
    fontWeight:    '600',
    letterSpacing: 0.3,
  },
  labelPrimary: {
    color:      Colors.bg,
    fontWeight: '700',
  },
  labelSecondary: { color: Colors.text1 },
  labelGhost:     { color: Colors.text2 },
  labelDanger:    { color: Colors.error },
});