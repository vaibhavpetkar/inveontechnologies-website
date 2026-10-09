import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, FileText } from "lucide-react";
import { FileChip } from "../files/FileChip";
import { timeAgo } from "../../lib/tasks";
import { EMP_DOC_STATUS, docFile, formatDate, type EmployeeDocument, type QueueDocument } from "../../lib/employeeDocs";
import "../../styles/employee-docs.css";

interface Props {
  doc: EmployeeDocument | QueueDocument;
  index: number;
  /** Staff view: shows whose document it is and the short status labels. */
  staff?: boolean;
  children?: ReactNode;
}

/** One employee document, in the same look as the candidate document rows. */
export function EmployeeDocRow({ doc: d, index, staff = false, children }: Props) {
  const meta = EMP_DOC_STATUS[d.status];
  const employee = "employee" in d ? d.employee : null;
  const reviewed = d.status !== "uploaded";
  const reviewer = d.reviewerName ?? "Reviewer";

  return (
    <motion.div
      layout
      className={`doc-row edoc-row status-${d.status}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ delay: Math.min(index, 12) * 0.03, type: "spring", stiffness: 340, damping: 30 }}
    >
      <span className={`doc-icon tone-${meta.tone}`}><FileText size={18} /></span>
      <div className="doc-main">
        <div className="doc-title">
          <strong>{d.documentType}</strong>
          <span className={`pill pill-${meta.tone}`}>{staff ? meta.staffLabel : meta.label}</span>
        </div>
        {employee && (
          <span className="muted-small">
            <span className="edoc-who">{employee.name}</span>
            {employee.businessId && <> · <span className="edoc-id">{employee.businessId}</span></>}
          </span>
        )}
        {d.description && <p className="edoc-desc">{d.description}</p>}
        <span className="muted-small" title={new Date(d.uploadedAt).toLocaleString()}>
          Uploaded {staff ? timeAgo(d.uploadedAt) : formatDate(d.uploadedAt)}
        </span>

        {reviewed && d.status === "rejected" && !staff && d.note ? (
          <div className="edoc-fix" role="note">
            <AlertTriangle size={16} />
            <div>
              <strong>What needs fixing{d.reviewerName ? `, from ${d.reviewerName}` : ""}</strong>
              {d.note}
            </div>
          </div>
        ) : (
          reviewed && (
            <p className="edoc-review">
              {d.status === "verified" ? "Verified" : "Sent back"} by {reviewer}
              {d.verifiedAt && ` · ${formatDate(d.verifiedAt)}`}
              {d.note && <> · <q>{d.note}</q></>}
            </p>
          )
        )}
      </div>
      <FileChip file={docFile(d)} />
      {children && <div className="doc-actions">{children}</div>}
    </motion.div>
  );
}
