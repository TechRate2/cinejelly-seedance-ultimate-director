/**
 * Niche playbooks — script-time creative intelligence per content family.
 *
 * Distilled from a systematic mining of the curated Seedance 2.0 prompt corpus (131 proven
 * prompts analyzed for hook formulas, camera language, audio integration, reference usage,
 * pacing, and viral triggers — original wording, attribution in docs/CREDITS.md). Where the
 * prompt compiler decorates individual shots (niche DNA, cinematic grammar), these
 * playbooks teach the SCRIPT WRITER: the Story Architect receives the matching playbook as
 * a hard directive, so scripts are born with the winning hook, beat structure, audio
 * design, and reference strategy for their content family — for every niche.
 *
 * Deterministic and no-spend. Family resolution accepts both platform niches (37+) and
 * creative modes, with keyword fallback for free-text niches.
 */

export interface NichePlaybook {
  readonly family: string;
  /** Proven first-1-3-second hook patterns; the script should pick ONE and commit. */
  readonly hookFormulas: readonly string[];
  /** Canonical beat structure for the whole video. */
  readonly beatTemplate: string;
  /** Signature camera sequencing language for this family. */
  readonly cameraPlaybook: string;
  /** How dialogue/SFX/music are written for this family. */
  readonly audioSignature: string;
  /** How identity/product/style/frame references should be applied. */
  readonly referenceStrategy: string;
  /** What makes this family shareable; scripts should engineer at least one. */
  readonly viralTriggers: readonly string[];
  /** Anti-patterns that mark a video as cheap or off-family. */
  readonly avoid: string;
}

const PLAYBOOKS: Record<string, NichePlaybook> = {
  cinematic_film: {
    family: "cinematic_film",
    hookFormulas: [
      "extreme slow push-in on an intimate micro-detail (hands, profile, an object mid-use) under motivated golden light",
      "freeze on a charged two-person moment, then let it breathe into motion",
      "open on the aftermath first, then cut back to how it began"
    ],
    beatTemplate: "3 beats of 4-6s each with escalating intimacy or tension: establish -> approach/complication -> emotional payoff held on a readable final frame",
    cameraPlaybook: "static or slow dolly-in -> reverse close-up -> extreme close-up two-shot at the emotional peak; shallow depth of field with creamy bokeh; motivated rack focus at the turn",
    audioSignature: "whispered or quiet quoted dialogue with explicit delivery notes and 200-400ms pause cues; layered ambience (room tone, small physical sounds) fading under a soft score; lip-sync on every spoken line",
    referenceStrategy: "identity reference is the exact start-frame anchor; lock face, hair, and wardrobe across every shot with an explicit no-drift clause",
    viralTriggers: ["parasocial intimacy (eye contact, blush, almost-touch)", "restrained tension released in the last second", "nostalgia texture (film grain, era styling)"],
    avoid: "robotic or exaggerated expressions, rushed cuts through emotional beats, on-screen text or subtitles baked into the image"
  },
  anime_animation: {
    family: "anime_animation",
    hookFormulas: [
      "super close-up on the character's eyes, then an ultra-fast zoom out as motion explodes",
      "high-speed whip-pan rush through a fantastical world straight into the protagonist",
      "shouted signature line delivered with explosive force on frame one"
    ],
    beatTemplate: "3-4 beats of 4-6s, each packing 2-3 rhythm cuts inside its per-second timeline (min 4s beats): power stance -> rapid action chain (kick/object-POV/impact) -> aftermath frame that invites a loop",
    cameraPlaybook: "diagonal low-angle power stances, crash zooms, impact-frame orbits, match cuts; continuous kinetic motion — never a slideshow of stills",
    audioSignature: "BGM with an explicit mood and BPM, an SFX list per impact (glitch stingers, energy hums), one shouted quotable line marked as modifiable; cuts land on the beat",
    referenceStrategy: "use the character turnaround sheet (front/back/side) as the only identity source; when a storyboard/control sheet is supplied, follow its shots exactly but NEVER render the sheet, its panels, or annotations",
    viralTriggers: ["transformation or power-up reveal", "2D-into-reality or anime-to-photoreal fusion", "punch-the-camera loop-bait ending"],
    avoid: "storyboard borders or annotations leaking into frame, off-model character drift between cuts, static poses passed off as action"
  },
  ugc_pov_authentic: {
    family: "ugc_pov_authentic",
    hookFormulas: [
      "direct-to-camera selfie address with a candid doubt or bold claim in the first line",
      "first-person POV tilt-up that reveals something impossible, treated casually",
      "ASMR whisper opener ('I found a hidden...') before the music or reveal drops"
    ],
    beatTemplate: "15s in per-second choreography: hook line -> handheld exploration/proof beats of 4-6s each packing 2-3 quick proof actions inside the clip -> reaction -> payoff or twist; end on a natural cutoff, not a produced outro",
    cameraPlaybook: "handheld selfie-stick wide-angle with genuine micro-shake, autofocus hunt, digital zoom, phone-sensor character; no stabilized cinematic moves at all",
    audioSignature: "in-camera ambience only (breathing, cloth, street rumble) with sparse quoted natural dialogue; no scored music unless the format is a beat-synced hyperlapse",
    referenceStrategy: "the creator photo is the identity anchor — preserve the exact face and stated details (accessories stay on the same wrist/side) through every second; product appears in-hand, never floating",
    viralTriggers: ["'how is this possible?' fake-authentic spectacle", "prank or expectation reversal", "POV immersion the viewer projects into"],
    avoid: "color grading, filters, slow motion, beauty smoothing, perfect lighting — anything produced-looking kills the format's trust"
  },
  commercial_product: {
    family: "commercial_product",
    hookFormulas: [
      "macro hero detail of the product mid-action (droplet, texture, mechanism click) before any context",
      "aspirational lifestyle vignette with the subject confident mid-use",
      "problem beat staged in one shot, product enters as the turn"
    ],
    beatTemplate: "labeled scenes across 15-35s escalating to a hero shot: hook -> product-in-use proof -> sensory macro -> human payoff -> rotating hero end-frame with quiet CTA",
    cameraPlaybook: "slider tracking and orbit for lifestyle, macro rack focus for detail, push-in for the hero; a distinct motion language per scene so the montage feels designed",
    audioSignature: "beat-driven cuts under a mood-matched BGM build; optionally SFX-only (clicks, pours, mechanism sounds) for premium restraint; testimonial lines lip-synced",
    referenceStrategy: "product reference is 100%-accurate geometry/color/label — logo appears only where it exists on the real product; multiple images act as time-ordered keyframes, not a collage; identity reference locks the presenter",
    viralTriggers: ["satisfying process montage", "before-to-after glow", "crowd-joins-in contagion moment"],
    avoid: "logo on wrong surfaces, floating product with no hands, over-claiming text overlays, dull flat lighting on the hero shot"
  },
  action_vfx_fantasy: {
    family: "action_vfx_fantasy",
    hookFormulas: [
      "mid-action entry: the strike/breach/charge is already happening on frame one",
      "extreme close-up on one detail (an eye, a mask sealing) that ignites the sequence",
      "total stillness with dread — something colossal is about to appear"
    ],
    beatTemplate: "labeled shots of 4-6s escalating to a cataclysm then a calm reveal; optionally one true unbroken continuous shot with no cuts for maximum spectacle",
    cameraPlaybook: "sweeping wide establish -> whip into high-speed tracking -> orbit the hero -> crash-zoom or speed-ramp at impact -> aerial pull-back finale revealing scale",
    audioSignature: "SFX-forward design (roars, shockwaves, structural groans) over a swelling score with low-frequency weight; slow-motion at impact then snap back to full speed on the beat",
    referenceStrategy: "single character reference with an explicit identity-preservation clause (face, glasses, beard survive every frame); grounded-anatomy clause when realism matters",
    viralTriggers: ["scale shock (colossal creature vs real landmark)", "transformation VFX", "destruction spectacle with physical debris"],
    avoid: "gore, weightless floaty physics, toy-like miniature feel, morphing geometry between frames"
  },
  comedy_meme: {
    family: "comedy_meme",
    hookFormulas: [
      "locked static camera on a mundane setup that is about to flip absurd",
      "deadpan setup line delivered straight to camera",
      "escalating running gag introduced innocently in shot one"
    ],
    beatTemplate: "two-beat reversal (0-7s setup, 7-15s absurd payoff) or micro-gag ladder of 4-6s beats landing 2-3 gags inside each clip, ending on a freeze or told-you-so look to camera",
    cameraPlaybook: "explicitly static locked camera for deadpan (no zoom, no pan, no shake); jump cuts for escalation; one whip-pan reserved for the reveal",
    audioSignature: "quoted comic dialogue with timestamped bickering, exaggerated prop SFX, and often NO music — silence sells the deadpan; a single sting on the punchline",
    referenceStrategy: "recurring cast via character handles for series potential; prop safety framed explicitly (plastic props, adults only, no harm)",
    viralTriggers: ["absurd reversal or anticlimax", "escalating running gag", "wholesome twist after menace"],
    avoid: "camera movement that breaks the deadpan, laugh-track energy, explaining the joke, unsafe or mean-spirited stunts"
  },
  food_asmr: {
    family: "food_asmr",
    hookFormulas: [
      "extreme macro on the most tactile moment (sizzle, pour, glaze bubbling) with hands only",
      "top-down drop of a fresh ingredient landing in light",
      "the finished dish first, then rewind into the process"
    ],
    beatTemplate: "numbered process steps in strict cooking order packed 2-3 per 4-6s beat (each step timed inside the clip's per-second timeline), closing on a slow orbit of the finished dish and one human reaction",
    cameraPlaybook: "extreme macro and overhead process shots with match cuts on shape and motion; slow push-in on steam; closing orbit; vertical slow-motion reserved for the money shot",
    audioSignature: "ASMR SFX list written explicitly (chop, sizzle, bubble, ceramic clink) over a BPM-matched cozy BGM; one reveal sting; sound carries the appetite",
    referenceStrategy: "same chef/hands across every beat; when a storyboard is supplied follow all shots exactly without rendering the sheet; product packaging accurate when branded",
    viralTriggers: ["satisfying craft process", "moisture/steam/crunch sensory detail", "cozy healing aspiration"],
    avoid: "skipping process order, dry-looking food, music drowning the SFX, faces stealing focus from the food"
  },
  music_dance: {
    family: "music_dance",
    hookFormulas: [
      "subject in a stylized set as the drum pattern kicks in, lips opening on the first bar",
      "beat-drop freeze then explode into choreography",
      "an unexpected performer (age/identity subversion) owning the frame instantly"
    ],
    beatTemplate: "3 beats across 15s: intro attitude flowing into the verse with lip-sync (0-5) -> choreography escalation (5-10) -> climax where the music cuts abruptly and the performer holds the freeze (10-15)",
    cameraPlaybook: "medium push-in alternating with close-ups on the beat, low-angle authority shots, one 360-degree orbit, full-body pull-back for the dance reveal; every cut lands on the count",
    audioSignature: "embedded lyric lines in brackets with tempo and attitude notes; genre-specific BGM (trap 808s, city-pop); the abrupt-stop freeze is an audio event",
    referenceStrategy: "performer identity locked across outfit/set changes; choreography sheets act as count maps (16 counts per 10s), never rendered on screen",
    viralTriggers: ["quotable lyric bar", "dance loop-bait", "subversion casting (the last person you'd expect)"],
    avoid: "anatomy distortion mid-dance, cuts that ignore the beat grid, lyrics without lip-sync"
  },
  sports_fitness: {
    family: "sports_fitness",
    hookFormulas: [
      "low tracking shot beside the athlete already in motion, eyes locked",
      "the impossible finish first, then the run-up",
      "chalk dust / rope snap / cleat plant macro as the starting gun"
    ],
    beatTemplate: "15s in tight second-ranges: approach -> skill chain past real obstacles/defenders -> slow-motion at the decisive moment -> full-speed finish -> crowd eruption freeze",
    cameraPlaybook: "handheld lateral follow at body height, orbit on the skill move, tilt-up for aerial actions, speed-ramp only at the decisive contact; no drones or gimbal glide — keep it grounded",
    audioSignature: "surface and equipment SFX (ball friction, footfalls, breath) under rising crowd noise that erupts at the payoff; minimal or no music until the eruption",
    referenceStrategy: "athlete identity from the reference persona; opposition must actively contest (never standing mannequins); equipment/kit accurate to reference",
    viralTriggers: ["multi-obstacle skill chain", "impossible finish", "crowd shock reaction"],
    avoid: "1-on-none showcases, defenders posing statically, floaty physics on the ball or body"
  },
  travel_worldtour: {
    family: "travel_worldtour",
    hookFormulas: [
      "extreme close-up selfie smile with an ASMR whisper, then the music explodes into the first location",
      "aerial fly-through diving into street level where the guide is already walking",
      "one sensory place detail (steam, lanterns, waves) before any wide establishing shot"
    ],
    beatTemplate: "either a beat-synced hyperlapse rendered INSIDE 4-6s clips (rapid in-clip location flips on the beat, one look/outfit evolution per location) or 3-4 narrative districts of 4-5s each ending on a pull-back reveal of the whole world",
    cameraPlaybook: "selfie hyperlapse with hard beat cuts, tracking walkthroughs, emotional close-ups on discoveries, one grand pull-back finale; location variety IS the camera story",
    audioSignature: "upbeat driving BGM stitched with per-location ambience (markets, birds, water); the whisper-to-drop transition is the audio hook",
    referenceStrategy: "strict identity consistency across every location (face, accessories on the same side); outfits may change per location but the person never drifts",
    viralTriggers: ["rapid location variety flex", "outfit-per-location evolution", "socioeconomic or era contrast between districts"],
    avoid: "duplicate-feeling locations, identity drift between cuts, random bystanders replacing the subject, brochure-static wide shots"
  },
  transformation_reveal: {
    family: "transformation_reveal",
    hookFormulas: [
      "the ordinary state held just long enough to register before the first crack of change",
      "a charged object or garment beginning to move on its own",
      "before-state and a countdown cue (music riser, inhale, drumstick click)"
    ],
    beatTemplate: "before-state held inside the opening 4-5s beat -> transformation in continuous motion with the body/object never decomposing (5-8s) -> after-state strut/hold of 4-5s -> loopable final frame matching the opening angle",
    cameraPlaybook: "hold one continuous angle or slow orbit THROUGH the transformation so the change reads as real; speed-ramp at the peak; match the final framing to the first for loop-bait",
    audioSignature: "a single riser into an impact hit at the transformation peak, then a confident groove; fabric/energy SFX detailed explicitly",
    referenceStrategy: "image-1-to-image-2 morph contract: start state and end state each anchored to a reference, with an explicit clause that the subject never dissolves or decomposes mid-change",
    viralTriggers: ["identity/outfit metamorphosis", "anime-to-photoreal or era-swap crossings", "seamless loop that hides the seam"],
    avoid: "cutting away at the transformation moment, melting/decomposing geometry, mismatched identity after the change"
  },
  family_kids: {
    family: "family_kids",
    hookFormulas: [
      "cozy sunlit intro on a small telling detail (tiny jersey, drawing, packed lunch) before faces",
      "child's-eye POV looking up at the moment beginning",
      "the end-of-day hug first, then the day that earned it"
    ],
    beatTemplate: "5 wholesome beats: warm setup -> shared activity -> small stumble or doubt -> encouragement -> emotional payoff held long enough to feel",
    cameraPlaybook: "smooth slow dolly close-ups at child height, gentle push-ins on reactions, one wide to place the family in their world; no aggressive movement",
    audioSignature: "soft emotional score under natural family sounds (laughter, footsteps, park ambience); minimal dialogue, one heartfelt quoted line at the payoff",
    referenceStrategy: "family member identities locked per reference with natural skin and expressions; safety-first framing (no risky stunts, no minors in unsafe contexts)",
    viralTriggers: ["parent-child emotional payoff", "generational hand-me-down moment", "small kindness that lands big"],
    avoid: "saccharine over-acting, unsafe activities, adult-comedy energy, rushed emotional beats"
  },
  education_explainer: {
    family: "education_explainer",
    hookFormulas: [
      "call out the mistake or misconception in the first second",
      "show the surprising end result first, then promise the method",
      "one concrete number or claim the viewer can verify by watching"
    ],
    beatTemplate: "hook -> 3 concrete steps or proofs with visible state changes -> recap payoff with a save-this cue; every claim gets a visible demonstration beat",
    cameraPlaybook: "clean stable framing with deliberate cut-ins to the exact detail being explained; overhead for process, screen-style insert only when the subject is digital",
    audioSignature: "clear guided narration paced to the beats, minimal BGM under voice, one sting on the key insight; captions-friendly phrasing",
    referenceStrategy: "presenter identity locked if on camera; product/tool references drive the demonstration steps; faceless variant uses hands and B-roll mapped 1:1 to narration",
    viralTriggers: ["immediately actionable fix", "myth-bust with visible counterexample", "save-worthy checklist compression"],
    avoid: "lecture pacing without visual change, claims with no on-screen proof, jargon the niche audience wouldn't use"
  }
};

const GROUNDED_PLAYBOOK: NichePlaybook = {
  family: "grounded_general",
  hookFormulas: [
    "open mid-action on the most interesting visible moment, never on a slow establish",
    "a direct question or bold claim in the first line",
    "the payoff teased first, then earn it"
  ],
  beatTemplate: "hook -> development with visible state changes -> proof or emotional peak -> settled payoff on a readable final frame",
  cameraPlaybook: "vary shot size every beat (close/medium/wide), one deliberate camera move per beat, end on a stable frame",
  audioSignature: "motivated ambience plus concise voiceover; one audio accent at the peak; silence where it helps",
  referenceStrategy: "identity and product references anchor every shot they appear in; take only the subject from each reference, not its background or lighting",
  viralTriggers: ["a moment worth rewatching", "an emotion the viewer wants to share"],
  avoid: "static shots that overstay, monotone pacing, endings that just stop"
};

/**
 * Per-family musical tempo + sonic identity. Used two ways, both FREE (no separate music track):
 * (1) plan the CUTTING rhythm to a beat grid (see beat-grid-planner.ts), and (2) tell Seedance
 * the intended tempo/mood so its OWN native audio carries that energy under the voiceover.
 * We deliberately do NOT mix a separate BGM bed — native model audio + TTS voiceover is cleaner
 * and avoids muddying the voice. Comedy/UGC run dry (scoresToMusic=false): deadpan or in-camera
 * sound with no musical scoring at all.
 */
export interface NicheBeatProfile {
  /** Target musical tempo for this family (beats per minute) — drives cut rhythm + native-audio feel. */
  readonly bpm: number;
  /** Desired musical mood for the model's native audio; ignored when scoresToMusic is false. */
  readonly bgmGenre: string;
  /** Whether this family should feel musically scored at all (via native audio), vs run dry. */
  readonly scoresToMusic: boolean;
}

const BEAT_PROFILE_BY_FAMILY: Record<string, NicheBeatProfile> = {
  cinematic_film: { bpm: 70, bgmGenre: "restrained cinematic score (ambient strings, sub-bass swells)", scoresToMusic: true },
  anime_animation: { bpm: 150, bgmGenre: "high-energy electronic/orchestral hybrid with impact stingers", scoresToMusic: true },
  ugc_pov_authentic: { bpm: 100, bgmGenre: "none — in-camera sound or a single trending audio bed only", scoresToMusic: false },
  commercial_product: { bpm: 112, bgmGenre: "upbeat modern pop/electronic with a clear build to the hero shot", scoresToMusic: true },
  action_vfx_fantasy: { bpm: 140, bgmGenre: "epic percussive trailer bed with low-end weight", scoresToMusic: true },
  comedy_meme: { bpm: 100, bgmGenre: "none — deadpan silence with a single sting on the punchline", scoresToMusic: false },
  food_asmr: { bpm: 90, bgmGenre: "cozy lo-fi/acoustic kept low under crisp ASMR foley", scoresToMusic: true },
  music_dance: { bpm: 120, bgmGenre: "genre-driven track (trap 808s or city-pop) with a hard drop", scoresToMusic: true },
  sports_fitness: { bpm: 130, bgmGenre: "driving electronic/hip-hop rising into a crowd swell", scoresToMusic: true },
  travel_worldtour: { bpm: 122, bgmGenre: "uplifting house/tropical bed that opens on the drop", scoresToMusic: true },
  transformation_reveal: { bpm: 126, bgmGenre: "riser-into-drop electronic keyed to the change", scoresToMusic: true },
  family_kids: { bpm: 85, bgmGenre: "warm acoustic (ukulele/piano) under natural family sound", scoresToMusic: true },
  education_explainer: { bpm: 95, bgmGenre: "minimal corporate underscore beneath the voice", scoresToMusic: true },
  grounded_general: { bpm: 105, bgmGenre: "neutral modern underscore that supports the voice", scoresToMusic: true }
};

/** Platform niches and creative modes -> content family. */
const FAMILY_BY_KEY: Record<string, string> = {
  // creative modes
  cinematic: "cinematic_film",
  story: "cinematic_film",
  ugc_review: "ugc_pov_authentic",
  testimonial: "ugc_pov_authentic",
  product_ad: "commercial_product",
  demo: "commercial_product",
  comparison: "commercial_product",
  problem_solution: "education_explainer",
  education: "education_explainer",
  // platform niches
  cinematic_story: "cinematic_film",
  drama_series: "cinematic_film",
  brand_story_documentary: "cinematic_film",
  general_video: "grounded_general",
  beauty_skincare: "commercial_product",
  fashion_apparel: "commercial_product",
  ecommerce_product_video: "commercial_product",
  workspace_accessory: "commercial_product",
  creator_tools: "commercial_product",
  mobile_app: "commercial_product",
  livestream_commerce: "commercial_product",
  affiliate_review: "ugc_pov_authentic",
  family_lifestyle: "ugc_pov_authentic",
  food_beverage: "food_asmr",
  fitness_wellness: "sports_fitness",
  sports: "sports_fitness",
  travel_hospitality: "travel_worldtour",
  real_estate: "travel_worldtour",
  event_venue: "travel_worldtour",
  education_course: "education_explainer",
  finance_investing: "education_explainer",
  healthcare_services: "education_explainer",
  legal_education: "education_explainer",
  news_commentary: "education_explainer",
  podcast_clip: "education_explainer",
  home_repair: "education_explainer",
  auto_service: "education_explainer",
  local_service: "ugc_pov_authentic",
  gaming_entertainment: "action_vfx_fantasy",
  // expanded entertainment niches (from the mined corpus)
  anime: "anime_animation",
  animation: "anime_animation",
  meme: "comedy_meme",
  comedy: "comedy_meme",
  music_video: "music_dance",
  dance: "music_dance",
  transformation: "transformation_reveal",
  fantasy: "action_vfx_fantasy",
  action: "action_vfx_fantasy",
  pet: "comedy_meme",
  kids_family: "family_kids"
};

/** Keyword fallback for free-text niches the map does not know. */
const FAMILY_KEYWORDS: readonly { readonly family: string; readonly pattern: RegExp }[] = [
  { family: "anime_animation", pattern: /anime|manga|chibi|hoạt hình|hoat hinh/i },
  { family: "comedy_meme", pattern: /meme|hài|hai huoc|funny|comedy|prank/i },
  { family: "music_dance", pattern: /music|mv|rap|dance|nhảy|nhay|bài hát|bai hat/i },
  { family: "action_vfx_fantasy", pattern: /action|vfx|fantasy|kaiju|monster|siêu nhiên|sieu nhien|game/i },
  { family: "food_asmr", pattern: /food|asmr|món ăn|mon an|nấu|nau|đồ uống|do uong|cafe|coffee/i },
  { family: "travel_worldtour", pattern: /travel|du lịch|du lich|tour|khách sạn|khach san|resort/i },
  { family: "sports_fitness", pattern: /sport|thể thao|the thao|gym|fitness|bóng|bong/i },
  { family: "transformation_reveal", pattern: /transform|biến hình|bien hinh|makeover|glow.?up|before.?after/i },
  { family: "cinematic_film", pattern: /film|phim|cinematic|drama|романтик|romance|tình cảm|tinh cam/i },
  { family: "ugc_pov_authentic", pattern: /ugc|pov|vlog|selfie|review/i }
];

export function resolveNichePlaybook(input: {
  readonly niche?: string;
  readonly creativeMode?: string;
}): NichePlaybook {
  return resolveNichePlaybookMatch(input).playbook;
}

/**
 * Resolve a family playbook AND report whether a SPECIFIC family matched (vs falling to the generic
 * grounded playbook). Callers with a CreativeIntent use `matched=false` to compose a per-brief custom
 * playbook instead of shipping the generic one — the antidote to "generic when the niche is unknown".
 */
export function resolveNichePlaybookMatch(input: {
  readonly niche?: string;
  readonly creativeMode?: string;
}): { readonly playbook: NichePlaybook; readonly matched: boolean } {
  const keys = [input.niche, input.creativeMode]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
  for (const key of keys) {
    const family = FAMILY_BY_KEY[key];
    if (family && Object.hasOwn(PLAYBOOKS, family)) {
      return { playbook: PLAYBOOKS[family] as NichePlaybook, matched: true };
    }
  }
  for (const key of keys) {
    for (const { family, pattern } of FAMILY_KEYWORDS) {
      if (pattern.test(key) && Object.hasOwn(PLAYBOOKS, family)) {
        return { playbook: PLAYBOOKS[family] as NichePlaybook, matched: true };
      }
    }
  }
  return { playbook: GROUNDED_PLAYBOOK, matched: false };
}

/**
 * Compose a per-brief CUSTOM playbook from the analyst's CreativeIntent when no fixed family fits
 * (open-niche antidote, mined from openmontage's playbook-generator pattern). Deterministic and FREE
 * — it reuses the intent the analyst already produced, never a new LLM call. So a "real-estate
 * walkthrough" or "B2B SaaS explainer" gets a tailored formula instead of the generic grounded one.
 */
export function composeCustomPlaybook(intent: {
  readonly register: string;
  readonly genre: string;
  readonly niche: string;
  readonly tone: string;
  readonly emotionArc: string;
  readonly pacingProfile: string;
  readonly visualWorld: string;
  readonly storyEngine: { readonly conflict: string; readonly stakes: string; readonly payoff: string };
  readonly styleDna?: { readonly optics?: string; readonly motion?: string; readonly audioFeel?: string; readonly palette?: string };
}): NichePlaybook {
  const isKol = intent.register === "natural_phone_kol";
  const slug = intent.niche.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "custom";
  return {
    family: `custom:${slug}`,
    hookFormulas: [
      `open on the conflict — ${intent.storyEngine.conflict} — visible in the very first frame`,
      `lead with what's at stake: ${intent.storyEngine.stakes}`,
      isKol
        ? "a real person addresses the camera with a candid line that names the problem"
        : "a charged detail or motivated push-in that plants the tension before any context"
    ],
    beatTemplate: `${isKol ? "fast phone-native beats" : "measured cinematic beats"} tracing the emotion ${intent.emotionArc}: hook on the conflict -> proof/turn where ${intent.storyEngine.stakes} is felt -> payoff that lands ${intent.storyEngine.payoff} on a readable final frame (pacing: ${intent.pacingProfile})`,
    cameraPlaybook: intent.styleDna?.optics || intent.styleDna?.motion
      ? `${intent.styleDna?.optics ?? ""}${intent.styleDna?.optics && intent.styleDna?.motion ? "; " : ""}${intent.styleDna?.motion ?? ""}`.trim()
      : isKol
        ? "handheld phone framing, one imperfect reframe per beat, no gimbal glide"
        : "vary shot size each beat, one motivated camera move per beat, settle on a stable end frame",
    audioSignature: intent.styleDna?.audioFeel
      ? intent.styleDna.audioFeel
      : isKol
        ? "in-camera sound and close phone-mic voice; no scored bed"
        : "motivated ambience plus concise voiceover; one audio accent at the emotional peak",
    referenceStrategy: "identity and product references anchor every shot they appear in; take only the subject from each reference, never its background or lighting",
    viralTriggers: [
      `a ${intent.tone} moment worth rewatching in ${intent.visualWorld}`,
      `the visible turn where ${intent.storyEngine.payoff} pays off the ${intent.storyEngine.conflict}`
    ],
    avoid: isKol
      ? "any produced/graded/slow-mo look, posed presenting, or empty establishing shots — it must feel un-crafted"
      : "static shots that overstay, monotone pacing, generic stock-feeling framing, endings that just stop"
  };
}

/**
 * Resolve the family's musical beat profile (tempo + BGM identity). Reuses the same family
 * resolution as the playbook, so beat-synced cutting and background music stay aligned with
 * the creative family that was chosen for the script.
 */
export function resolveNicheBeatProfile(input: {
  readonly niche?: string;
  readonly creativeMode?: string;
}): NicheBeatProfile {
  const family = resolveNichePlaybook(input).family;
  const profile = BEAT_PROFILE_BY_FAMILY[family] ?? BEAT_PROFILE_BY_FAMILY["grounded_general"];
  return profile ?? { bpm: 105, bgmGenre: "neutral modern underscore that supports the voice", scoresToMusic: true };
}

/**
 * Compact, LLM-injectable directive: the family's winning formula as hard scripting rules, plus a
 * beat-sync line for families that score to music. Kept under ~1700 characters (asserted by the
 * niche-playbooks smoke) so it strengthens the instruction without drowning it.
 */
export function nichePlaybookDirective(input: {
  readonly niche?: string;
  readonly creativeMode?: string;
  readonly creativeIntent?: Parameters<typeof composeCustomPlaybook>[0];
  /** The RESOLVED style register — makes playbook selection register-aware (cross-audit A1). */
  readonly register?: "professional_cinematic" | "natural_phone_kol";
}): string {
  const match = resolveNichePlaybookMatch(input);
  // Unknown niche + an analyst intent → tailor a custom playbook instead of the generic grounded
  // one, so open/rare niches still get a specific formula (#3 smart-niche upgrade).
  const nicheFirstPlaybook = !match.matched && input.creativeIntent
    ? composeCustomPlaybook(input.creativeIntent)
    : match.playbook;
  const nicheFirstBeat = resolveNicheBeatProfile(input);
  // REGISTER-AWARE OVERRIDE (cross-audit A1): niche-first resolution hands a skincare/food/fashion
  // REVIEW (creativeMode → natural_phone_kol) a cinematic/scored niche family (commercial_product,
  // food_asmr, sports_fitness…) whose formula — orbits, macro rack focus, a BGM beat-sync bed — flatly
  // contradicts the phone-KOL register the SAME brief resolves ("NO cinematic bokeh, in-camera sound,
  // NO scored music"). When the register is phone-KOL but the resolved family wants a music bed, use
  // the authentic phone-KOL playbook instead (the niche's texture still comes from niche-DNA in the
  // compiler). Families that are already phone-compatible (ugc_pov_authentic, deadpan comedy — no
  // music bed) are kept. The cinematic register keeps the niche-first family unchanged.
  const registerContradictsMusic = input.register === "natural_phone_kol" && nicheFirstBeat.scoresToMusic;
  const playbook = registerContradictsMusic ? (PLAYBOOKS["ugc_pov_authentic"] as NichePlaybook) : nicheFirstPlaybook;
  const beat = registerContradictsMusic
    ? (BEAT_PROFILE_BY_FAMILY["ugc_pov_authentic"] as NicheBeatProfile)
    : nicheFirstBeat;
  const lines = [
    `NICHE PLAYBOOK (${playbook.family}) — script to this family's proven formula:`,
    `Hook (pick ONE and commit): ${playbook.hookFormulas.join(" | ")}.`,
    `Beat structure: ${playbook.beatTemplate}.`,
    `Camera language: ${playbook.cameraPlaybook}.`,
    `Audio design: ${playbook.audioSignature}.`,
    `References: ${playbook.referenceStrategy}.`,
    `Engineer at least one viral trigger: ${playbook.viralTriggers.join("; ")}.`,
    `Never: ${playbook.avoid}.`
  ];
  if (beat.scoresToMusic) {
    lines.push(`Beat sync: time the edit to a ~${beat.bpm} BPM pulse; the model's native audio carries the ${beat.bgmGenre} energy (no separate track). Land motion hits, accents, and hard cuts on the beat — a held continuous shot hits its accent on the beat rather than cutting to it.`);
  }
  return lines.join(" ");
}

export function listNichePlaybookFamilies(): readonly string[] {
  return Object.keys(PLAYBOOKS);
}

/**
 * Cross-family Seedance mastery rules mined from the whole corpus — the techniques that
 * separate top prompts regardless of niche. Appended once to the scripting directive.
 */
export const SEEDANCE_MASTERY_DIRECTIVE = [
  "SEEDANCE MASTERY:",
  "Declare the emotional pacing curve up front (e.g. calm -> chaos -> comedic -> warm) and cut to it.",
  "Write audio as its own layer per beat: quoted dialogue with delivery notes and accurate lip-sync, an explicit SFX list, ambience, and the music arc (including deliberate silences and abrupt stops).",
  "Anchor identity explicitly: name the locked features (face, hair, accessories and which side they sit on) and repeat that they must not drift, duplicate, or flicker across cuts.",
  "Give every reference one explicit job (identity / product / style / start frame) and state what NOT to take from it; when a storyboard is supplied, follow its panel order exactly but never render the sheet.",
  "Scaffold time in explicit second ranges; each beat states camera, action, and audio together.",
  // Anti-AI realism discipline (mined from ai-shortfilm-prompts, Seedance-tuned): the model's default is TOO clean, which reads as fake.
  "Realism through imperfection: give each recurring subject/prop >=2 lived-in imperfections (worn collar, stray hair, faint blemish, scuff) and restate them every time it appears — flawless surfaces read as AI.",
  "End on a designed but RESTRAINED final frame (loopable opening-match, payoff freeze, or settled hero shot); never just stop, and never pile effects or new motion onto the closer — over-produced endings are the clearest AI tell."
].join(" ");
