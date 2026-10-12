import { DashboardShell } from "../components/DashboardShell";
import { OrgChart } from "../components/org/OrgChart";

/** The team structure: who reports to whom. */
export default function OrgChartPage() {
  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>Team structure</h1>
          <p>Who reports to whom across the company.</p>
        </div>
      </div>
      <OrgChart />
    </DashboardShell>
  );
}
