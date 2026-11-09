// A trip's itinerary alone, ready to print: /trips/:id/print (signed in) and /print/:token (a
// short-lived link the installed iPhone app opens in Safari, which can print; the app can't).
// It opens the print dialog once loaded, and keeps a Print button for another go.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import type { TripDetail } from '@shared/types';
import { ItineraryPrint } from '../components/Itinerary';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useTrip } from '../lib/queries';

type Printable = Pick<TripDetail, 'trip' | 'itinerary'>;

function PrintView({ data, back }: { data?: Printable; back?: string }) {
  const printed = useRef(false);
  // Paper is light, whatever the screen uses.
  useEffect(() => {
    const root = document.documentElement;
    const theme = root.dataset.theme;
    root.dataset.theme = 'light';
    return () => {
      if (theme) root.dataset.theme = theme;
      else delete root.dataset.theme;
    };
  }, []);
  useEffect(() => {
    if (!data || printed.current) return;
    // Let the page lay out first. (Marked done only once it runs, so a re-run can't skip it.)
    const t = setTimeout(() => {
      printed.current = true;
      window.print();
    }, 400);
    return () => clearTimeout(t);
  }, [data]);
  return (
    <div className="min-h-full bg-white pb-10 text-ink">
      <div className="flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2 print:hidden">
        {back && (
          <Link to={back} className="inline-flex items-center gap-1 text-[15px] text-accent">
            <Icon name="chevLeft" size={18} /> Back
          </Link>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[15px] font-medium text-accent-ink"
        >
          <Icon name="printer" size={16} /> Print
        </button>
      </div>
      {data ? <ItineraryPrint detail={data} /> : <p className="px-4 pt-6 text-soft">Loading…</p>}
    </div>
  );
}

/** Signed in: /trips/:id/print. */
export function PrintTrip() {
  const { id = '' } = useParams();
  const q = useTrip(id);
  return <PrintView data={q.data} back={`/trips/${id}`} />;
}

/** From a print link, no sign-in needed: /print/:token. */
export function PrintFromLink({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ['print', token],
    queryFn: () => api.get<Printable>(`/print/${encodeURIComponent(token)}`),
    retry: false,
  });
  if (q.isError)
    return (
      <p className="px-5 pt-[calc(env(safe-area-inset-top,0px)+24px)] text-soft">
        This print link has expired. Open Print again in Duffel.
      </p>
    );
  return <PrintView data={q.data} />;
}
