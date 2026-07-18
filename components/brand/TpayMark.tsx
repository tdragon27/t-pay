import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/theme';

/** A quiet, geometry-only T Pay mark that stays crisp at small sizes. */
export function TpayMark({ size = 64, glow = false }: { size?: number; glow?: boolean }) {
  const radius = Math.round(size * 0.28);
  const inset = Math.max(1, Math.round(size * 0.025));

  return (
    <View
      accessible
      accessibilityLabel="T Pay"
      style={[
        styles.shell,
        {
          width: size,
          height: size,
          borderRadius: radius,
          shadowOpacity: glow ? 0.22 : 0,
          shadowRadius: glow ? size * 0.22 : 0,
        },
      ]}
    >
      <LinearGradient
        colors={['#52DDF5', '#6D78F5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.frame, { borderRadius: radius, padding: inset }]}
      >
        <View style={[styles.inner, { borderRadius: Math.max(1, radius - inset) }]}>
          <View
            style={[
              styles.glyphTop,
              {
                width: size * 0.4,
                height: Math.max(3, size * 0.075),
                borderRadius: size * 0.04,
              },
            ]}
          />
          <View
            style={[
              styles.glyphStem,
              {
                width: Math.max(3, size * 0.082),
                height: size * 0.31,
                borderRadius: size * 0.04,
              },
            ]}
          />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  frame: {
    flex: 1,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#0A1119',
  },
  glyphTop: {
    backgroundColor: '#F5F7FA',
  },
  glyphStem: {
    marginTop: -1,
    backgroundColor: '#F5F7FA',
  },
});
