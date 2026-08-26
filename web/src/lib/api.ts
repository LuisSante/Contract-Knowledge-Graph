import axios from 'axios';

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
