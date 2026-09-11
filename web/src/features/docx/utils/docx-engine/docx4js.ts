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

let browserDocxModulePromise: Promise<Docx4jsBrowserModule> | null = null;

export async function loadBrowserDocx4js(): Promise<Docx4jsBrowserModule> {
	if (browserDocxModulePromise) return browserDocxModulePromise;

	browserDocxModulePromise = new Promise<Docx4jsBrowserModule>((resolve, reject) => {
		const alreadyLoaded = resolveDocx4jsFromRequire();
		if (alreadyLoaded) {
			resolve(alreadyLoaded);
			return;
		}

		const scriptId = 'docx4js-browser-bundle';
		const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

		const finish = () => {
			const loaded = resolveDocx4jsFromRequire();
			if (loaded) {
				resolve(loaded);
				return;
			}
			reject(new Error('docx4js browser bundle loaded, but module is unavailable.'));
		};

		const fail = () => {
			reject(new Error('Unable to load /vendor/docx4js.js'));
		};

		if (existingScript) {
			existingScript.addEventListener('load', finish, { once: true });
			existingScript.addEventListener('error', fail, { once: true });
			return;
		}

		const script = document.createElement('script');
		script.id = scriptId;
		script.src = '/vendor/docx4js.js';
		script.async = true;
		script.addEventListener('load', finish, { once: true });
		script.addEventListener('error', fail, { once: true });
		document.head.appendChild(script);
	}).catch((err) => {
		browserDocxModulePromise = null;
		throw err;
	});

	return browserDocxModulePromise;
}
