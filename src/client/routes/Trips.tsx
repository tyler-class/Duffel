import { useNavigate } from 'react-router';
import { localToday, splitTrips } from '@shared/logic';
import type { Trip } from '@shared/types';
import { useAppState } from '../lib/queries';
import { Onboarding } from './Onboarding';
import { formatRange } from '../lib/format';
import { Icon, tripIcon } from '../components/Icon';
import { cx, Empty, IconButton, PageHeader, PrimaryButton, SectionLabel } from '../components/ui';

export function Trips() {
  const nav = useNavigate();
  const { data } = useAppState();
  if (!data) return null;
  if (!data.trips.length && !data.people.length && !data.items.length) return <Onboarding />;
  const { active, archived } = splitTrips(data.trips, localToday());
  const row = (t: Trip, highlight: boolean) => (
    <div key={t.id} className="mx-6 flex items-center border-b border-line">
      <button
        className="flex min-w-0 flex-1 items-center gap-3.5 py-3.5 text-left"
        onClick={() => {
          nav(`/trips/${t.id}`);
        }}
      >
        <span
          className={cx(
            'grid h-10 w-10 flex-none place-items-center rounded-[10px]',
            highlight ? 'bg-accent-tint text-accent' : 'bg-chip text-soft',
          )}
        >
          <Icon name={tripIcon(t.trip_type)} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-base">{t.name}</span>
          <span className="flex items-center gap-2.5 text-[13px] text-soft">
            {(t.start_date || t.end_date) && (
              <span className="inline-flex items-center gap-1">
                <Icon name="cal" size={13} />
                {formatRange(t.start_date, t.end_date)}
              </span>
            )}
            <span className="inline-flex items-center gap-1 tnum">
              <Icon name="check" size={13} />
              {t.packed_count}/{t.item_count}
            </span>
          </span>
          <span className="h-0.5 w-full overflow-hidden rounded bg-track">
            <span
              className="block h-full bg-accent"
              style={{
                width: `${t.item_count ? Math.round((t.packed_count / t.item_count) * 100) : 0}%`,
              }}
            />
          </span>
        </span>
      </button>
      <IconButton
        icon="settings"
        label={`${t.name} details`}
        className="-mr-2 ml-2"
        onClick={() => nav(`/trips/${t.id}/details`)}
      />
    </div>
  );
  return (
    <div>
      <PageHeader
        title="Trips"
        icon="map"
        action={
          <PrimaryButton icon="plus" onClick={() => nav('/trips/new')}>
            New trip
          </PrimaryButton>
        }
      />
      {!data.trips.length && (
        <Empty title="No trips yet">
          Plan one from a template, copy a past trip, or start blank.
        </Empty>
      )}
      {active.length > 0 && (
        <>
          <SectionLabel icon="clock">Upcoming</SectionLabel>
          {active.map((t, i) => row(t, i === 0))}
        </>
      )}
      {archived.length > 0 && (
        <>
          <SectionLabel icon="archive">Past</SectionLabel>
          {archived.map((t) => row(t, false))}
        </>
      )}
    </div>
  );
}
