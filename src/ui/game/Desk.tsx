// The window: the queue, the visitor in front of you, their papers, the procedure, the Oracle's
// suggestion, and the stamps. Decisions are commands; the desk greys out what the bus would refuse.
import { useEffect, useRef, useState } from "preact/hooks";
import type { Session } from "../../app/session";
import { registeredAt } from "../../core/world/records";
import { waitingCases } from "../../core/world/query";
import { decisionProblem, windowProblem } from "../../core/world/window";
import { useUi } from "../context";
import { fmt } from "../i18n";
import {
  actionName,
  addressOf,
  caseName,
  FIELD_RECORD,
  institutionName,
  packText,
  personName,
} from "./names";
import { type Paper, papersFor } from "./papers";

interface Props {
  session: Session;
  onClose(): void;
  /** The sheet open on top of the desk (a paper or the procedure), so Escape can close it first. */
  sheet: string | null;
  setSheet(sheet: string | null): void;
}

/** Keep Tab inside `root`: from the last control back to the first, and the other way round. */
function trapTab(e: KeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== "Tab" || !root) return;
  const items = [
    ...root.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled])"),
  ];
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
    e.preventDefault();
    first.focus();
  }
}

export function Desk(props: Props) {
  const { m, lang } = useUi();
  const { session } = props;
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openSheet = (sheet: string) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    props.setSheet(sheet);
  };
  // When a sheet closes, focus goes back to the button that opened it.
  useEffect(() => {
    if (props.sheet === null && opener.current?.isConnected) {
      opener.current.focus();
      opener.current = null;
    }
  }, [props.sheet]);
  const w = session.world;
  const ix = session.game.ix;
  const [selected, setSelected] = useState<string | null>(null);
  const [stamped, setStamped] = useState<{ type: string; action: "approve" | "deny" } | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  const waiting = waitingCases(w);
  const current = waiting.find((c) => c.id === selected) ?? waiting[0] ?? null;
  const closed = windowProblem({ s: w, ix });

  useEffect(() => {
    first.current?.focus();
  }, [current?.id, Boolean(closed)]);

  let body;
  if (closed) {
    body = (
      <p class="muted" data-testid="desk-closed">
        {w.clock.phase === "day" ? m.desk.away : m.desk.closed}
      </p>
    );
  } else if (!current) {
    body = (
      <p class="muted" data-testid="desk-empty">
        {m.desk.empty}
      </p>
    );
  } else {
    const type = ix.cases.get(current.type)!;
    const name = personName(ix, lang, current.applicant);
    const address = addressOf(ix, lang, current.building);
    const papers = papersFor(w, ix, m, lang, current);
    const suggestion = session.game.suggestion(current.id);
    const claimField = suggestion?.claims[0]?.field ?? "exists";
    const summary = suggestion
      ? fmt(packText(ix.pack, lang, suggestion.text), {
          address,
          name,
          count: registeredAt(w.records, current.building).length,
          institution: institutionName(ix, lang, FIELD_RECORD[claimField]),
        })
      : "";
    const decide = (action: "approve" | "deny", adopt: boolean) => {
      const r = session.submit(
        adopt ? { type: "case.adopt", case: current.id } : { type: "case.decide", case: current.id, action },
      );
      if (r.ok) {
        setStamped({ type: current.type, action });
        setSelected(null);
      }
    };
    const problemFor = (action: "approve" | "deny") => decisionProblem({ s: w, ix }, current.id, action);
    body = (
      <div class="case" data-testid="case" data-case={current.id}>
        <h3>
          {caseName(ix, lang, current.type)} · {name}
        </h3>
        <p class="request">{fmt(packText(ix.pack, lang, type.request), { name, address })}</p>
        <div class="papers" aria-label={m.desk.papers}>
          {papers.map((p, i) => (
            <button
              key={p.id}
              type="button"
              class="paper-chip"
              ref={i === 0 ? first : undefined}
              data-testid={`paper-${i}`}
              data-paper={p.id}
              onClick={() => openSheet(`paper:${i}`)}
            >
              <b>{p.title}</b>
              <span class="muted">{p.day}</span>
            </button>
          ))}
          <button
            type="button"
            class="paper-chip sop"
            data-testid="open-sop"
            onClick={() => openSheet("sop")}
          >
            <b>{m.desk.sop}</b>
          </button>
        </div>
        {suggestion && (
          <section
            class="suggestion"
            data-testid="suggestion"
            data-action={suggestion.action}
            data-reason={suggestion.reason}
          >
            <p class="label">◇ {m.desk.suggests}</p>
            <p>{summary}</p>
            <button
              type="button"
              class="oracle"
              data-testid="adopt"
              disabled={Boolean(problemFor(suggestion.action))}
              onClick={() => decide(suggestion.action, true)}
            >
              {m.desk.adopt}: {actionName(ix, lang, current.type, suggestion.action)}
            </button>
            <p class="muted small">{m.desk.adoptHint}</p>
          </section>
        )}
        <p class="muted">{m.desk.decideHint}</p>
        <div class="stamps">
          {(["approve", "deny"] as const).map((action) => {
            const problem = problemFor(action);
            return (
              <button
                key={action}
                type="button"
                class={`stamp stamp-${action}`}
                data-testid={`stamp-${action}`}
                disabled={Boolean(problem)}
                title={problem ? m.rejections[problem.code] : undefined}
                onClick={() => decide(action, false)}
              >
                {actionName(ix, lang, current.type, action)}
              </button>
            );
          })}
        </div>
        {props.sheet?.startsWith("paper:") && (
          <PaperSheet paper={papers[Number(props.sheet.slice(6))]!} onClose={() => props.setSheet(null)} />
        )}
        {props.sheet === "sop" && (
          <Sheet
            title={fmt(m.desk.sopTitle, { case: caseName(ix, lang, current.type) })}
            testid="sop"
            onClose={() => props.setSheet(null)}
          >
            <ol class="sop-list">
              {type.sop.map((ref) => (
                <li key={ref}>{packText(ix.pack, lang, ref)}</li>
              ))}
            </ol>
          </Sheet>
        )}
      </div>
    );
  }

  return (
    <div
      class="overlay desk-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={m.desk.title}
      data-testid="desk"
      onKeyDown={(e) => trapTab(e, (e.target as HTMLElement).closest<HTMLElement>(".sheet") ?? root.current)}
    >
      <div class="desk" ref={root}>
        <header>
          <h2>{m.desk.title}</h2>
          <button type="button" data-testid="desk-close" onClick={props.onClose}>
            {m.desk.close}
          </button>
        </header>
        <div class="desk-body">
          <aside class="queue" aria-label={m.desk.queue}>
            <p class="label">{m.desk.queue}</p>
            <ol data-testid="queue">
              {waiting.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    data-case={c.id}
                    aria-pressed={c.id === current?.id}
                    onClick={() => {
                      setSelected(c.id);
                      props.setSheet(null);
                    }}
                  >
                    {personName(ix, lang, c.applicant)} · {caseName(ix, lang, c.type)}
                  </button>
                </li>
              ))}
            </ol>
          </aside>
          <div class="desk-main">
            {stamped && (
              <p class="stamped" role="status" data-testid="stamped">
                {fmt(m.desk.stamped, { action: actionName(ix, lang, stamped.type, stamped.action) })}
              </p>
            )}
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}

function Sheet(props: {
  title: string;
  testid: string;
  onClose(): void;
  children: preact.ComponentChildren;
}) {
  const { m } = useUi();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  return (
    <div
      class="sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      data-testid={props.testid}
    >
      <article class="sheet">
        <h3>{props.title}</h3>
        {props.children}
        <button ref={close} type="button" data-testid={`${props.testid}-close`} onClick={props.onClose}>
          {m.desk.back}
        </button>
      </article>
    </div>
  );
}

function PaperSheet(props: { paper: Paper; onClose(): void }) {
  const p = props.paper;
  return (
    <Sheet title={p.title} testid="paper" onClose={props.onClose}>
      <p class="provenance" data-testid="paper-source">
        <span>{p.source}</span> · <span data-testid="paper-day">{p.day}</span>
      </p>
      <dl>
        {p.fields.map((f) => (
          <div key={f.label} class="row">
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
