import axios from 'axios';

export function getAxiosErrorMessage(error: unknown, fallbackMessage: string): string {
	const detail =
		axios.isAxiosError(error) &&
		error.response?.data &&
		typeof error.response.data === 'object' &&
		'detail' in error.response.data &&
		typeof error.response.data.detail === 'string'
			? error.response.data.detail
			: null;

	if (detail) return detail;
	if (error instanceof Error && error.message) return error.message;
	return fallbackMessage;
}
