'use client';

import { useState } from 'react';

/** Types a weight the slider can only approximate; the draft lets a half-typed number stand. */
export function WeightField({
	value,
	label,
	onCommit,
}: {
	value: number;
	label: string;
	onCommit: (value: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<input
			type="text"
			inputMode="decimal"
			value={draft ?? String(value)}
			onChange={(event) => {
				const raw = event.target.value;
				setDraft(raw);
				const parsed = Number(raw.replace(',', '.'));
				if (raw.trim() !== '' && !Number.isNaN(parsed)) onCommit(parsed);
			}}
			onBlur={() => setDraft(null)}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur();
			}}
			className="w-9 shrink-0 rounded border border-border/60 bg-background px-1 py-px text-center font-medium text-blue-600 tabular-nums outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/60"
			aria-label={label}
			title="Type a weight between 0 and 1"
		/>
	);
}
