import type { Session } from "../../app/session";
import { SPEEDS, type Speed } from "../../app/clock";
import { capacityOf } from "./world-info";
import { fmt } from "../i18n";
import { useUi } from "../context";
import { clockText, nameOf } from "./names";
import { LanguageSwitch } from "../LanguageSwitch";

const SPEED_NAME: Record<Speed, "pause" | "x1" | "x2" | "x4"> = { 0: "pause", 1: "x1", 2: "x2", 4: "x4" };

export function TopBar(props: { session: Session; onSave(): void; onHelp(): void; onBuild(): void }) {
  const { m, lang } = useUi();
  const { session } = props;
  const w = session.world;
  const ix = session.game.ix;
  const phase = w.clock.phase;
  const used = Object.values(w.stock).reduce((a, b) => a + b, 0);
  const stock = ix.pack.resources.filter((r) => (w.stock[r.id] ?? 0) > 0);

  return (
    <header class="topbar">
      <div class="when" data-testid="clock">
        <strong>{fmt(m.hud.day, { n: w.clock.day })}</strong>
        <span class="phase" data-testid="phase">
          {m.phases[phase]}
        </span>
        <span class="mono">{clockText(w.clock.minute)}</span>
        <span class="weather" title={m.hud.weather}>
          {nameOf(ix, lang, w.weather)}
        </span>
      </div>

      <div class="speed" role="group" aria-label={m.hud.speed}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={session.speed === s}
            data-testid={`speed-${SPEED_NAME[s]}`}
            disabled={phase !== "day"}
            onClick={() => session.setSpeed(s)}
          >
            {m.hud.speedNames[SPEED_NAME[s]]}
          </button>
        ))}
      </div>

      <button
        type="button"
        class="primary"
        data-testid="advance"
        disabled={phase === "day"}
        onClick={() => session.submit({ type: "phase.advance" })}
      >
        {m.advance[phase]}
      </button>

      <ul
        class="stock"
        data-testid="stock"
        aria-label={fmt(m.hud.storage, { used, max: capacityOf(session) })}
      >
        <li class="capacity mono">{fmt(m.hud.storage, { used, max: capacityOf(session) })}</li>
        {stock.length === 0 && <li class="muted">{m.hud.empty}</li>}
        {stock.map((r) => (
          <li key={r.id} data-resource={r.id}>
            <span>{nameOf(ix, lang, r.id)}</span> <b class="mono">{w.stock[r.id]}</b>
          </li>
        ))}
      </ul>

      <div class="tools">
        <LanguageSwitch class="language inline" />
        <button type="button" onClick={props.onBuild} data-testid="open-build">
          {m.hud.build}
        </button>
        <button type="button" onClick={props.onSave} data-testid="open-save">
          {m.hud.save}
        </button>
        <button type="button" onClick={props.onHelp} aria-label={m.hud.help}>
          ?
        </button>
      </div>
    </header>
  );
}
