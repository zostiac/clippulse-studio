import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
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
