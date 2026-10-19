// The papers on the desk for a case: the visitor's own application, and an extract from each
// institution whose records bear on it. Every paper says where it came from and when.
import type { CaseKind, RecordField } from "../../core/content/schema";
import type { PackIndex } from "../../core/world/pack-index";
import type { CaseView } from "../../core/world/query";
import { bookedLoad, buildingRecord, registeredAt } from "../../core/world/records";
import type { WorldView } from "../../core/world/types";
import { fmt, type Messages } from "../i18n";
import { addressOf, caseName, institutionName, personName } from "./names";

export interface Paper {
  /** "form" for the application, else the institution's content id. */
  id: string;
  title: string;
  source: string;
  day: string;
  fields: { label: string; value: string }[];
}

const RELEVANT: Record<CaseKind, RecordField[]> = {
  connect: ["address", "occupants", "power", "condition"],
  register: ["address", "occupants"],
  repair: ["address", "condition"],
};

export function papersFor(w: WorldView, ix: PackIndex, m: Messages, lang: string, c: CaseView): Paper[] {
  const kind = ix.cases.get(c.type)?.kind ?? "connect";
  const t = m.papers;
  const dayText = (day: number) => (day > 0 ? fmt(t.day, { n: day }) : t.undated);
  const applicant = personName(ix, lang, c.applicant);
  const papers: Paper[] = [
    {
      id: "form",
      title: t.form,
      source: fmt(t.source, { source: applicant }),
      day: dayText(c.day),
      fields: [
        { label: t.applicant, value: applicant },
        { label: t.address, value: addressOf(ix, lang, c.building) },
        { label: t.request, value: caseName(ix, lang, c.type) },
        { label: t.statement, value: t.says[kind] },
      ],
    },
  ];
  const rec = buildingRecord(w.records, c.building);
  const known = rec?.known ?? false;
  const byInstitution = new Map<string, RecordField[]>();
  for (const field of RELEVANT[kind]) {
    const inst = ix.keeper[field];
    if (inst) byInstitution.set(inst.id, [...(byInstitution.get(inst.id) ?? []), field]);
  }
  for (const [inst, fields] of byInstitution) {
    const rows: Paper["fields"] = [{ label: t.address, value: addressOf(ix, lang, c.building) }];
    for (const field of fields) {
      if (!known && field !== "address") continue;
      switch (field) {
        case "address":
          rows.push({ label: t.onMap, value: known ? t.yes : t.notOnFile });
          break;
        case "occupants": {
          const people = registeredAt(w.records, c.building).map((p) => personName(ix, lang, p));
          rows.push({ label: t.occupants, value: people.length ? people.join(m.listSeparator) : t.none });
          break;
        }
        case "power": {
          const district = ix.districtOf.get(c.building) ?? "";
          rows.push({ label: t.power, value: rec?.power ? t.connected : t.notConnected });
          rows.push({
            label: t.line,
            value: fmt(t.loadOf, {
              load: bookedLoad(w.records, ix.ratings, district),
              capacity: ix.ratings.capacity[district] ?? 0,
            }),
          });
          break;
        }
        case "condition":
          rows.push({ label: t.condition, value: rec?.damaged ? t.damaged : t.sound });
          break;
      }
    }
    const name = institutionName(ix, lang, fields[0]!);
    papers.push({
      id: inst,
      title: fmt(t.extract, { institution: name }),
      source: fmt(t.source, { source: name }),
      day: dayText(rec?.updated ?? 0),
      fields: rows,
    });
  }
  return papers;
}
