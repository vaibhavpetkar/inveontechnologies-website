import { useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon, Link2, Loader2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/api";
import { formatBytes, isImage, openFile } from "../../lib/files";
import { useToast } from "../Toast";

interface Props {
  file: { url: string; name: string; mimeType?: string; sizeBytes?: number };
  onRemove?: () => void;
  removeLabel?: string;
}

/** A file you can click to open (PDFs and images in a new tab, others download). */
export function FileChip({ file, onRemove, removeLabel = "Remove" }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const external = /^https?:\/\//.test(file.url);
  const Icon = external ? Link2 : isImage(file.mimeType) ? ImageIcon : FileText;

  async function open() {
    setOpening(true);
    try {
      await openFile(file, accessToken);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't open that file.", "error");
    } finally {
      setOpening(false);
    }
  }

  return (
    <span className="file-chip">
      <button type="button" className="file-chip-open" onClick={open} disabled={opening} title={`Open ${file.name}`}>
        {opening ? <Loader2 size={15} className="spin" /> : <Icon size={15} />}
        <span className="file-chip-name">{file.name}</span>
        {file.sizeBytes ? <span className="file-chip-size">{formatBytes(file.sizeBytes)}</span> : external ? <ExternalLink size={12} /> : null}
      </button>
      {onRemove && (
        <button type="button" className="file-chip-remove" onClick={onRemove} aria-label={`${removeLabel} ${file.name}`} title={removeLabel}>
          <X size={13} />
        </button>
      )}
    </span>
  );
}
