import { create } from 'zustand';
import type { ClauseTreeNode, DocumentMeta, Node } from '@/types/document';

interface DocumentState {
	currentDocument: DocumentMeta | null;
	paragraphs: Node[];
	clauseTree: ClauseTreeNode[];
	loading: boolean;
	error: string | null;
	selectedParagraph: Node | null;

	setCurrentDocument: (doc: DocumentMeta | null) => void;
	setParagraphs: (paragraphs: Node[]) => void;
	setClauseTree: (clauseTree: ClauseTreeNode[]) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	setSelectedParagraph: (paragraph: Node | null) => void;
	reset: () => void;
}

const initialState = {
	currentDocument: null,
	paragraphs: [] as Node[],
	clauseTree: [] as ClauseTreeNode[],
	loading: false,
	error: null as string | null,
	selectedParagraph: null as Node | null,
};

export const useDocumentStore = create<DocumentState>((set) => ({
	...initialState,
	setCurrentDocument: (currentDocument) => set({ currentDocument }),
	setParagraphs: (paragraphs) => set({ paragraphs }),
	setClauseTree: (clauseTree) => set({ clauseTree }),
	setLoading: (loading) => set({ loading }),
	setError: (error) => set({ error }),
	setSelectedParagraph: (selectedParagraph) => set({ selectedParagraph }),
	reset: () => set(initialState),
}));
