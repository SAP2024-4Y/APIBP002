import { useCallback, useEffect, useState } from 'react';
import { subscribe } from '../api.js';

export function useHashRoute(fallback) {
  const read = useCallback(() => window.location.hash.replace(/^#\/?/, '').split('?')[0] || fallback, [fallback]);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [read]);
  const go = useCallback((next) => {
    window.location.hash = `/${next}`;
  }, []);
  return [route, go];
}

export function useDebounced(value, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function useApiLog() {
  const [log, setLog] = useState({ calls: [], budget: null });
  useEffect(() => subscribe(setLog), []);
  return log;
}

export function useEscape(handler, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler, active]);
}
