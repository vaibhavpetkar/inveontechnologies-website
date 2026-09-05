import { useLayoutEffect } from 'react';
import { useLocation } from 'wouter';

function scrollWindowToTop() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    active.blur();
  }

  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export default function ScrollToTop() {
  const [location] = useLocation();

  useLayoutEffect(() => {
    scrollWindowToTop();
    const frame = requestAnimationFrame(scrollWindowToTop);
    return () => cancelAnimationFrame(frame);
  }, [location]);

  return null;
}
