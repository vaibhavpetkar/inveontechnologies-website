import { useEffect, useState } from "react";
import { API_BASE, ApiError, refreshSession } from "./api";

export type FilePurpose = "resume" | "application_document" | "employee_document" | "task_attachment" | "chat_attachment";

export interface StoredFile {
  id: string;
  url: string; // /api/v1/files/<id>
  name: string;
  mimeType: string;
  sizeBytes: number;
}

// Mirrors the server's list, for the file picker's filter.
const DOCS = ".pdf,.doc,.docx";
const IMAGES = ".png,.jpg,.jpeg,.webp";
export const ACCEPT: Record<FilePurpose, string> = {
  resume: DOCS,
  application_document: `${DOCS},${IMAGES}`,
  employee_document: `${DOCS},${IMAGES}`,
  task_attachment: `${DOCS},${IMAGES},.gif,.xls,.xlsx,.pptx,.zip,.csv,.txt`,
  chat_attachment: `${DOCS},${IMAGES},.gif,.xls,.xlsx,.pptx,.zip,.csv,.txt`,
};
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Calls fetch with the access token, refreshing it once on a 401 like apiFetch does. */
export async function authedFetch(path: string, accessToken: string | null, init: RequestInit = {}) {
  const go = (token: string | null) => fetch(`${API_BASE}${path}`, { ...init, credentials: "include", headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  let res = await go(accessToken);
  if (res.status === 401 && accessToken) {
    const fresh = await refreshSession();
    if (fresh) res = await go(fresh);
  }
  return res;
}

export async function uploadFile(file: File, purpose: FilePurpose, accessToken: string | null): Promise<StoredFile> {
  if (file.size > MAX_FILE_BYTES) throw new ApiError("FILE_TOO_LARGE", "Files can be up to 10 MB.", 413);
  const res = await authedFetch(`/api/v1/files?purpose=${purpose}&name=${encodeURIComponent(file.name)}`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.code ?? "UPLOAD_FAILED", data?.error?.message ?? "The upload didn't go through. Try again.", res.status);
  return data.file as StoredFile;
}

export async function fetchFile(url: string, accessToken: string | null, download = false): Promise<Blob> {
  const res = await authedFetch(`${url}${download ? "?download=1" : ""}`, accessToken);
  if (!res.ok) throw new ApiError(res.status === 403 ? "FORBIDDEN" : "NOT_FOUND", res.status === 403 ? "You can't open this file." : "That file isn't available.", res.status);
  return res.blob();
}

const VIEWABLE = /^(application\/pdf|image\/(png|jpeg|gif|webp))$/;

/**
 * Opens a portal file: PDFs and images in a new tab, anything else downloads.
 * Plain https links (older attachments) open directly.
 */
export async function openFile(file: { url: string; name: string; mimeType?: string }, accessToken: string | null) {
  if (/^https?:\/\//.test(file.url)) {
    window.open(file.url, "_blank", "noopener");
    return;
  }
  const viewable = !!file.mimeType && VIEWABLE.test(file.mimeType);
  // Open the tab before the await, or the popup blocker stops it.
  const tab = viewable ? window.open("", "_blank") : null;
  try {
    const blob = await fetchFile(file.url, accessToken, !viewable);
    const href = URL.createObjectURL(blob);
    if (tab) {
      tab.location.href = href;
    } else {
      const a = document.createElement("a");
      a.href = href;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** An object URL for showing a portal image inline (chat previews). */
export function useFileObjectUrl(url: string | null, accessToken: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let revoked = false;
    let href: string | null = null;
    fetchFile(url, accessToken)
      .then((blob) => {
        if (revoked) return;
        href = URL.createObjectURL(blob);
        setSrc(href);
      })
      .catch(() => undefined);
    return () => {
      revoked = true;
      if (href) URL.revokeObjectURL(href);
    };
    // The token refreshes every 15 minutes; don't refetch the image for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return src;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const isImage = (mimeType?: string) => !!mimeType && /^image\//.test(mimeType);
