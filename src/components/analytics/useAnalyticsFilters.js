import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// Filter state lives in the URL (?range=90&mine=MINE-TAL-02&category=...), so a filtered view can be
// bookmarked or shared and survives switching between the two Analytics tabs. The raw values are
// untrusted: the service (analyticsService.resolveFilters) validates and clamps them, and the page
// always renders the RESOLVED set it gets back.
export function useAnalyticsFilters() {
  const [params, setParams] = useSearchParams();
  const raw = {
    preset: params.get('range') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    mineId: params.get('mine') ?? undefined,
    category: params.get('category') ?? undefined,
  };
  const search = params.toString() ? `?${params.toString()}` : '';

  /** Applies `patch` on top of the resolved filters currently shown and writes it to the URL. */
  const apply = useCallback(
    (resolved, patch) => {
      const next = { ...resolved, ...patch };
      const sp = new URLSearchParams();
      if (next.preset !== 'ALL') sp.set('range', next.preset);
      if (next.preset === 'CUSTOM') {
        sp.set('from', next.from);
        sp.set('to', next.to);
      }
      if (next.mineId !== 'ALL') sp.set('mine', next.mineId);
      if (next.category !== 'ALL') sp.set('category', next.category);
      setParams(sp, { replace: true });
    },
    [setParams]
  );

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);
  return { raw, search, apply, reset };
}

export const isDefaultFilters = (f) => f.preset === 'ALL' && f.mineId === 'ALL' && f.category === 'ALL';
