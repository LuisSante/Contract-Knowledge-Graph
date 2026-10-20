import type { Node } from './paragraph';

export type EvidenceParagraph = {
	node: Node;
	/** Why it is linked to the selected paragraph, when the graph says so: one clause modifies
	 *  another (`from` and `to` are their numbers, such as "§11" and "§8.4"). */
	relation?: { kind: 'modifies'; from: string; to: string };
};
