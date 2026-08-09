import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "../../src/components/ErrorBoundary.js";

function Bomb(): never {
  throw new Error("boom: something in rendering broke");
}

/** Renders fine until `shouldThrow` becomes true, to exercise the componentDidUpdate focus
 * path specifically (an error appearing after some prior successful renders), distinct from
 * Bomb's always-throws-immediately case (which only ever exercises componentDidMount). */
function SometimesThrows({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("boom: broke on a later render");
  return <p>Fine for now</p>;
}

// React logs the caught error to the console via its own dev-mode error reporting on top of
// componentDidCatch's own console.error -- expected noise for these tests, not a real failure.
function silenceExpectedErrorLogs() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("catches a rendering error and shows a recovery screen instead of a blank page", () => {
    silenceExpectedErrorLogs();
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /return to upload screen/i })).toBeInTheDocument();
    // The technical detail is present but tucked away, not thrown in the user's face.
    expect(screen.getByText("boom: something in rendering broke")).toBeInTheDocument();
  });

  it("moves keyboard focus to the recovery screen, matching ErrorPanel/DownloadPanel's own pattern", () => {
    silenceExpectedErrorLogs();
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toHaveFocus();
  });

  it("also moves focus when the error appears on a later render, not just the first", () => {
    silenceExpectedErrorLogs();
    const { rerender } = render(
      <ErrorBoundary>
        <SometimesThrows shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Fine for now")).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <SometimesThrows shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByText("boom: broke on a later render")).toBeInTheDocument();
  });

  it('"Return to upload screen" resets the route and reloads the page', async () => {
    silenceExpectedErrorLogs();
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, hash: "#/about", reload: reloadSpy });

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    await userEvent.click(screen.getByRole("button", { name: /return to upload screen/i }));

    expect(window.location.hash).toBe("");
    expect(reloadSpy).toHaveBeenCalledOnce();
  });
});
