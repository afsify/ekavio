const frontendOrigin = 'https://ekavio.afsify.com';
const required = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
const requiredCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.ekavio.afsify.com wss://api.ekavio.afsify.com",
  "worker-src 'self'",
  "manifest-src 'self'",
];

let failed = false;
for (const path of ['/', '/login']) {
  try {
    const response = await fetch(new URL(path, frontendOrigin), {
      method: 'HEAD',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    const problems = [];
    if (response.status !== 200) problems.push(`HTTP ${response.status}`);
    for (const [name, value] of Object.entries(required)) {
      if (response.headers.get(name) !== value) problems.push(`${name} missing or incorrect`);
    }
    const hsts = response.headers.get('strict-transport-security') ?? '';
    const age = /^max-age=(\d+)(?:;|$)/i.exec(hsts)?.[1];
    if (!age || Number(age) < 31_536_000) problems.push('HSTS missing or shorter than one year');
    const csp = response.headers.get('content-security-policy') ?? '';
    const directives = csp.split(';').map((part) => part.trim()).filter(Boolean);
    for (const directive of requiredCsp) {
      if (!directives.includes(directive)) problems.push(`CSP ${directive.split(' ')[0]} missing or incorrect`);
    }
    if (directives.some((directive) => /(?:^|\s)\*(?:\s|$)/.test(directive))) {
      problems.push('CSP contains wildcard source');
    }
    console.log(JSON.stringify({ path, status: problems.length === 0 ? 'pass' : 'fail', problems }));
    if (problems.length > 0) failed = true;
  } catch {
    console.log(JSON.stringify({ path, status: 'fail', problems: ['HTTPS header probe unavailable'] }));
    failed = true;
  }
}
if (failed) process.exitCode = 1;
