// Fast lookups into a pack's content, built once per game. Read-only.
import type { Pack } from "../content/pack";
import type {
  Building,
  CaseKind,
  CaseType,
  District,
  GameEvent,
  Institution,
  Landmark,
  Layer,
  Params,
  Part,
  Passage,
  Prop,
  Recipe,
  RecordField,
  Resident,
  Routine,
  Scene,
  Spot,
  StylePack,
  WindowPlace,
} from "../content/schema";
import { hashValue } from "./hash";
import type { Ratings } from "./records";

export interface PackIndex {
  pack: Pack;
  districts: Map<string, District>;
  scenes: Map<string, Scene>;
  layers: Map<string, Layer>;
  /** Walkable layers of each scene, front to back. */
  sceneLayers: Map<string, Layer[]>;
  passages: Map<string, Passage>;
  /** Passages touching each layer. */
  passagesAt: Map<string, Passage[]>;
  spots: Map<string, Spot>;
  buildings: Map<string, Building>;
  /** Buildings on each layer, left to right. */
  rows: Map<string, Building[]>;
  /** The district each building's line belongs to. */
  districtOf: Map<string, string>;
  props: Map<string, Prop>;
  routines: Map<string, Routine>;
  residents: Map<string, Resident>;
  institutions: Institution[];
  keeper: Record<RecordField, Institution>;
  cases: Map<string, CaseType>;
  caseOfKind: Partial<Record<CaseKind, CaseType>>;
  events: GameEvent[];
  styles: Map<string, StylePack>;
  recipes: Map<string, Recipe>;
  parts: Map<string, Part>;
  landmarks: Map<string, Landmark>;
  ratings: Ratings;
  window: WindowPlace;
  params: Params;
  dayStart: number;
  dusk: number;
  /** See packFingerprint. */
  fingerprint: string;
}

/**
 * What the simulation sees of a pack, hashed: everything but its text. Two packs with the same
 * fingerprint run the same world from the same seed, whatever language they are read in; a save
 * only loads into a pack with the fingerprint it was made with.
 */
export function packFingerprint(pack: Pack): string {
  const { id, version, engine, extends: parent, systems } = pack.manifest;
  return hashValue({
    ...pack,
    manifest: { id, version, engine, extends: parent, systems },
    languages: undefined,
    locale: undefined,
  });
}

const byId = <T extends { id: string }>(list: readonly T[]) => new Map(list.map((e) => [e.id, e]));

export function indexPack(pack: Pack): PackIndex {
  const layers = byId(pack.layers);
  const sceneLayers = new Map<string, Layer[]>();
  for (const l of [...pack.layers].sort((a, b) => b.depth - a.depth)) {
    if (l.kind !== "walk") continue;
    sceneLayers.set(l.scene, [...(sceneLayers.get(l.scene) ?? []), l]);
  }
  const passagesAt = new Map<string, Passage[]>();
  for (const p of pack.passages) {
    for (const layer of [p.from.layer, p.to.layer])
      passagesAt.set(layer, [...(passagesAt.get(layer) ?? []), p]);
  }
  const rows = new Map<string, Building[]>();
  for (const b of [...pack.buildings].sort((a, c) => a.x - c.x))
    rows.set(b.layer, [...(rows.get(b.layer) ?? []), b]);
  const scenes = byId(pack.scenes);
  const districtOf = new Map<string, string>();
  for (const b of pack.buildings) {
    const scene = scenes.get(layers.get(b.layer)?.scene ?? "");
    districtOf.set(b.id, scene?.district ?? "");
  }
  const keeper = {} as Record<RecordField, Institution>;
  for (const inst of pack.institutions) for (const field of inst.keeps) keeper[field] = inst;
  const caseOfKind: Partial<Record<CaseKind, CaseType>> = {};
  for (const c of pack.cases) caseOfKind[c.kind] = c;
  const ratings: Ratings = {
    capacity: Object.fromEntries(pack.districts.map((d) => [d.id, d.capacity])),
    load: Object.fromEntries(pack.buildings.map((b) => [b.id, b.load])),
    district: Object.fromEntries(districtOf),
  };
  return {
    pack,
    fingerprint: packFingerprint(pack),
    districts: byId(pack.districts),
    scenes,
    layers,
    sceneLayers,
    passages: byId(pack.passages),
    passagesAt,
    spots: byId(pack.spots),
    buildings: byId(pack.buildings),
    rows,
    districtOf,
    props: byId(pack.props),
    routines: byId(pack.routines),
    residents: byId(pack.residents),
    institutions: pack.institutions,
    keeper,
    cases: byId(pack.cases),
    caseOfKind,
    events: pack.events,
    styles: byId(pack.styles),
    recipes: byId(pack.recipes),
    parts: byId(pack.parts),
    landmarks: byId(pack.landmarks),
    ratings,
    window: pack.window,
    params: pack.params,
    dayStart: pack.calendar.day_start_minute,
    dusk: pack.calendar.dusk_minute,
  };
}

export function lookup<T>(map: Map<string, T>, id: string, what: string): T {
  const found = map.get(id);
  if (!found) throw new Error(`unknown ${what} "${id}"`);
  return found;
}
