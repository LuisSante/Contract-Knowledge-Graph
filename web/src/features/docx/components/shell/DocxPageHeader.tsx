'use client';

import Link from 'next/link';
import { FileText, ChevronLeft, Coins } from 'lucide-react';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { GLOBAL_ANALYSIS_MODEL_OPTIONS } from '@/constants/docx-viewer';

interface DocxPageHeaderProps {
	documentName: string | null;
	costLabel: string | null;
	model: string;
	onModelChange: (value: string) => void;
	modelDisabled?: boolean;
}

/**
 * Top header of the viewer: "Document" label + name, accumulated LLM cost, and
 * global model selector (Contradiction Analysis + Paragraph Explanation).
 */
export function DocxPageHeader({
	documentName,
	costLabel,
	model,
	onModelChange,
	modelDisabled,
}: DocxPageHeaderProps) {
	return (
		<header className="flex flex-none items-center gap-3 border-b border-border bg-header px-4 py-2.5">
			<Link
				href="/"
				className="flex size-7 flex-none items-center justify-center rounded-lg text-header-foreground/70 transition-colors hover:bg-header-foreground/15 hover:text-header-foreground"
				aria-label="Back to documents"
				title="Back to documents"
			>
				<ChevronLeft className="size-4" />
			</Link>

			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span className="flex size-7 flex-none items-center justify-center rounded-lg bg-card text-primary shadow-sm">
					<FileText className="size-4" />
				</span>
				<div className="min-w-0 truncate text-sm font-medium text-header-foreground">
					{documentName || 'No document selected'}
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-2.5">
				{costLabel && (
					<div
						className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-2xs font-medium text-primary shadow-sm"
						title="Total accumulated real LLM usage cost"
					>
						<Coins className="size-3 text-primary" />
						{costLabel}
					</div>
				)}
				<Select value={model} onValueChange={onModelChange} disabled={modelDisabled}>
					<SelectTrigger
						size="sm"
						className="h-7 w-[88px] shrink-0 border-transparent bg-card px-2 text-2xs text-primary shadow-sm hover:bg-card/90 focus-visible:ring-header-foreground/40 [&_svg]:text-primary"
						title="Global model for Contradiction Analysis and Paragraph Explanation"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="min-w-0">
						{GLOBAL_ANALYSIS_MODEL_OPTIONS.map((option) => (
							<SelectItem
								key={option.value}
								value={option.value}
								className="text-2xs whitespace-nowrap"
							>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</header>
	);
}
