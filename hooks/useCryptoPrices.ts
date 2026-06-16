// hooks/useCryptoPrices.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

export interface AssetPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
}

export function useCryptoPrices() {
  const [btc, setBtc] = useState<AssetPrice | null>(null);
  const [eth, setEth] = useState<AssetPrice | null>(null);
  const [usdc, setUsdc] = useState<AssetPrice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);

  const fetchPrices = useCallback(async (manual?: boolean) => {
    if (manual) setIsRefreshing(true);
    setError(null);
    try {
      const url =
        'https://api.coingecko.com/api/v3/coins/markets' +
        '?vs_currency=usd' +
        '&ids=bitcoin,ethereum,usd-coin' +
        '&order=market_cap_desc' +
        '&per_page=3' +
        '&sparkline=false' +
        '&price_change_percentage=24h';

      const res = await axios.get(url, { timeout: 10000 });
      const list: AssetPrice[] = res.data;

      for (const coin of list) {
        if (coin.id === 'bitcoin') setBtc(coin);
        if (coin.id === 'ethereum') setEth(coin);
        if (coin.id === 'usd-coin') setUsdc(coin);
      }
    } catch (e) {
      setError('Unable to load live prices');
    } finally {
      setIsLoading(false);
      if (manual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    timer.current = setInterval(() => fetchPrices(), 60000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [fetchPrices]);

  return {
    btc,
    eth,
    usdc,
    isLoading,
    isRefreshing,
    error,
    refresh: () => fetchPrices(true),
  };
}