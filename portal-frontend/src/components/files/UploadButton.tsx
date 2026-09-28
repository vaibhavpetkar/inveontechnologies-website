import { useRef, useState, type ReactNode } from "react";
import { Loader2, Upload } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/api";
import { ACCEPT, uploadFile, type FilePurpose, type StoredFile } from "../../lib/files";
import { useToast } from "../Toast";

interface Props {
  purpose: FilePurpose;
  /** Called with the upload; return a promise to keep the button busy while it's attached. */
  onUploaded: (file: StoredFile) => unknown;
  label?: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  icon?: ReactNode;
}

/** A button that picks a file, uploads it and hands it back. */
export function UploadButton({ purpose, onUploaded, label = "Upload", className = "btn btn-secondary btn-sm", disabled, title, icon = <Upload size={15} /> }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await onUploaded(await uploadFile(file, purpose, accessToken));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "The upload didn't go through. Try again.", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input ref={input} type="file" hidden accept={ACCEPT[purpose]} onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className={className} disabled={disabled || busy} title={title} aria-label={typeof label === "string" && label ? label : title} onClick={() => input.current?.click()}>
        {busy ? <Loader2 size={15} className="spin" /> : icon}
        {label && <span>{busy ? "Uploading…" : label}</span>}
      </button>
    </>
  );
}
