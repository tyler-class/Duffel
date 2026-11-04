import { useState } from 'react';
import { Icon } from '../components/Icon';
import { GhostButton, PageHeader, SectionLabel } from '../components/ui';

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <GhostButton
      icon={done ? 'check' : 'copy'}
      className="py-1 text-accent"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: the text is selectable */
        }
      }}
    >
      {done ? 'Copied' : label}
    </GhostButton>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="block overflow-x-auto rounded-lg bg-chip px-3 py-2.5 font-mono text-[13px] whitespace-nowrap text-ink select-all">
      {children}
    </code>
  );
}

export function ConnectAI() {
  const url = `${window.location.origin}/mcp`;
  const cli = `claude mcp add --transport http duffel ${url}`;
  return (
    <div className="pb-12">
      <PageHeader title="Connect an AI assistant" back="/more" />
      <div className="flex flex-col gap-3 px-5 text-sm text-soft">
        <p>
          Let Claude, ChatGPT or any assistant that supports MCP read and update your packing lists.
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-soft">Your Duffel’s connector URL</span>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <Code>{url}</Code>
            </div>
            <Copy text={url} />
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-accent-tint px-3 py-2.5 text-accent">
          <Icon name="user" size={16} className="mt-0.5" />
          When you connect, a Duffel sign-in page opens. Enter your household password there to
          approve the assistant.
        </p>
      </div>

      <SectionLabel>Claude (web, desktop, mobile)</SectionLabel>
      <ol className="flex list-decimal flex-col gap-1.5 pr-5 pl-10 text-sm text-ink">
        <li>Open Settings → Connectors and choose “Add custom connector”.</li>
        <li>Name it Duffel and paste the URL above.</li>
        <li>Choose Connect, then enter your household password on the Duffel page.</li>
      </ol>

      <SectionLabel>ChatGPT</SectionLabel>
      <ol className="flex list-decimal flex-col gap-1.5 pr-5 pl-10 text-sm text-ink">
        <li>
          In Settings, add a custom connector (MCP server). Your plan may need developer mode turned
          on.
        </li>
        <li>Paste the URL above and choose OAuth sign-in.</li>
        <li>Enter your household password on the Duffel page.</li>
      </ol>

      <SectionLabel>Claude Code</SectionLabel>
      <div className="flex flex-col gap-2 px-5 text-sm text-ink">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <Code>{cli}</Code>
          </div>
          <Copy text={cli} />
        </div>
        <p className="text-soft">Then run /mcp in Claude Code and choose Authenticate.</p>
      </div>

      <SectionLabel>Other apps</SectionLabel>
      <p className="px-5 text-sm text-ink">
        Cursor, VS Code and other MCP apps: add a remote (HTTP) MCP server with the URL above. They
        open the Duffel sign-in page the first time.
      </p>
    </div>
  );
}
