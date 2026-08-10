// Shared engine for "zoom with Shift + Scroll": keeps a compression value
// (0→1), animates it with a RAF tween (cubic easing) on
// Shift+Scroll and reschedules a recompute on the host's scroll/resize/ResizeObserver.
// Used by the related bridge and the contradiction evidence compression; each
// one only provides its `refresh` (what to recompute), its `durationMs` and, optionally,
// `canCompress` (when to allow the gesture).

const COMPRESS_SNAP_EPSILON = 0.001;
const WHEEL_DIRECTION_DEADZONE = 2;

interface AttachShiftWheelCompressionOptions {
	host: HTMLElement;
	/** Tween duration in ms (related: 560, contradiction: 420). */
	durationMs: number;
	/** Recomputes with the current compression value (compute + setState + classes). */
	refresh: (compression: number) => void;
	/** If it returns false, Shift+Scroll does not compress (leaves normal scrolling). */
	canCompress?: () => boolean;
}

/**
 * Attaches the compression engine to the host and returns the cleanup function.
 * Call inside a `useEffect` (lifecycle/deps are governed by the hook that
 * uses it). A `cleanup()` cancels the tween, the RAFs and removes the listeners.
 */
export function attachShiftWheelCompression({
	host,
	durationMs,
	refresh,
	canCompress,
}: AttachShiftWheelCompressionOptions): () => void {
	let compression = 0;
	let target = 0;
	let frame: number | null = null;
	let tween: number | null = null;

	const schedule = () => {
		if (frame != null) cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			frame = null;
			refresh(compression);
		});
	};

	const animate = (timestamp: number, startValue: number, startTime: number) => {
		const elapsed = timestamp - startTime;
		const linearProgress = Math.max(0, Math.min(1, elapsed / durationMs));
		const easedProgress =
			linearProgress < 0.5
				? 4 * linearProgress * linearProgress * linearProgress
				: 1 - Math.pow(-2 * linearProgress + 2, 3) / 2;
		compression = startValue + (target - startValue) * easedProgress;
		refresh(compression);

		const delta = Math.abs(target - compression);
		if (linearProgress >= 1 || delta <= COMPRESS_SNAP_EPSILON) {
			compression = target;
			tween = null;
			refresh(compression);
			return;
		}
		tween = requestAnimationFrame((next) => animate(next, startValue, startTime));
	};

	const handleWheel = (event: WheelEvent) => {
		if (!event.shiftKey) return;
		if (canCompress && !canCompress()) return;
		const wheelDelta =
			Math.abs(event.deltaY) >= WHEEL_DIRECTION_DEADZONE ? event.deltaY : event.deltaX;
		if (Math.abs(wheelDelta) < WHEEL_DIRECTION_DEADZONE) return;
		event.preventDefault();
		const nextTarget = wheelDelta > 0 ? 1 : 0;
		if (nextTarget === target && tween != null) return;

		target = nextTarget;
		const startValue = compression;
		const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
		if (tween != null) {
			cancelAnimationFrame(tween);
			tween = null;
		}
		tween = requestAnimationFrame((next) => animate(next, startValue, startTime));
	};

	schedule();
	host.addEventListener('scroll', schedule, { passive: true });
	window.addEventListener('resize', schedule);
	host.addEventListener('wheel', handleWheel, { passive: false });
	const observer = new ResizeObserver(schedule);
	observer.observe(host);

	return () => {
		host.removeEventListener('scroll', schedule);
		window.removeEventListener('resize', schedule);
		host.removeEventListener('wheel', handleWheel);
		observer.disconnect();
		if (frame != null) cancelAnimationFrame(frame);
		if (tween != null) cancelAnimationFrame(tween);
	};
}
