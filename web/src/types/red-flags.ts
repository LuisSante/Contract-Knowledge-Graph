/** A red flag as annotated in the ALeaseBERT dataset (notebooks/red_flags.ipynb), not by the system. */
export interface RedFlag {
	/** The last centred heading before the flagged text; empty before the first one. */
	article: string;
	/** The dataset's label, e.g. `break_option`; null for the few it left untyped. */
	type: string | null;
	text: string;
	/** Paragraph index in the DOCX, counted from 0. */
	docxParagraph: number;
}
