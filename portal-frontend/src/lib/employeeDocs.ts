import { apiFetch } from "./api";

/** Personal documents an employee or intern uploads for their manager and HR to check. */

export type EmployeeDocStatus = "uploaded" | "verified" | "rejected";

export interface DocFile {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  documentType: string;
  fileUrl: string;
  status: EmployeeDocStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  note: string | null;
  description: string | null;
  uploadedAt: string;
  updatedAt: string;
  file: DocFile | null;
  reviewerName: string | null;
}

export interface QueueDocument extends EmployeeDocument {
  employee: { id: string; businessId: string | null; userId: string; name: string };
}

export type DocCounts = Partial<Record<EmployeeDocStatus, number>>;

export const EMP_DOC_STATUS: Record<EmployeeDocStatus, { label: string; staffLabel: string; tone: string }> = {
  uploaded: { label: "Waiting for review", staffLabel: "Waiting", tone: "amber" },
  verified: { label: "Verified", staffLabel: "Verified", tone: "green" },
  rejected: { label: "Needs a fix", staffLabel: "Sent back", tone: "red" },
};

export const OTHER_TYPE = "Other";
export const EMP_DOC_TYPES = [
  "Aadhaar card",
  "PAN card",
  "Passport photo",
  "Degree certificate",
  "Mark sheets",
  "Bank account details / cancelled cheque",
  "Previous experience letter",
  "Address proof",
  OTHER_TYPE,
];

const BASE = "/api/v1/employees";

/** The caller's own employee record, or null when they don't have one yet. */
export async function fetchMyEmployeeId(accessToken: string | null) {
  const r = await apiFetch<{ employee: { id: string } }>(`${BASE}/me`, { accessToken });
  return r.employee.id;
}

export function fetchEmployeeDocs(employeeId: string, accessToken: string | null) {
  return apiFetch<{ documents: EmployeeDocument[] }>(`${BASE}/${employeeId}/documents`, { accessToken }).then((r) => r.documents);
}

export function addEmployeeDoc(employeeId: string, body: { documentType: string; fileUrl: string; description?: string }, accessToken: string | null) {
  return apiFetch<{ document: EmployeeDocument }>(`${BASE}/${employeeId}/documents`, { method: "POST", body, accessToken });
}

export function removeEmployeeDoc(id: string, accessToken: string | null) {
  return apiFetch(`${BASE}/documents/${id}`, { method: "DELETE", accessToken });
}

export function fetchReviewQueue(status: EmployeeDocStatus, accessToken: string | null) {
  return apiFetch<{ documents: QueueDocument[]; counts: DocCounts }>(`${BASE}/documents/review-queue?status=${status}`, { accessToken });
}

export function reviewEmployeeDoc(id: string, approve: boolean, note: string | undefined, accessToken: string | null) {
  return apiFetch<{ document: EmployeeDocument }>(`${BASE}/documents/${id}/verify`, { method: "POST", body: { approve, note }, accessToken });
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** The file to open for a document: the stored upload, or the raw link for older rows. */
export const docFile = (d: EmployeeDocument) => d.file ?? { url: d.fileUrl, name: d.documentType };
