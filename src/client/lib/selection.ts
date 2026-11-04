import { useEffect, useState } from 'react';
import { defaultTripId, localToday } from '@shared/logic';
import type { Trip } from '@shared/types';
import { load, save } from './storage';

const KEY = 'trip';
const listeners = new Set<(id: string) => void>();

/** Remember a trip choice (e.g. from the Trips list) before navigating to Pack. */
export function selectTrip(id: string) {
  save(KEY, id);
  listeners.forEach((fn) => fn(id));
}

/**
 * The trip shown on Pack. Starts on the saved trip (or the first active one) and
 * then stays put, so finishing a trip doesn't bounce you to another one.
 */
export function useSelectedTrip(trips: Trip[] | undefined): [string | null, (id: string) => void] {
  const [chosen, setChosen] = useState<string | null>(() => load<string | null>(KEY, null));
  useEffect(() => {
    const fn = (id: string) => setChosen(id);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  const exists = !!trips && !!chosen && trips.some((t) => t.id === chosen);
  const id = exists ? chosen : trips ? defaultTripId(trips, localToday()) : null;
  // Lock in the first choice so it survives a trip becoming complete.
  useEffect(() => {
    if (trips && id && id !== chosen) save(KEY, id);
  }, [trips, id, chosen]);
  return [id, selectTrip];
}
