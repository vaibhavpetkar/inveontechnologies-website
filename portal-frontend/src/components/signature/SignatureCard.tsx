import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eraser, ImageUp, PenLine, Signature as SignatureIcon, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { useToast } from "../Toast";
import "../../styles/signature.css";

interface SavedSignature {
  image: string;
  updatedAt: string;
}

const W = 560;
const H = 180;

/**
 * Your handwritten signature: draw it or upload a photo of it. It's printed
 * on the offer and appointment letters you accept.
 */
export function SignatureCard() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [saved, setSaved] = useState<SavedSignature | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ signature: SavedSignature | null }>("/api/v1/me/signature", { accessToken })
      .then((r) => setSaved(r.signature))
      .catch(() => setSaved(null));
  }, [accessToken]);

  async function save(image: string) {
    setBusy(true);
    try {
      const r = await apiFetch<{ signature: SavedSignature }>("/api/v1/me/signature", { method: "PUT", body: { image }, accessToken });
      setSaved(r.signature);
      setEditing(false);
      toast("Signature saved");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save your signature.", "error");
    }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm("Remove your signature? Letters you accept after this won't carry it.")) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/me/signature", { method: "DELETE", accessToken });
      setSaved(null);
      toast("Signature removed");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove it.", "error");
    }
    setBusy(false);
  }

  if (saved === undefined) return <section className="panel sig-card"><div className="skeleton" style={{ height: 90 }} /></section>;

  return (
    <section className="panel sig-card" aria-labelledby="sig-title">
      <div className="sig-head">
        <span className="sig-icon"><SignatureIcon size={20} /></span>
        <div>
          <h2 id="sig-title">Digital signature</h2>
          <p className="muted-small">Draw it or upload a photo of it. It's printed on the offer and appointment letters you accept.</p>
        </div>
        {!saved && !editing && (
          <button className="btn btn-sm sig-add" onClick={() => setEditing(true)}><PenLine size={14} /> Add signature</button>
        )}
      </div>
      {saved && !editing && (
        <div className="sig-saved">
          <div className="sig-preview"><img src={saved.image} alt="Your saved signature" /></div>
          <div className="sig-actions">
            <span className="muted-small">Saved {new Date(saved.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEditing(true)}><PenLine size={14} /> Change</button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={remove}><Trash2 size={14} /> Remove</button>
          </div>
        </div>
      )}
      <AnimatePresence>{editing && <SignaturePad busy={busy} onCancel={() => setEditing(false)} onSave={save} />}</AnimatePresence>
    </section>
  );
}

function SignaturePad({ busy, onCancel, onSave }: { busy: boolean; onCancel: () => void; onSave: (image: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ctx = useCallback(() => {
    const c = canvas.current!.getContext("2d")!;
    c.lineWidth = 2.6;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = "#0b1f4d";
    return c;
  }, []);

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  function down(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const c = ctx();
    c.beginPath();
    c.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    c.fillStyle = "#0b1f4d";
    c.fill();
    setEmpty(false);
  }
  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const c = ctx();
    c.beginPath();
    c.moveTo(last.current.x, last.current.y);
    c.lineTo(p.x, p.y);
    c.stroke();
    last.current = p;
  }
  const up = () => {
    drawing.current = false;
    last.current = null;
  };

  function clear() {
    canvas.current!.getContext("2d")!.clearRect(0, 0, W, H);
    setEmpty(true);
    setError(null);
  }

  // A photo of a signature is scaled into the pad, so it's saved as a small PNG like a drawn one.
  function loadFile(file: File) {
    setError(null);
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError("Use a PNG or JPEG image.");
    if (file.size > 5 * 1024 * 1024) return setError("That image is too large. Use one under 5 MB.");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = canvas.current!.getContext("2d")!;
      c.clearRect(0, 0, W, H);
      const scale = Math.min((W - 20) / img.width, (H - 20) / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      setEmpty(false);
    };
    img.onerror = () => setError("Couldn't read that image.");
    img.src = url;
  }

  return (
    <motion.div className="sig-pad-wrap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
      <div className="sig-pad">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          aria-label="Signature pad: draw your signature here"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
        />
        {empty && <span className="sig-placeholder">Sign here with your mouse, finger or stylus</span>}
        <span className="sig-line" aria-hidden />
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="sig-pad-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()}><ImageUp size={14} /> Upload a photo</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={empty} onClick={clear}><Eraser size={14} /> Clear</button>
        <span className="sig-spacer" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}><X size={14} /> Cancel</button>
        <button type="button" className="btn btn-sm" disabled={empty || busy} onClick={() => onSave(canvas.current!.toDataURL("image/png"))}>
          {busy ? "Saving…" : "Save signature"}
        </button>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
      </div>
    </motion.div>
  );
}
