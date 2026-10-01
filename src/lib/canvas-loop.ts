/**
 * Runs a canvas animation without hurting page speed:
 * - waits until the page has loaded and the browser is idle, so it never
 *   delays the first paint or the page becoming usable;
 * - draws at most `fps` frames a second;
 * - pauses while the canvas is off screen or the tab is hidden;
 * - draws one still frame instead of animating for people who asked for
 *   reduced motion, and on small screens when `still` says so.
 * Returns a function that stops everything.
 */
export function startCanvasLoop(
  canvas: HTMLCanvasElement,
  frame: (time: number) => void,
  { fps = 30, still = false }: { fps?: number; still?: boolean } = {},
): () => void {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || still) {
    frame(0);
    return () => {};
  }

  const interval = 1000 / fps;
  let raf = 0;
  let last = 0;
  let visible = true;
  let started = false;
  let stopped = false;

  const tick = (time: number) => {
    raf = 0;
    if (stopped || !visible || document.hidden) return;
    if (time - last >= interval) {
      last = time;
      frame(time);
    }
    raf = requestAnimationFrame(tick);
  };
  const resume = () => {
    if (started && !stopped && !raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resume();
  });
  observer.observe(canvas);
  document.addEventListener('visibilitychange', resume);

  // One still frame right away so the space isn't empty, then animate once the page is idle.
  frame(0);
  const begin = () => {
    started = true;
    resume();
  };
  const hasIdle = typeof window.requestIdleCallback === 'function';
  const idle = (cb: () => void): number => (hasIdle ? window.requestIdleCallback(cb, { timeout: 4000 }) : window.setTimeout(cb, 2500));
  let idleId: number | undefined;
  const onLoad = () => {
    idleId = idle(begin);
  };
  if (document.readyState === 'complete') onLoad();
  else window.addEventListener('load', onLoad, { once: true });

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    if (idleId !== undefined) {
      if (hasIdle) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    }
    window.removeEventListener('load', onLoad);
    observer.disconnect();
    document.removeEventListener('visibilitychange', resume);
  };
}

/** Phones and small tablets get a still background instead of a running one. */
export const isSmallScreen = () => window.matchMedia?.('(max-width: 767px)').matches ?? false;
