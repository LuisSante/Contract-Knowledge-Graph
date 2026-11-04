'use client';

import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { estimateFlagExplanation, explainFlag } from '@/services/flag-explanation';
import type {
	FlagExplanationInput,
	FlagExplanationEstimate,
	FlagExplanationResponse,
} from '@/types/flag-explanation';

/** Explicación efímera conectada al camino; sus motivos nunca pasan a ser aristas. */
export function FlagExplanation({
	docId,
	input,
	onResult,
}: {
	docId: string;
	input: FlagExplanationInput;
	onResult: (result: FlagExplanationResponse | null) => void;
}) {
	const [estimate, setEstimate] = useState<FlagExplanationEstimate | null>(null);
	const [busy, setBusy] = useState<'estimate' | 'generate' | null>(null);
	const [error, setError] = useState('');
	const inFlight = useRef(false);
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const message = (err: unknown) =>
		isAxiosError(err) && typeof err.response?.data?.detail === 'string'
			? err.response.data.detail
			: 'Could not get the explanation. You can try again.';
	const prepare = async () => {
		if (inFlight.current) return;
		inFlight.current = true;
		setBusy('estimate');
		setError('');
		try {
			const next = await estimateFlagExplanation(docId, input);
			if (mounted.current) setEstimate(next);
		} catch (err) {
			setError(message(err));
		} finally {
			setBusy(null);
			inFlight.current = false;
		}
	};
	const generate = async () => {
		if (!estimate || inFlight.current) return;
		inFlight.current = true;
		setBusy('generate');
		setError('');
		try {
			const next = await explainFlag(docId, input);
			if (!mounted.current) return;
			setEstimate(null);
			onResult(next);
		} catch (err) {
			setError(message(err));
		} finally {
			setBusy(null);
			inFlight.current = false;
		}
	};

	return (
		<section
			aria-label="Red flag explanation"
			className="relative mt-3 border-l-2 border-border pl-3 text-xs before:absolute before:-top-3 before:-left-0.5 before:h-3 before:border-l-2 before:border-border"
		>
			{!estimate && (
				<Button size="sm" variant="outline" disabled={!!busy} onClick={() => void prepare()}>
					{busy ? 'Preparing…' : 'Why is it a red flag?'}
				</Button>
			)}
			{estimate && (
				<div className="space-y-2 rounded-md border border-border bg-card p-3">
					<p className="font-semibold">Explain with {estimate.model}</p>
					<p className="text-muted-foreground">
						Estimated cost:{' '}
						{estimate.estimatedCostUsd === null
							? 'unavailable'
							: `≈ US$ ${estimate.estimatedCostUsd.toFixed(4)}`}{' '}
						per request. The total may vary with the response and reasoning.
					</p>
					<div className="flex flex-wrap gap-2">
						<Button size="sm" disabled={!!busy} onClick={() => void generate()}>
							{busy === 'generate' ? 'Generating explanation…' : 'Generate explanation'}
						</Button>
						<Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setEstimate(null)}>
							Cancel
						</Button>
					</div>
				</div>
			)}
			{error && (
				<p role="alert" className="mt-2 text-destructive">
					{error}
				</p>
			)}
		</section>
	);
}

/** Tarjetas de argumento: son anotaciones de la vista, no nodos de la ontología. */
export function ExplanationCards({
	result,
	selected,
	onSelect,
}: {
	result: FlagExplanationResponse;
	selected: number | null;
	onSelect: (index: number | null) => void;
}) {
	const { explanation } = result;
	return (
		<section
			aria-label="AI explanation layer"
			className="relative mt-8 border-t border-border/60 pt-3"
		>
			<div className="flex min-w-[860px] items-start justify-center gap-[140px] px-12 pt-12 pb-3">
				<div className="flex w-[220px] shrink-0 flex-col gap-5">
					{explanation.reasons.map((reason, index) => {
						const active = selected === index;
						return (
							<article
								key={reason.id}
								data-explanation-card={`reason-${index}`}
								className={cn(
									'relative z-10 w-[220px] shrink-0 rounded-md border border-dashed border-muted-foreground/60 bg-card p-3 text-xs',
									active && 'ring-2 ring-primary/50'
								)}
							>
								<button
									type="button"
									aria-pressed={active}
									className="w-full text-left"
									onClick={() => onSelect(active ? null : index)}
								>
									{reason.kind === 'missing_information' && (
										<span className="text-[10px] text-muted-foreground">Information gap</span>
									)}
									<h4 className="mt-1 font-semibold">{reason.concept}</h4>
								</button>
							</article>
						);
					})}
				</div>
				<article
					data-explanation-card="conclusion"
					className="relative z-10 w-[280px] shrink-0 rounded-md border border-dashed border-muted-foreground bg-card p-3 text-xs"
				>
					<h3 className="font-semibold" aria-label="Risk summary">
						{explanation.summary}
					</h3>
				</article>
			</div>
		</section>
	);
}
