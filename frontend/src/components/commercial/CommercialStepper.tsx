export function CommercialStepper({ steps }: { steps: Array<{ label: string; complete: boolean }> }) {
  return <ol className="commercial-stepper" aria-label="Commercial progress">{steps.map((step) => <li key={step.label} data-complete={step.complete}><span aria-hidden="true">{step.complete ? '✓' : '○'}</span> {step.label}<span className="sr-only">{step.complete ? ': complete' : ': pending'}</span></li>)}</ol>;
}
