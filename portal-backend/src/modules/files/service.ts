import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import type { Database } from "../shared/db/client.js";
import {
  applications,
  candidateProfiles,
  channelMembers,
  conversationParticipants,
  documentRequests,
  employeeDocuments,
  employees,
  messageAttachments,
  messages,
  storedFiles,
  taskAttachments,
  tasks,
} from "../shared/db/schema.js";
import { AppError } from "../shared/errors.js";
import { canViewApplication } from "../applications/access.js";
import { canAccessTask } from "../tasks/routes.js";

export type FilePurpose = (typeof storedFiles.$inferSelect)["purpose"];
export type StoredFile = typeof storedFiles.$inferSelect;

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // nginx allows 15 MB per request

// The type comes from the extension, and the first bytes have to agree with
// it: a renamed .exe or an HTML page called "cv.pdf" is refused.
const PDF = { ext: ["pdf"], mime: "application/pdf", magic: [[0x25, 0x50, 0x44, 0x46]] };
const OLE = [[0xd0, 0xcf, 0x11, 0xe0]]; // legacy .doc/.xls
const ZIP = [[0x50, 0x4b, 0x03, 0x04]]; // .docx/.xlsx/.pptx/.zip
const TYPES: Record<string, { mime: string; magic: number[][] | "text" }> = {
  pdf: PDF,
  doc: { mime: "application/msword", magic: OLE },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: ZIP },
  png: { mime: "image/png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
  jpg: { mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] },
  gif: { mime: "image/gif", magic: [[0x47, 0x49, 0x46, 0x38]] },
  webp: { mime: "image/webp", magic: [[0x52, 0x49, 0x46, 0x46]] },
  xls: { mime: "application/vnd.ms-excel", magic: OLE },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: ZIP },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", magic: ZIP },
  zip: { mime: "application/zip", magic: ZIP },
  csv: { mime: "text/csv", magic: "text" },
  txt: { mime: "text/plain", magic: "text" },
};

const DOCS = ["pdf", "doc", "docx"];
const IMAGES = ["png", "jpg", "jpeg", "webp"];
const ALLOWED: Record<FilePurpose, string[]> = {
  resume: DOCS,
  application_document: [...DOCS, ...IMAGES],
  employee_document: [...DOCS, ...IMAGES],
  task_attachment: [...DOCS, ...IMAGES, "gif", "xls", "xlsx", "pptx", "zip", "csv", "txt"],
  chat_attachment: [...DOCS, ...IMAGES, "gif", "xls", "xlsx", "pptx", "zip", "csv", "txt"],
};

export function allowedExtensions(purpose: FilePurpose) {
  return ALLOWED[purpose];
}

/** Checks name and content, and returns the MIME type to store. Throws a user-facing error otherwise. */
export function checkUpload(purpose: FilePurpose, name: string, bytes: Buffer): string {
  if (bytes.length === 0) throw new AppError("EMPTY_FILE", "That file is empty.", 400);
  if (bytes.length > MAX_FILE_BYTES) throw new AppError("FILE_TOO_LARGE", "Files can be up to 10 MB.", 413);
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const allowed = ALLOWED[purpose];
  if (!allowed.includes(ext)) {
    throw new AppError("UNSUPPORTED_FILE_TYPE", `That file type isn't accepted here. Use ${allowed.map((e) => e.toUpperCase()).join(", ")}.`, 400);
  }
  const type = TYPES[ext];
  const ok =
    type.magic === "text"
      ? !bytes.subarray(0, 4096).includes(0)
      : type.magic.some((sig) => sig.every((b, i) => bytes[i] === b)) && (ext !== "webp" || bytes.subarray(8, 12).toString("latin1") === "WEBP");
  if (!ok) throw new AppError("FILE_CONTENT_MISMATCH", `That file doesn't look like a real .${ext} file.`, 400);
  return type.mime;
}

export const fileUrl = (id: string) => `/api/v1/files/${id}`;
const URL_PATTERN = /^\/api\/v1\/files\/([0-9a-f-]{36})$/;

/** What the API returns about a file. */
export function publicFile(file: StoredFile) {
  return { id: file.id, url: fileUrl(file.id), name: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, purpose: file.purpose, createdAt: file.createdAt };
}

/** The uploaded file behind a stored URL, or null for an external link or nothing. */
export async function fileForUrl(db: Database, url: string | null | undefined): Promise<StoredFile | null> {
  const id = url?.match(URL_PATTERN)?.[1];
  if (!id) return null;
  return (await db.query.storedFiles.findFirst({ where: eq(storedFiles.id, id) })) ?? null;
}

/**
 * For routes that store a file URL: the URL must point at a file this user
 * uploaded for this purpose, so nobody can attach (and so gain access to)
 * someone else's upload. Plain https links are still allowed where they were
 * before, as external links.
 */
export async function claimFile(db: Database, url: string, userId: string, purpose: FilePurpose, { allowLinks = false } = {}): Promise<StoredFile | null> {
  const id = url.match(URL_PATTERN)?.[1];
  if (!id) {
    if (allowLinks && /^https:\/\/\S+$/.test(url)) return null;
    throw new AppError("INVALID_FILE", "Upload the file first.", 400);
  }
  const file = await db.query.storedFiles.findFirst({ where: eq(storedFiles.id, id) });
  if (!file || file.uploadedBy !== userId || file.purpose !== purpose) throw new AppError("INVALID_FILE", "That upload can't be used here.", 400);
  return file;
}

const PRIVILEGED = ["hr", "admin", "super_admin"];

/** Who may download a file: its uploader, HR/admins, and whoever can see the place it's attached to. */
export async function canReadFile(db: Database, req: Request, file: StoredFile): Promise<boolean> {
  const { sub: userId, role } = req.user!;
  if (file.uploadedBy === userId || PRIVILEGED.includes(role)) return true;
  const url = fileUrl(file.id);

  switch (file.purpose) {
    case "chat_attachment": {
      const [row] = await db
        .select({ channelId: messages.channelId, conversationId: messages.conversationId })
        .from(messageAttachments)
        .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
        .where(eq(messageAttachments.fileUrl, url))
        .limit(1);
      if (!row) return false;
      if (row.conversationId) {
        return !!(await db.query.conversationParticipants.findFirst({ where: and(eq(conversationParticipants.conversationId, row.conversationId), eq(conversationParticipants.userId, userId)) }));
      }
      return !!(await db.query.channelMembers.findFirst({ where: and(eq(channelMembers.channelId, row.channelId!), eq(channelMembers.userId, userId)) }));
    }
    case "task_attachment": {
      const [row] = await db.select({ task: tasks }).from(taskAttachments).innerJoin(tasks, eq(tasks.id, taskAttachments.taskId)).where(eq(taskAttachments.fileUrl, url)).limit(1);
      return !!row && canAccessTask(db, userId, role, row.task);
    }
    case "application_document": {
      const doc = await db.query.documentRequests.findFirst({ where: eq(documentRequests.fileUrl, url) });
      if (!doc?.applicationId) return false; // documents not for an opening: only the candidate and HR
      const application = await db.query.applications.findFirst({ where: eq(applications.id, doc.applicationId) });
      return !!application && canViewApplication(db, req, application);
    }
    case "resume": {
      // Staff who can see one of this candidate's applications can read the resume on their profile.
      const profile = await db.query.candidateProfiles.findFirst({ where: eq(candidateProfiles.resumeUrl, url) });
      if (!profile) return false;
      const apps = await db.query.applications.findMany({ where: eq(applications.userId, profile.userId) });
      for (const application of apps) if (await canViewApplication(db, req, application)) return true;
      return false;
    }
    case "employee_document": {
      // Self and HR are handled above; the employee's own manager reviews them too.
      if (role !== "manager") return false;
      const [row] = await db
        .select({ managerId: employees.managerId })
        .from(employeeDocuments)
        .innerJoin(employees, eq(employees.id, employeeDocuments.employeeId))
        .where(eq(employeeDocuments.fileUrl, url))
        .limit(1);
      return row?.managerId === userId;
    }
  }
}
