import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
