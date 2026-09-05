import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description: string;
  path?: string;
  type?: string;
  schema?: Record<string, any>;
}

export function SEO({ title, description, path = '', type = 'website', schema }: SEOProps) {
  const url = `https://inveontechnologies.in${path}`;
  const siteName = 'Inveon Technologies';
  const image = 'https://inveontechnologies.in/og-image.png';

  return (
    <Helmet>
      <title>{title} | {siteName}</title>
      <meta name="description" content={description} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:image" content={image} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:description" content={description} />
      
      {/* Canonical Link */}
      <link rel="canonical" href={url} />

      {/* Structured Data */}
      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      )}
    </Helmet>
  );
}
