import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicLayout } from '../components/layout/PublicLayout';
import { FaqSection } from '../pages/Landing/FaqSection';
import { FeaturesSection } from '../pages/Landing/FeaturesSection';
import { HeroSection } from '../pages/Landing/HeroSection';
import { useAppStore } from '../store/useAppStore';

const page = () => <MemoryRouter><HeroSection /><FeaturesSection /><FaqSection /></MemoryRouter>;

afterEach(() => vi.unstubAllGlobals());

describe('public landing content', () => {
  it('has one primary heading and truthful calls to action', () => {
    render(page());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const hero = screen.getByRole('region', { name: /Run your daily business/ });
    expect(within(hero).getByRole('link', { name: /Request Access/ }).getAttribute('href')).toBe('#pricing');
    expect(within(hero).getByRole('link', { name: 'See what is included' }).getAttribute('href')).toBe('#modules');
    expect(within(hero).getByRole('list', { name: 'How access works' }).textContent).toMatch(/No instant purchase.*No automatic charges.*Staging access only/);
  });

  it('presents exactly the four implemented modules and the shared foundation', () => {
    render(page());
    const modules = screen.getByRole('region', { name: 'Choose what your business needs.' });
    expect(within(modules).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Queue & Appointments', 'Staff Attendance', 'Customer Dues', 'Inventory', 'The foundation comes with your workspace.']);
    expect(screen.getAllByRole('list').some((list) => list.tagName === 'OL' && list.children.length === 3)).toBe(true);
  });

  it('labels the illustration and makes no invented commercial, certification or metric claims', () => {
    const { container } = render(page());
    expect(screen.getByText('Illustration only. Not live customer data.')).toBeTruthy();
    expect(container.querySelector('.preview-nav')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).not.toMatch(/₹|trusted by|testimonial|ISO ?27001|SOC ?2|GDPR|HIPAA|\d+(\.\d+)?\s?%|uptime of/i);
    expect(screen.getByText('Not yet. This staging experience does not change the current NO-GO decision for real customer data.')).toBeTruthy();
  });
});

describe('public navigation section state', () => {
  it('marks the section in view as the current location and clears it', () => {
    let notify: IntersectionObserverCallback = () => undefined;
    class FakeObserver { constructor(callback: IntersectionObserverCallback) { notify = callback; } observe() {} disconnect() {} unobserve() {} }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    useAppStore.setState({ user: null, theme: { mode: 'light', primaryColor: '#4F46E5' } });
    render(<MemoryRouter><PublicLayout><section id="modules">Modules</section></PublicLayout></MemoryRouter>);
    const modules = () => screen.getAllByRole('link', { name: 'Modules' })[0];
    expect(modules().getAttribute('aria-current')).toBeNull();
    const entry = (isIntersecting: boolean) => [{ isIntersecting, intersectionRatio: .6, target: { id: 'modules' } }] as unknown as IntersectionObserverEntry[];
    act(() => notify(entry(true), {} as IntersectionObserver));
    expect(modules().getAttribute('aria-current')).toBe('location');
    expect(screen.getAllByRole('link', { name: 'Product' })[0].getAttribute('aria-current')).toBeNull();
    act(() => notify(entry(false), {} as IntersectionObserver));
    expect(modules().getAttribute('aria-current')).toBeNull();
  });
});
