// The build menu, the save menu and the key help: small dialogs over the map.
import { useRef, useState } from "preact/hooks";
import { SaveError } from "../../core/game/game";
import { Session } from "../../app/session";
import { useUi } from "../context";
import type { Messages } from "../i18n";
import { amounts, nameOf, packText } from "./names";

function Dialog(props: {
  title: string;
  onClose(): void;
  closeLabel: string;
  children: preact.ComponentChildren;
  testid: string;
}) {
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label={props.title} data-testid={props.testid}>
      <div class="dialog">
        <header>
          <h2>{props.title}</h2>
          <button type="button" onClick={props.onClose}>
            {props.closeLabel}
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}

export function BuildMenu(props: { session: Session; onPick(building: string): void; onClose(): void }) {
  const { m, lang } = useUi();
  const ix = props.session.game.ix;
  const stock = props.session.world.stock;
  return (
    <Dialog
      title={m.buildMenu.title}
      onClose={props.onClose}
      closeLabel={m.buildMenu.close}
      testid="build-menu"
    >
      <ul class="build-list">
        {ix.pack.buildings.map((b) => {
          const affordable = Object.entries(b.cost).every(([res, n]) => (stock[res] ?? 0) >= n);
          return (
            <li key={b.id}>
              <button
                type="button"
                data-testid={`build-${b.id}`}
                disabled={!affordable}
                onClick={() => props.onPick(b.id)}
              >
                <span class="glyph" style={{ color: b.color }}>
                  {b.glyph}
                </span>
                <span class="name">{nameOf(ix, lang, b.id)}</span>
                <span class="cost mono">{amounts(ix, lang, b.cost, m.listSeparator)}</span>
                <span class="desc muted">
                  {affordable ? packText(ix.pack, lang, b.description) : m.buildMenu.short}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
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
  const [status, setStatus] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const { session } = props;
  const errorText = (e: unknown) =>
    e instanceof SaveError ? m.saveMenu.errors[e.code] : m.saveMenu.errors.NOT_A_SAVE;

  return (
    <Dialog title={m.saveMenu.title} onClose={props.onClose} closeLabel={m.saveMenu.close} testid="save-menu">
      <div class="stack">
        <button
          type="button"
          data-testid="save-here"
          onClick={async () =>
            setStatus((await session.saveToBrowser()) ? m.saveMenu.saved : m.saveMenu.saveFailed)
          }
        >
          {m.saveMenu.saveHere}
        </button>
        <button
          type="button"
          data-testid="load-here"
          onClick={async () => {
            try {
              const loaded = await Session.fromBrowser(session.pack);
              if (!loaded) return setStatus(m.saveMenu.noSave);
              props.onLoaded(loaded);
            } catch (e) {
              setStatus(errorText(e));
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
              setStatus(errorText(err));
            }
          }}
        />
        {status && (
          <p role="status" data-testid="save-status">
            {status}
          </p>
        )}
      </div>
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
