import type { ReactNode } from 'react';

const icon = (paths: ReactNode) => <svg className="public-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>;
const modules = [
  ['Queue & Appointments', 'Keep visits moving, without losing track.', ['Customer and service selection', 'Branch-scoped appointments and date filters', 'Queue tokens and visit status'], icon(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>)],
  ['Staff Attendance', 'See who is here and when.', ['Check-in and check-out records', 'Staff attendance history', 'Branch-scoped attendance reporting'], icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="m17 11 2 2 3.5-4" /></>)],
  ['Customer Dues', 'A clear record of what is owed.', ['Customer dues and payment entries', 'Outstanding balances and history', 'Branch-scoped summaries'], icon(<><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M7 15h4" /></>)],
  ['Inventory', 'Know your stock, and its movements.', ['Items, categories and suppliers', 'Stock movement records', 'Branch stock balances and reports'], icon(<><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>)],
] as const;
const audiences = [
  ['Clinics', 'Keep walk-ins and booked visits in order.'],
  ['Shops', 'Track customers, dues and stock together.'],
  ['Salons', 'See today’s appointments and who is in.'],
  ['Service counters', 'Run a simple queue with clear visit status.'],
  ['Offices', 'Record staff attendance by branch.'],
];
const steps = [
  ['Choose your setup', 'Pick a package or individual modules and send your requirements.'],
  ['Confirm together', 'An operator reviews your request and confirms your agreement and manual payment.'],
  ['Open your workspace', 'Use your one-time invitation to choose your own password and begin.'],
];
const reasons = [
  ['One working context', 'Organization and branch context follows your work.'],
  ['Access with intent', 'Staff permissions and module access are enforced on the server.'],
  ['A human commercial process', 'Agreements, payments and renewals are confirmed manually, with no surprise checkout.'],
];

export function FeaturesSection() {
  return <>
    <section className="public-section public-container" aria-labelledby="public-audience-title">
      <p className="public-eyebrow">Built around everyday work</p>
      <h2 id="public-audience-title">Different businesses. Familiar daily needs.</h2>
      <ul className="public-audience">{audiences.map(([type, text]) => <li className="panel" key={type}><strong>{type}</strong><span className="muted">{text}</span></li>)}</ul>
      <p className="muted">Operational coordination, not a clinical records system, retail POS or payroll service.</p>
    </section>
    <section className="public-section public-container" aria-labelledby="public-steps-title">
      <p className="public-eyebrow">How it works</p>
      <h2 id="public-steps-title">A considered start, not a rushed checkout.</h2>
      <ol className="public-three-grid public-steps">{steps.map(([title, text], index) => <li className="panel" key={title}><span className="public-step-number" aria-hidden="true">{index + 1}</span><h3>{title}</h3><p className="muted">{text}</p></li>)}</ol>
    </section>
    <section className="public-section public-container" id="modules" aria-labelledby="public-modules-title">
      <p className="public-eyebrow">Your operations, connected</p>
      <h2 id="public-modules-title">Choose what your business needs.</h2>
      <p className="public-lead">Use a package or start with individual modules. Module availability follows your confirmed subscription.</p>
      <div className="public-module-grid">{modules.map(([name, summary, bullets, glyph]) => <article key={name} className="panel public-module">{glyph}<h3>{name}</h3><p className="muted">{summary}</p><ul>{bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></article>)}</div>
      <div className="panel public-core"><h3>The foundation comes with your workspace.</h3><p>Customers and services · Staff and branches · Roles and permissions · Organization settings · Dashboards and reports</p><p className="muted">These shared foundations are not separate paid add-ons. Reports remain scoped to your access and enabled modules.</p></div>
    </section>
    <section className="public-section public-container" aria-labelledby="public-why-title">
      <p className="public-eyebrow">Why EkaVio</p>
      <h2 id="public-why-title">Less switching. More clarity.</h2>
      <div className="public-three-grid">{reasons.map(([title, text]) => <article className="panel" key={title}><h3>{title}</h3><p className="muted">{text}</p></article>)}</div>
    </section>
    <section className="public-section public-container" id="security" aria-labelledby="public-security-title"><div className="panel public-core"><p className="public-eyebrow">Security & privacy</p><h2 id="public-security-title">Practical boundaries, clearly stated.</h2><p>Organization and branch access controls, revocable sessions and permission checks protect authenticated workflows. Passwords and onboarding links are not marketing data.</p><p className="muted">This is a staging experience, not a production-readiness or uptime promise. We do not claim certifications or introduce marketing trackers.</p><a className="public-text-link" href="/privacy">Read the privacy overview →</a></div></section>
  </>;
}
