import React, { useEffect, useRef, useState } from "react";

/*
 * In-app dialogs styled per DESIGN.md "Level 3" (modals & context menus):
 * pristine white surface, #CBD5E1 border, slate glaze backdrop.
 */

function DialogShell({ title, children, onCancel, labelledBy }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onCancel}
        className="absolute inset-0 bg-[rgba(248,249,250,0.85)] backdrop-blur-[12px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative w-full max-w-md rounded-lg bg-white border border-ink-300 p-5 shadow-[0_20px_32px_-8px_rgba(15,23,42,0.08),0_8px_16px_-4px_rgba(15,23,42,0.04)]"
      >
        <h2 id={labelledBy} className="font-title-md text-title-md text-ink">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);
  if (!open) return null;

  return (
    <DialogShell title={title} onCancel={onCancel} labelledBy="cp-confirm-title">
      <p className="mt-2 font-body-sm text-body-sm text-ink-muted leading-relaxed">{message}</p>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white border border-line text-ink-deep font-body-sm text-body-sm font-medium hover:bg-paper-cool transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          className={
            danger
              ? "px-4 py-2 rounded-lg bg-error-soft border border-error-line text-error-deep font-body-sm text-body-sm font-semibold hover:bg-error-tint transition-colors"
              : "px-4 py-2 rounded-lg bg-accent text-white font-body-sm text-body-sm font-semibold hover:bg-accent-600 transition-colors shadow-sm"
          }
        >
          {confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}

export function PromptDialog({
  open,
  title,
  message,
  placeholder = "",
  initialValue = "",
  submitLabel = "Add",
  cancelLabel = "Cancel",
  onSubmit,
  onCancel,
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef(null);
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      // Focus after the dialog paints.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onSubmit?.(v);
  };

  return (
    <DialogShell title={title} onCancel={onCancel} labelledBy="cp-prompt-title">
      {message ? <p className="mt-2 font-body-sm text-body-sm text-ink-muted leading-relaxed">{message}</p> : null}
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        className="mt-3 w-full px-3 py-2 rounded-lg bg-paper-cool border border-line text-ink font-body-sm text-body-sm placeholder:text-ink-faint focus:border-accent focus:bg-white transition-colors"
      />
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white border border-line text-ink-deep font-body-sm text-body-sm font-medium hover:bg-paper-cool transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={submit}
          className="px-4 py-2 rounded-lg bg-accent text-white font-body-sm text-body-sm font-semibold hover:bg-accent-600 transition-colors shadow-sm"
        >
          {submitLabel}
        </button>
      </div>
    </DialogShell>
  );
}
