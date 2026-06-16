// components/ui/Card.tsx
import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { Colors, Radius, Spacing, Shadow } from '@/constants/theme';

interface CardProps extends ViewProps {
  glow?: boolean;
  elevated?: boolean;
}

export function Card({ glow, elevated, style, children, ...rest }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        elevated && styles.elevated,
        glow && styles.glow,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...Shadow.card,
  },
  elevated: {
    backgroundColor: Colors.elevated,
  },
  glow: {
    borderColor: Colors.primaryDim,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
});
