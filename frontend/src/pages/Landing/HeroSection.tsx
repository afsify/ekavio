const reassurances = ['No instant purchase', 'No automatic charges', 'Staging access only'];

export function HeroSection() {
  return (
    <section className="public-container public-hero" id="product" aria-labelledby="public-hero-title">
      <div className="public-hero-copy">
        <p className="public-eyebrow">Business operations for small teams</p>
        <h1 id="public-hero-title">Run your daily business.<br /><span>From one workspace.</span></h1>
        <p className="public-lead">
          Keep customers, the queue, appointments, staff attendance, dues and stock in one place, so your team spends
          less time chasing notebooks and messages. Start with the modules you need. A person confirms your access and terms.
        </p>
        <div className="public-actions">
          <a className="action-link" href="#pricing">Request Access <span aria-hidden="true">↗</span></a>
          <a className="quiet-button" href="#modules">See what is included</a>
        </div>
        <ul className="public-reassurance" aria-label="How access works">
          {reassurances.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}
        </ul>
      </div>
      <figure className="workspace-preview panel" aria-label="Illustrative EkaVio workspace">
        <div className="preview-top"><strong>Your workspace</strong><span className="public-badge">Example workspace</span></div>
        <div className="preview-columns">
          <div className="preview-nav" aria-hidden="true">
            <span className="is-active">Overview</span><span>Customers</span><span>Queue</span><span>Attendance</span><span>Inventory</span>
          </div>
          <div className="preview-main">
            <p className="muted">Main branch · A typical business day</p>
            <h2>Everything in its place.</h2>
            <div className="preview-stats">
              <div><strong>08</strong><span>In the queue</span></div>
              <div><strong>12</strong><span>Staff present</span></div>
            </div>
            <div className="preview-task"><span className="preview-dot" aria-hidden="true" />Customer visit <span className="muted">Waiting</span></div>
            <div className="preview-task"><span className="preview-dot" aria-hidden="true" />Stock review <span className="muted">Today</span></div>
            <figcaption className="public-small muted">Illustration only. Not live customer data.</figcaption>
          </div>
        </div>
      </figure>
    </section>
  );
}
