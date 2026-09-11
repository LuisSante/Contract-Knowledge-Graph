/**
 * Matched to the code that already exists, not to Prettier's defaults: the app is
 * written with tabs and single quotes, and `es5` keeps trailing commas out of the
 * parameter lists where this codebase never put them.
 */
const config = {
	useTabs: true,
	singleQuote: true,
	semi: true,
	printWidth: 100,
	trailingComma: 'es5',
};

export default config;
