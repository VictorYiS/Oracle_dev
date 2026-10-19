// The pending tray: everything adopted from the Oracle without checking. Each item says what was
// taken for granted and how to check it; checking closes it with a verdict. No penalties here.
import type { Session } from "../../app/session";
import type { PendingView } from "../../core/world/query";
import { CHECKABLE } from "../../core/world/records";
import { readProblem } from "../../core/world/window";
import { useUi } from "../context";
import { fmt } from "../i18n";
import { addressOf, caseName } from "./names";

/** Always on screen as a small tab; opens into the list. */
export function PendingTray(props: { session: Session; open: boolean; onToggle(): void }) {
  const { m, lang } = useUi();
  const { session } = props;
  const w = session.world;
  const ix = session.game.ix;
  const items = [...w.pending.items].reverse();
  const t = m.pending;

  const item = (p: PendingView) => {
    const address = addressOf(ix, lang, p.building);
    const bySight = p.claims.every((c) => CHECKABLE[c.field].sight);
    const byOriginal = p.claims.every((c) => CHECKABLE[c.field].original);
    const problem = readProblem({ s: w, ix }, p.id);
    return (
      <li key={p.id} data-pending={p.id} data-verdict={p.verdict ?? undefined} class={p.verdict ?? "open"}>
        <p class="head">
          <b>{caseName(ix, lang, p.type)}</b> · {address} ·{" "}
          <span class="muted">{fmt(m.papers.day, { n: p.day })}</span>
        </p>
        <p class="label">◇ {t.took}</p>
        <ul class="claims">
          {p.claims.map((c) => (
            <li key={`${c.field}${c.building}`}>
              {fmt(t.claims[c.field][c.value ? "yes" : "no"], { address: addressOf(ix, lang, c.building) })}
            </li>
          ))}
        </ul>
        {p.verdict ? (
          <p class={`verdict ${p.verdict}`} data-testid={`verdict-${p.id}`}>
            {p.verdict === "right" ? t.right : t.wrong} · {p.how === "original" ? t.byOriginal : t.bySight}
          </p>
        ) : (
          <>
            <p class="label">{t.how}</p>
            <ul class="how">
              {bySight && <li>{fmt(t.sight, { address })}</li>}
              {byOriginal && <li>{fmt(t.original, { n: ix.params.original_minutes })}</li>}
            </ul>
            {byOriginal && (
              <button
                type="button"
                data-testid={`read-${p.id}`}
                disabled={Boolean(problem)}
                title={problem ? m.rejections[problem.code] : undefined}
                onClick={() => session.submit({ type: "pending.read", item: p.id })}
              >
                {t.read}
              </button>
            )}
          </>
        )}
      </li>
    );
  };

  const open = w.pending.items.filter((p) => p.verdict === null).length;
  return (
    <aside class={`tray ${props.open ? "open" : ""}`} data-testid="pending" aria-label={t.title}>
      <button
        type="button"
        class="tray-tab"
        data-testid="pending-toggle"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        {m.hud.pending}{" "}
        <b class="mono" data-testid="pending-count">
          {open}
        </b>
      </button>
      <div class="tray-body" hidden={!props.open}>
        <h2>{t.title}</h2>
        {items.length === 0 ? (
          <p class="muted">{t.empty}</p>
        ) : (
          <ol class="pending-list">{items.map(item)}</ol>
        )}
      </div>
    </aside>
  );
}
