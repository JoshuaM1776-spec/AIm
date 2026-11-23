import { ArrowLeft, ArrowRight, ChevronRight, CircleAlert, Loader, X } from "lucide-react";
import { type ButtonHTMLAttributes, type ComponentType, type ReactNode, useEffect, useId, useRef } from "react";
import { Link, type LinkProps, useNavigate } from "react-router";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

/** The page column: phone-width, centred on larger screens. */
export function Page({ children, className = "", wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <main id="main" className={cx("mx-auto flex min-h-dvh w-full flex-col px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]",
      wide ? "max-w-3xl" : "max-w-[30rem]", className)}>
      {children}
    </main>
  );
}

/** Back arrow, optional centre content (progress), optional right content. */
export function TopBar({ back, backLabel = "Back", center, right }: { back?: string | (() => void); backLabel?: string; center?: ReactNode; right?: ReactNode }) {
  const navigate = useNavigate();
  const onBack = typeof back === "function" ? back : back ? () => navigate(back) : () => navigate(-1);
  return (
    <div className="flex h-12 items-center gap-3">
      <button type="button" onClick={onBack} aria-label={backLabel}
        className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-paper-deep">
        <ArrowLeft size={22} strokeWidth={1.8} />
      </button>
      <div className="flex min-w-0 flex-1 justify-center">{center}</div>
      <div className="flex min-w-11 shrink-0 justify-end text-sm font-semibold text-ink">{right}</div>
    </div>
  );
}

/** A subtle segmented progress bar, as in the story cards. */
export function Segments({ total, current, label }: { total: number; current: number; label?: string }) {
  return (
    <div className="flex w-full max-w-48 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current}
      aria-label={label ?? `Card ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx("h-1.5 flex-1 rounded-full transition-colors duration-300", i < current ? "bg-button" : "bg-line")} />
      ))}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-button text-[#f8f1e6] shadow-[0_2px_0_rgba(0,0,0,.18),inset_0_1px_0_rgba(255,255,255,.08)] hover:bg-button-hover active:translate-y-px disabled:opacity-50",
  secondary: "border border-line bg-card text-ink hover:border-bronze-soft disabled:opacity-50",
  ghost: "text-bronze hover:bg-paper-deep disabled:opacity-50",
  danger: "border border-danger/30 bg-danger-wash text-danger hover:border-danger disabled:opacity-50",
};
const sizes = { md: "min-h-11 px-5 text-[0.95rem]", lg: "min-h-14 px-7 text-[1.15rem] font-serif" };

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: "md" | "lg"; arrow?: boolean; busy?: boolean; icon?: ComponentType<{ size?: number }> }

export function Button({ variant = "primary", size = "md", arrow, busy, icon: Icon, className = "", children, disabled, ...rest }: BtnProps) {
  return (
    <button type="button" {...rest} disabled={disabled || busy} aria-busy={busy || undefined}
      className={cx("inline-flex items-center justify-center gap-2 rounded-full font-medium transition", variants[variant], sizes[size], className)}>
      {busy ? <Loader size={18} className="animate-spin" aria-hidden /> : Icon ? <Icon size={18} /> : null}
      {children}
      {arrow && !busy && <ArrowRight size={size === "lg" ? 20 : 17} strokeWidth={1.8} aria-hidden />}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", arrow, className = "", children, ...rest }: LinkProps & { variant?: Variant; size?: "md" | "lg"; arrow?: boolean }) {
  return (
    <Link {...rest} className={cx("inline-flex items-center justify-center gap-2 rounded-full font-medium transition", variants[variant], sizes[size], className)}>
      {children}
      {arrow && <ArrowRight size={size === "lg" ? 20 : 17} strokeWidth={1.8} aria-hidden />}
    </Link>
  );
}

/** The round "next" button at the bottom right of a story card. */
export function NextCircle({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="grid h-12 w-12 place-items-center rounded-full border-2 border-ink/80 bg-card/70 text-ink backdrop-blur hover:bg-card">
      <ArrowRight size={22} strokeWidth={1.8} />
    </button>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-line bg-card px-3 py-1 text-sm font-medium text-ink-soft">{children}</span>;
}

export function Card({ children, className = "", as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "li" }) {
  return <As className={cx("rounded-2xl border border-line bg-card/80", className)}>{children}</As>;
}

export function NavRow({ to, icon: Icon, children, hint }: { to: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; children: ReactNode; hint?: string }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-4 rounded-2xl border border-line bg-card/80 px-4 text-ink transition hover:border-bronze-soft">
      <span className="text-bronze"><Icon size={22} strokeWidth={1.7} /></span>
      <span className="flex-1">
        <span className="block font-medium">{children}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <ChevronRight size={20} className="text-muted" aria-hidden />
    </Link>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted" role="status">
      <Loader size={18} className="animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry, className = "" }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cx("flex items-start gap-3 rounded-xl border border-danger/25 bg-danger-wash px-4 py-3 text-sm text-danger", className)}>
      <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && <button type="button" onClick={onRetry} className="mt-1 font-semibold underline underline-offset-2">Try again</button>}
      </div>
    </div>
  );
}

export function Notice({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-line bg-bronze-wash/60 px-4 py-3 text-sm text-ink-soft", className)}>{children}</div>;
}

export function ScreenTitle({ eyebrow, title, subtitle, icon }: { eyebrow?: string; title: string; subtitle?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="mt-2 text-center">
      {icon && <div className="mb-2 flex justify-center text-bronze">{icon}</div>}
      {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
      <h1 className="text-[2.1rem] leading-tight">{title}</h1>
      {subtitle && <p className="mx-auto mt-2 max-w-xs text-[0.98rem] text-ink-soft">{subtitle}</p>}
    </header>
  );
}

/** An accessible modal dialog: focus moves in, Escape closes, focus returns afterwards. */
export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>("[data-autofocus], button, textarea, input, select, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const f = [...el.querySelectorAll<HTMLElement>("button, textarea, input, select, a[href]")].filter(x => !x.hasAttribute("disabled"));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 sm:items-center sm:p-6 anim-fade" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id}
        className="max-h-[92dvh] w-full max-w-[30rem] overflow-y-auto rounded-t-3xl border border-line bg-paper px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id={id} className="pt-1 text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid h-11 w-11 place-items-center rounded-full hover:bg-paper-deep">
            <X size={20} />
          </button>
        </div>
        <div className="mt-2">{children}</div>
        {footer && <div className="mt-5 flex flex-col gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export const inputClass = "w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-ink placeholder:text-muted/70 focus:border-bronze focus:outline-none";
