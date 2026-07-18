import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

type BorderIntensity = 'subtle' | 'hero';

interface AnimatedGlassBorderProps {
  borderRadius: number;
  duration?: number;
  enabled?: boolean;
  intensity?: BorderIntensity;
}

const INTENSITY = {
  subtle: {
    baseOpacity: 0.08,
    traceOpacity: 0.2,
    glowOpacity: 0.07,
    dashRatio: 0.12,
  },
  hero: {
    baseOpacity: 0.1,
    traceOpacity: 0.34,
    glowOpacity: 0.1,
    dashRatio: 0.14,
  },
} as const;

export function AnimatedGlassBorder({
  borderRadius,
  duration = 9000,
  enabled = true,
  intensity = 'subtle',
}: AnimatedGlassBorderProps) {
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const offset = useSharedValue(0);
  const config = INTENSITY[intensity];

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) => {
      if (Math.round(current.width) === Math.round(width) && Math.round(current.height) === Math.round(height)) {
        return current;
      }
      return { width, height };
    });
  };

  const metrics = useMemo(() => {
    const width = Math.max(0, size.width);
    const height = Math.max(0, size.height);
    if (width < 4 || height < 4) return null;
    const radius = Math.max(0, Math.min(borderRadius, width / 2, height / 2));
    const perimeter = 2 * (width + height - 4 * radius) + 2 * Math.PI * radius;
    const dash = Math.max(18, perimeter * config.dashRatio);
    return { width, height, radius, perimeter, dash };
  }, [borderRadius, config.dashRatio, size.height, size.width]);

  useEffect(() => {
    if (!enabled || reduceMotion || !metrics) {
      cancelAnimation(offset);
      offset.value = 0;
      return undefined;
    }
    offset.value = 0;
    offset.value = withRepeat(
      withTiming(-metrics.perimeter, { duration, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(offset);
  }, [duration, enabled, metrics, offset, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));

  const shouldAnimate = enabled && !reduceMotion && metrics;
  const dashArray = metrics ? `${metrics.dash} ${Math.max(1, metrics.perimeter - metrics.dash)}` : '0 1';

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {metrics ? (
        <Svg width={metrics.width} height={metrics.height} style={StyleSheet.absoluteFill}>
          <Rect
            x={0.75}
            y={0.75}
            width={metrics.width - 1.5}
            height={metrics.height - 1.5}
            rx={metrics.radius}
            ry={metrics.radius}
            fill="none"
            stroke={Colors.primary}
            strokeOpacity={config.baseOpacity}
            strokeWidth={1}
          />
          {shouldAnimate ? (
            <>
              <AnimatedRect
                x={1.5}
                y={1.5}
                width={metrics.width - 3}
                height={metrics.height - 3}
                rx={Math.max(0, metrics.radius - 1)}
                ry={Math.max(0, metrics.radius - 1)}
                fill="none"
                stroke={Colors.primary}
                strokeOpacity={config.glowOpacity}
                strokeWidth={5}
                strokeLinecap="round"
                strokeDasharray={dashArray}
                animatedProps={animatedProps}
              />
              <AnimatedRect
                x={1}
                y={1}
                width={metrics.width - 2}
                height={metrics.height - 2}
                rx={Math.max(0, metrics.radius - 0.5)}
                ry={Math.max(0, metrics.radius - 0.5)}
                fill="none"
                stroke="#BEEFFF"
                strokeOpacity={config.traceOpacity}
                strokeWidth={1.25}
                strokeLinecap="round"
                strokeDasharray={dashArray}
                animatedProps={animatedProps}
              />
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
