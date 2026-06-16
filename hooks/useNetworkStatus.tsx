import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

interface NetworkContextValue {
  isOffline: boolean;
  isInternetReachable: boolean | null;
}

const NetworkContext = createContext<NetworkContextValue>({ isOffline: false, isInternetReachable: null });

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isInternetReachable, setReachable] = useState<boolean | null>(null);
  const [isConnected, setConnected] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setConnected(Boolean(state.isConnected));
      setReachable(state.isInternetReachable);
    });
    return unsub;
  }, []);

  const value = useMemo(() => ({
    isOffline: !isConnected || isInternetReachable === false,
    isInternetReachable,
  }), [isConnected, isInternetReachable]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetworkStatus() {
  return useContext(NetworkContext);
}
