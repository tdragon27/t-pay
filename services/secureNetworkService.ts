export interface SecureRequestOptions extends RequestInit {
  allowHttpLocalhost?: boolean;
}

const PINNING_REQUIRED = process.env.EXPO_PUBLIC_PINNING_REQUIRED === 'true';
const PINNING_NATIVE_AVAILABLE = process.env.EXPO_PUBLIC_NATIVE_PINNING_AVAILABLE === 'true';

function assertSecureUrl(input: RequestInfo | URL, allowHttpLocalhost = false) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
  const url = new URL(raw);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(allowHttpLocalhost && isLocal)) {
    throw new Error(`Blocked insecure request to ${url.hostname}. HTTPS is required.`);
  }
  if (PINNING_REQUIRED && !PINNING_NATIVE_AVAILABLE) {
    throw new Error('Certificate pinning is required but no native pinning module is active in this build.');
  }
}

export async function secureFetch(input: RequestInfo | URL, options: SecureRequestOptions = {}) {
  assertSecureUrl(input, options.allowHttpLocalhost);
  return fetch(input, options);
}

export function getCertificatePinningStatus() {
  return {
    required: PINNING_REQUIRED,
    nativeAvailable: PINNING_NATIVE_AVAILABLE,
    mode: PINNING_REQUIRED && PINNING_NATIVE_AVAILABLE ? 'enforced' : PINNING_REQUIRED ? 'blocked' : 'https-only',
  } as const;
}
