# Rebrand: Eleviq → Inveon Technologies

## What changed

**Branding** — every "Eleviq" mention, the `eleviq.buzz` domain, and the logo mark
were replaced with Inveon Technologies / inveontechnologies.in across all pages,
the Navbar, Footer, and shared SEO component. Verified with a full-repo grep —
zero "Eleviq" references remain anywhere in source or the built bundle.

**Removed fabricated content** — the original template was full of invented
specifics that don't belong to Inveon Technologies (or, for that matter, ever
belonged to the real Eleviq). All of the following were deleted rather than
relabeled, since carrying them over under a real company's name would mean
publishing false claims:

- Fake leadership team (names, titles, bios) on the About page
- Fake founding story / timeline (2015 Bangalore origin, funding milestones)
- Fake client testimonials (named people at invented companies) on Home and Clients
- Fake case studies with fabricated metrics ($1.8M, 99.97% accuracy, etc.)
- Fake client logo list
- Fake certifications (SOC 2 Type II, ISO 27001, HIPAA, AWS/Microsoft Partner)
- Fake office addresses (San Francisco, Bangalore, Dubai) and a placeholder phone number
- Fabricated product performance stats (2.4x faster, 99.9% uptime SLA, 70% cheaper than SAP, etc.)
- A false "certified ERPNext implementation partner" claim
- Unverified response-time guarantees ("24 hours", "2 business days")

The only numeric claims kept are the two your real site actually states:
**200+ companies** and **15+ countries served**.

## What still needs your real data

Search the codebase for `// TODO` — every spot needing real info is marked. In short:

- Leadership/team names for About page (currently shows "Leadership profiles coming soon")
- Real founding story/timeline, if you want one
- Real, permissioned client testimonials and case studies
- Real client logos (with permission to display them)
- Real office address(es)/phone number, or confirmation you're remote-first
- Real social media profile URLs (LinkedIn/Twitter/GitHub currently point to generic homepages)
- Confirm the tech stack list on About reflects what you actually use
- Confirm `inveontechnologies@gmail.com` is a real, monitored inbox

## Contact form backend

The form no longer submits anywhere (it previously posted to `eleviq.buzz`,
which was a third party's domain — not something this site should silently
send visitor data to). It now reads `VITE_LEADS_API_URL` from your `.env` file
(see `.env.example`) and POSTs the lead there as JSON. Until you set that
variable, submitting the form shows a clear inline error instead of pretending
to succeed.

**Important:** if your CRM/backend endpoint requires an API key, add that key
server-side (in your own backend), never in a `VITE_` variable — anything with
that prefix gets bundled into the public JS and is visible to anyone who views
the site's source.

## SEO

- Per-page canonical URLs, Open Graph, and Twitter Card tags
- Organization JSON-LD structured data (using only verified facts)
- `sitemap.xml` added, referenced from `robots.txt`
- `og:image` wired to `/og-image.png` — you'll need to add that image file
