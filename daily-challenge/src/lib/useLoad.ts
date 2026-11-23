import { type DependencyList, useCallback, useEffect, useState } from "react";
import { ApiError } from "./api.ts";

/** Loads data once (and again when deps change), with loading and error states and a reload. */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await run());
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("unknown", "Something went wrong. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    if (enabled) void reload();
    else setLoading(false);
  }, [reload, enabled]);
  return { data, error, loading, reload, setData };
}
