import React, { type ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

interface PressScaleProps extends Omit<PressableProps, 'children' | 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  pressedTranslateY?: number;
}

/** A restrained tactile response for primary financial actions. */
export function PressScale({
  children,
  style,
  pressedScale = 0.985,
  pressedTranslateY = 1,
  disabled,
  onPressIn,
  onPressOut,
  ...pressableProps
}: PressScaleProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      <Pressable
        {...pressableProps}
        disabled={disabled}
        onPressIn={(event) => {
          if (!disabled && !reduceMotion) {
            scale.value = withTiming(pressedScale, { duration: Motion.pressIn });
            translateY.value = withTiming(pressedTranslateY, { duration: Motion.pressIn });
          }
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          scale.value = withTiming(1, { duration: reduceMotion ? 0 : Motion.pressOut });
          translateY.value = withTiming(0, { duration: reduceMotion ? 0 : Motion.pressOut });
          onPressOut?.(event);
        }}
        style={styles.pressable}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
  },
});
