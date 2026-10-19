import { useUi } from "./context";
import { UI_LANGUAGES } from "./i18n";

export function LanguageSwitch(props: { class?: string }) {
  const { m, lang, offered, setLang } = useUi();
  if (offered.length < 2) return null;
  return (
    <nav class={props.class ?? "language"} aria-label={m.language}>
      {offered.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={l === lang} onClick={() => setLang(l)}>
          {UI_LANGUAGES[l]?.name ?? l}
        </button>
      ))}
    </nav>
  );
}
