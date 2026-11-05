import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { AutoPackFallback } from '@shared/lookups';
import { api, errorMessage } from '../lib/api';
import { useAppState } from '../lib/queries';
import { useSave } from '../lib/useSave';
import { useTheme, type Theme } from '../lib/theme';
import { Icon } from '../components/Icon';
import {
  ErrorText,
  GhostButton,
  PageHeader,
  PrimaryButton,
  SectionLabel,
  Segmented,
  Sheet,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { ConnectAISection } from './ConnectAI';
import { InstallHint } from '../components/InstallHint';
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

      <SectionLabel icon="bag">Auto pack</SectionLabel>
      <div className="flex flex-col gap-3 px-6 pt-4 pb-2">
        <p className="text-sm text-soft">
          A catalog item can auto pack into a type of bag, like diapers into a diaper bag. When it
          goes on a trip for someone, Duffel puts it in that person’s bag of that type, or the
          trip’s shared one. A bag’s type is set under Catalog → Bags.
        </p>
        <span className="text-sm text-ink">When someone has no bag of that type</span>
        <Segmented<AutoPackFallback>
          label="When someone has no bag of that type"
          value={data.settings.autopack_fallback}
          onChange={(autopack_fallback) => run(() => api.patch('/settings', { autopack_fallback }))}
          options={[
            ['unplaced', 'Leave in No bag'],
            ['main', 'Use their luggage'],
          ]}
        />
        <p className="text-xs text-faint">
          {data.settings.autopack_fallback === 'main'
            ? 'The item goes in their suitcase (or duffel, backpack), so nothing is left without a bag.'
            : 'The item stays in No bag, so you notice. It moves in when a bag of that type is added.'}
        </p>
        <ErrorText>{error}</ErrorText>
      </div>

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
