import type { KgDeontic } from '@/types/knowledge';

// The words that move a clause toward one side without changing who holds it.
const RULES: Array<[string, RegExp]> = [
	['sole discretion', /sole(?: and absolute)? discretion/i],
	['without cause', /without cause|for any reason or no reason|for convenience/i],
	['needs consent', /prior written consent|without the (?:prior )?consent/i],
	['not unreasonably withheld', /not (?:to )?be unreasonably withheld/i],
	['best efforts', /best efforts/i],
	['reasonable efforts', /reasonable efforts/i],
	['capped', /shall not exceed|not to exceed|maximum liability/i],
	['exclusive remedy', /sole and exclusive remedy/i],
	['at any time', /at any time/i],
];

export function finePrint(text: string): string[] {
	return RULES.filter(([, rx]) => rx.test(text)).map(([label]) => label);
}

const NOTICE =
	/\(?(\d+)\)?\s*(days?|months?)[’']?\s*(?:prior\s+)?(?:advance\s+)?(?:written\s+)?notice/i;

/** The extracted deadline, or the notice period the text itself states. */
export function termOf(s: KgDeontic): string | null {
	if (s.deadline?.trim()) return s.deadline.trim();
	const hit = NOTICE.exec(s.text ?? '');
	return hit ? `${hit[1]} ${hit[2].toLowerCase()} notice` : null;
}

const STOP = new Set(
	'the a an of to and or in on for by with as be shall will may must not any all its their this that such other under from at is are no each party parties agreement module'.split(
		' '
	)
);

export function tokens(text: string, drop: string[] = []): Set<string> {
	let clean = text.toLowerCase();
	for (const name of drop) if (name.length > 2) clean = clean.split(name.toLowerCase()).join(' ');
	return new Set((clean.match(/[a-z]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)));
}

export function overlap(x: Set<string>, y: Set<string>): number {
	if (!x.size || !y.size) return 0;
	let common = 0;
	for (const w of x) if (y.has(w)) common++;
	return (2 * common) / (x.size + y.size);
}
