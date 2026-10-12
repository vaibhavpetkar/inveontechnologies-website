import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** GETs a path (null = skip) and exposes reload(). Optional polling interval. */
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    try {
      const result = await api<T>(path);
      if (id === seq.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === seq.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(!!path);
    setData(null);
    void load();
    if (!pollMs || !path) return;
    const t = setInterval(() => void load(), pollMs);
    return () => clearInterval(t);
  }, [load, path, pollMs]);

  return { data, error, loading, reload: load };
}
