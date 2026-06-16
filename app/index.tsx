import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useWalletStore } from '@/store/walletStore';

export default function IndexRoute() {
  const { isLoaded, address } = useWalletStore();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0F', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#00D4FF" />
      </View>
    );
  }

  return <Redirect href={address ? '/(tabs)/home' : '/(onboarding)/welcome'} />;
}
