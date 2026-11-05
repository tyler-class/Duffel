import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { AutoPackFallback } from '@shared/lookups';
import { api, errorMessage } from '../lib/api';
import { useAppState } from '../lib/queries';
import { useSave } from '../lib/useSave';
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

export function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useAppState();
  const { run, busy, error } = useSave();
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
      <PageHeader title="Settings" icon="settings" />

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
            ['main', 'Use their main bag'],
          ]}
        />
        <p className="text-xs text-faint">
          {data.settings.autopack_fallback === 'main'
            ? 'The item goes in their main (checked) bag, so nothing is left without a bag.'
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

      <SectionLabel icon="settings">Password and sign-in</SectionLabel>
      <div className="flex flex-col gap-3 px-6 pt-4 text-sm text-soft">
        <p>
          To change the password, edit the{' '}
          <span className="font-medium text-ink">APP_PASSWORD</span> secret in Cloudflare (Workers →
          duffel → Settings → Variables and Secrets), or run:
        </p>
        <code className="block overflow-x-auto rounded-lg bg-chip px-3 py-2.5 font-mono text-[13px] whitespace-nowrap text-ink select-all">
          npx wrangler secret put APP_PASSWORD
        </code>
        <p>Everyone is signed out when it changes.</p>
      </div>
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

      <SectionLabel icon="info">About</SectionLabel>
      <div className="flex flex-col gap-3 px-6 pt-4 text-sm text-soft">
        <p>
          Duffel is a free, open-source packing list for families. It runs on your own Cloudflare
          account, so your lists stay yours.
        </p>
        <p>
          Built by{' '}
          <a
            href="https://tylerclass.net"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent"
          >
            Tyler Class
          </a>
          .
        </p>
      </div>
      <div className="px-6 pt-2">
        <a
          href="https://ko-fi.com/tylerclass"
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-3 border-y border-line py-3.5 text-base text-ink"
        >
          <Icon name="coffee" size={18} className="text-accent" />
          <span className="flex-1">If you want to say thank you, coffee is my love language</span>
          <Icon name="chevRight" size={16} className="text-faint" />
        </a>
      </div>

      <div className="flex items-center justify-between px-6 pt-8 text-xs text-faint md:hidden">
        <span>Duffel {__APP_VERSION__}</span>
        <a
          href="https://github.com/tyler-class/Duffel"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-soft"
        >
          <Icon name="github" size={16} />
          Duffel on GitHub
        </a>
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
