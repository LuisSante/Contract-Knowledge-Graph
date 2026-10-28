import type { Node } from './paragraph';

export type EvidenceParagraph = {
	node: Node;
	/** Why it is linked to the selected paragraph, when the graph says so: one clause modifies,
	 *  depends on or refers to another (`from` and `to` are their numbers, such as "§11" and "§8.4"), or
	 *  it holds the condition of a statement written apart from it («Unless…», with its trigger). */
	relation?:
		| { kind: 'modifies' | 'depends_on' | 'references'; from: string; to: string }
		/** It defines words the selected clause uses: their names, the defining clause's number,
		 *  and on the last such link how many more were left without a line. */
		| { kind: 'uses'; terms: string[]; definedIn: string; more: number }
		/** It uses words the selected clause defines: their names, this clause's number, and on
		 *  the last such link how many more were left without a line. */
		| { kind: 'defines'; terms: string[]; usedIn: string; more: number }
		| { kind: 'condition'; lead: string; trigger: string };
};
