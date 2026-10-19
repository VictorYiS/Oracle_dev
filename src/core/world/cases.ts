// Cases grow out of the world: an occupied house without power asks to be connected, a damaged
// one asks for a crew, someone living where the registry does not have them asks to be
// registered. Each dawn some of these become visitors; they walk to the window and wait. A
// decision changes the records at once, or orders work that the bureau carries out at dusk.
import {
  type Ctx,
  emit,
  findBuilding,
  findCase,
  findRecord,
  findResident,
  newId,
  setRecord,
  setRegistration,
  withRng,
} from "./mutate";
import { lookup } from "./pack-index";
import { claimHolds } from "./observe";
import { occupants, queueSpot, trueFacts, trueLoad } from "./query";
import { registrationOf } from "./records";
import type { CaseAction, CaseState, Cause } from "./types";

const DAWN: Cause = { routine: "dawn" };
const DAY: Cause = { routine: "day" };
const DUSK: Cause = { routine: "dusk" };
/** Settled cases are filed away after this many days. */
const KEEP_DAYS = 2;

/** Is something already in hand for this building and kind, or this applicant? */
function busy(ctx: Ctx, kind: string, building: string, applicant: string): boolean {
  return ctx.s.cases.some((c) => {
    const open =
      c.status === "scheduled" || c.status === "waiting" || ctx.s.records.orders.some((o) => o.case === c.id);
    if (!open) return false;
    return c.applicant === applicant || (c.building === building && ctx.ix.cases.get(c.type)?.kind === kind);
  });
}

/** Dawn: file away old cases, then pick today's visitors from what the world needs. */
export function generateCases(ctx: Ctx): void {
  const { s, ix } = ctx;
  s.cases = s.cases.filter(
    (c) => c.day > s.clock.day - KEEP_DAYS || c.status === "scheduled" || c.status === "waiting",
  );
  const candidates: { type: string; building: string; applicant: string }[] = [];
  const taken = new Set<string>();
  const add = (type: string | undefined, building: string, applicant: string, kind: string) => {
    if (!type || taken.has(applicant) || busy(ctx, kind, building, applicant)) return;
    taken.add(applicant);
    candidates.push({ type, building, applicant });
  };
  for (const b of s.buildings) {
    const people = occupants(s, b.id);
    if (people.length === 0) continue;
    if (!b.power) add(ix.caseOfKind.connect?.id, b.id, people[0]!, "connect");
    if (b.damaged) add(ix.caseOfKind.repair?.id, b.id, people[people.length - 1]!, "repair");
  }
  for (const r of s.residents) {
    if (r.here && r.home && registrationOf(s.records, r.id) !== r.home)
      add(ix.caseOfKind.register?.id, r.home, r.id, "register");
  }
  if (candidates.length === 0) return;

  const [lo, hi] = ix.params.cases_per_day;
  withRng(s, (rng) => {
    const n = Math.min(candidates.length, lo + rng.int(hi - lo + 1));
    const picked = rng.shuffle(candidates).slice(0, n);
    const spacing = Math.max(1, Math.floor((ix.dusk - ix.dayStart - 180) / n));
    picked.forEach((p, k) => {
      const kase: CaseState = {
        id: newId(s, "c"),
        type: p.type,
        applicant: p.applicant,
        building: p.building,
        day: s.clock.day,
        leaves: ix.dayStart + (k === 0 ? 0 : k * spacing + rng.int(Math.max(1, Math.floor(spacing / 3)))),
        status: "scheduled",
        action: null,
      };
      s.cases.push(kase);
      emit(
        ctx,
        "case.filed",
        { case: kase.id, type: kase.type, building: kase.building, applicant: kase.applicant },
        DAWN,
      );
    });
  });
}

/** Each minute of the day: visitors set off, and those who reach the window join the queue. */
export function tickCases(ctx: Ctx): void {
  const { s } = ctx;
  for (const c of s.cases) {
    if (c.status !== "scheduled") continue;
    const r = findResident(s, c.applicant);
    if (!r?.here) {
      c.status = "expired";
      continue;
    }
    if (r.visiting === null && s.clock.minute >= c.leaves) r.visiting = c.id;
    if (r.visiting !== c.id || r.legs.length > 0) continue;
    const spot = queueSpot(ctx, c.id);
    if (r.layer === spot.layer && r.x === spot.x && r.going === `window:${c.id}`) {
      c.status = "waiting";
      emit(
        ctx,
        "case.arrived",
        { case: c.id, type: c.type, building: c.building, applicant: c.applicant },
        DAY,
      );
    }
  }
}

/**
 * Carry out a decision the command bus has already checked. Adopting the Oracle's suggestion and
 * deciding by hand both come here, so the world cannot tell them apart.
 */
export function decide(
  ctx: Ctx,
  id: string,
  action: CaseAction,
  via: "manual" | "oracle",
  cause: Cause,
): void {
  const { s, ix } = ctx;
  const c = findCase(s, id)!;
  const kind = lookup(ix.cases, c.type, "case type").kind;
  const decided = emit(
    ctx,
    "case.decided",
    { case: c.id, type: c.type, building: c.building, applicant: c.applicant, action, via },
    cause,
  );
  c.status = "decided";
  c.action = action;
  const visitor = findResident(s, c.applicant);
  if (visitor?.visiting === c.id) visitor.visiting = null;
  if (action === "deny") return;
  // Vouching for an address the registry did not know puts it on the map.
  if (!findRecord(s, c.building)?.known) setRecord(s, c.building, { known: true });
  switch (kind) {
    case "register":
      setRegistration(s, c.applicant, c.building);
      return;
    case "connect":
    case "repair":
      if (kind === "repair") {
        const district = ix.districtOf.get(c.building) ?? "";
        s.crews[district] = (s.crews[district] ?? 0) + 1;
      }
      s.records.orders.push({ id: newId(s, "o"), kind, building: c.building, case: c.id, event: decided.id });
  }
}

/** Dusk: the bureau's crews carry out the day's orders. Each outcome points back at its decision. */
export function executeOrders(ctx: Ctx): void {
  const { s } = ctx;
  for (const o of s.records.orders) {
    const b = findBuilding(s, o.building);
    const cause: Cause = { event: o.event };
    const data = {
      kind: o.kind,
      building: o.building,
      case: o.case,
      applicant: findCase(s, o.case)?.applicant ?? null,
    };
    if (!b) {
      emit(ctx, "order.failed", { ...data, reason: "missing" }, cause);
      continue;
    }
    if (o.kind === "connect") {
      if (b.damaged) {
        setRecord(s, b.id, { damaged: true }); // the crew reports what it found
        emit(ctx, "order.failed", { ...data, reason: "damaged" }, cause);
      } else if (b.power) {
        setRecord(s, b.id, { power: true });
        emit(ctx, "order.done", { ...data, found: "already" }, cause);
      } else if (lineReallyFull(ctx, b.id)) {
        emit(ctx, "order.failed", { ...data, reason: "overload" }, cause);
      } else {
        b.power = true;
        setRecord(s, b.id, { power: true });
        emit(ctx, "order.done", { ...data, found: "fixed" }, cause);
      }
    } else {
      const found = b.damaged ? "fixed" : "nothing";
      b.damaged = false;
      setRecord(s, b.id, { damaged: false });
      emit(ctx, "order.done", { ...data, found }, cause);
    }
  }
  s.records.orders = [];
}

/** Dusk: whoever is still waiting goes home. */
export function expireCases(ctx: Ctx): void {
  for (const c of ctx.s.cases) {
    if (c.status !== "scheduled" && c.status !== "waiting") continue;
    if (c.status === "waiting")
      emit(ctx, "case.expired", { case: c.id, type: c.type, applicant: c.applicant }, DUSK);
    c.status = "expired";
    const r = findResident(ctx.s, c.applicant);
    if (r?.visiting === c.id) r.visiting = null;
  }
}

/** Read the originals behind a pending item: they say how things really are. */
export function readOriginal(ctx: Ctx, id: number, cause: Cause): void {
  const item = ctx.s.pending.items.find((p) => p.id === id)!;
  const right = item.claims.every((c) =>
    claimHolds(c, trueFacts(ctx.s, c.building), lineReallyFull(ctx, c.building)),
  );
  item.verdict = right ? "right" : "wrong";
  item.how = "original";
  item.checked = ctx.s.clock.day;
  emit(
    ctx,
    "pending.checked",
    { item: item.id, case: item.case, building: item.building, verdict: item.verdict, how: "original" },
    cause,
  );
}

/** Would connecting `building` really overload its line (the meter cards, not the books)? */
function lineReallyFull(ctx: Ctx, building: string): boolean {
  const district = ctx.ix.districtOf.get(building) ?? "";
  const capacity = ctx.ix.districts.get(district)?.capacity ?? 0;
  return trueLoad(ctx, district) + (ctx.ix.buildings.get(building)?.load ?? 0) > capacity;
}
