// Runs the What if… comparator of the Clause Analyzer on one knowledge graph, with the
// same modules the web app ships, so any number quoted in docs/ can be regenerated.
//
//   node scripts/comparators.mjs [kg json] [party A id] [party B id]
//
// Needs Node >= 23.6 (strips TypeScript types natively).
import { readFileSync } from "node:fs";

import { root } from "./web-modules.mjs";

const kgFile =
  process.argv[2] ??
  `${root}infra/json/kg/root_BELLICUMPHARMACEUTICALS_INC_05_07_2019-EX-10_1-Supply_Agreement.json`;
const [aId, bId] = [process.argv[3] ?? "party-1", process.argv[4] ?? "party-2"];
const kg = JSON.parse(readFileSync(kgFile, "utf8"));

const { buildScenarios } =
  await import("@/features/docx/utils/knowledge/scenarios");

const name = (id) => kg.parties.find((p) => p.id === id)?.name ?? id;
console.log(`A = ${name(aId)} · B = ${name(bId)}\n`);

console.log("Scenarios (read as B)");
for (const c of buildScenarios(kg, aId, bId, "b"))
  console.log(
    `  ${c.id.padEnd(10)} ${c.steps.length} steps · ${c.steps.filter((s) => s.risk).length} risks · ${c.limits.length} limits · ${c.gaps.length} gaps`,
  );
