'use client';

import { useEffect } from 'react';

export interface DocNote {
	pid: string;
	text: string;
	tone: 'gap' | 'warn' | 'step';
	at: 'before' | 'after';
}

interface DocNotesParams {
	active: boolean;
	renderEpoch: number;
	paragraphElementById: Map<string, HTMLElement>;
	notes: DocNote[];
}

/**
 * Draws what the panel found next to the paragraph it belongs to — including what is
 * missing, which the text itself cannot show.
 */
export function useDocNotes({ active, renderEpoch, paragraphElementById, notes }: DocNotesParams) {
	const key = notes.map((n) => `${n.pid}|${n.at}|${n.tone}|${n.text}`).join('\n');

	useEffect(() => {
		if (!active || renderEpoch === 0 || notes.length === 0) return;
		const made: HTMLElement[] = [];
		for (const note of notes) {
			const target = paragraphElementById.get(note.pid);
			if (!target) continue;
			const tag = document.createElement('div');
			tag.className = `docx-note docx-note--${note.tone}`;
			tag.textContent = note.text;
			if (note.at === 'before') target.before(tag);
			else target.after(tag);
			made.push(tag);
		}
		return () => made.forEach((tag) => tag.remove());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, renderEpoch, key, paragraphElementById]);
}
