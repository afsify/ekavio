const questions = [
  ['Can I use just one module?', 'Yes. Choose individual modules or a package that matches your needs. The operator confirms the final setup.'],
  ['How does pricing work?', 'Published prices are estimates for the selected monthly or yearly cycle. Contact-priced selections require a discussion; they do not have a numeric estimate.'],
  ['Is Request Access a purchase?', 'No. It submits your requirements for review. An agreement and manual payment settlement happen separately before onboarding.'],
  ['Who chooses the account password?', 'You do, through a one-time onboarding invitation after your setup is confirmed. Staff invitations also let recipients choose their own passwords.'],
  ['Will I be charged automatically?', 'No. Payments and renewals are recorded manually. There is no automatic charge or payment gateway.'],
  ['Can different branches have separate access?', 'Yes. Branch assignments, roles and server-enforced permissions define access within your organization.'],
  ['Does EkaVio replace specialist software?', 'No. EkaVio coordinates daily operations. It is not an EHR, payroll service, retail POS or statutory invoicing system.'],
  ['Is this ready for real customer data?', 'Not yet. This staging experience does not change the current NO-GO decision for real customer data.'],
];
export function FaqSection() { return <section className="public-section public-container" id="faq"><p className="public-eyebrow">A few useful answers</p><h2>Before you get started.</h2><div className="public-faq">{questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p className="muted">{answer}</p></details>)}</div><div className="public-final-cta panel"><h2>Start with a clearer picture.</h2><p className="muted">Tell us what your business needs. We’ll confirm the right setup together.</p><a className="action-link" href="#pricing">Request Access</a></div></section>; }
