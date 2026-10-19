// Names on screen come from the pack, in the player's language.
import { text, type Pack } from "../../core/content/pack";
import type { RecordField } from "../../core/content/schema";
import type { PackIndex } from "../../core/world/pack-index";
import type { ClaimField } from "../../core/world/records";

export function packText(pack: Pack, lang: string, ref: string): string {
  return text(pack, ref, lang);
}

export function addressOf(ix: PackIndex, lang: string, building: string): string {
  const b = ix.buildings.get(building);
  return b ? text(ix.pack, b.address, lang) : building;
}

export function personName(ix: PackIndex, lang: string, person: string): string {
  const r = ix.residents.get(person);
  return r ? text(ix.pack, r.name, lang) : person;
}

export function layerName(ix: PackIndex, lang: string, layer: string): string {
  const l = ix.layers.get(layer);
  if (l) return text(ix.pack, l.name, lang);
  const p = ix.passages.get(layer);
  return p ? text(ix.pack, p.name, lang) : layer;
}

export function caseName(ix: PackIndex, lang: string, type: string): string {
  const c = ix.cases.get(type);
  return c ? text(ix.pack, c.name, lang) : type;
}

export function actionName(ix: PackIndex, lang: string, type: string, action: "approve" | "deny"): string {
  const c = ix.cases.get(type);
  return c ? text(ix.pack, action === "approve" ? c.approve : c.deny, lang) : action;
}

/** Which institution's records a claim is about. */
export const FIELD_RECORD: Record<ClaimField, RecordField> = {
  exists: "address",
  occupied: "occupants",
  power: "power",
  line_full: "power",
  damaged: "condition",
};

export function institutionName(ix: PackIndex, lang: string, field: RecordField): string {
  const inst = ix.keeper[field];
  return inst ? text(ix.pack, inst.name, lang) : field;
}

export function clockText(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
