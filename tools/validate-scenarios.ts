// npm run validate — assemble every pack under scenarios/ and report problems with file and field.
import { listPackIds, loadPack } from "./lib/read-pack";

let failed = 0;
for (const id of listPackIds()) {
  const result = loadPack(id);
  if (result.ok) {
    const { pack } = result;
    const counts = [
      `map ${pack.map.width}×${pack.map.height}`,
      `${pack.resources.length} resources`,
      `${pack.buildings.length} buildings`,
      `${pack.events.length} events`,
      `${pack.units.length} unit types`,
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
