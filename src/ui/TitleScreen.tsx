// The first screen: the scenario's name, where the game is running, and the ways in.
import { useEffect, useRef, useState } from "preact/hooks";
import { detectChannel, hasClaudeSampling } from "../app/channel";
import { BUILD_ID, REPO_URL } from "../app/config";
import { text, type Pack, type PackIssue } from "../core/content/pack";
import { useUi } from "./context";
import { fmt } from "./i18n";
import { LanguageSwitch } from "./LanguageSwitch";

type Glyph = "seen" | "reading" | "narrated";
const GLYPH: Record<Glyph, string> = { seen: "◉", reading: "⚙", narrated: "◇" };

function Reading(props: { glyph: Glyph; label: string; value: string }) {
  const { m } = useUi();
  const name = m.provenance[props.glyph];
  return (
    <div class="reading">
      <span class={`glyph glyph-${props.glyph}`} title={name} aria-label={name}>
        {GLYPH[props.glyph]}
      </span>
      <span class="reading-label">{props.label}</span>
      <span class="reading-value">{props.value}</span>
    </div>
  );
}

interface Props {
  pack: Pack;
  importedFrom: string | null;
  hasBrowserSave: boolean;
  problems: PackIssue[] | null;
  message: string | null;
  onNewGame(): void;
  onContinue(): void;
  onOpenSave(file: File): void;
  onImport(files: File[]): void;
}

export function TitleScreen(props: Props) {
  const { m, lang } = useUi();
  const channel = detectChannel();
  const [sampling, setSampling] = useState<boolean | null>(null);
  const saveInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void hasClaudeSampling().then(setSampling);
    // webkitdirectory is not in Preact's JSX types; set it directly.
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);
  const { pack } = props;
  const oracleStatus = sampling === null ? m.checking : sampling ? m.oracleClaude : m.oracleOffline;
  const picked = (e: Event) => {
    const files = [...((e.currentTarget as HTMLInputElement).files ?? [])];
    (e.currentTarget as HTMLInputElement).value = "";
    if (files.length) props.onImport(files);
  };

  return (
    <main class="screen">
      <div class="fog" aria-hidden="true" />
      <LanguageSwitch />
      <header class="masthead">
        <p class="wordmark">{m.title.wordmark}</p>
        <h1 class="title">{text(pack, pack.manifest.title, lang)}</h1>
        {pack.manifest.tagline && <p class="tagline">{text(pack, pack.manifest.tagline, lang)}</p>}
        {props.importedFrom && <p class="muted">{fmt(m.title.imported, { name: props.importedFrom })}</p>}
      </header>

      <div class="ways-in">
        <button type="button" class="primary" data-testid="new-game" onClick={props.onNewGame}>
          {m.title.newGame}
        </button>
        {props.hasBrowserSave && (
          <button type="button" data-testid="continue" onClick={props.onContinue}>
            {m.title.continue}
          </button>
        )}
        <button type="button" onClick={() => saveInput.current?.click()}>
          {m.title.openSave}
        </button>
        <input
          ref={saveInput}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="title-open-save"
          onChange={(e) => {
            const f = (e.currentTarget as HTMLInputElement).files?.[0];
            if (f) props.onOpenSave(f);
          }}
        />
      </div>

      <details class="import">
        <summary>{m.title.importPack}</summary>
        <p class="muted">{m.title.importHint}</p>
        <div class="ways-in">
          <button type="button" onClick={() => folderInput.current?.click()}>
            {m.title.importFolder}
          </button>
          <button type="button" onClick={() => zipInput.current?.click()}>
            {m.title.importZip}
          </button>
        </div>
        <input ref={folderInput} type="file" multiple hidden data-testid="import-folder" onChange={picked} />
        <input ref={zipInput} type="file" accept=".zip" hidden data-testid="import-zip" onChange={picked} />
      </details>

      {props.message && (
        <p class="warn" role="alert">
          {props.message}
        </p>
      )}
      {props.problems && (
        <div class="problems" role="alert" data-testid="pack-problems">
          <p>{m.title.problems}</p>
          <ul class="issues" lang="en">
            {props.problems.map((i) => (
              <li key={`${i.file}${i.path}${i.message}`}>
                <code>{i.file}</code> · <code>{i.path}</code>: {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section class="readings" aria-label={m.oracle}>
        <Reading glyph="seen" label={m.build} value={BUILD_ID} />
        <Reading glyph="reading" label={m.channel} value={m.channels[channel]} />
        <Reading glyph="narrated" label={m.oracle} value={oracleStatus} />
      </section>

      <footer class="footnote">
        <p>{m.stage}</p>
        <p>{m.next}</p>
        <p>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {m.source}
          </a>
        </p>
      </footer>
    </main>
  );
}
