import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BRAND_NAME } from '@/constants/brand';

export function LoginForm() {
	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>Sign in</CardTitle>
				<CardDescription>Access to {BRAND_NAME} (backend pending).</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<label className="block">
					<span className="sr-only">Email</span>
					<Input type="email" placeholder="Email" autoComplete="email" disabled />
				</label>
				<label className="block">
					<span className="sr-only">Password</span>
					<Input type="password" placeholder="Password" autoComplete="current-password" disabled />
				</label>
				<Button className="w-full" disabled>
					Sign in
				</Button>
			</CardContent>
		</Card>
	);
}
