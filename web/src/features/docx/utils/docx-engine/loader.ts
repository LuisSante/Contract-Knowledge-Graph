import type { Docx4jsBrowserModule } from './types';

export function resolveDocx4jsFromRequire(): Docx4jsBrowserModule | null {
	const maybeRequire = (
		globalThis as typeof globalThis & { require?: (moduleName: string) => unknown }
	).require;
	if (typeof maybeRequire !== 'function') return null;

	try {
		const mod = maybeRequire('docx4js') as Partial<Docx4jsBrowserModule> | undefined;
		if (mod?.docx?.load) return mod as Docx4jsBrowserModule;
	} catch {
		return null;
	}

	return null;
}
