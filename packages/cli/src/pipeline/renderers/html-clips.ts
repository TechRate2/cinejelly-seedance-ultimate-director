import type { TimelineState } from "@vibeframe/core";

export function relAsset(url: string): string {
  const basename = url.split("/").pop() ?? url;
  return `assets/${basename}`;
}

type LottiePosition =
  | "full"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

interface LottieOverlayParams {
  position: LottiePosition;
  scale: number;
  opacity: number;
  loop: boolean;
}

function numberParam(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolParam(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function lottieOverlayParams(clip: TimelineState["clips"][number]): LottieOverlayParams {
  const fx = clip.effects.find(
    (effect) => effect.type === "custom" && effect.params.kind === "motion-overlay"
  );
  const rawPosition = String(fx?.params.position ?? "full") as LottiePosition;
  const position: LottiePosition = [
    "full",
    "center",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ].includes(rawPosition)
    ? rawPosition
    : "full";
  return {
    position,
    scale: Math.max(0.01, Math.min(2, numberParam(fx?.params.scale, position === "full" ? 1 : 0.25))),
    opacity: Math.max(0, Math.min(1, numberParam(fx?.params.opacity, 1))),
    loop: boolParam(fx?.params.loop, true),
  };
}

function lottieInnerStyle(params: LottieOverlayParams): string {
  const base = [
    "position:absolute",
    "pointer-events:none",
    `opacity:${params.opacity}`,
  ];

  if (params.position === "full") {
    return [...base, "inset:0", "width:100%", "height:100%"].join(";");
  }

  const size = `${params.scale * 100}%`;
  const edge = "4%";
  const placement: Record<Exclude<LottiePosition, "full">, string[]> = {
    center: ["left:50%", "top:50%", "transform:translate(-50%,-50%)"],
    "top-left": [`left:${edge}`, `top:${edge}`],
    "top-right": [`right:${edge}`, `top:${edge}`],
    "bottom-left": [`left:${edge}`, `bottom:${edge}`],
    "bottom-right": [`right:${edge}`, `bottom:${edge}`],
  };
  return [...base, ...placement[params.position], `width:${size}`, `height:${size}`].join(";");
}

export function buildClipElements(state: TimelineState): string {
  return state.clips
    .map((clip) => {
      const source = state.sources.find((s) => s.id === clip.sourceId);
      const track = state.tracks.find((t) => t.id === clip.trackId);
      if (!source || !track) return `<!-- missing source/track for clip ${clip.id} -->`;
      const zIndex = track.order;

      switch (source.type) {
        case "image":
          return `<div id="${clip.id}" class="clip" style="z-index:${zIndex};"><img src="${relAsset(source.url)}" style="width:100%;height:100%;object-fit:cover;"></div>`;
        case "video":
          return `<div id="${clip.id}" class="clip" style="z-index:${zIndex};"><video id="${clip.id}-media" src="${relAsset(source.url)}" style="width:100%;height:100%;object-fit:cover;" muted playsinline></video></div>`;
        case "audio":
          return `<audio id="${clip.id}-media" src="${relAsset(source.url)}"></audio><div id="${clip.id}" class="clip" style="z-index:${zIndex};background:#111;"></div>`;
        case "lottie":
          {
            const params = lottieOverlayParams(clip);
            const loop = params.loop ? " loop" : "";
            return `<div id="${clip.id}" class="clip" style="z-index:${zIndex};"><dotlottie-wc src="${relAsset(source.url)}" autoplay${loop} style="${lottieInnerStyle(params)}"></dotlottie-wc></div>`;
          }
        default:
          return `<!-- unsupported source type: ${(source as { type: string }).type} for clip ${clip.id} -->`;
      }
    })
    .join("\n  ");
}

export interface HfMediaElement {
  elementId: string;
  src: string;
  startTime: number;
  endTime: number;
  mediaOffset: number;
  volume: number;
  hasAudio: boolean;
}

export function buildMediaDeclarations(state: TimelineState): HfMediaElement[] {
  return state.clips
    .map((clip) => ({ clip, source: state.sources.find((s) => s.id === clip.sourceId) }))
    .filter((x): x is { clip: typeof x.clip; source: NonNullable<typeof x.source> } =>
      x.source !== undefined && (x.source.type === "video" || x.source.type === "audio")
    )
    .map(({ clip, source }) => ({
      elementId: `${clip.id}-media`,
      src: relAsset(source.url),
      startTime: clip.startTime,
      endTime: clip.startTime + clip.duration,
      mediaOffset: clip.sourceStartOffset ?? 0,
      volume: 1,
      hasAudio: true,
    }));
}

export function buildClipRuntimeData(state: TimelineState) {
  return state.clips.map((clip) => ({
    id: clip.id,
    startTime: clip.startTime,
    duration: clip.duration,
    effects: clip.effects,
  }));
}
