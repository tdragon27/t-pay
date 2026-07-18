import React, { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

interface MotionViewProps {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  variant?: 'fade' | 'rise';
  layout?: boolean;
}

/**
 * Lightweight UI-thread motion. Keep transitions short so navigation remains
 * responsive and the interface still feels like a financial product.
 */
export function MotionView({
  children,
  delay = 0,
  style,
  variant = 'rise',
  layout = false,
}: MotionViewProps) {
  const reduceMotion = useReducedMotion();
  const entering =
    reduceMotion
      ? undefined
      : variant === 'fade'
        ? FadeIn.duration(220).delay(delay)
        : FadeInDown.duration(Motion.reveal).delay(delay);

  return (
    <Animated.View
      entering={entering}
      layout={layout && !reduceMotion ? LinearTransition.duration(180) : undefined}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
