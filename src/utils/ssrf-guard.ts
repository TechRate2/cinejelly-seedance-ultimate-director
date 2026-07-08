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

/** True if an IP literal (v4 or v6) is loopback/private/link-local — never fetch it. */
export function isPrivateIpLiteral(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = isIP(lower);
  if (ipVersion === 4) {
    const [first = 0, second = 0] = lower.split(".").map((part) => Number(part));
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  if (ipVersion === 6) {
    return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
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
