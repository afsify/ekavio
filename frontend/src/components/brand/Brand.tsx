/** One original folded-E mark, shared by the public site and workspace. */
export function BrandMark({ className = '' }: { className?: string }) {
  return <svg className={`brand-mark ${className}`} viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect width="40" height="40" rx="11" fill="currentColor" /><path d="M10 10H30L25 15H15V18H27L22 23H15V26H30L25 31H10V10Z" fill="white" /><path d="M25 10H30L25 15V10Z" fill="currentColor" opacity=".35" /></svg>;
}
export function BrandWordmark() { return <span className="brand-wordmark">Eka<span>Vio</span></span>; }
export function BrandLockup() { return <span className="brand-lockup"><BrandMark /><BrandWordmark /></span>; }
