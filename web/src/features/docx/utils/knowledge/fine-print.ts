import type { KgDeontic } from '@/types/knowledge';

const NOTICE =
	/\(?(\d+)\)?\s*(days?|months?)[’']?\s*(?:prior\s+)?(?:advance\s+)?(?:written\s+)?notice/i;

/** The extracted deadline, or the notice period the text itself states. */
export function termOf(s: KgDeontic): string | null {
	if (s.deadline?.trim()) return s.deadline.trim();
	const hit = NOTICE.exec(s.text ?? '');
	return hit ? `${hit[1]} ${hit[2].toLowerCase()} notice` : null;
}
