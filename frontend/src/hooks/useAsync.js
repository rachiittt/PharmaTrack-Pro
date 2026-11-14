import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and tracks { data, error, loading }. Re-runs when deps
 * change; `reload()` refetches without clearing the current data, so tables
 * don't flash empty on refresh. Stale responses are discarded.
 */
export function useAsync(loader, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled });
  const requestId = useRef(0);
  const loaderRef = useRef(loader);
  useLayoutEffect(() => { loaderRef.current = loader; });

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (id === requestId.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (id === requestId.current) setState((s) => ({ ...s, error, loading: false }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (enabled) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
