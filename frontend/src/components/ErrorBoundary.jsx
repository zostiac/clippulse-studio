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
      <main className="min-h-screen flex items-center justify-center p-6 bg-[#faf8ff] text-[#131b2e]">
        <section className="w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-6 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#ffdad6] text-[#ba1a1a]">
            <span className="material-symbols-outlined text-[24px]">error</span>
          </div>
          <h1 className="text-lg font-semibold text-[#0f172a]">The studio encountered an error</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#64748b]">
            Your saved projects are stored separately. Reload the studio to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-[#b45309] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#903f00]"
          >
            Reload studio
          </button>
        </section>
      </main>
    );
  }
}
