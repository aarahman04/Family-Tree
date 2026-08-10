import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { FamilyTree } from "../../../models/types.js";

/** One imported family tree plus the name of the file it came from. */
export interface TreeSession {
  tree: FamilyTree;
  fileName: string;
}

interface TreeSessionContextValue {
  session: TreeSession | undefined;
  setSession: (session: TreeSession) => void;
  clearSession: () => void;
}

const TreeSessionContext = createContext<TreeSessionContextValue | undefined>(undefined);

/**
 * App-level holder for the currently-loaded tree, so it survives navigation between the
 * upload page (#/) and the full-screen editor (#/editor) without a re-import. Kept in
 * memory only — nothing is persisted here (autosave to localStorage is a later phase).
 */
export function TreeSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<TreeSession | undefined>(undefined);
  const setSession = useCallback((next: TreeSession) => setSessionState(next), []);
  const clearSession = useCallback(() => setSessionState(undefined), []);
  const value = useMemo(
    () => ({ session, setSession, clearSession }),
    [session, setSession, clearSession]
  );
  return <TreeSessionContext.Provider value={value}>{children}</TreeSessionContext.Provider>;
}

export function useTreeSession(): TreeSessionContextValue {
  const value = useContext(TreeSessionContext);
  if (!value) throw new Error("useTreeSession must be used within a TreeSessionProvider");
  return value;
}
