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
      <main className="min-h-screen flex items-center justify-center p-6 bg-[#0A0B0F] text-slate-100">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12141D] p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300">
            !
          </div>
          <h1 className="text-lg font-semibold">The studio encountered an error</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Your saved projects are stored separately. Reload the studio to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Reload studio
          </button>
        </section>
      </main>
    );
  }
}
