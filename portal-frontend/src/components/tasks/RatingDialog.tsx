import { createPortal } from "react-dom";
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Clock, Star, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { Task } from "../../lib/tasks";
import { useToast } from "../Toast";
import { StarRatingInput } from "./StarRating";
import "../../styles/performance.css";

interface Props {
  task: Task;
  /** "approve": approve the task in review with a rating. "rate": rate (or re-rate) a done task. */
  mode: "approve" | "rate";
  assigneeName: string;
  onCancel: () => void;
  onDone: () => void;
}

/** Hours that count for the score: logged time, else the estimate, else 1 (mirrors the server). */
function scoreHours(task: Task) {
  const actual = Number(task.actualHours ?? 0);
  if (actual > 0) return actual;
  const estimate = Number(task.estimateHours ?? 0);
  return estimate > 0 ? estimate : 1;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

export function RatingDialog({ task, mode, assigneeName, onCancel, onDone }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [rating, setRating] = useState(task.rating ?? 0);
  const [note, setNote] = useState(task.ratingNote ?? "");
  const [busy, setBusy] = useState(false);
  const hours = scoreHours(task);

  async function submit(e: FormEvent | null, withRating = true) {
    e?.preventDefault();
    if (withRating && !rating) return;
    setBusy(true);
    try {
      if (mode === "approve") {
        await apiFetch(`/api/v1/tasks/${task.id}/transition`, {
          method: "POST",
          body: { toStatus: "done", ...(withRating ? { rating, ratingNote: note.trim() || undefined } : {}) },
          accessToken,
        });
        toast(withRating ? `Approved with ${rating} star${rating === 1 ? "" : "s"}` : "Approved");
      } else {
        await apiFetch(`/api/v1/tasks/${task.id}/rating`, { method: "POST", body: { rating, note: note.trim() || undefined }, accessToken });
        toast(`Rated ${rating} star${rating === 1 ? "" : "s"}`);
      }
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that. Please try again.", "error");
      setBusy(false);
    }
  }

  return createPortal(
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onCancel}>
      <motion.form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-title"
        onSubmit={(e) => submit(e)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id="rating-title"><Star size={20} className="rating-title-icon" /> {mode === "approve" ? "Approve and rate" : task.rating ? "Change the rating" : "Rate this work"}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onCancel}><X size={18} /></button>
        </div>
        <p className="muted-small">{task.title}</p>

        <div className="field">
          <span className="field-label" id="rating-label">How good was {assigneeName === "You" ? "the work" : `${assigneeName}'s work`}?</span>
          <StarRatingInput value={rating} onChange={setRating} label="Rating, 1 to 5 stars" />
        </div>

        <div className="rating-explain">
          <Clock size={16} />
          <div>
            <strong>Stars count for more on longer tasks: points = hours × stars.</strong>
            <span>
              This task counts as {fmt(hours)}h, so {rating ? `${rating} star${rating === 1 ? "" : "s"} adds about ${fmt(hours * (rating / 5) * 10)} points` : "each star adds about " + fmt(hours * 2) + " points"} to their monthly score (finishing on time adds 10%, late takes off 15%).
            </span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="rating-note">A few words (optional)</label>
          <textarea id="rating-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What went well, what could be better next time?" />
        </div>

        <div className="modal-actions wrap">
          {mode === "approve" && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => submit(null, false)} title="It counts as 3 stars">
              Approve without stars
            </button>
          )}
          <button className="btn" disabled={busy || !rating}>
            {mode === "approve" ? "Approve" : "Save rating"}
          </button>
        </div>
      </motion.form>
    </motion.div>,
    document.body,
  );
}
