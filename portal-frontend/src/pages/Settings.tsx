import { Link, useParams } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, FileText, IndianRupee, Inbox, Mail, Network, ShieldAlert } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { CompanyTab } from "../components/settings/CompanyTab";
import { FeesTab } from "../components/settings/FeesTab";
import { EmailTab } from "../components/settings/EmailTab";
import { EmailLogTab } from "../components/settings/EmailLogTab";
import { OffersTab } from "../components/settings/OffersTab";
import { OrgChart } from "../components/org/OrgChart";
import { useAuth } from "../context/AuthContext";
import { SETTINGS_ROLES, SETTINGS_TABS, tabFromParam, type SettingsTab } from "../lib/settings";
import "../styles/settings.css";

const ICONS: Record<SettingsTab, typeof Mail> = {
  company: Building2,
  structure: Network,
  fees: IndianRupee,
  email: Mail,
  "email-log": Inbox,
  offers: FileText,
};

/** Company details, internship fees, email and the email log, and internship offers. HR reads; admins edit. */
export default function Settings() {
  const { user } = useAuth();
  const params = useParams<{ tab?: string }>();
  const tab = tabFromParam(params.tab);
  const allowed = !!user && SETTINGS_ROLES.includes(user.role);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  if (!allowed) {
    return (
      <DashboardShell>
        <div className="empty-state">
          <ShieldAlert size={34} />
          <h3>Settings are for HR and admins</h3>
          <p>Ask an admin if you need something changed here.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>{isAdmin ? "Company logo, seal and details on letters, who reports to whom, internship fees, and how the portal sends email." : "What prints on letters and offers, internship fees, and the email the portal sends. Only admins can change company details, fees and email."}</p>
        </div>
      </div>

      <nav className="tabs st-tabs" aria-label="Settings sections">
        {SETTINGS_TABS.map((t) => {
          const Icon = ICONS[t.id];
          const active = tab === t.id;
          return (
            <Link key={t.id} href={t.path} className={`tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
              {active && <motion.span layoutId="settings-tab" className="tab-underline" />}
              <Icon size={15} /> {t.label}
            </Link>
          );
        })}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.16 }}>
          {tab === "company" && <CompanyTab />}
          {tab === "structure" && (
            <>
              <p className="st-lead">Who reports to whom. Each person's manager reviews their documents and tasks.</p>
              <OrgChart />
            </>
          )}
          {tab === "fees" && <FeesTab />}
          {tab === "email" && <EmailTab />}
          {tab === "email-log" && <EmailLogTab />}
          {tab === "offers" && <OffersTab />}
        </motion.div>
      </AnimatePresence>
    </DashboardShell>
  );
}
