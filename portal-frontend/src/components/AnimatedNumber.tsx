import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/** Counts up from 0 the first time it scrolls into view. */
export function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduce) {
      el.textContent = String(value);
      return;
    }
    const from = Number(el.textContent) || 0;
    const controls = animate(from, value, { duration: 0.8, ease: "easeOut", onUpdate: (v) => (el.textContent = String(Math.round(v))) });
    return () => controls.stop();
  }, [value, inView, reduce]);

  return <span ref={ref}>0</span>;
}
