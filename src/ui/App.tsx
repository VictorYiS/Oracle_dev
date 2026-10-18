import { useEffect, useState } from "preact/hooks";
import { text, type PackResult } from "../core/content/pack";
import { detectChannel, hasClaudeSampling } from "../app/channel";
import { BUILD_ID, REPO_URL } from "../app/config";
import { chooseLanguage, offeredLanguages, storeLanguage } from "../app/lang";
import { messages, UI_LANGUAGES, type Messages } from "./i18n";

type Glyph = "seen" | "reading" | "narrated";
const GLYPH: Record<Glyph, string> = { seen: "◉", reading: "⚙", narrated: "◇" };

function Reading(props: { m: Messages; glyph: Glyph; label: string; value: string }) {
  const name = props.m.provenance[props.glyph];
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

function LanguageSwitch(props: {
  m: Messages;
  offered: string[];
  current: string;
  onChange(l: string): void;
}) {
  if (props.offered.length < 2) return null;
  return (
    <nav class="language" aria-label={props.m.language}>
      {props.offered.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={lang === props.current}
          onClick={() => props.onChange(lang)}
        >
          {UI_LANGUAGES[lang]?.name ?? lang}
        </button>
      ))}
    </nav>
  );
}

export function App(props: { pack: PackResult }) {
  const packLanguages = props.pack.ok ? props.pack.pack.languages : ["en"];
  const offered = offeredLanguages(packLanguages);
  const [lang, setLang] = useState(() => chooseLanguage(packLanguages));
  const m = messages(lang);
  const channel = detectChannel();
  const [sampling, setSampling] = useState<boolean | null>(null);

  useEffect(() => {
    void hasClaudeSampling().then(setSampling);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const changeLanguage = (next: string) => {
    storeLanguage(next);
    setLang(next);
  };

  if (!props.pack.ok) {
    return (
      <main class="screen">
        <h1 class="title">{m.packError}</h1>
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
  const oracleStatus = sampling === null ? m.checking : sampling ? m.oracleClaude : m.oracleOffline;

  return (
    <main class="screen">
      <div class="fog" aria-hidden="true" />
      <LanguageSwitch m={m} offered={offered} current={lang} onChange={changeLanguage} />
      <header class="masthead">
        <p class="wordmark">ORACLE</p>
        <h1 class="title">{text(pack, pack.manifest.title, lang)}</h1>
        {pack.manifest.tagline && <p class="tagline">{text(pack, pack.manifest.tagline, lang)}</p>}
      </header>

      <section class="readings" aria-label={m.oracle}>
        <Reading m={m} glyph="seen" label={m.build} value={BUILD_ID} />
        <Reading m={m} glyph="reading" label={m.channel} value={m.channels[channel]} />
        <Reading m={m} glyph="narrated" label={m.oracle} value={oracleStatus} />
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
