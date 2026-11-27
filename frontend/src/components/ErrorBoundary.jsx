import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ClipPulse Studio UI crashed:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-surface text-on-surface">
        <section className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center shadow-[0_20px_32px_-8px_rgba(15,23,42,0.08)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-error-container text-on-error-container">
            <span className="material-symbols-outlined text-[24px]">error</span>
          </div>
          <h1 className="text-lg font-semibold">The studio encountered an error</h1>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            {this.state.error?.message ? (
              <span className="block font-label-sm text-label-sm text-error-deep bg-error-soft border border-error-line rounded px-2 py-1.5 mt-2 break-words text-left">
                {String(this.state.error.message).slice(0, 300)}
              </span>
            ) : null}
            Your saved projects are stored separately. Reload the studio to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-primary-container px-4 py-2.5 text-sm font-semibold text-on-primary-container transition hover:bg-primary"
          >
            Reload studio
          </button>
        </section>
      </main>
    );
  }
}
