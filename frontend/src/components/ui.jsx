import React, { useId } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

/** Shared form and feedback primitives, so every screen speaks the same visual language. */

export const inputClass =
  "w-full px-3 py-2 rounded-lg bg-sunken border border-line text-sm text-ink placeholder:text-faint " +
  "hover:border-line-strong focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors";

const BUTTON_STYLES = {
  primary: "bg-accent hover:bg-accent-hover text-on-accent border border-transparent",
  secondary: "bg-raised hover:bg-ink/5 text-ink border border-line hover:border-line-strong",
  ghost: "bg-transparent hover:bg-ink/8 text-muted hover:text-ink border border-transparent",
  danger: "bg-transparent hover:bg-bad/10 text-bad border border-bad/40",
};

const BUTTON_SIZES = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-5 py-2.5 text-sm gap-2",
};

export function Button({ variant = "secondary", size = "md", className = "", children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none ${BUTTON_STYLES[variant]} ${BUTTON_SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}

const NOTICE_STYLES = {
  info: { box: "bg-accent/10 border-accent/30 text-ink", icon: "text-accent", Icon: Info },
  ok: { box: "bg-ok/10 border-ok/30 text-ink", icon: "text-ok", Icon: CheckCircle2 },
  warn: { box: "bg-warn/10 border-warn/35 text-ink", icon: "text-warn", Icon: AlertTriangle },
  error: { box: "bg-bad/10 border-bad/35 text-ink", icon: "text-bad", Icon: AlertTriangle },
};

export function Notice({ tone = "info", title, children, actions, onDismiss }) {
  const s = NOTICE_STYLES[tone];
  return (
    <div
      role={tone === "error" || tone === "warn" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm ${s.box}`}
    >
      <s.Icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.icon}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="text-muted leading-relaxed">{children}</div>}
        {actions && <div className="flex flex-wrap gap-2 pt-1.5">{actions}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 p-1 -m-1 rounded text-muted hover:text-ink hover:bg-ink/10"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export function Field({ label, hint, htmlFor, children }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-faint leading-relaxed">{hint}</p>}
    </div>
  );
}

/** Accessible on/off switch with a visible label and description. */
export function Toggle({ checked, onChange, label, description }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink cursor-pointer">
          {label}
        </label>
        {description && <p className="text-xs text-faint mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-10 h-6 rounded-full border transition-colors ${
          checked ? "bg-accent border-accent" : "bg-sunken border-line-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-sm transition-transform ${
            checked ? "translate-x-4 bg-on-accent" : "translate-x-0 bg-faint"
          }`}
        />
      </button>
    </div>
  );
}

/** Single-choice group rendered as connected buttons. */
export function Segmented({ value, onChange, options, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-sunken p-0.5 gap-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              active ? "bg-raised text-ink shadow-sm border border-line" : "text-muted hover:text-ink border border-transparent"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
