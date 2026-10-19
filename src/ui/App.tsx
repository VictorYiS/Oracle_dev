// Title screen or game. Owns the loaded pack, the language and the running session.
import { useEffect, useRef, useState } from "preact/hooks";
import { DEFAULT_PACK } from "../app/config";
import { installDebug } from "../app/debug";
import { chooseLanguage, offeredLanguages, storeLanguage } from "../app/lang";
import { assembleWithBundledParents, loadBundledPack, rawPackFromFiles } from "../app/packs";
import { Session } from "../app/session";
import { readSave } from "../app/storage";
import type { Pack, PackIssue } from "../core/content/pack";
import { SaveError } from "../core/game/game";
import { UiContext } from "./context";
import { GameScreen } from "./game/GameScreen";
import { type Later, type Messages, messages } from "./i18n";
import { TitleScreen } from "./TitleScreen";

type PackState =
  { status: "loading" } | { status: "ok"; pack: Pack } | { status: "error"; issues: PackIssue[] };

const randomSeed = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
};

export function App() {
  const [packState, setPackState] = useState<PackState>({ status: "loading" });
  const [importedFrom, setImportedFrom] = useState<string | null>(null);
  const [problems, setProblems] = useState<PackIssue[] | null>(null);
  // Which message, not its text: the title screen has a language switch.
  const [message, setMessage] = useState<Later | null>(null);
  const [lang, setLangState] = useState(() => chooseLanguage(["en", "zh-CN"]));
  const [session, setSessionState] = useState<Session | null>(null);
  const [hasBrowserSave, setHasBrowserSave] = useState(false);
  // The session the debug hook and saves see: updated the moment a session starts, not after
  // the next render, so nothing can observe a gap between the screen and the game.
  const live = useRef<Session | null>(null);
  const running = useRef<Session | null>(null);
  const setSession = (next: Session | null) => {
    live.current = next;
    setSessionState(next);
  };
  const packRef = useRef<Pack | null>(null);

  const pack = packState.status === "ok" ? packState.pack : null;
  packRef.current = pack;
  const offered = offeredLanguages(pack?.languages ?? ["en", "zh-CN"]);
  const m = messages(lang);

  const setLang = (next: string) => {
    storeLanguage(next);
    setLangState(next);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    void loadBundledPack(DEFAULT_PACK).then((r) => {
      if (r.ok) {
        setPackState({ status: "ok", pack: r.pack });
        setLangState(chooseLanguage(r.pack.languages));
      } else setPackState({ status: "error", issues: r.issues });
    });
    installDebug(
      () => live.current,
      (seed) => {
        if (!packRef.current) return false;
        setSession(Session.newGame(packRef.current, seed));
        return true;
      },
    );
  }, []);

  useEffect(() => {
    if (!pack) return;
    void readSave(Session.slotFor(pack)).then((s) => setHasBrowserSave(Boolean(s)));
  }, [pack, session]);

  // Run exactly one session at a time.
  useEffect(() => {
    running.current?.stop();
    running.current = session;
    session?.start();
    return () => session?.stop();
  }, [session]);

  const saveError = (e: unknown) =>
    setMessage(
      () => (t: Messages) =>
        e instanceof SaveError ? t.saveMenu.errors[e.code] : t.saveMenu.errors.NOT_A_SAVE,
    );

  let screen;
  if (packState.status === "loading") {
    screen = (
      <main class="screen">
        <p class="muted">{m.title.loading}</p>
      </main>
    );
  } else if (packState.status === "error") {
    screen = (
      <main class="screen">
        <h1 class="title">{m.packError}</h1>
        <ul class="issues" lang="en">
          {packState.issues.map((i) => (
            <li key={`${i.file}${i.path}${i.message}`}>
              <code>{i.file}</code> · {i.path}: {i.message}
            </li>
          ))}
        </ul>
      </main>
    );
  } else if (session) {
    screen = <GameScreen session={session} onReplace={setSession} />;
  } else {
    screen = (
      <TitleScreen
        pack={packState.pack}
        importedFrom={importedFrom}
        hasBrowserSave={hasBrowserSave}
        problems={problems}
        message={message?.(m) ?? null}
        onNewGame={() => setSession(Session.newGame(packState.pack, randomSeed()))}
        onContinue={async () => {
          try {
            const loaded = await Session.fromBrowser(packState.pack);
            if (loaded) setSession(loaded);
            else setMessage(() => (t: Messages) => t.saveMenu.noSave);
          } catch (e) {
            saveError(e);
          }
        }}
        onOpenSave={async (file) => {
          try {
            setSession(Session.fromSave(packState.pack, JSON.parse(await file.text())));
          } catch (e) {
            saveError(e);
          }
        }}
        onImport={async (files) => {
          setProblems(null);
          setMessage(null);
          try {
            const raw = await rawPackFromFiles(files);
            const result = await assembleWithBundledParents(raw);
            if (!result.ok) {
              setProblems(result.issues);
              return;
            }
            setImportedFrom(raw.origin);
            setPackState({ status: "ok", pack: result.pack });
            setLangState(chooseLanguage(result.pack.languages));
          } catch {
            setMessage(() => (t: Messages) => t.title.noManifest);
          }
        }}
      />
    );
  }

  return <UiContext.Provider value={{ m, lang, offered, setLang }}>{screen}</UiContext.Provider>;
}
