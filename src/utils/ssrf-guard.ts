/**
 * SSRF guard for every server-side fetch of a caller-influenced URL.
 *
 * A URL that merely "looks" public (https, no embedded credentials) can still point at an
 * internal service — either as a literal RFC1918/loopback/link-local address or via a public
 * domain whose DNS record resolves to a private IP. Any code that fetch()es such a URL must
 * first pass it through assertPublicHttpsFetchTarget so the box cannot be turned into an SSRF
 * proxy for internal admin panels, cloud metadata, or other tenants' services.
 *
 * Centralized here so the product-URL researcher, the audio-mix engine, and the assembly engine
 * all enforce the SAME rule (the audio/clip download paths previously checked only protocol +
 * credentials and never resolved DNS). Deterministic except for the DNS lookup; fails safe.
 */

import { isIP } from "node:net";
import { lookup } from "node:dns";
import { promisify } from "node:util";

const dnsLookup = promisify(lookup);

function isPrivateIpv4(ip: string): boolean {
  const [first = 0, second = 0] = ip.split(".").map((part) => Number(part));
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) || // CGNAT 100.64.0.0/10 (RFC 6598) — routable to internal infra
    (first === 198 && (second === 18 || second === 19)) || // benchmarking 198.18.0.0/15
    first >= 224 // multicast / reserved — never a legitimate fetch target
  );
}

/** Expand an IPv6 literal (incl. `::` compression and a trailing dotted-quad) to 8 numeric groups. */
function expandIpv6(host: string): number[] | undefined {
  let text = host;
  const dotted = text.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const a = Number(dotted[2]), b = Number(dotted[3]), c = Number(dotted[4]), d = Number(dotted[5]);
    if ([a, b, c, d].some((n) => n > 255)) return undefined;
    text = `${dotted[1]}${(((a << 8) | b) >>> 0).toString(16)}:${(((c << 8) | d) >>> 0).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(":").filter((p) => p !== "") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":").filter((p) => p !== "") : []) : [];
  const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail] : head;
  if (groups.length !== 8) return undefined;
  const nums = groups.map((g) => parseInt(g, 16));
  return nums.some((n) => !Number.isFinite(n) || n < 0 || n > 0xffff) ? undefined : nums;
}

/** IPv4 embedded in an IPv4-mapped (`::ffff:x`) or IPv4-compatible (`::x`) IPv6 address, if any. */
function embeddedIpv4(groups: number[]): string | undefined {
  const firstFiveZero = groups.slice(0, 5).every((g) => g === 0);
  const isMapped = firstFiveZero && groups[5] === 0xffff;
  const isCompat = firstFiveZero && groups[5] === 0 && !(groups[6] === 0 && (groups[7] ?? 0) <= 1);
  if (!isMapped && !isCompat) return undefined;
  const g6 = groups[6] ?? 0, g7 = groups[7] ?? 0;
  return `${(g6 >> 8) & 0xff}.${g6 & 0xff}.${(g7 >> 8) & 0xff}.${g7 & 0xff}`;
}

/**
 * True if an IP literal (v4 or v6) is loopback/private/link-local/reserved — never fetch it.
 * Handles IPv4-mapped/compat IPv6 (`::ffff:127.0.0.1` -> 127.0.0.1) so an internal host cannot be
 * smuggled past the guard as a "public" IPv6 literal.
 */
export function isPrivateIpLiteral(ip: string): boolean {
  let host = ip.toLowerCase().replace(/^\[|\]$/g, "").trim();
  const zone = host.indexOf("%");
  if (zone !== -1) {
    host = host.slice(0, zone);
  }
  const version = isIP(host);
  if (version === 4) {
    return isPrivateIpv4(host);
  }
  if (version === 6) {
    const groups = expandIpv6(host);
    if (groups) {
      const v4 = embeddedIpv4(groups);
      if (v4 && isPrivateIpv4(v4)) {
        return true;
      }
    }
    if (host === "::" || host === "::1") {
      return true;
    }
    // Unique-local fc00::/7 (fc../fd..) and link-local fe80::/10 (fe8./fe9./fea./feb.).
    return /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
  }
  return false;
}

/** True for loopback/link-local/private hostnames and internal TLDs in every notation. */
export function isLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    lower === "localhost" ||
    lower === "::" ||
    lower === "::1" ||
    lower === "0.0.0.0" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }
  return isPrivateIpLiteral(lower);
}

/**
 * Resolve the host and reject if ANY resolved address is loopback/private/link-local. Stops a
 * public-looking domain whose DNS A/AAAA record points at an internal service. Fails safe
 * (treats a resolution error, or no addresses, as unsafe).
 */
export async function hostnameResolvesToPrivate(hostname: string): Promise<boolean> {
  const bare = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    return isPrivateIpLiteral(bare);
  }
  try {
    const addresses = await dnsLookup(bare, { all: true });
    if (addresses.length === 0) {
      return true;
    }
    return addresses.some((entry) => isPrivateIpLiteral(entry.address));
  } catch {
    return true;
  }
}

/**
 * Throw unless `url` is a public https target safe to fetch server-side: https scheme, no
 * embedded credentials, hostname not loopback/private, and DNS does not resolve to a private IP.
 * Call this immediately before any fetch() of a caller-influenced media/reference URL.
 */
export async function assertPublicHttpsFetchTarget(url: string | URL, label = "Media"): Promise<void> {
  let parsed: URL;
  try {
    parsed = url instanceof URL ? url : new URL(url);
  } catch {
    throw new Error(`${label} URL is not a valid URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} URL must use https.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} URL must not include embedded credentials.`);
  }
  if (isLocalHost(parsed.hostname) || (await hostnameResolvesToPrivate(parsed.hostname))) {
    throw new Error(`${label} URL host resolves to a private or internal network address.`);
  }
}

/**
 * SSRF-safe replacement for a plain fetch() of a caller-influenced URL. Validates the target, then
 * follows redirects MANUALLY so every hop's Location is re-validated (host + DNS) BEFORE the request
 * is issued — a plain fetch with the default redirect:"follow" would let a public host 302 to an
 * internal/loopback/metadata address that the initial check never saw. Returns the final response.
 */
export async function ssrfSafeFetch(
  url: string | URL,
  init: RequestInit = {},
  options: { readonly label?: string; readonly maxRedirects?: number } = {}
): Promise<Response> {
  const label = options.label ?? "Media";
  const maxRedirects = options.maxRedirects ?? 5;
  let current = url instanceof URL ? url.href : url;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicHttpsFetchTarget(current, label);
    const response = await fetch(current, { ...init, redirect: "manual" });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) {
      return response;
    }
    let next: string;
    try {
      next = new URL(location, current).href;
    } catch {
      throw new Error(`${label} URL returned an invalid redirect target.`);
    }
    current = next;
  }
  throw new Error(`${label} URL exceeded the redirect limit.`);
}
