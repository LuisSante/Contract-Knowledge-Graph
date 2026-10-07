// Runs the two comparators of the Clause Analyzer on one knowledge graph, with the
// same modules the web app ships, so any number quoted in docs/ can be regenerated.
//
//   node scripts/comparators.mjs [kg json] [party A id] [party B id]
//
// Needs Node >= 23.6 (strips TypeScript types natively).
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = pathToFileURL(`${root}web/src/`).href;

// The web code imports through the "@/" alias and without extensions.
const hooks = `
export async function resolve(spec, ctx, next) {
	if (spec.startsWith('@/')) spec = ${JSON.stringify(src)} + spec.slice(2);
	if ((spec.startsWith('file:') || spec.startsWith('.')) && !/\\.[cm]?[jt]s$/.test(spec)) spec += '.ts';
	return next(spec, ctx);
}
export async function load(url, ctx, next) {
	return next(url, url.endsWith('.ts') ? { ...ctx, format: 'module-typescript' } : ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const kgFile =
	process.argv[2] ??
	`${root}infra/json/kg/root_BELLICUMPHARMACEUTICALS_INC_05_07_2019-EX-10_1-Supply_Agreement.json`;
const [aId, bId] = [process.argv[3] ?? 'party-1', process.argv[4] ?? 'party-2'];
const kg = JSON.parse(readFileSync(kgFile, 'utf8'));

const { buildMirror } = await import('@/features/docx/utils/knowledge/mirror');
const { buildScenarios } = await import('@/features/docx/utils/knowledge/scenarios');

const name = (id) => kg.parties.find((p) => p.id === id)?.name ?? id;
console.log(`A = ${name(aId)} · B = ${name(bId)}\n`);

const mirror = buildMirror(kg, aId, bId);
const held = kg.rights.filter((r) => r.benefitPartyId === aId || r.benefitPartyId === bId).length;
const paired = mirror.rows.reduce((n, r) => n + (r.a ? 1 : 0) + (r.b ? 1 : 0), 0);
console.log('Mirror', mirror.counts, `· ${paired} of ${held} rights fall in a family`);
for (const r of mirror.rows.filter((r) => r.status !== 'same'))
	console.log(`  ${r.status.padEnd(5)} ${r.family.padEnd(9)} ${r.label}`);

console.log('\nScenarios (read as B)');
for (const c of buildScenarios(kg, aId, bId, 'b'))
	console.log(
		`  ${c.id.padEnd(10)} ${c.steps.length} steps · ${c.steps.filter((s) => s.risk).length} risks · ${c.limits.length} limits · ${c.gaps.length} gaps`
	);
