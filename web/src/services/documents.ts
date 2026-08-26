import { api } from '@/lib/api';
import { useDocumentStore } from '@/stores/document';
import type { DocumentMeta } from '@/types/document';

export async function listDocuments(): Promise<DocumentMeta[]> {
	const response = await api.get<DocumentMeta[]>('/list_documents');
	return response.data;
}

export async function fetchDocumentFile(docId: string): Promise<ArrayBuffer> {
	const response = await api.get<ArrayBuffer>(
		`/document_file/${encodeURIComponent(docId)}`,
		{ responseType: 'arraybuffer' }
	);
	return response.data;
}

export async function resolveDocumentMeta(docId: string): Promise<DocumentMeta | null> {
	const { currentDocument, setCurrentDocument } = useDocumentStore.getState();
	if (currentDocument?.id === docId) return currentDocument;

	try {
		const documents = await listDocuments();
		const found = documents.find((doc) => doc.id === docId) ?? null;
		if (found) setCurrentDocument(found);
		return found;
	} catch {
		return null;
	}
}
