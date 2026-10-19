// Names on screen come from the pack, in the player's language.
import { text, type Pack } from "../../core/content/pack";
import type { PackIndex } from "../../core/world/pack-index";
import type { UnitState } from "../../core/world/types";
import type { DeepReadonlyUnit } from "./types";

export function nameOf(ix: PackIndex, lang: string, id: string): string {
  const entity =
    ix.resources.get(id) ??
    ix.buildings.get(id) ??
    ix.units.get(id) ??
    ix.nodes.get(id) ??
    ix.weathers.get(id) ??
    ix.terrain.find((t) => t.id === id);
  return entity ? text(ix.pack, entity.name, lang) : id;
}

/** "Worker 3": the unit type's name and the number in its id, so units can be told apart. */
export function unitLabel(ix: PackIndex, lang: string, unit: DeepReadonlyUnit | UnitState): string {
  if (unit.role === "avatar") return nameOf(ix, lang, unit.type); // there is only one of you
  return `${nameOf(ix, lang, unit.type)} ${unit.id.slice(1)}`;
}

/** "4 of this, 2 of that", joined with the language's list separator. */
export function amounts(ix: PackIndex, lang: string, list: Record<string, number>, sep: string): string {
  return Object.entries(list)
    .map(([res, n]) => `${n} ${nameOf(ix, lang, res)}`)
    .join(sep);
}

export function packText(pack: Pack, lang: string, ref: string): string {
  return text(pack, ref, lang);
}

export function clockText(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
