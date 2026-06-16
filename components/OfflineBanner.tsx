import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export function OfflineBanner() {
  const { isOffline } = useNetworkStatus();
  if (!isOffline) return null;
  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={16} color={Colors.warning} />
      <Text style={styles.text}>No internet connection - read-only mode</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: Spacing.md, backgroundColor: Colors.warningBg, borderBottomWidth: 1, borderBottomColor: 'rgba(255,181,71,0.25)' },
  text: { color: Colors.warning, fontSize: FontSize.xs, fontWeight: '800' },
});

