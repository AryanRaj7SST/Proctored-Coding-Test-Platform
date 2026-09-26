import dns from 'node:dns';
import net from 'node:net';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const FETCH_TIMEOUT_MS = 5000;
export const MAX_REDIRECTS = 3;

/**
 * Checks whether an IP address belongs to private, loopback, link-local,
 * multicast, or reserved ranges to prevent Server-Side Request Forgery (SSRF).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').toLowerCase();

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (clean.startsWith('::ffff:')) {
    const rest = clean.slice(7);
    if (net.isIPv4(rest)) {
      return isPrivateOrReservedIp(rest);
    }
    const hexParts = rest.split(':');
    if (hexParts.length === 2) {
      const high = parseInt(hexParts[0] || '0', 16);
      const low = parseInt(hexParts[1] || '0', 16);
      const o0 = (high >> 8) & 0xff;
      const o1 = high & 0xff;
      const o2 = (low >> 8) & 0xff;
      const o3 = low & 0xff;
      return isPrivateOrReservedIp(`${o0}.${o1}.${o2}.${o3}`);
    }
  }

  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    const o0 = parts[0] ?? -1;
    const o1 = parts[1] ?? -1;
    const o2 = parts[2] ?? -1;

    if (o0 === 0) return true; // 0.0.0.0/8
    if (o0 === 10) return true; // 10.0.0.0/8 (RFC 1918)
    if (o0 === 127) return true; // 127.0.0.0/8 (Loopback)
    if (o0 === 169 && o1 === 254) return true; // 169.254.0.0/16 (Link-local / cloud metadata)
    if (o0 === 172 && o1 >= 16 && o1 <= 31) return true; // 172.16.0.0/12 (RFC 1918)
    if (o0 === 192 && o1 === 168) return true; // 192.168.0.0/16 (RFC 1918)
    if (o0 === 100 && o1 >= 64 && o1 <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (o0 === 192 && o1 === 0 && o2 === 0) return true; // 192.0.0.0/24
    if (o0 === 192 && o1 === 0 && o2 === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
    if (o0 === 198 && (o1 === 18 || o1 === 19)) return true; // 198.18.0.0/15
    if (o0 === 198 && o1 === 51 && o2 === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
    if (o0 === 203 && o1 === 0 && o2 === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
    if (o0 >= 224) return true; // 224.0.0.0/4 (Multicast + Reserved 240.0.0.0/4 + Broadcast)
    return false;
  }

  if (net.isIPv6(clean)) {
    if (clean === '::1' || clean === '::') return true; // Loopback / Unspecified
    if (/^fe[89ab]/i.test(clean)) return true; // fe80::/10 Link-local
    if (/^f[cd]/i.test(clean)) return true; // fc00::/7 Unique local (private)
    return false;
  }

  return false;
}

/**
 * Checks if a hostname directly matches internal domain suffixes or is a private IP literal.
 */
export function isBlockedHostname(hostname: string): boolean {
  const clean = hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .trim();

  if (
    clean === 'localhost' ||
    clean.endsWith('.localhost') ||
    clean.endsWith('.local') ||
    clean.endsWith('.internal') ||
    clean.endsWith('.lan') ||
    clean.endsWith('.corp') ||
    clean.endsWith('.home') ||
    clean === 'metadata.google.internal'
  ) {
    return true;
  }

  if (net.isIP(clean)) {
    return isPrivateOrReservedIp(clean);
  }

  return false;
}

/**
 * Resolves a hostname via DNS and checks all returned IP addresses for private ranges.
 */
export async function isBlockedByDns(hostname: string): Promise<boolean> {
  const clean = hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .trim();

  // If already an IP address, isBlockedHostname already handled it
  if (net.isIP(clean)) {
    return false;
  }

  try {
    const records = await dns.promises.lookup(clean, { all: true });
    return records.some((record) => isPrivateOrReservedIp(record.address));
  } catch {
    // If DNS resolution fails, allow downstream fetch to handle or report error
    return false;
  }
}
