import '../global.css';

import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import { Buffer } from 'buffer';

import { toastConfig } from '@/components/ui/ToastConfig';
import { useArcWallet } from '@/hooks/useArcWallet';
import { useWalletStore } from '@/store/walletStore';
import { hasPinSetup, isAppLocked, isPinSecurityEnabled, lockIfInactive, setAppLocked } from '@/services/securityService';
import { NetworkProvider } from '@/hooks/useNetworkStatus';
import { OfflineBanner } from '@/components/OfflineBanner';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const { isLoaded, address } = useWalletStore();

  useEffect(() => {
    if (!isLoaded) return;

    const current = String(segments[0] ?? '');
    const inOnboarding = current === '(onboarding)';
    const inSecurity = current === 'pin-setup' || current === 'lock';
    const hasWallet = Boolean(address);
    const pinSecurityEnabled = isPinSecurityEnabled();

    async function routeSecurity() {
      if (!hasWallet && !inOnboarding) {
        router.replace('/(onboarding)/welcome');
        return;
      }
      if (!hasWallet) return;

      if (!pinSecurityEnabled) {
        if (inSecurity) router.replace('/(tabs)/home');
        return;
      }

      const pinReady = await hasPinSetup();
      if (!pinReady && current !== 'pin-setup') {
        router.replace('/pin-setup' as any);
        return;
      }

      const locked = await isAppLocked();
      if (pinReady && current === 'lock' && !locked) {
        router.replace('/(tabs)/home');
        return;
      }
      if (pinReady && current === 'pin-setup') {
        router.replace('/(tabs)/home');
        return;
      }
      if (pinReady && !inSecurity && locked) {
        router.replace('/lock' as any);
        return;
      }
      if (pinReady && inOnboarding) {
        router.replace('/(tabs)/home');
      }
    }

    void routeSecurity();
  }, [isLoaded, address, segments, router]);


  useEffect(() => {
    if (!isLoaded || !address || !isPinSecurityEnabled()) return;

    const activeSegment = String(segments[0] ?? '');
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        void setAppLocked(true);
      } else if (state === 'active') {
        void lockIfInactive().then((locked) => {
          if (locked && activeSegment !== 'lock') router.replace('/lock' as any);
        });
      }
    });

    const timer = setInterval(() => {
      void lockIfInactive().then((locked) => {
        if (locked && activeSegment !== 'lock' && activeSegment !== 'pin-setup') router.replace('/lock' as any);
      });
    }, 5000);

    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [isLoaded, address, segments, router]);
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F' }}>
        <ActivityIndicator size="large" color="#00D4FF" />
      </View>
    );
  }

  const modal = { presentation: 'modal', animation: 'slide_from_bottom' } as const;
  const full = { presentation: 'fullScreenModal', animation: 'fade' } as const;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0F' }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="pin-setup" />
      <Stack.Screen name="lock" />
      <Stack.Screen name="send" options={modal} />
      <Stack.Screen name="receive" options={modal} />
      <Stack.Screen name="bridge" options={modal} />
      <Stack.Screen name="faucet" options={modal} />
      <Stack.Screen name="fx" options={modal} />
      <Stack.Screen name="merchant" options={modal} />
      <Stack.Screen name="merchant-pos" options={modal} />
      <Stack.Screen name="merchant-analytics" options={modal} />
      <Stack.Screen name="markets" options={modal} />
      <Stack.Screen name="market/[id]" options={modal} />
      <Stack.Screen name="pay" options={modal} />
      <Stack.Screen name="notifications" options={modal} />
      <Stack.Screen name="security-backup" options={modal} />
      <Stack.Screen name="gas-sponsorship" options={modal} />
      <Stack.Screen name="invoice/[id]" options={modal} />
      <Stack.Screen name="scan" options={full} />
      <Stack.Screen name="smart-qr" options={modal} />
      <Stack.Screen name="contacts" options={modal} />
      <Stack.Screen name="split-bill" options={modal} />
      <Stack.Screen name="split/[id]" options={modal} />
      <Stack.Screen name="history" options={modal} />
      <Stack.Screen name="autoflow" options={modal} />
      <Stack.Screen name="insights" options={modal} />
    </Stack>
  );
}

export default function RootLayout() {
  useArcWallet();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NetworkProvider>
          <View style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
            <StatusBar style="light" backgroundColor="#0A0A0F" />
            <OfflineBanner />
            <RootNavigator />
            <Toast config={toastConfig} />
          </View>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
















