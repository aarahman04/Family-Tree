import { Component, createRef, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level safety net: catches any uncaught rendering error anywhere below it and shows a
 * recovery screen instead of React's default -- unmounting the whole tree to a blank white
 * page. This matters specifically because there is no autosave (see
 * web/src/lib/unsavedEdits.ts): without it, a single rendering bug anywhere would silently
 * destroy a user's in-session edits with no way back and no explanation.
 *
 * Must be a class component -- componentDidCatch/getDerivedStateFromError have no hook
 * equivalent in React as of version 18, so this is the one place in the app that isn't
 * function-and-hooks by necessity, not by choice.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  // Every other transient panel in this app (ErrorPanel, DownloadPanel, ...) moves keyboard
  // focus to itself on mount via the useAutoFocus hook, so a keyboard/screen-reader user
  // lands on it immediately instead of staying wherever focus happened to be. This can't
  // reuse that hook -- it's a class component, which error boundaries are required to be --
  // so componentDidUpdate below replicates the same behavior manually instead of skipping it.
  private headingRef = createRef<HTMLDivElement>();

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Last-resort diagnostic -- there's no error-reporting service to send this to instead.
    console.error("Unexpected rendering error:", error, info.componentStack);
  }

  // Two hooks, covering both ways the error state can first appear: componentDidMount fires
  // when a child throws during this boundary's very first render (there's no prior commit
  // for componentDidUpdate to compare against in that case); componentDidUpdate covers an
  // error thrown later, after some number of successful renders already happened.
  componentDidMount(): void {
    if (this.state.error) {
      this.headingRef.current?.focus();
    }
  }

  componentDidUpdate(_prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState): void {
    if (this.state.error && !prevState.error) {
      this.headingRef.current?.focus();
    }
  }

  handleReturnToUpload = (): void => {
    // A full reload, not just clearing local component state, is deliberate: an error this
    // boundary catches means some part of the React tree's state can no longer be trusted,
    // so the only honest recovery is a genuinely fresh start, not a partial one that risks
    // re-entering the same broken state. The original uploaded file was never touched by
    // this (or any) error -- only in-session edits, which by design exist only in memory.
    window.location.hash = "";
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        ref={this.headingRef}
        tabIndex={-1}
        className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center"
        role="alert"
      >
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Something went wrong
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          The application ran into an unexpected error and can't safely continue from here. Your
          original file was never modified by this — it never is — but any unsaved edits in this
          browser session could not be recovered.
        </p>
        <button
          type="button"
          onClick={this.handleReturnToUpload}
          className="mx-auto rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Return to upload screen
        </button>
        <details className="mt-2 text-left text-xs text-slate-500 dark:text-slate-400">
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{error.message}</pre>
        </details>
      </div>
    );
  }
}
