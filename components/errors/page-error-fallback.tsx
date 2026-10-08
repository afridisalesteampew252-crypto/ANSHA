'use client';

type Props = {
  retry: () => void;
  title?: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  fullPage?: boolean;
};

/** Uses native controls and its own styles so failed providers cannot break recovery. */
export function PageErrorFallback({
  retry,
  title = 'This page could not be loaded',
  description = 'Please try again. You can also reload the page or continue from the website.',
  href = '/',
  linkLabel = 'Go to website',
  fullPage = false,
}: Props) {
  const controlStyle = { border: '1px solid #d4d4d8', borderRadius: 8, padding: '10px 16px', font: 'inherit', fontSize: 14, cursor: 'pointer', textDecoration: 'none' };
  return (
    <section style={{ boxSizing: 'border-box', display: 'grid', placeItems: 'center', minHeight: fullPage ? '100dvh' : '20rem', padding: 24, color: '#18181b', fontFamily: 'system-ui, sans-serif' }} aria-label="Page recovery">
      <div style={{ width: '100%', maxWidth: 560, boxSizing: 'border-box', border: '1px solid #e4e4e7', borderRadius: 16, padding: 24, background: '#fff' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 24 }}>{title}</h2>
        <p role="alert" style={{ margin: '0 0 20px', lineHeight: 1.6, color: '#52525b' }}>{description}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" style={{ ...controlStyle, background: '#D21E1E', borderColor: '#D21E1E', color: '#fff' }} onClick={retry}>Retry</button>
          <button type="button" style={{ ...controlStyle, background: '#fff', color: '#18181b' }} onClick={() => window.location.reload()}>Reload page</button>
          <a href={href} style={{ ...controlStyle, color: '#18181b' }}>{linkLabel}</a>
        </div>
      </div>
    </section>
  );
}
