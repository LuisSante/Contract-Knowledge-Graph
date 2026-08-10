import type { NextConfig } from 'next';

// Origen del backend ContraVis. El frontend llama same-origin `/api/v1/*` y Next
// reenvía (proxy) a este backend server-side, evitando CORS por completo.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8300';

const nextConfig: NextConfig = {
	async rewrites() {
		return [
			{
				source: '/api/v1/:path*',
				destination: `${BACKEND_URL}/api/v1/:path*`,
			},
		];
	},
};

export default nextConfig;
