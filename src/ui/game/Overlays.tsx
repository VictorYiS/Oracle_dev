// Small dialogs over the street: the save menu, settings and the key help.
import { useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { SaveError } from "../../core/game/game";
import { Session } from "../../app/session";
import { useUi } from "../context";
import type { Later, Messages } from "../i18n";

export function Dialog(props: {
  title: string;
  onClose(): void;
  closeLabel: string;
  children: ComponentChildren;
  testid: string;
  class?: string;
}) {
  return (
    <div
      class={`overlay ${props.class ?? ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      data-testid={props.testid}
    >
      <div class="dialog">
        <header>
          <h2>{props.title}</h2>
          <button type="button" data-testid={`${props.testid}-close`} onClick={props.onClose}>
            {props.closeLabel}
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SaveMenu(props: { session: Session; onLoaded(session: Session): void; onClose(): void }) {
  const { m } = useUi();
  // Which message to show, not its text: the menu can stay open while the language changes.
  const [status, setStatus] = useState<Later | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const { session } = props;
  const errorText =
    (e: unknown): Later =>
    (t) =>
      e instanceof SaveError ? t.saveMenu.errors[e.code] : t.saveMenu.errors.NOT_A_SAVE;

  return (
    <Dialog title={m.saveMenu.title} onClose={props.onClose} closeLabel={m.saveMenu.close} testid="save-menu">
      <div class="stack">
        <button
          type="button"
          data-testid="save-here"
          onClick={async () => {
            const ok = await session.saveToBrowser();
            // A state setter calls a function argument, so the message picker is wrapped once.
            setStatus(() => (t: Messages) => (ok ? t.saveMenu.saved : t.saveMenu.saveFailed));
          }}
        >
          {m.saveMenu.saveHere}
        </button>
        <button
          type="button"
          data-testid="load-here"
          onClick={async () => {
            try {
              const loaded = await Session.fromBrowser(session.pack);
              if (!loaded) return setStatus(() => (t: Messages) => t.saveMenu.noSave);
              props.onLoaded(loaded);
            } catch (e) {
              setStatus(() => errorText(e));
            }
          }}
        >
          {m.saveMenu.loadHere}
        </button>
        <button
          type="button"
          data-testid="download-save"
          onClick={() =>
            download(
              `oracle-${session.pack.manifest.id}-day${session.world.clock.day}.json`,
              session.saveText(),
            )
          }
        >
          {m.saveMenu.download}
        </button>
        <button type="button" onClick={() => file.current?.click()}>
          {m.saveMenu.open}
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="open-save-file"
          onChange={async (e) => {
            const picked = (e.currentTarget as HTMLInputElement).files?.[0];
            if (!picked) return;
            try {
              props.onLoaded(Session.fromSave(session.pack, JSON.parse(await picked.text())));
            } catch (err) {
              setStatus(() => errorText(err));
            }
          }}
        />
        {status && (
          <p role="status" data-testid="save-status">
            {status(m)}
          </p>
        )}
      </div>
    </Dialog>
  );
}

export function SettingsDialog(props: {
  reduceMotion: boolean;
  setReduceMotion(on: boolean): void;
  onClose(): void;
}) {
  const { m } = useUi();
  return (
    <Dialog title={m.settings.title} onClose={props.onClose} closeLabel={m.settings.close} testid="settings">
      <label class="toggle">
        <input
          type="checkbox"
          data-testid="reduce-motion"
          checked={props.reduceMotion}
          onChange={(e) => props.setReduceMotion((e.currentTarget as HTMLInputElement).checked)}
        />
        <span>{m.settings.reduceMotion}</span>
      </label>
      <p class="muted">{m.settings.reduceMotionHint}</p>
    </Dialog>
  );
}

export function HelpOverlay(props: { onClose(): void }) {
  const { m } = useUi();
  const rows = Object.keys(m.help.keys) as (keyof Messages["help"]["keys"])[];
  return (
    <Dialog title={m.help.title} onClose={props.onClose} closeLabel={m.help.close} testid="help">
      <table class="keys">
        <tbody>
          {rows.map((k) => (
            <tr key={k}>
              <th scope="row">
                <kbd>{m.help.keys[k]}</kbd>
              </th>
              <td>{m.help.does[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
