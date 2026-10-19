// The event feed: what the player can know. Changes nobody saw (someone moving out, a cable run in
// the night) are in the log, but not here.
import type { Session } from "../../app/session";
import type { PackIndex } from "../../core/world/pack-index";
import type { EventView } from "../../core/world/types";
import { useUi } from "../context";
import { fmt, type Messages } from "../i18n";
import { actionName, addressOf, caseName, packText, personName } from "./names";

const SHOWN = 6;
const FACTS = ["power", "damaged", "occupied"] as const;

function diffText(m: Messages, d: EventView["data"]): string {
  return FACTS.filter((f) => d[`was_${f}`] !== d[`now_${f}`])
    .map((f) =>
      fmt(m.events.change, {
        was: m.facts[f][d[`was_${f}`] ? "yes" : "no"],
        now: m.facts[f][d[`now_${f}`] ? "yes" : "no"],
      }),
    )
    .join(m.listSeparator);
}

/** The feed's wording for an event, or null if the player would not know of it. */
export function eventText(ix: PackIndex, m: Messages, lang: string, ev: EventView): string | null {
  const d = ev.data;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const address = () => addressOf(ix, lang, str("building"));
  const name = () => personName(ix, lang, str("applicant"));
  const e = m.events;
  switch (ev.kind) {
    case "world.created":
      return e["world.created"];
    case "scenario":
      return packText(ix.pack, lang, str("message"));
    case "case.arrived":
      return fmt(e["case.arrived"], { name: name(), case: caseName(ix, lang, str("type")) });
    case "case.decided":
      return fmt(d.via === "oracle" ? e["case.decidedOracle"] : e["case.decided"], {
        case: caseName(ix, lang, str("type")),
        address: address(),
        action: actionName(ix, lang, str("type"), d.action === "approve" ? "approve" : "deny"),
      });
    case "case.expired":
      return fmt(e["case.expired"], { name: name() });
    case "order.done": {
      const key =
        d.kind === "connect"
          ? d.found === "already"
            ? "order.already"
            : "order.connected"
          : d.found === "nothing"
            ? "order.nothing"
            : "order.repaired";
      return fmt(e[key], { address: address(), name: name() });
    }
    case "order.failed": {
      const key =
        d.reason === "damaged"
          ? "order.damaged"
          : d.reason === "overload"
            ? "order.overload"
            : "order.missing";
      return fmt(e[key], { address: address() });
    }
    case "memory.seen":
      return d.unknown
        ? fmt(e["memory.unknown"], { address: address() })
        : fmt(e["memory.seen"], { address: address(), diff: diffText(m, d) });
    case "memory.changed": {
      const days = Number(d.days ?? 0);
      const when = days === 0 ? e.today : days === 1 ? e.yesterday : fmt(e.daysAgo, { n: days });
      return fmt(e["memory.changed"], { address: address(), when, diff: diffText(m, d) });
    }
    case "pending.checked":
      return fmt(d.verdict === "right" ? e["pending.right"] : e["pending.wrong"], { address: address() });
    case "day.settled":
      return fmt(e["day.settled"], {
        day: Number(d.day),
        decided: Number(d.decided),
        expired: Number(d.expired),
      });
    default:
      return null;
  }
}

export function EventFeed(props: { session: Session }) {
  const { m, lang } = useUi();
  const ix = props.session.game.ix;
  // Newest first, scanning back from the end: the log can hold thousands of events.
  const log = props.session.game.events;
  const shown: { ev: EventView; text: string }[] = [];
  for (let i = log.length - 1; i >= 0 && shown.length < SHOWN; i--) {
    const text = eventText(ix, m, lang, log[i]!);
    if (text) shown.push({ ev: log[i]!, text });
  }
  return (
    <section class="feed" aria-label={m.hud.events} aria-live="polite" data-testid="events">
      <ol>
        {shown.map(({ ev, text }) => (
          <li key={ev.id} data-kind={ev.kind} data-event={ev.id}>
            <span class="mono muted">{ev.day}</span> {text}
          </li>
        ))}
      </ol>
    </section>
  );
}
