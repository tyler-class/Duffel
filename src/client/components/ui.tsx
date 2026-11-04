import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from 'react';
import { useNavigate } from 'react-router';
import { Icon, type IconName } from './Icon';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ---------- buttons ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName };

export function PrimaryButton({
  icon,
  className,
  children,
  tone,
  ...p
}: BtnProps & { tone?: 'danger' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[15px] font-medium disabled:opacity-50',
        tone === 'danger' ? 'bg-danger text-white' : 'bg-accent text-accent-ink',
        className,
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function GhostButton({ icon, className, children, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center gap-1.5 px-3 py-2.5 text-[15px] text-soft disabled:opacity-50',
        className,
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function DangerButton({ icon = 'trash', className, children, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center gap-1.5 py-2.5 text-[15px] text-danger disabled:opacity-50',
        className,
      )}
    >
      <Icon name={icon} size={16} />
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className,
  ...p
}: BtnProps & { icon: IconName; label: string }) {
  return (
    <button
      {...p}
      aria-label={label}
      title={label}
      className={cx('grid h-9 w-9 place-items-center rounded-full text-soft', className)}
    >
      <Icon name={icon} />
    </button>
  );
}

// ---------- form pieces ----------
/** A form row: leading icon, then label + control. */
export function FieldRow({
  icon,
  label,
  htmlFor,
  children,
  hint,
}: {
  icon?: IconName;
  label?: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3.5 border-b border-line py-3">
      {icon && <Icon name={icon} className="mt-0.5 text-faint" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {label && (
          <label htmlFor={htmlFor} className="text-xs text-soft">
            {label}
          </label>
        )}
        {children}
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
    </div>
  );
}

export function TextInput(p: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cx(
        'w-full bg-transparent text-base text-ink placeholder:text-faint focus:outline-none',
        p.className,
      )}
    />
  );
}

export function Pick({
  on,
  onClick,
  children,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm',
        on ? 'border-ink text-ink' : 'border-line text-soft',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Switch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx(
        'relative h-6 w-10 flex-none rounded-full transition-colors disabled:opacity-40',
        on ? 'bg-accent' : 'bg-track',
      )}
    >
      <span
        className={cx(
          'absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform',
          on && 'translate-x-4',
        )}
      />
    </button>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
}: {
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
}) {
  const v = value ?? 0;
  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        aria-label="Less"
        onClick={() => onChange(Math.max(min, v - 1))}
        className="grid h-8 w-8 place-items-center rounded-full border border-line text-soft"
      >
        −
      </button>
      <input
        aria-label="Quantity"
        inputMode="numeric"
        value={value ?? ''}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value === '' || Number.isFinite(n))
            onChange(e.target.value === '' ? 0 : Math.max(min, n));
        }}
        className="w-10 bg-transparent text-center font-mono text-base tnum focus:outline-none"
      />
      <button
        type="button"
        aria-label="More"
        onClick={() => onChange(v + 1)}
        className="grid h-8 w-8 place-items-center rounded-full border border-line text-soft"
      >
        +
      </button>
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex min-w-0 gap-0.5 rounded-[9px] bg-chip p-[3px]"
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cx(
            'flex-1 rounded-[7px] px-0.5 py-1.5 text-[13px] whitespace-nowrap',
            value === v
              ? 'bg-seg font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]'
              : 'text-soft',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function PersonDot({ color, size = 8 }: { color?: string | null; size?: number }) {
  return (
    <span
      className="inline-block flex-none rounded-full"
      style={{
        width: size,
        height: size,
        background: `var(--person-${color ?? 'mist'}, var(--person-mist))`,
      }}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}

// ---------- sheet ----------
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-[18px] bg-surface pb-safe sm:rounded-[18px] sm:shadow-xl"
      >
        <div className="mx-auto mt-2.5 mb-2 h-1 w-9 flex-none rounded-full bg-line" />
        <h2 id={titleId} className="flex-none px-5 pb-1.5 text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">{children}</div>
        {footer && (
          <div className="flex flex-none items-center justify-between gap-2 border-t border-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** A sheet of tappable actions (the trip menu). */
export function ActionList({
  actions,
}: {
  actions: {
    icon: IconName;
    label: string;
    onClick: () => void;
    danger?: boolean;
    hidden?: boolean;
  }[];
}) {
  return (
    <div className="flex flex-col">
      {actions
        .filter((a) => !a.hidden)
        .map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className={cx(
              'flex items-center gap-3.5 border-b border-line py-3.5 text-left text-base',
              a.danger ? 'text-danger' : 'text-ink',
            )}
          >
            <Icon name={a.icon} className={a.danger ? '' : 'text-soft'} />
            {a.label}
          </button>
        ))}
    </div>
  );
}

// ---------- page chrome ----------
export function PageHeader({
  title,
  back,
  action,
  sub,
}: {
  title: ReactNode;
  back?: string | true;
  action?: ReactNode;
  sub?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <header className="flex flex-col gap-1.5 px-5 pt-4 pb-2">
      {back && (
        <button
          onClick={() => (back === true ? nav(-1) : nav(back))}
          className="-ml-1.5 flex items-center gap-0.5 self-start py-1 text-[15px] text-soft"
        >
          <Icon name="back" size={18} /> Back
        </button>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-[28px] leading-tight font-semibold tracking-[-0.025em] text-balance">
          {title}
        </h1>
        {action}
      </div>
      {sub && <div className="text-sm text-soft">{sub}</div>}
    </header>
  );
}

/** A section header pill: tinted, bold, with an optional accent icon and trailing count or action. */
export function SectionLabel({
  children,
  icon,
  trailing,
  sticky,
}: {
  children: ReactNode;
  icon?: IconName;
  trailing?: ReactNode;
  sticky?: boolean;
}) {
  return (
    <div
      className={cx(
        'px-4 pt-6 pb-1',
        sticky && 'sticky top-[env(safe-area-inset-top,0px)] z-10 bg-bg',
      )}
    >
      <div className="flex items-center gap-2 rounded-full bg-accent-tint px-4 py-2">
        {icon && <Icon name={icon} size={15} className="text-accent" />}
        <span className="flex-1 text-[13px] font-semibold text-ink">{children}</span>
        {trailing}
      </div>
    </div>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      <p className="text-base font-medium">{title}</p>
      {children && <p className="max-w-[34ch] text-sm text-soft">{children}</p>}
      {action}
    </div>
  );
}

/** A full-width row link in a list. */
export function ListRow({
  onClick,
  children,
  trailing,
}: {
  onClick: () => void;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="mx-6 flex w-[calc(100%-3rem)] items-center gap-3.5 border-b border-line py-3.5 text-left"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
      {trailing ?? <Icon name="chevRight" className="text-faint" />}
    </button>
  );
}

/** True on wide screens (tablet and desktop). */
export function useIsWide(): boolean {
  const query = '(min-width: 640px)';
  const [wide, setWide] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * A menu opened from a button: a dropdown under the button on wide screens,
 * a bottom sheet on phones.
 */
export function Menu({
  open,
  onClose,
  anchor,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchor: DOMRect | null;
  title: ReactNode;
  children: ReactNode;
}) {
  const wide = useIsWide();
  useEffect(() => {
    if (!open || !wide) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [open, wide, onClose]);
  if (!open) return null;
  if (!wide || !anchor) {
    return (
      <Sheet open={open} onClose={onClose} title={title}>
        {children}
      </Sheet>
    );
  }
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        role="menu"
        className="absolute w-72 rounded-xl border border-line bg-surface px-4 py-1 shadow-xl"
        style={{ top: anchor.bottom + 6, right: Math.max(8, window.innerWidth - anchor.right) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="[&>div>button:last-child]:border-b-0">{children}</div>
      </div>
    </div>
  );
}

/** A subheading inside a section: plain bold text, aligned with the section's content. */
export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="px-6 pt-5 pb-2 text-sm font-semibold text-ink">{children}</h3>;
}
