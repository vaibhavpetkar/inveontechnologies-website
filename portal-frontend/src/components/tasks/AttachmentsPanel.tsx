import { useCallback, useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { StoredFile } from "../../lib/files";
import { FileChip } from "../files/FileChip";
import { UploadButton } from "../files/UploadButton";
import { useToast } from "../Toast";

interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  uploadedBy: string;
  file: StoredFile | null; // null for a plain link
}

/** Files on a task: anyone on the task can add them; whoever added one (or HR/admin) can remove it. */
export function AttachmentsPanel({ taskId, onChanged }: { taskId: string; onChanged: () => void }) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Attachment[] | null>(null);
  const privileged = !!user && ["hr", "admin", "super_admin"].includes(user.role);

  const load = useCallback(
    () => apiFetch<{ attachments: Attachment[] }>(`/api/v1/tasks/${taskId}/attachments`, { accessToken }).then((r) => setItems(r.attachments)),
    [taskId, accessToken],
  );
  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  async function add(file: StoredFile) {
    await apiFetch(`/api/v1/tasks/${taskId}/attachments`, { method: "POST", body: { fileName: file.name, fileUrl: file.url }, accessToken });
    toast("File added");
    await load();
    onChanged();
  }

  async function remove(a: Attachment) {
    if (!window.confirm(`Remove ${a.fileName} from this task?`)) return;
    try {
      await apiFetch(`/api/v1/tasks/${taskId}/attachments/${a.id}`, { method: "DELETE", accessToken });
      setItems((list) => list?.filter((x) => x.id !== a.id) ?? null);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove that file.", "error");
    }
  }

  return (
    <section className="gh-panel" aria-label="Files">
      <h3><Paperclip size={16} /> Files{items && items.length > 0 ? ` (${items.length})` : ""}</h3>
      {items && items.length > 0 && (
        <div className="file-list" style={{ marginBottom: "0.6rem" }}>
          {items.map((a) => (
            <FileChip
              key={a.id}
              file={a.file ?? { url: a.fileUrl, name: a.fileName }}
              onRemove={a.uploadedBy === user?.id || privileged ? () => remove(a) : undefined}
            />
          ))}
        </div>
      )}
      <UploadButton purpose="task_attachment" label="Add a file" onUploaded={add} />
    </section>
  );
}
