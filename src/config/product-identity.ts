/**
 * The product's public name, in ONE place.
 *
 * Everything a customer reads — the Studio header, the terms page, page titles — takes its name
 * from here, so rebranding, white-labelling or reselling the platform is a configuration change
 * rather than a search-and-replace across the source.
 *
 * Deliberately scoped to the VISIBLE surface only. Three things carry the old name and are NOT
 * covered here, because each is wiring rather than branding and renaming it costs something real
 * while gaining nothing a reader can see:
 *
 *  - Environment variables (`CINEJELLY_*`, 109 of them). Renaming breaks every deployed `.env` the
 *    moment the new build ships — the server starts with its configuration silently missing.
 *  - Report schema versions (`cinejelly.*.v1`). Renaming invalidates every archived report and
 *    every contract that validates one.
 *  - Browser storage keys (`cinejelly_session`, `cinejelly_lang`, `cinejelly_api_key`). Renaming
 *    signs out every logged-in customer and forgets their language, and nobody sees these unless
 *    they open developer tools.
 *
 * A future owner who genuinely wants them renamed should do it as its own deliberate migration
 * with a compatibility period — read the new name, fall back to the old one, drop the fallback a
 * release later — rather than as a side effect of changing a display name.
 */

/** Neutral default so a fresh clone is unbranded until an operator chooses a name. */
const DEFAULT_PRODUCT_NAME = "AI Video Studio";

/**
 * Public product name. Set `PRODUCT_NAME` in the environment to rebrand the whole customer surface.
 * Bounded and stripped of markup characters because it is interpolated into HTML pages.
 */
export function productName(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PRODUCT_NAME?.trim();
  if (!configured) {
    return DEFAULT_PRODUCT_NAME;
  }
  return configured.replace(/[<>"'&]/g, "").slice(0, 60) || DEFAULT_PRODUCT_NAME;
}

/** Name for the customer-facing creation surface, e.g. "AI Video Studio Studio" reads badly. */
export function studioName(env: NodeJS.ProcessEnv = process.env): string {
  const name = productName(env);
  return /studio/iu.test(name) ? name : `${name} Studio`;
}
