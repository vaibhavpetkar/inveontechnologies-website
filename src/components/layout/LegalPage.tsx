import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';

/** Shared shell for the Privacy Policy and Terms pages. */
export default function LegalPage({ title, path, description, updated, children }: { title: string; path: string; description: string; updated: string; children: ReactNode }) {
  return (
    <>
      <Helmet>
        <title>{title} | Inveon Technologies</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={`${title} | Inveon Technologies`} />
        <meta property="og:url" content={`https://inveontechnologies.in${path}`} />
        <link rel="canonical" href={`https://inveontechnologies.in${path}`} />
      </Helmet>
      <section className="section-padding bg-white">
        <div className="section-container">
          <article className="prose prose-slate max-w-3xl mx-auto prose-headings:font-semibold prose-a:text-primary">
            <h1 style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h1>
            <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
            {children}
          </article>
        </div>
      </section>
    </>
  );
}
