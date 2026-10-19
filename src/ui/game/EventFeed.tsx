import type { Session } from "../../app/session";
import type { EventView } from "../../core/world/types";
import { fmt, type Messages } from "../i18n";
import { useUi } from "../context";
import { nameOf, packText, unitLabel } from "./names";

const SHOWN = 8;

export function eventText(session: Session, m: Messages, lang: string, ev: EventView): string {
  const ix = session.game.ix;
  const d = ev.data;
  if (ev.kind === "scenario") return packText(ix.pack, lang, String(d.message));
  const template = (m.events as Record<string, string>)[ev.kind];
  if (!template) return ev.kind;
  const buildingType =
    typeof d.type === "string" ? d.type : session.world.buildings.find((b) => b.id === d.building)?.type;
  const unit = session.world.units.find((u) => u.id === d.unit);
  const vars: Record<string, string | number> = {
    building: buildingType ? nameOf(ix, lang, buildingType) : "",
    resource: typeof d.resource === "string" ? nameOf(ix, lang, d.resource) : "",
    node: typeof d.node === "string" ? nameOf(ix, lang, d.node) : "",
    weather: typeof d.weather === "string" ? nameOf(ix, lang, d.weather) : "",
    unit: unit ? unitLabel(ix, lang, unit) : typeof d.type === "string" ? nameOf(ix, lang, d.type) : "",
    phase: typeof d.phase === "string" ? ((m.phases as Record<string, string>)[d.phase] ?? "") : "",
    amount: Number(d.amount ?? 0),
    day: Number(d.day ?? ev.day),
    fed: Number(d.fed ?? 0),
    hungry: Number(d.hungry ?? 0),
    days: Number(d.days ?? 0),
  };
  return fmt(template, vars);
}

export function EventFeed(props: { session: Session }) {
  const { m, lang } = useUi();
  // Newest first, scanning back from the end: the log can hold thousands of events.
  const log = props.session.game.events;
  const events: EventView[] = [];
  for (let i = log.length - 1; i >= 0 && events.length < SHOWN; i--) {
    if (log[i]!.kind !== "phase.changed") events.push(log[i]!);
  }
  return (
    <section class="feed" aria-label={m.hud.events} aria-live="polite" data-testid="events">
      <ol>
        {events.map((e) => (
          <li key={e.id} data-kind={e.kind}>
            <span class="mono muted">{e.day}</span> {eventText(props.session, m, lang, e)}
          </li>
        ))}
      </ol>
    </section>
  );
}
