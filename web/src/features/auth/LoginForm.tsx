import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

/**
 * Login stub (scaffolding). The backend does not expose auth yet; this form
 * exists to pin down the `(auth)/login` route and layout. The real logic
 * (sending credentials, token in `@/lib/api`) will be implemented once the
 * backend has auth.
 */
export function LoginForm() {
	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>Sign in</CardTitle>
				<CardDescription>Access to ContraVis (backend pending).</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<Input type="email" placeholder="Email" disabled />
				<Input type="password" placeholder="Password" disabled />
				<Button className="w-full" disabled>
					Sign in
				</Button>
			</CardContent>
		</Card>
	);
}
