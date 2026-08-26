import { create } from 'zustand';
import type { DocumentMeta, Node } from '@/types/document';

interface DocumentState {
	currentDocument: DocumentMeta | null;
	paragraphs: Node[];
	loading: boolean;
	error: string | null;
	selectedParagraph: Node | null;

	setCurrentDocument: (doc: DocumentMeta | null) => void;
	setParagraphs: (paragraphs: Node[]) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	setSelectedParagraph: (paragraph: Node | null) => void;
	reset: () => void;
}

const initialState = {
	currentDocument: null,
	paragraphs: [] as Node[],
	loading: false,
	error: null as string | null,
	selectedParagraph: null as Node | null,
};

export const useDocumentStore = create<DocumentState>((set) => ({
	...initialState,
	setCurrentDocument: (currentDocument) => set({ currentDocument }),
	setParagraphs: (paragraphs) => set({ paragraphs }),
	setLoading: (loading) => set({ loading }),
	setError: (error) => set({ error }),
	setSelectedParagraph: (selectedParagraph) => set({ selectedParagraph }),
	reset: () => set(initialState),
}));
