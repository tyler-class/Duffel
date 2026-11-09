import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import type { AutoPackFallback } from '@shared/lookups';
import { api, errorMessage } from '../lib/api';
import { useAppState } from '../lib/queries';
import { useSave } from '../lib/useSave';
import { useTheme, type Theme } from '../lib/theme';
import { Icon } from '../components/Icon';
import {
  cx,
  ErrorText,
  GhostButton,
  InfoTip,
  PageHeader,
  PrimaryButton,
  SectionLabel,
  Segmented,
  Sheet,
  Switch,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { ConnectAISection } from './ConnectAI';
import { InstallHint } from '../components/InstallHint';
import {
  isNewer,
  isSourceRepo,
  runUrl,
  setupUrl,
  UPSTREAM,
  useLatestVersion,
} from '../lib/updates';
import { AboutButton } from '../components/AboutSheet';

export function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useAppState();
  const { run, busy, error } = useSave();
  const [theme, setTheme] = useTheme();
  const [restore, setRestore] = useState<{ file: File; data: unknown } | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  if (!data) return null;

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setRestoreError('');
    try {
      setRestore({ file: f, data: JSON.parse(await f.text()) });
    } catch {
      setRestoreError('That file isn’t a Duffel backup.');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="pb-12">
      <PageHeader
        title="Settings"
        icon="settings"
        action={<AboutButton variant="header" className="md:hidden" />}
      />

      <SectionLabel icon="palette">Appearance</SectionLabel>
      <div className="px-6 pt-4 pb-2">
        <Segmented<Theme>
          label="Appearance"
          value={theme}
          onChange={setTheme}
          options={[
            ['light', 'Light'],
            ['dark', 'Dark'],
            ['system', 'System'],
          ]}
        />
      </div>

      <SectionLabel
        icon="bag"
        trailing={
          <InfoTip label="How auto pack works">
            <div className="flex flex-col gap-3">
              <p>
                Each catalog item says where it packs: their luggage, their carry-on, a type of bag
                (like diapers into a diaper bag), or no bag (a stroller, a car seat). Set it on the
                item in the Catalog; a template can change it for its trips. Bag types are set under
                Catalog → Bags.
              </p>
              <AutoPackList title="When it happens">
                <li>Making a trip from a template, or copying a trip.</li>
                <li>Adding catalog items to a trip, one or several.</li>
                <li>
                  Selecting items and assigning them to someone: anything not in a bag they share
                  moves to theirs.
                </li>
                <li>Adding a bag to a trip: Duffel offers to move the items waiting for it.</li>
              </AutoPackList>
              <AutoPackList title="Where things go">
                <li>A bag type: that person’s bag of that type, else the trip’s shared one.</li>
                <li>Carry-on: that person’s carry-on bag, else a shared carry-on.</li>
                <li>
                  Luggage: that person’s suitcase, else their duffel, backpack or tote, else a
                  shared bag if one clearly fits best. A diaper bag or cooler is used last, only
                  when it’s their only bag.
                </li>
                <li>No bag: the No bag group.</li>
                <li>Nowhere that fits: No bag yet, to sort out by hand.</li>
              </AutoPackList>
              <AutoPackList title="It never">
                <li>Moves something you put in a bag yourself.</li>
                <li>Places items typed in by name that aren’t in the catalog.</li>
              </AutoPackList>
            </div>
          </InfoTip>
        }
      >
        Auto pack
      </SectionLabel>
      <div className="flex flex-col gap-3 px-6 pt-4 pb-2 text-sm text-soft">
        <p>Catalog items go into the right bag when they’re added to a trip.</p>
        <span className="pt-1 text-ink">When someone has no bag of an item’s type</span>
        <Segmented<AutoPackFallback>
          label="When someone has no bag of an item’s type"
          value={data.settings.autopack_fallback}
          onChange={(autopack_fallback) => run(() => api.patch('/settings', { autopack_fallback }))}
          options={[
            ['unplaced', 'Leave in No bag yet'],
            ['main', 'Use their luggage'],
          ]}
        />
        <p className="text-xs text-faint">
          {data.settings.autopack_fallback === 'main'
            ? 'It goes in their luggage instead, so nothing is left without a bag.'
            : 'It waits in No bag yet, so you notice. Add a bag of that type and Duffel offers to move it in.'}
        </p>
        <ErrorText>{error}</ErrorText>
      </div>

      <UpdatesSection
        setUp={data.settings.updates_set_up}
        onSetUp={() => run(() => api.patch('/settings', { updates_set_up: true }))}
        telemetry={data.settings.telemetry}
        onTelemetry={(telemetry) => run(() => api.patch('/settings', { telemetry }))}
      />

      <SectionLabel icon="phone">Install on your phone</SectionLabel>
      <div className="px-6 py-4">
        <InstallHint />
      </div>

      <SectionLabel icon="archive">Backup</SectionLabel>
      <p className="px-6 pt-4 text-sm text-soft">
        Everything: people, catalog, templates and trips.
      </p>
      <div className="flex flex-col px-6 pt-1">
        <a
          href="/api/export"
          download
          className="flex items-center gap-3 border-b border-line py-3.5 text-base text-ink"
        >
          <Icon name="download" size={18} className="text-accent" />
          <span className="flex-1">Download backup</span>
          <Icon name="chevRight" className="text-faint" />
        </a>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-3 border-b border-line py-3.5 text-left text-base text-ink"
        >
          <Icon name="upload" size={18} className="text-accent" />
          <span className="flex-1">Restore from backup…</span>
          <Icon name="chevRight" className="text-faint" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <ErrorText>{restoreError}</ErrorText>
      </div>

      <ConnectAISection />

      <SectionLabel icon="user">Account</SectionLabel>
      <div className="px-6 pt-2">
        <button
          className="flex w-full items-center gap-3 border-y border-line py-3.5 text-left text-base text-ink"
          onClick={async () => {
            try {
              await api.post('/logout');
            } finally {
              qc.clear();
              window.location.href = '/';
            }
          }}
        >
          <Icon name="logout" size={18} className="text-accent" />
          <span className="flex-1">Sign out of this device</span>
        </button>
      </div>

      <Sheet
        open={!!restore}
        onClose={() => setRestore(null)}
        title="Replace everything?"
        footer={
          <>
            <GhostButton onClick={() => setRestore(null)}>Cancel</GhostButton>
            <PrimaryButton
              tone="danger"
              disabled={busy}
              onClick={async () => {
                if (!restore) return;
                try {
                  await api.post('/import', restore.data);
                  await qc.invalidateQueries();
                  setRestore(null);
                  toast({ text: 'Backup restored' });
                } catch (e) {
                  setRestoreError(errorMessage(e));
                  setRestore(null);
                }
              }}
            >
              Restore
            </PrimaryButton>
          </>
        }
      >
        <p className="py-2 text-sm text-soft">
          Everything in this Duffel is replaced with the contents of {restore?.file.name}. This
          can’t be undone, so download a backup first if you might need it.
        </p>
      </Sheet>
    </div>
  );
}

function AutoPackList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-medium text-ink">{title}</p>
      <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 marker:text-faint">{children}</ul>
    </div>
  );
}

const LINK_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[15px] font-medium';

/**
 * Updates: is a newer Duffel out, and links into this copy's own GitHub repo to add the
 * update workflow (once) or run it. Updates go Duffel → their repo → their Cloudflare.
 */
function UpdatesSection({
  setUp,
  onSetUp,
  telemetry,
  onTelemetry,
}: {
  setUp: boolean;
  onSetUp: () => void;
  telemetry: boolean;
  onTelemetry: (on: boolean) => void;
}) {
  const latest = useLatestVersion();
  const current = __APP_VERSION__;
  const repo = __SOURCE_REPO__;
  const isSource = isSourceRepo(repo, UPSTREAM);
  const newer = latest.data && isNewer(latest.data, current) ? latest.data : null;
  const status = newer
    ? `Duffel ${newer} is available. You have ${current}.`
    : latest.isError
      ? `Duffel ${current}. Couldn’t check for a newer version.`
      : latest.data
        ? `Duffel ${current}, up to date.`
        : `Duffel ${current}.`;

  return (
    <>
      <SectionLabel
        icon="download"
        trailing={
          !isSource && (
            <InfoTip label="How updates work">
              <div className="flex flex-col gap-2">
                <p>Updates take two steps, both in your own accounts:</p>
                <ol className="flex list-decimal flex-col gap-1 pl-5 marker:text-faint">
                  <li>
                    An update workflow in your GitHub copy brings in the latest Duffel every Monday.
                    GitHub needs you to add it once: Set up opens it ready to commit.
                  </li>
                  <li>
                    Cloudflare deploys your copy every time it changes. That part is already on.
                  </li>
                </ol>
                <p>
                  Your data lives in your database, so updates don’t touch it. Changes you made to
                  the code in your copy are replaced.
                </p>
              </div>
            </InfoTip>
          )
        }
      >
        Updates
      </SectionLabel>
      <div className="flex flex-col gap-3 px-6 pt-4 pb-2 text-sm text-soft">
        <p className={cx(newer && 'text-ink')}>{status}</p>
        {isSource ? null : !repo ? (
          <p className="text-xs text-faint">Deployed by hand: git pull, then npm run deploy.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {setUp ? (
                <a
                  href={runUrl(repo)}
                  target="_blank"
                  rel="noreferrer"
                  className={cx(
                    LINK_BUTTON,
                    newer ? 'bg-accent text-accent-ink' : 'bg-chip text-ink',
                  )}
                >
                  <Icon name="reset" size={16} />
                  Update now
                </a>
              ) : (
                <a
                  href={setupUrl(repo, __SOURCE_BRANCH__)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={onSetUp}
                  className={cx(LINK_BUTTON, 'bg-accent text-accent-ink')}
                >
                  <Icon name="github" size={16} />
                  Set up automatic updates
                </a>
              )}
              <a
                href={`https://github.com/${repo}`}
                target="_blank"
                rel="noreferrer"
                className="px-1 text-[13px] text-soft underline-offset-2 hover:underline"
              >
                {repo}
              </a>
            </div>
            <p className="text-xs text-faint">
              {setUp ? (
                <>
                  Opens GitHub: click Run workflow.{' '}
                  <a
                    href={setupUrl(repo, __SOURCE_BRANCH__)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    Set up again
                  </a>
                </>
              ) : (
                'Opens GitHub: click Commit changes. It updates now, then every Monday.'
              )}
            </p>
          </>
        )}
        <div className="flex items-center gap-3 border-t border-line pt-3">
          <span className="flex flex-1 items-center gap-1.5 text-ink">
            Share anonymous usage counts
            <InfoTip label="What’s shared">
              <div className="flex flex-col gap-2">
                <p>Once a day this copy sends Duffel’s developer:</p>
                <ul className="flex list-disc flex-col gap-0.5 pl-5 marker:text-faint">
                  <li>a random id this copy made for itself</li>
                  <li>its version</li>
                  <li>how many trips, items, bags and so on it has (counts only)</li>
                  <li>whether automatic updates are on</li>
                </ul>
                <p>
                  Never names, lists, notes or anything you type, and no IP address is kept. It
                  shows how many copies are in use, to decide what to work on next.
                </p>
              </div>
            </InfoTip>
          </span>
          <Switch on={telemetry} onChange={onTelemetry} label="Share anonymous usage counts" />
        </div>
      </div>
    </>
  );
}
