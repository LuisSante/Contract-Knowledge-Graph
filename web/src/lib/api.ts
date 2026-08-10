import axios from 'axios';

/**
 * Frontend HTTP client.
 *
 * `baseURL` is relative (`/api/v1`): the browser makes same-origin calls and Next
 * proxies to the backend (see `next.config.ts` → rewrites), avoiding CORS. The
 * interceptor injects `Authorization: Token <key>` when a token is available
 * — scaffolding for a future login layer.
 */
export const api = axios.create({
	baseURL: process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1',
	withCredentials: false,
});

api.interceptors.request.use((config) => {
	const token = process.env.NEXT_PUBLIC_API_TOKEN;
	if (token) {
		config.headers.set('Authorization', `Token ${token}`);
	}
	return config;
});
