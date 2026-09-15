import { Link, useLocation } from "wouter";

const LINKS = [
  { href: "/opportunities", label: "Opportunities" },
  { href: "/candidate", label: "My applications" },
  { href: "/courses", label: "Courses" },
  { href: "/profile", label: "Profile" },
];

export function CandidateNav() {
  const [location] = useLocation();
  return (
    <nav className="dash-nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={location.startsWith(l.href) ? "active" : ""}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
