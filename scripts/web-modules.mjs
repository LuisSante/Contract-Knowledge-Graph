// Lets a Node script import the web app's TypeScript modules the way the app does:
// through the "@/" alias and without extensions. Import it before any "@/" module.
//
// Needs Node >= 23.6 (strips TypeScript types natively).
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
const src = pathToFileURL(`${root}web/src/`).href;

const hooks = `
export async function resolve(spec, ctx, next) {
	if (spec.startsWith('@/')) spec = ${JSON.stringify(src)} + spec.slice(2);
	if ((spec.startsWith('file:') || spec.startsWith('.')) && !/\\.[cm]?[jt]s$/.test(spec)) spec += '.ts';
	return next(spec, ctx);
}
export async function load(url, ctx, next) {
	return next(url, url.endsWith('.ts') ? { ...ctx, format: 'module-typescript' } : ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
