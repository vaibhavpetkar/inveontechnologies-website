import { useRef, type KeyboardEvent } from "react";
import { Star } from "lucide-react";
import "../../styles/performance.css";

export const STAR_WORDS = ["", "Needs a lot of work", "Below expectations", "Good", "Very good", "Outstanding"];

interface InputProps {
  value: number;
  onChange: (stars: number) => void;
  label: string;
  id?: string;
}

/**
 * Pick 1-5 stars. Works like a radio group: Tab lands on the chosen star (or
 * the first), arrow keys move and select, Home/End jump to the ends.
 */
export function StarRatingInput({ value, onChange, label, id }: InputProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(n: number) {
    const next = Math.min(5, Math.max(1, n));
    onChange(next);
    refs.current[next - 1]?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, n: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") select(n + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") select(n - 1);
    else if (e.key === "Home") select(1);
    else if (e.key === "End") select(5);
    else return;
    e.preventDefault();
  }

  return (
    <div className="star-input-wrap">
      <div className="star-input" role="radiogroup" aria-label={label} id={id}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            ref={(el) => (refs.current[n - 1] = el)}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}${STAR_WORDS[n] ? `, ${STAR_WORDS[n]}` : ""}`}
            tabIndex={value ? (value === n ? 0 : -1) : n === 1 ? 0 : -1}
            className={`star-btn${n <= value ? " on" : ""}`}
            onClick={() => select(n)}
            onKeyDown={(e) => onKey(e, n)}
          >
            <Star size={28} />
          </button>
        ))}
      </div>
      <span className="star-word" aria-hidden="true">{value ? STAR_WORDS[value] : "Pick a rating"}</span>
    </div>
  );
}

/** Read-only stars, e.g. "★★★★☆". */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= full ? "on" : ""} aria-hidden="true" />
      ))}
    </span>
  );
}
