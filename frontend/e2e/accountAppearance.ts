import { expect, type Locator } from '@playwright/test';

/** Assert visible UX-01 content and painted colors, not the retired palette/DOM count. */
export async function expectAccountAppearance(account: Locator) {
  await expect(account).toBeVisible();
  await expect(account.locator('.account-name')).toBeVisible();
  await expect(account.locator('.account-name')).not.toBeEmpty();
  const actions = account.getByRole('navigation', { name: 'Account actions' });
  for (const [name, href] of [
    ['My profile', '/settings?section=profile'],
    ['Security & password', '/settings?section=security'],
    ['Settings', '/settings'],
    ['Help & support', '/help'],
  ]) {
    const link = actions.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible(); await expect(link).toHaveAttribute('href', href);
  }
  for (const name of ['Light', 'Dark', 'System']) await expect(account.getByRole('radio', { name, exact: true })).toBeVisible();
  await expect(account.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const styles = await account.locator('.account-name,.account-identity .muted,.account-sheet nav a,.theme-mode-option,.account-signout').evaluateAll(nodes => nodes.map(node => {
    const canvas = document.createElement('canvas').getContext('2d')!;
    const rgba = (color: string) => {
      canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1);
      return Array.from(canvas.getImageData(0, 0, 1, 1).data);
    };
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.slice(0, 3).map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
      return r * .2126 + g * .7152 + b * .0722;
    };
    const style = getComputedStyle(node);
    const token = node.matches('.muted') ? '--text-muted' : node.matches('[data-selected=true]') ? '--primary-readable' : '--text';
    const semanticColor = style.getPropertyValue(token).trim();
    if (!CSS.supports('color', semanticColor)) throw new Error(`Invalid account color token: ${token}`);
    const foreground = rgba(style.color), expected = rgba(semanticColor);
    // Composite actual ancestor surfaces, including translucent backgrounds.
    const surfaces: string[] = []; let ancestor: Element | null = node, opaque = false;
    while (ancestor) {
      const background = getComputedStyle(ancestor).backgroundColor; surfaces.push(background);
      if (rgba(background)[3] === 255) { opaque = true; break; }
      ancestor = ancestor.parentElement;
    }
    if (!opaque) throw new Error('No opaque account surface found');
    canvas.clearRect(0, 0, 1, 1);
    for (const background of surfaces.reverse()) { canvas.fillStyle = background; canvas.fillRect(0, 0, 1, 1); }
    const bg = luminance(Array.from(canvas.getImageData(0, 0, 1, 1).data)), fg = luminance(foreground);
    return { label: node.textContent?.trim(), foreground, expected, duration: style.transitionDuration, contrast: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) };
  }));
  expect(styles.length).toBeGreaterThan(0);
  for (const style of styles) {
    expect(style.foreground, `${style.label}: semantic foreground`).toEqual(style.expected);
    expect(style.duration, `${style.label}: reduced motion`).toBe('0s');
    expect(style.contrast, `${style.label}: painted text contrast`).toBeGreaterThanOrEqual(4.5);
  }
  expect(await account.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  return styles;
}
