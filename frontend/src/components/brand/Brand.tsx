/** One original folded-E mark, shared by the public site and workspace. */
export function BrandMark({ className = '' }: { className?: string }) {
  return <svg className={`brand-mark ${className}`} viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect width="40" height="40" rx="12" fill="currentColor" /><path d="M12 11H29L25 16H17V19H25L21 24H17V29H12V11Z" fill="white" /><path d="M23 26L28 21V29H20L23 26Z" fill="white" opacity=".7" /></svg>;
}
export function BrandWordmark() { return <span className="brand-wordmark">Eka<span>Vio</span></span>; }
export function BrandLockup() { return <span className="brand-lockup"><BrandMark /><BrandWordmark /></span>; }
