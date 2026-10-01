import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { navForRole, ROLE_LABELS, displayName } from "../lib/nav";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";

/**
 * The signed-in app frame: a sidebar with each role's links, a top bar,
 * and an animated content area. On narrow screens the sidebar becomes a
 * slide-in drawer.
 */
export function DashboardShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [location]);

  // Escape closes whichever dialog or drawer is on top, the same as clicking outside it. Components
  // that handle Escape themselves call preventDefault, so this waits until they have had their turn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTimeout(() => {
        if (e.defaultPrevented) return;
        const scrims = document.querySelectorAll<HTMLElement>(".modal-scrim, .drawer-scrim");
        const top = scrims[scrims.length - 1];
        if (!top) return;
        for (const type of ["mousedown", "click"]) top.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clearing the user is enough: every page using this shell sits behind
  // ProtectedRoute, which redirects to /login once the user is gone.
  async function handleLogout() {
    await logout();
  }

  const links = user ? navForRole(user.role) : [];
  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  const sidebar = (
    <nav className="sidebar-nav" aria-label="Main">
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={`sidebar-link${isActive(href) ? " active" : ""}`}>
          {isActive(href) && <motion.span layoutId="sidebar-active" className="sidebar-active" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <Icon size={18} strokeWidth={2} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">IN</span>
          <span>Inveon Portal</span>
        </div>
        {sidebar}
      </aside>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawerOpen(false)} />
            <motion.aside
              className="app-sidebar mobile"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            >
              <div className="sidebar-brand">
                <span className="brand-mark">IN</span>
                <span>Inveon Portal</span>
                <button className="icon-button" aria-label="Close menu" onClick={() => setDrawerOpen(false)} style={{ marginLeft: "auto" }}>
                  <X size={18} />
                </button>
              </div>
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="app-main">
        <header className="app-topbar">
          <button className="icon-button menu-button" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="topbar-spacer" />
          {user && <NotificationBell />}
          {user && (
            <div className="topbar-user">
              <Avatar email={user.email} size={32} />
              <div className="topbar-user-text">
                <span className="topbar-name">{displayName(user.email)}</span>
                <span className="topbar-role">{ROLE_LABELS[user.role] ?? user.role}</span>
              </div>
              <button className="icon-button" onClick={handleLogout} aria-label="Sign out" title="Sign out">
                <LogOut size={18} />
              </button>
            </div>
          )}
        </header>
        <motion.main
          key={location.split("/")[1]}
          className={`dash-body${wide ? " wide" : ""}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
