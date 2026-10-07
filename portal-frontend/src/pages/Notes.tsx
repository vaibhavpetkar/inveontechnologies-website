import { DashboardShell } from "../components/DashboardShell";
import { NotesList } from "../components/notes/NotesList";

/** Planning notes, important notes, bookmarks and shared passwords. */
export default function Notes() {
  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>Notes</h1>
          <p>Plans, important notes, bookmarks and passwords. Private to you unless you share them.</p>
        </div>
      </div>
      <NotesList />
    </DashboardShell>
  );
}
