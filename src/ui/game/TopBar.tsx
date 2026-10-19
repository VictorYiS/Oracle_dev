import type { Session } from "../../app/session";
import { SPEEDS, type Speed } from "../../app/clock";
import { fmt } from "../i18n";
import { useUi } from "../context";
import { clockText } from "./names";
import { LanguageSwitch } from "../LanguageSwitch";

const SPEED_NAME: Record<Speed, "pause" | "x1" | "x2" | "x4"> = { 0: "pause", 1: "x1", 2: "x2", 4: "x4" };

interface Props {
  session: Session;
  onSave(): void;
  onSettings(): void;
  onHelp(): void;
}

export function TopBar(props: Props) {
  const { m } = useUi();
  const { session } = props;
  const w = session.world;
  const phase = w.clock.phase;

  return (
    <header class="topbar">
      <div class="when" data-testid="clock">
        <strong>{fmt(m.hud.day, { n: w.clock.day })}</strong>
        <span class="phase" data-testid="phase">
          {m.phases[phase]}
        </span>
        <span class="mono" data-testid="time">
          {clockText(w.clock.minute)}
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

      {phase !== "day" && (
        <button
          type="button"
          class="primary"
          data-testid="advance"
          onClick={() => session.submit({ type: "phase.advance" })}
        >
          {m.advance[phase]}
        </button>
      )}
      {phase === "day" && (
        <button
          type="button"
          data-testid="wait"
          onClick={() => session.submit({ type: "hero.wait", minutes: 60 })}
        >
          {m.hud.wait}
        </button>
      )}

      <div class="tools">
        <LanguageSwitch class="language inline" />
        <button type="button" onClick={props.onSave} data-testid="open-save">
          {m.hud.save}
        </button>
        <button type="button" onClick={props.onSettings} data-testid="open-settings">
          {m.hud.settings}
        </button>
        <button type="button" onClick={props.onHelp} aria-label={m.hud.help} data-testid="open-help">
          ?
        </button>
      </div>
    </header>
  );
}
