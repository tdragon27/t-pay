import React, { useEffect } from 'react';
import { StyleSheet, Text, TextInput, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function formatUsd(value: number) {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatUsdWorklet(value: number) {
  'worklet';
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const parts = safe.toFixed(2).split('.');
  const whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${whole}.${parts[1]}`;
}

export function AnimatedBalanceText({
  value,
  hidden,
  style,
}: {
  value: number;
  hidden: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const animatedValue = useSharedValue(value);

  useEffect(() => {
    animatedValue.value = reduceMotion
      ? value
      : withTiming(value, {
          duration: 720,
          easing: Easing.out(Easing.cubic),
        });
  }, [animatedValue, reduceMotion, value]);

  const animatedProps = useAnimatedProps(() => {
    const text = formatUsdWorklet(animatedValue.value);
    return { text, defaultValue: text } as never;
  });

  if (hidden) return <Text style={style}>$ ••••</Text>;
  if (reduceMotion) return <Text style={style}>{formatUsd(value)}</Text>;

  return (
    <AnimatedTextInput
      animatedProps={animatedProps}
      editable={false}
      importantForAccessibility="no"
      pointerEvents="none"
      style={[styles.input, style]}
      underlineColorAndroid="transparent"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
});
