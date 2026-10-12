import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Boxes, Cloud, History, ListChecks, LogOut, Menu, Server, Users, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/apps", label: "Apps", icon: Boxes },
  { href: "/jobs", label: "Jobs", icon: ListChecks },
  { href: "/team", label: "Team", icon: Users },
  { href: "/alerts", label: "Alerts", icon: Bell, min: "admin" as const },
  { href: "/audit", label: "Audit log", icon: History, min: "admin" as const },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { user, org, setOrgId, logout, can } = useAuth();
  return (
    <div className="sidebar-inner">
      <Link href="/servers" className="brand" onClick={onNavigate}>
        <Cloud size={22} /> Inveon Cloud
      </Link>
      {user && user.organizations.length > 0 && (
        <label className="org-switch">
          <span className="sr-only">Organization</span>
          <select value={org?.id ?? ""} onChange={(e) => setOrgId(e.target.value)}>
            {user.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {org && <span className="org-role">{org.role}</span>}
        </label>
      )}
      <nav className="nav">
        {NAV.filter((n) => !n.min || can(n.min)).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`nav-link ${location.startsWith(href) ? "active" : ""}`} onClick={onNavigate}>
            <Icon size={18} /> {label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <span className="muted small" title={user?.email}>
          {user?.email}
        </span>
        <button className="btn btn-ghost btn-small" onClick={() => void logout()}>
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <aside className="sidebar">
        <Sidebar />
      </aside>
      <header className="topbar">
        <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <span className="brand">
          <Cloud size={20} /> Inveon Cloud
        </span>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.aside
              className="drawer"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "tween", duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="icon-btn drawer-close" onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
              <Sidebar onNavigate={() => setOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <main className="main">{children}</main>
    </div>
  );
}
