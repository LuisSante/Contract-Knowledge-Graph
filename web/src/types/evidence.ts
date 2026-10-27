import type { Node } from './paragraph';

export type EvidenceParagraph = {
	node: Node;
	/** Why it is linked to the selected paragraph, when the graph says so: one clause modifies
	 *  or depends on another (`from` and `to` are their numbers, such as "§11" and "§8.4"), or
	 *  it holds the condition of a statement written apart from it («Unless…», with its trigger). */
	relation?:
		| { kind: 'modifies' | 'depends_on'; from: string; to: string }
		| { kind: 'condition'; lead: string; trigger: string };
};
