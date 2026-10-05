import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:5009/api');
vi.stubEnv('VITE_SOCKET_URL', 'http://127.0.0.1:5009');
afterEach(() => cleanup());
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
