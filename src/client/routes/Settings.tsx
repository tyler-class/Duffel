import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { useAppState } from '../lib/queries';
import { useSave } from '../lib/useSave';
import { Icon } from '../components/Icon';
import {
  ErrorText,
  FieldRow,
  GhostButton,
  PageHeader,
  PrimaryButton,
  SectionLabel,
  Sheet,
  TextInput,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { ConnectAISection } from './ConnectAI';
import { InstallHint } from '../components/InstallHint';

export function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useAppState();
  const { run, busy, error } = useSave();
  const [name, setName] = useState<string | null>(null);
  const [restore, setRestore] = useState<{ file: File; data: unknown } | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  if (!data) return null;
  const shownName = name ?? data.settings.instance_name;

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

      <SectionLabel icon="users">Household</SectionLabel>
      <div className="px-6">
        <FieldRow icon="tag" label="Name" htmlFor="inst-name">
          <div className="flex items-center gap-2">
            <TextInput id="inst-name" value={shownName} onChange={(e) => setName(e.target.value)} />
            {shownName.trim() && shownName !== data.settings.instance_name && (
              <GhostButton
                className="py-1 text-accent"
                disabled={busy}
                onClick={() => run(() => api.patch('/settings', { instance_name: shownName }))}
              >
                Save
              </GhostButton>
            )}
          </div>
        </FieldRow>
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

      <div className="flex items-center justify-between px-6 pt-8 text-xs text-faint">
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
