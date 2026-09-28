import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/api";
import type { ChatAttachment } from "../../lib/chat";
import { isImage, openFile, useFileObjectUrl } from "../../lib/files";
import { FileChip } from "../files/FileChip";
import { useToast } from "../Toast";

function ChatImage({ file }: { file: ChatAttachment }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const src = useFileObjectUrl(file.url, accessToken);

  function open() {
    openFile(file, accessToken).catch((err) => toast(err instanceof ApiError ? err.message : "Couldn't open that file.", "error"));
  }

  return (
    <button type="button" className="chat-image" onClick={open} title={file.name} aria-label={`Open ${file.name}`}>
      {src ? <img src={src} alt={file.name} /> : <span className="chat-image-wait" />}
    </button>
  );
}

/** Files sent with a chat message: images preview inline, everything else is a chip. */
export function ChatAttachments({ items }: { items: ChatAttachment[] }) {
  return (
    <div className="chat-attachments">
      {items.map((a) => (isImage(a.mimeType) ? <ChatImage key={a.id} file={a} /> : <FileChip key={a.id} file={a} />))}
    </div>
  );
}
