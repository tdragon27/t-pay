import { useCallback, useEffect, useState } from 'react';
import { FiatCurrency, FiatRatesSnapshot, formatFiatAmount, getFiatCurrency, getFiatRates, rateAgeLabel, setFiatCurrency } from '@/services/fiatPreferenceService';

export function useFiatCurrency() {
  const [currency, setCurrencyState] = useState<FiatCurrency>('USD');
  const [rates, setRates] = useState<FiatRatesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshRates = useCallback(async (force = false) => {
    const nextRates = await getFiatRates(force);
    setRates(nextRates);
    return nextRates;
  }, []);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setLoading(true);
      const [nextCurrency, nextRates] = await Promise.all([getFiatCurrency(), getFiatRates()]);
      if (!active) return;
      setCurrencyState(nextCurrency);
      setRates(nextRates);
      setLoading(false);
    }
    hydrate();
    const timer = setInterval(() => { void refreshRates(true); }, 5 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [refreshRates]);

  const changeCurrency = useCallback(async (next: FiatCurrency) => {
    await setFiatCurrency(next);
    setCurrencyState(next);
  }, []);

  const format = useCallback((amountUsd: number) => {
    if (!rates) return `$${amountUsd.toFixed(2)}`;
    return formatFiatAmount(amountUsd, currency, rates);
  }, [currency, rates]);

  return {
    currency,
    rates,
    loading,
    changeCurrency,
    refreshRates,
    format,
    rateAge: rates ? rateAgeLabel(rates.timestamp) : 'unknown',
    rateSource: rates?.source ?? 'internal',
  };
}
