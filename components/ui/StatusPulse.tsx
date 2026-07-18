import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export function StatusPulse({ color, size = 7 }: { color: string; size?: number }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(progress);
      progress.value = 0;
      return undefined;
    }
    progress.value = withRepeat(withTiming(1, { duration: 1600 }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.32 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value * 1.7 }],
  }));

  return (
    <View style={{ width: size + 6, height: size + 6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
          ringStyle,
        ]}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute' },
});
