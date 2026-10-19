import { createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import type { Session } from "../app/session";
import { en } from "./i18n/en";
import type { Messages } from "./i18n";

export interface Ui {
  m: Messages;
  lang: string;
  /** Languages this pack and the UI both ship. */
  offered: string[];
  setLang(lang: string): void;
}

export const UiContext = createContext<Ui>({ m: en, lang: "en", offered: ["en"], setLang: () => {} });

export const useUi = (): Ui => useContext(UiContext);

/** Re-render when the session changes, at most once per animation frame. */
export function useRevision(session: Session): number {
  const [revision, setRevision] = useState(session.revision);
  useEffect(() => {
    let queued = false;
    const unsubscribe = session.subscribe(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        setRevision(session.revision);
      });
    });
    return unsubscribe;
  }, [session]);
  return revision;
}
