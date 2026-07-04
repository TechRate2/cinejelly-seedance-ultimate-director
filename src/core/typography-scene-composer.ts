/**
 * Typography / text-scene composition.
 *
 * Distilled from VibeFrame's HTML/CSS scene composition: some of the most commercial video
 * formats (faceless explainers, caption-first shorts, quote cards, stat/data reveals,
 * kinetic-text intros/outros) are built from styled TEXT, not from a video model. This
 * composer turns a text scene spec into a deterministic, self-contained SVG frame plus a
 * timed reveal plan the assembly layer can rasterize (ffmpeg + an SVG rasterizer) and burn
 * in — so the pipeline can produce text-driven scenes without spending a video render.
 *
 * Fully deterministic and no-spend. All user text is XML-escaped, so a scene spec can never
 * inject markup into the SVG.
 */

export type TypographySceneKind = "title_card" | "bullet_list" | "quote" | "stat_card" | "kinetic_text";

export type TypographyTheme = "midnight" | "sunrise" | "mono" | "brand";

export interface TypographyThemePalette {
  readonly background: string;
  readonly backgroundAccent: string;
  readonly title: string;
  readonly body: string;
  readonly accent: string;
}

const THEMES: Record<TypographyTheme, TypographyThemePalette> = {
  midnight: { background: "#0b0e1d", backgroundAccent: "#141a3a", title: "#ffffff", body: "#c7cded", accent: "#8f5cff" },
  sunrise: { background: "#1a0f2e", backgroundAccent: "#3a1740", title: "#fff5e6", body: "#ffd9a8", accent: "#ff7d54" },
  mono: { background: "#0a0a0a", backgroundAccent: "#1a1a1a", title: "#ffffff", body: "#bdbdbd", accent: "#ffffff" },
  brand: { background: "#06121f", backgroundAccent: "#0d2135", title: "#ffffff", body: "#a9d8ff", accent: "#36f2aa" }
};

export type TypographyAspect = "9:16" | "16:9" | "1:1";

const DIMENSIONS: Record<TypographyAspect, { readonly width: number; readonly height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 }
};

export interface TypographySceneSpec {
  readonly kind: TypographySceneKind;
  readonly title?: string;
  readonly subtitle?: string;
  /** Bullet points (bullet_list) or kinetic words (kinetic_text). */
  readonly lines?: readonly string[];
  /** Big value for stat_card, e.g. "3.2x". */
  readonly statValue?: string;
  readonly attribution?: string;
  readonly theme?: TypographyTheme;
  readonly aspect?: TypographyAspect;
  readonly durationSeconds?: number;
}

export interface TypographyRevealStep {
  readonly atSecond: number;
  readonly elementId: string;
  readonly description: string;
}

export interface TypographyScene {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly durationSeconds: number;
  /** Timed reveal plan for the assembler to animate/burn the text in. */
  readonly reveal: readonly TypographyRevealStep[];
}

export function composeTypographyScene(spec: TypographySceneSpec): TypographyScene {
  const aspect = spec.aspect ?? "9:16";
  const { width, height } = DIMENSIONS[aspect];
  const palette = THEMES[spec.theme ?? "midnight"];
  const durationSeconds = clampDuration(spec.durationSeconds ?? 4);
  const cx = width / 2;
  const body = renderBody(spec, palette, width, height);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${palette.background}"/><stop offset="1" stop-color="${palette.backgroundAccent}"/>`,
    `</linearGradient></defs>`,
    `<rect width="${width}" height="${height}" fill="url(#bg)"/>`,
    `<rect x="${cx - 60}" y="${height * 0.14}" width="120" height="8" rx="4" fill="${palette.accent}"/>`,
    body.markup,
    `</svg>`
  ].join("");

  return { svg, width, height, durationSeconds, reveal: body.reveal };
}

function renderBody(
  spec: TypographySceneSpec,
  palette: TypographyThemePalette,
  width: number,
  height: number
): { readonly markup: string; readonly reveal: TypographyRevealStep[] } {
  const cx = width / 2;
  const titleSize = Math.round(width * 0.075);
  const bodySize = Math.round(width * 0.042);
  const reveal: TypographyRevealStep[] = [];
  const parts: string[] = [];

  const title = clampText(spec.title, 90);

  if (spec.kind === "stat_card") {
    const statValue = clampText(spec.statValue, 12) || "—";
    parts.push(textEl(cx, height * 0.42, Math.round(width * 0.22), palette.accent, "middle", statValue, "stat", 800));
    if (title) {
      parts.push(textEl(cx, height * 0.56, bodySize, palette.body, "middle", title, "stat-label"));
    }
    reveal.push({ atSecond: 0, elementId: "stat", description: "count-up the stat value" });
  } else if (spec.kind === "quote") {
    const quoteLines = wrapText(clampText(spec.title, 200), 28);
    let y = height * 0.38;
    parts.push(textEl(cx, y - titleSize, Math.round(titleSize * 1.6), palette.accent, "middle", "“", "quote-mark"));
    quoteLines.forEach((line, index) => {
      parts.push(textEl(cx, y, Math.round(width * 0.06), palette.title, "middle", line, `quote-${index}`, 600));
      y += Math.round(width * 0.08);
    });
    if (spec.attribution) {
      parts.push(textEl(cx, y + bodySize, bodySize, palette.body, "middle", `— ${clampText(spec.attribution, 60)}`, "attribution"));
    }
    reveal.push({ atSecond: 0, elementId: "quote-0", description: "fade in the quote" });
  } else if (spec.kind === "bullet_list") {
    if (title) {
      parts.push(textEl(cx, height * 0.24, titleSize, palette.title, "middle", title, "title", 800));
    }
    let y = height * 0.36;
    (spec.lines ?? []).slice(0, 6).forEach((line, index) => {
      const clean = clampText(line, 60);
      parts.push(`<circle cx="${width * 0.16}" cy="${y - bodySize * 0.35}" r="${bodySize * 0.28}" fill="${palette.accent}"/>`);
      parts.push(textEl(width * 0.22, y, bodySize, palette.body, "start", clean, `bullet-${index}`));
      reveal.push({ atSecond: round1(index * 0.6), elementId: `bullet-${index}`, description: `slide in bullet ${index + 1}` });
      y += Math.round(height * 0.09);
    });
  } else if (spec.kind === "kinetic_text") {
    const words = (spec.lines && spec.lines.length > 0 ? spec.lines : (title ? title.split(/\s+/) : []))
      .map((word) => clampText(word, 24))
      .slice(0, 8);
    let y = height * 0.4;
    words.forEach((word, index) => {
      const emphasis = index % 2 === 0 ? palette.title : palette.accent;
      parts.push(textEl(cx, y, Math.round(width * 0.11), emphasis, "middle", word, `word-${index}`, 800));
      reveal.push({ atSecond: round1(index * 0.4), elementId: `word-${index}`, description: `punch-in word "${word}"` });
      y += Math.round(width * 0.13);
    });
  } else {
    // title_card
    const titleLines = wrapText(title || "Untitled", 22);
    let y = height * 0.4;
    titleLines.forEach((line, index) => {
      parts.push(textEl(cx, y, titleSize, palette.title, "middle", line, `title-${index}`, 800));
      y += Math.round(titleSize * 1.25);
    });
    if (spec.subtitle) {
      parts.push(textEl(cx, y + bodySize, bodySize, palette.body, "middle", clampText(spec.subtitle, 120), "subtitle"));
    }
    reveal.push({ atSecond: 0, elementId: "title-0", description: "fade/scale in the title" });
  }

  return { markup: parts.join(""), reveal };
}

function textEl(
  x: number,
  y: number,
  size: number,
  fill: string,
  anchor: "start" | "middle" | "end",
  text: string,
  id: string,
  weight = 400
): string {
  return (
    `<text id="${id}" x="${round1(x)}" y="${round1(y)}" font-family="Segoe UI, Arial, sans-serif" ` +
    `font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(text)}</text>`
  );
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxCharsPerLine && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
    if (lines.length >= 6) {
      break;
    }
  }
  if (current && lines.length < 6) {
    lines.push(current.trim());
  }
  return lines.length > 0 ? lines : [text.slice(0, maxCharsPerLine)];
}

function clampText(value: string | undefined, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

function clampDuration(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 4;
  }
  return Math.min(30, Math.max(1, Math.round(value * 10) / 10));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
