// Prints the benefit share the Table draws for every clause, with the same modules the
// web app ships, so the numbers in docs/metricas/reparto-beneficio.md can be regenerated.
// Next to each share it prints what the retired per-kind weights gave, for comparison.
//
//   node scripts/benefit-share.mjs <kg json> <party A id> <party B id> [clause id ...]
//
// The clause ids, if any, get a statement-by-statement breakdown.
//
// The docs were measured on the Bellicum–Miltenyi summary, which is no longer under
// infra/json/kg/. To recover it:
//
//   git show 3759e25:infra/json/kg/root_BELLICUM_MILTENYI_Supply_Agreement_Summary.json > study.json
//   node scripts/benefit-share.mjs study.json party-2 party-1 clause-8 clause-10
import { readFileSync } from "node:fs";

import "./web-modules.mjs";

const [kgFile, aId, bId, ...detailIds] = process.argv.slice(2);
if (!kgFile || !aId || !bId) {
  console.error(
    "usage: node scripts/benefit-share.mjs <kg json> <party A id> <party B id> [clause id ...]",
  );
  process.exit(1);
}
const kg = JSON.parse(readFileSync(kgFile, "utf8"));

const { buildStatementGrid, DEONTIC_MARK_KINDS } =
  await import("@/features/docx/utils/knowledge/statement-grid");
const { computeBenefitShare } =
  await import("@/features/docx/utils/knowledge/benefit-share");

// The weights the bar used before every statement counted once. Never validated.
const RETIRED = { prohibition: 1, obligation: 0.7, right: 0.3 };

const grid = buildStatementGrid(kg, aId, bId);
const name = (id) => kg.parties.find((p) => p.id === id)?.name ?? id;
const laneName = { a: name(aId), b: name(bId), shared: "both" };

// Same rule as computeBenefitShare, with the retired weights instead of 1.
function retiredShare(row, lanes) {
  const benefit = { a: 0, b: 0 };
  for (const lane of lanes) {
    for (const mark of row.marks[lane]) {
      if (!DEONTIC_MARK_KINDS.includes(mark.kind)) continue;
      const weight = RETIRED[mark.kind];
      if (lane === "shared") {
        benefit.a += weight;
        benefit.b += weight;
        continue;
      }
      const gains = mark.kind === "right" ? lane : mark.counterpartLane;
      if (gains === "a" || gains === "b") benefit[gains] += weight;
    }
  }
  return benefit;
}

// Rounded the way the bar prints it: A to the nearest unit, B as the rest.
const pct = ({ a, b }) => {
  const pa = Math.round((100 * a) / (a + b));
  return `${String(pa).padStart(3)}% / ${String(100 - pa).padStart(3)}%`;
};
const add = (x, y) => ({ a: x.a + y.a, b: x.b + y.b });

console.log(`A = ${laneName.a} · B = ${laneName.b}`);
for (const [title, lanes] of [
  ["Bilateral column closed", ["a", "b"]],
  ["Bilateral column open", ["a", "b", "shared"]],
]) {
  console.log(`\n${title}`);
  console.log(
    `  ${"clause".padEnd(10)} ${"heading".padEnd(45)} ${"A".padStart(3)} ${"B".padStart(3)}   share now     retired weights`,
  );
  const shares = computeBenefitShare(grid, lanes);
  let total = { a: 0, b: 0 };
  let retiredTotal = { a: 0, b: 0 };
  for (const row of grid.rows) {
    const now = shares.get(row.clauseId);
    if (!now || now.a + now.b === 0) continue;
    const before = retiredShare(row, lanes);
    total = add(total, now);
    retiredTotal = add(retiredTotal, before);
    console.log(
      `  ${row.clauseId.padEnd(10)} ${row.heading.slice(0, 45).padEnd(45)} ${String(now.a).padStart(3)} ${String(now.b).padStart(3)}   ${pct(now)}   ${pct(before)}  (${(before.a + before.b).toFixed(1)} points)`,
    );
  }
  console.log(
    `  ${"document".padEnd(10)} ${"".padEnd(45)} ${String(total.a).padStart(3)} ${String(total.b).padStart(3)}   ${pct(total)}   ${pct(retiredTotal)}`,
  );
}

for (const clauseId of detailIds) {
  const row = grid.rows.find((r) => r.clauseId === clauseId);
  if (!row) {
    console.log(`\n${clauseId}: no statements in the grid`);
    continue;
  }
  console.log(`\n${clauseId} · ${row.heading}`);
  for (const lane of ["a", "b", "shared"]) {
    for (const mark of row.marks[lane]) {
      if (!DEONTIC_MARK_KINDS.includes(mark.kind)) continue;
      const gains =
        lane === "shared"
          ? "shared"
          : mark.kind === "right"
            ? lane
            : mark.counterpartLane;
      console.log(
        `  ${mark.id.padEnd(16)} ${mark.kind.padEnd(12)} in the lane of ${laneName[lane].padEnd(32)} credits ${gains ? laneName[gains] : "nobody"}`,
      );
    }
  }
}
