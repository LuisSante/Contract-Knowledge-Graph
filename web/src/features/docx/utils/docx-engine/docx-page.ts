import type { Docx4jsBrowserModule } from './types';
import { resolveDocx4jsFromRequire } from './loader';

/**
 * DOM helpers for the docx viewer (loading the browser docx4js bundle and
 * managing the relations badge). REST queries were moved to
 * `@/services/*`; the graph builders to `@/services/graph`.
 */

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

export function getRelationsCount(
	relationsCountByNodeId: Map<string, number>,
	nodeId: string
): number {
	return relationsCountByNodeId.get(nodeId) ?? 0;
}

export function updateRelationBadge(
	paragraphRelationHostById: Map<string, HTMLElement>,
	relationsCountByNodeId: Map<string, number>,
	nodeId: string,
	host?: HTMLElement | null
) {
	const target = host ?? paragraphRelationHostById.get(nodeId);
	if (!target) return;

	const relationsCount = getRelationsCount(relationsCountByNodeId, nodeId);
	if (relationsCount <= 0) {
		target.classList.remove(
			'docx-relations-badge-host',
			'docx-related-badge-emphasis',
			'docx-related-badge--reference',
			'docx-related-badge--similarity'
		);
		delete target.dataset.relationsCount;
		delete target.dataset.relationsTone;
		target.style.removeProperty('--docx-relations-badge-right');
		target.style.removeProperty('--docx-relations-guide-right');
		return;
	}

	target.classList.add('docx-relations-badge-host');
	target.dataset.relationsCount = String(relationsCount);
	target.dataset.relationsTone = 'linked';
	alignRelationBadgeToPage(target);
}

function parseCssPx(value: string): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function alignRelationBadgeToPage(target: HTMLElement) {
	if (typeof window === 'undefined') return;

	const applyAlignment = () => {
		const section = target.closest('section');
		if (!(section instanceof HTMLElement)) return;

		const targetRect = target.getBoundingClientRect();
		const sectionRect = section.getBoundingClientRect();
		if (targetRect.width <= 0 || sectionRect.width <= 0) return;

		const sectionStyles = window.getComputedStyle(section);
		const sectionPaddingRight = parseCssPx(sectionStyles.paddingRight);
		const pageTextRightPx = sectionRect.right - sectionPaddingRight;
		const badgeCenterX = pageTextRightPx + 14;

		target.style.setProperty(
			'--docx-relations-badge-right',
			`${targetRect.right - badgeCenterX - 11}px`
		);
		target.style.setProperty(
			'--docx-relations-guide-right',
			`${targetRect.right - badgeCenterX - 1}px`
		);
	};

	if (target.isConnected) {
		applyAlignment();
		return;
	}

	window.requestAnimationFrame(applyAlignment);
}
