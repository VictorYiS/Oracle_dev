// npm run validate — assemble every pack under scenarios/ (places, people, paperwork and visual
// content) and report problems with file and field.
import { listPackIds, loadPack } from "./lib/read-pack";

let failed = 0;
for (const id of listPackIds()) {
  const result = loadPack(id);
  if (result.ok) {
    const { pack } = result;
    const kinds = (list: { kind: string }[]) => {
      const n: Record<string, number> = {};
      for (const x of list) n[x.kind] = (n[x.kind] ?? 0) + 1;
      return Object.entries(n)
        .map(([k, c]) => (c > 1 ? `${k} ×${c}` : k))
        .join(", ");
    };
    const counts = [
      `${pack.scenes.length} scenes (${kinds(pack.scenes)})`,
      `${pack.layers.length} layers`,
      `${pack.passages.length} passages (${kinds(pack.passages)})`,
      `${pack.buildings.length} buildings`,
      `${pack.residents.length} residents`,
      `${pack.cases.length} case types`,
      `${pack.styles.length} style packs`,
      `${pack.recipes.length} recipe families`,
      `${pack.landmarks.length} landmarks`,
    ];
    console.log(
      `✓ ${id} v${pack.manifest.version} (${pack.lineage.join(" → ")}) [${pack.languages.join(", ")}]: ${counts.join(" · ")}`,
    );
  } else {
    failed++;
    console.error(`✗ ${id}`);
    for (const issue of result.issues) console.error(`    ${issue.file} · ${issue.path}: ${issue.message}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} pack(s) failed validation.`);
  process.exit(1);
}
