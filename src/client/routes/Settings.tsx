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
      <PageHeader title="Settings" back="/more" />

      <div className="px-5">
        <FieldRow icon="tag" label="Household name" htmlFor="inst-name">
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
      <div className="px-5">
        <InstallHint />
      </div>

      <SectionLabel icon="archive">Backup</SectionLabel>
      <div className="flex flex-col gap-1 px-5">
        <p className="pb-1 text-sm text-soft">
          A backup holds everything: people, catalog, templates and trips.
        </p>
        <a
          href="/api/export"
          download
          className="inline-flex items-center gap-2 py-2.5 text-[15px] text-ink"
        >
          <Icon name="download" size={16} className="text-soft" />
          Download backup
        </a>
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 py-2.5 text-left text-[15px] text-ink"
        >
          <Icon name="upload" size={16} className="text-soft" />
          Restore from backup…
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

      <SectionLabel icon="settings">Password</SectionLabel>
      <div className="flex flex-col gap-2 px-5 text-sm text-soft">
        <p>
          The password is the{' '}
          <code className="rounded bg-chip px-1 font-mono text-[13px]">APP_PASSWORD</code> secret on
          your Cloudflare Worker. Change it in the Cloudflare dashboard under Workers → duffel →
          Settings → Variables and Secrets, or run{' '}
          <code className="rounded bg-chip px-1 font-mono text-[13px]">
            npx wrangler secret put APP_PASSWORD
          </code>
          . Everyone is signed out when it changes.
        </p>
        <GhostButton
          icon="logout"
          className="-ml-3 self-start text-ink"
          onClick={async () => {
            try {
              await api.post('/logout');
            } finally {
              qc.clear();
              window.location.href = '/';
            }
          }}
        >
          Sign out of this device
        </GhostButton>
      </div>

      <p className="px-5 pt-8 text-xs text-faint">Duffel {__APP_VERSION__}</p>

      <Sheet
        open={!!restore}
        onClose={() => setRestore(null)}
        title="Replace everything?"
        footer={
          <>
            <GhostButton onClick={() => setRestore(null)}>Cancel</GhostButton>
            <PrimaryButton
              className="bg-danger"
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
