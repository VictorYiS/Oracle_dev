import { useEffect, useState } from "preact/hooks";
import { text, type PackResult } from "../core/content/pack";
import { detectChannel, hasClaudeSampling } from "../app/channel";
import { BUILD_ID, REPO_URL } from "../app/config";
import { ui } from "./strings";

type Glyph = "seen" | "reading" | "narrated";
const GLYPH: Record<Glyph, string> = { seen: "◉", reading: "⚙", narrated: "◇" };

function Reading(props: { glyph: Glyph; label: string; value: string }) {
  return (
    <div class="reading">
      <span
        class={`glyph glyph-${props.glyph}`}
        title={ui.provenance[props.glyph]}
        aria-label={ui.provenance[props.glyph]}
      >
        {GLYPH[props.glyph]}
      </span>
      <span class="reading-label">{props.label}</span>
      <span class="reading-value">{props.value}</span>
    </div>
  );
}

export function App(props: { pack: PackResult }) {
  const channel = detectChannel();
  const [sampling, setSampling] = useState<boolean | null>(null);
  useEffect(() => {
    void hasClaudeSampling().then(setSampling);
  }, []);

  if (!props.pack.ok) {
    return (
      <main class="screen">
        <h1 class="title">{ui.packError}</h1>
        <ul class="issues">
          {props.pack.issues.map((i) => (
            <li key={`${i.file}${i.path}${i.message}`}>
              <code>{i.file}</code> · {i.path}: {i.message}
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const { pack } = props.pack;
  const oracleStatus = sampling === null ? ui.checking : sampling ? ui.oracleClaude : ui.oracleOffline;

  return (
    <main class="screen">
      <div class="fog" aria-hidden="true" />
      <header class="masthead">
        <p class="wordmark">ORACLE</p>
        <h1 class="title">{text(pack, pack.manifest.title)}</h1>
        {pack.manifest.tagline && <p class="tagline">{text(pack, pack.manifest.tagline)}</p>}
      </header>

      <section class="readings" aria-label="status">
        <Reading glyph="seen" label={ui.build} value={BUILD_ID} />
        <Reading glyph="reading" label={ui.channel} value={ui.channels[channel]} />
        <Reading glyph="narrated" label={ui.oracle} value={oracleStatus} />
      </section>

      <footer class="footnote">
        <p>{ui.stage}</p>
        <p>{ui.next}</p>
        <p>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {ui.source}
          </a>
        </p>
      </footer>
    </main>
  );
}
