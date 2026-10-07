import { annualSaving, formatInrMinor, type BillingCycle, type PublicCommercialOffer } from '../../commercial/publicCommercial';
export function OfferCard({ offer, cycle, selected = false, included, onSelect }: { offer: PublicCommercialOffer; cycle: BillingCycle; selected?: boolean; included?: string; onSelect?: () => void }) {
  const amount = cycle === 'monthly' ? offer.pricing?.monthlyPriceMinor : offer.pricing?.yearlyPriceMinor;
  const contact = offer.pricing?.pricingMode === 'contact';
  const unavailable = !offer.pricing || (!contact && amount == null);
  const saving = cycle === 'yearly' ? annualSaving(offer.pricing) : null;
  return <article className={`panel public-offer ${selected ? 'is-selected' : ''}`}>
    {offer.marketingLabel && <span className="public-badge">{offer.marketingLabel}</span>}
    <p className="public-eyebrow">{offer.offerType === 'plan' ? 'Package' : 'Individual module'}</p><h3>{offer.name}</h3><p className="muted">{offer.description}</p>
    <p className="public-offer-price">{contact ? 'Contact for pricing' : amount != null ? formatInrMinor(amount) : 'Cycle unavailable'}{amount != null && <small> /{cycle === 'monthly' ? 'month' : 'year'}</small>}</p>
    {saving && <p className="public-saving">Save {formatInrMinor(saving)} yearly vs 12 monthly payments</p>}
    <ul>{offer.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
    {onSelect && <button type="button" className={selected ? 'action-link' : 'quiet-button'} disabled={unavailable || Boolean(included)} aria-pressed={selected} onClick={onSelect}>{included ? `Included in ${included}` : unavailable ? 'Unavailable for this cycle' : selected ? 'Selected' : `Select ${offer.name}`}</button>}
  </article>;
}
