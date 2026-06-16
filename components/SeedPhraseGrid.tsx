// components/SeedPhraseGrid.tsx
// -----------------------------------------------------------------------------
// Renders the 12-word seed phrase in a 3x4 grid with numbered words.
// Used on both the Create and Export screens.
// -----------------------------------------------------------------------------

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, FontSize } from '@/constants/theme';

interface Props {
  words: string[];
  blurred?: boolean;
}

export function SeedPhraseGrid({ words, blurred = false }: Props) {
  return (
    <View style={styles.grid}>
      {words.map((word, index) => (
        <View key={index} style={styles.wordCard}>
          <Text style={styles.index}>{index + 1}</Text>
          <Text
            style={[styles.word, blurred && styles.blurred]}
            selectable={!blurred}
          >
            {blurred ? '\u2022\u2022\u2022\u2022\u2022' : word}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordCard: {
    width: '30.5%',
    backgroundColor: Colors.elevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  index: {
    fontSize: FontSize.xs,
    color: Colors.text3,
    fontWeight: '600',
    width: 16,
    textAlign: 'right',
  },
  word: {
    fontSize: FontSize.sm,
    color: Colors.text1,
    fontWeight: '500',
    flex: 1,
  },
  blurred: {
    color: Colors.text3,
    letterSpacing: 2,
  },
});

