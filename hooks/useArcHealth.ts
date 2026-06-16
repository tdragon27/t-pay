import { useCallback, useEffect, useState } from 'react';
import { checkArcRpcHealth, type ArcRpcHealth } from '@/services/arcHealthService';

export function useArcHealth(autoRefresh = true) {
  const [health, setHealth] = useState<ArcRpcHealth | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const refresh = useCallback(async () => {
    setIsChecking(true);
    try {
      const next = await checkArcRpcHealth();
      setHealth(next);
      return next;
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    refresh();
    const timer = setInterval(refresh, 45_000);
    return () => clearInterval(timer);
  }, [autoRefresh, refresh]);

  return { health, isChecking, refresh };
}
