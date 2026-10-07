import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metadataForPath } from './metadata';
export function PageMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const metadata = metadataForPath(pathname);
    document.title = metadata.title;
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots) robots.content = metadata.robots;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = metadata.canonical;
  }, [pathname]);
  return null;
}
