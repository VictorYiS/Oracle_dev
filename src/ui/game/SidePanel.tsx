// What is selected, what it is doing, and the orders it can take.
import type { Session } from "../../app/session";
import { nodeAt } from "../../core/world/query";
import { fmt } from "../i18n";
import { useUi } from "../context";
import { amounts, nameOf, packText, unitLabel } from "./names";
import type { DeepReadonlyUnit, Mode, Selection } from "./types";

interface Props {
  session: Session;
  selection: Selection;
  select(s: Selection): void;
  setMode(m: Mode): void;
}

function jobText(m: ReturnType<typeof useUi>["m"], unit: DeepReadonlyUnit): string {
  const job = unit.job;
  if (!job) return m.jobs.idle;
  if (job.kind === "move") return m.jobs.move;
  return m.jobs[job.stage];
}

export function SidePanel(props: Props) {
  const { m, lang } = useUi();
  const { session, selection } = props;
  const w = session.world;
  const ix = session.game.ix;
  const sel = selection;

  let body = <p class="muted">{m.panel.empty}</p>;

  if (sel?.kind === "unit") {
    const unit = w.units.find((u) => u.id === sel.id);
    if (unit) {
      const controllable = unit.role !== "resident" && unit.disabledDays === 0;
      const hasSite = w.buildings.some((b) => !b.complete);
      const workplace = unit.workplace ? w.buildings.find((b) => b.id === unit.workplace) : undefined;
      const workplaces = w.buildings.filter((b) => {
        const def = ix.buildings.get(b.type);
        return b.complete && def && def.workers > 0 && b.id !== unit.workplace;
      });
      body = (
        <>
          <h2>{unitLabel(ix, lang, unit)}</h2>
          <p data-testid="job">{jobText(m, unit)}</p>
          {unit.carrying && (
            <p>
              {fmt(m.panel.carrying, {
                n: unit.carrying.amount,
                resource: nameOf(ix, lang, unit.carrying.resource),
              })}
            </p>
          )}
          {unit.disabledDays > 0 && <p class="warn">{fmt(m.panel.outOfAction, { n: unit.disabledDays })}</p>}
          {unit.hunger > 0 && <p class="warn">{fmt(m.panel.hungry, { n: unit.hunger })}</p>}
          {unit.role === "resident" && (
            <p>
              {workplace ? fmt(m.panel.worksAt, { name: nameOf(ix, lang, workplace.type) }) : m.panel.noWork}
            </p>
          )}
          {controllable && (
            <div class="actions">
              <button
                type="button"
                data-testid="act-move"
                onClick={() => props.setMode({ kind: "move", unit: unit.id })}
              >
                {m.actions.move}
              </button>
              <button
                type="button"
                data-testid="act-gather"
                onClick={() => props.setMode({ kind: "gather", unit: unit.id })}
              >
                {m.actions.gather}
              </button>
              <button
                type="button"
                data-testid="act-build"
                disabled={!hasSite}
                onClick={() => props.setMode({ kind: "build", unit: unit.id })}
              >
                {m.actions.build}
              </button>
              <button
                type="button"
                data-testid="act-stop"
                onClick={() => session.submit({ type: "unit.stop", unit: unit.id })}
              >
                {m.actions.stop}
              </button>
            </div>
          )}
          {unit.role === "resident" && (
            <div class="actions">
              {workplaces.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => session.submit({ type: "unit.assign", unit: unit.id, building: b.id })}
                >
                  {m.actions.workHere}: {nameOf(ix, lang, b.type)}
                </button>
              ))}
              {workplace && (
                <button
                  type="button"
                  onClick={() => session.submit({ type: "unit.assign", unit: unit.id, building: null })}
                >
                  {m.actions.rest}
                </button>
              )}
            </div>
          )}
        </>
      );
    }
  } else if (sel?.kind === "building") {
    const b = w.buildings.find((v) => v.id === sel.id);
    const def = b && ix.buildings.get(b.type);
    if (b && def) {
      const workers = w.units.filter((u) => u.workplace === b.id).length;
      body = (
        <>
          <h2>{nameOf(ix, lang, b.type)}</h2>
          <p class="muted">{packText(ix.pack, lang, def.description)}</p>
          {!b.complete && (
            <p data-testid="site-progress">
              {fmt(m.panel.site, { pct: Math.floor((100 * b.progress) / def.build_ticks) })}
            </p>
          )}
          {def.storage > 0 && <p>{fmt(m.panel.storage, { n: def.storage })}</p>}
          {def.housing > 0 && <p>{fmt(m.panel.housing, { n: def.housing })}</p>}
          {def.sight > 0 && <p>{fmt(m.panel.sight, { n: def.sight })}</p>}
          {def.workers > 0 && <p>{fmt(m.panel.workers, { n: workers, max: def.workers })}</p>}
          {def.produces && (
            <p>
              {fmt(m.panel.produces, { list: amounts(ix, lang, def.produces, m.listSeparator) })}
              {def.consumes &&
                ` ${fmt(m.panel.consumes, { list: amounts(ix, lang, def.consumes, m.listSeparator) })}`}
            </p>
          )}
        </>
      );
    }
  } else if (sel?.kind === "tile") {
    const tile = sel.y * w.width + sel.x;
    const seen = w.explored[tile] === 1;
    const terrain = ix.terrain[w.terrain[tile] ?? 0];
    const node = seen ? nodeAt(w, tile) : undefined;
    body = (
      <>
        <h2>{seen && terrain ? nameOf(ix, lang, terrain.id) : fmt(m.panel.tile, { x: sel.x, y: sel.y })}</h2>
        {!seen && <p class="muted">{m.panel.unexplored}</p>}
        {node && (
          <p>
            {nameOf(ix, lang, node.type)} ·{" "}
            {node.amount > 0 ? fmt(m.panel.left, { n: node.amount }) : m.panel.exhausted}
          </p>
        )}
      </>
    );
  }

  return (
    <aside class="panel" data-testid="panel">
      <section class="selection">{body}</section>
      <section class="people">
        <h3>{m.hud.units}</h3>
        <ul>
          {w.units.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                data-testid={`unit-${u.id}`}
                aria-pressed={sel?.kind === "unit" && sel.id === u.id}
                onClick={() => props.select({ kind: "unit", id: u.id })}
              >
                <span>{unitLabel(ix, lang, u)}</span>
                <span class="muted">{u.role === "resident" ? "" : jobText(m, u)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
