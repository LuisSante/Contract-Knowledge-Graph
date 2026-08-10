import { api } from '@/lib/api';
import { useDocumentStore } from '@/stores/document';
import type { DocumentMeta } from '@/types/document';

/** Lists the CUAD dataset documents available in the backend. */
export async function listDocuments(): Promise<DocumentMeta[]> {
	const response = await api.get<DocumentMeta[]>('/list_documents');
	return response.data;
}

/** Downloads a document's `.docx` binary (to parse it with docx4js in the browser). */
export async function fetchDocumentFile(docId: string): Promise<ArrayBuffer> {
	const response = await api.get<ArrayBuffer>(
		`/document_file/${encodeURIComponent(docId)}`,
		{ responseType: 'arraybuffer' }
	);
	return response.data;
}

/**
 * Resolves a document's metadata by id. Uses the document already selected in
 * the store if it matches; otherwise queries the list and caches it.
 */
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
