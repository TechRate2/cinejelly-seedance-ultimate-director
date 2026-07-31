# Nhật ký quyết định kỹ thuật

> Repo này bắt đầu bằng **một commit sạch** chứa trạng thái đã kiểm chứng của dự án.
> Lịch sử 175 commit trước đó nằm ở repo cũ và không mang sang, nhưng **phần giá trị nhất của nó —
> lý do đằng sau từng thay đổi — được giữ ở đây.**
>
> Đọc file này khi bạn muốn biết *"vì sao code lại làm thế"* trước khi sửa nó. Rất nhiều dòng trong
> dự án trông có vẻ vòng vo, nhưng chúng tồn tại vì một sự cố cụ thể đã xảy ra và làm mất tiền thật.
>
> Bản đồ dự án: [`../BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md) · Kiểm tra dự án: `npm test`

---

## Bài học chung, rút ra từ 17 thay đổi dưới đây

1. **Cửa chặn miễn phí đặt sai chỗ trở thành cửa chặn đắt tiền.** Ba lỗi tốn tiền nhất tìm được đều
   cùng một hình dạng: một cửa chặn *fail-closed* (chặn là huỷ job) nằm **sau** bước tiêu tiền nó
   đang bảo vệ. Nó vẫn "hoạt động", nhưng khách đã mất tiền trước khi nó lên tiếng.

2. **Một tín hiệu chất lượng chỉ có nghĩa TRƯỚC khi tiêu tiền thì đừng nối vào quyết định SAU khi
   đã tiêu.** Hai lần: ghi chú thẩm mỹ của AI thị giác giết job, và verdict "có thể tốt hơn" xoá sạch
   9 clip đã trả tiền.

3. **Bài kiểm tra đọc văn bản mã nguồn là "sơn xanh".** Nó xanh kể cả khi tính năng bị xoá sạch. Tệ
   nhất là trường hợp một file **đồng thời** khẳng định cửa chặn nằm trước *và* sau bước tiêu tiền —
   cả hai check đều xanh. Bài kiểm tra tốt **nạp code từ `dist/` và đếm số lần mua**.

4. **Sản phẩm cho người Việt thì phải test bằng dữ liệu tiếng Việt.** Toàn bộ test cũ dùng tên không
   dấu ("Linh", "Mai") — nên không ai thấy "Bác Hùng" và "Bác Hằng" ra cùng một khoá, hay "Đức" bị
   rút còn "c". Và "nude" là **tên một màu**, không phải nội dung người lớn.

5. **Cấu hình được nội suy, giao thức thì không.** Đổi tên sản phẩm thành biến đã vô tình đổi luôn
   tên header HTTP → khách không đăng nhập được, mà build vẫn sạch và toàn bộ test vẫn xanh, vì
   không có bài nào so **hai đầu dây**.

---

# Chi tiết từng thay đổi (2026-07-28 → 2026-07-30)

## fix(cost): stop doomed jobs BEFORE provider spend + make maxCostUsd truthful (cost-architecture audit)

Owner incident: an 18s talking video was attempted 4x for $7.10 and produced
no usable video. Root cause is architectural — every failure paid the FULL
pipeline again from zero, and the gate that killed it (delivery gate,
target_duration) only runs AFTER every image, voice, clip and the assembly.
Blast radius scales brutally: one failed attempt is ~$2.8 at 18s, ~$14-18 at
60s talking, and $54 (ultimate) / $217 at 240s — a failed 1-minute video
really can cost hundreds.

Two fixes, both zero-risk and pre-spend:

- PRE-SPEND DELIVERABLE-DURATION ASSERT (director-agent): an avatar-routed
  shot's clip lasts exactly its spoken line (~4 words/s VN TTS), so the
  delivered runtime is knowable right after routing is decided and BEFORE the
  keyframe/TTS/avatar stages. If the plan cannot reach the delivery gate's own
  90% threshold, throw CustomerActionableError with plain-Vietnamese guidance
  (customer sees what to change; refund path runs) instead of paying $2.77 to
  learn the same thing at the end. Deliberately placed in the DIRECTOR, not
  the architect: only the director knows which shots will actually be
  avatar-routed (plannedTalkingShots) — an architect-side assert wrongly
  blocked b-roll-with-voiceover plans whose clips run their planned length.
- TRUTHFUL COST ESTIMATE: the gate counted 4 images / 3 LLM calls while the
  incident really paid 8 images / 11 calls — the image-anchor verifier's
  regenerations and its own vision calls were in no cost model, so maxCostUsd
  was decorative. Now counts up to 2x images when the verifier is wired plus
  2 vision calls per planned image, so the cap can block sooner, never
  overspend.

Also: the per-beat duration floor for a spoken beat is now its REAL rounded
speech length (2..15s) instead of a flat 2s — the flat floor over-reserved
time per beat (9 beats x 2s on an 18s order) while each delivered ~1.75s, so
a plan written in short natural lines could never fill the runtime no matter
how many beats the top-up added. Rounded to whole seconds so the distribution
still sums exactly to the order (a 12s single clip was landing at 12.5s).

talking-duration-fill smoke 14->20 (pre-spend assert exists, runs before
keyframe+TTS, is customer-actionable, mirrors the delivery tolerance; cost
estimate counts verifier regens + vision calls). input-matrix 645/645.
Sweep 89/91.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## fix(P0): unify speech rate + delivery tolerance — talking videos were losing ~31% of every line

Full-project survey (15-agent workflow, adversarially verified) found a P0 I
introduced myself two commits ago.

THE BUG: three different speech rates existed. The story architect scheduled a
talking beat at 4 words/second (measured VN TTS) but the ScriptEnhancer re-cap
used capToSpeakableWords, which hard-coded the 2.8 NARRATION rate — so every
polished line was cut to 70% of what its beat was scheduled for. Measured: a
13-word line on its own 3s beat came back 8 words (67%); an 18s order would
deliver ~12s. Worse, the pre-spend duration assert added in c8a55fd measures
the POST-enhancer plan at 4 w/s, so it would have BLOCKED essentially every
talking video — the flagship UGC path — as "script too short".

FIX (single source of truth):
- duration-scripting.ts now owns both named rates and explains when each
  applies: VOICEOVER_WORDS_PER_SECOND = 2.8 (model-authored narration budget
  written into a prompt — conservative is harmless) and the new exported
  TALKING_WORDS_PER_SECOND = 4 (a character's scripted line spoken by TTS —
  the rate that decides REAL delivered runtime, because an avatar clip lasts
  exactly its audio).
- capToSpeakableWords takes the rate as a parameter (defaulting to the
  narration rate) so a caller must state which kind of speech it is caping.
- script-enhancer, story-architect (single-clip merge) and director-agent all
  import the shared constant; the two duplicate local declarations are gone.
- DURATION_SHORT_BLOCK_TOLERANCE is now EXPORTED from delivery-gate and
  imported by the pre-spend assert instead of being hand-copied with a
  "must match" comment. A comment is not a mechanism: loosening one copy and
  forgetting the other either blocks deliverable jobs (lost revenue) or lets
  doomed jobs burn a full render (lost money).

Test-first discipline: the regression test was written and confirmed RED
(kept 9/13 words, rate undefined, duplicate constants present) before any fix.
talking-duration-fill smoke 20->25; single-clip vo-budget expectation
corrected to the talking rate (a 15s clip really speaks ~60 VN words, not 42).
Sweep 89/91.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## feat(phase1): best-of-N actually picks quality, real camera coverage, series faces pinned, purchase terms

Phase 1 of the commercial-readiness roadmap — four independent wins, each
code-verified before the fix and locked by a test. No extra render cost.

1) BEST-OF-N NOW BUYS QUALITY. Quality modes render 2-4 takes of every shot
   and the customer is billed per take, but candidate selection ranked by
   inspection status/severity/output and then fell through to LATENCY — and no
   product route ever set semanticVisualInspectionOptions, so aesthetic
   curation was off for every multi-candidate render. The extra takes only
   bought "reject a broken render"; among good ones the FASTEST provider
   response won. Curation now turns on automatically whenever candidateCount
   > 1 (explicit request options still win, explicit opt-out still honored,
   single-take economy renders untouched — nothing to choose between). Its
   vision calls are added to the cost estimate so the cap stays truthful.

2) REAL CAMERA COVERAGE. Shot size and angle already varied, but camera
   POSITION came from the arc-role default, which is front_view for all five
   roles — a 40-shot probe returned 40/40 dead-on, with no over-the-shoulder
   for dialogue and no side/behind coverage. Positions now rotate
   (front / over-the-shoulder / side / back) on non-arc-critical beats while
   hooks and climaxes stay front-on. The default palette — used by the
   long-form/film path, which sets no creativeMode — was three mid sizes, so
   an 8-minute film never got a wide to establish a space or an extreme
   close-up; it now spans long_shot..extreme_close_up. Probe after: 4
   positions, all 5 sizes.

3) SERIES FACES PINNED. An invented character got a brand-new face every
   episode: the store had the identityReferenceUri slot AND already reused it
   downstream, but nothing ever wrote it (only customer uploads did) and the
   director never surfaced the portraits it generated. DirectorRunResult now
   returns the identity portraits actually bound to the run, and recordEpisode
   backfills them append-only — episode 1 locks the face, later episodes can
   never overwrite it, and mid-series characters are pinned on the episode
   they appear in.

4) PURCHASE TERMS. New public /terms (+ /dieu-khoan) page: what a credit
   buys, when a failed render is refunded (reads the LIVE refund policy so it
   cannot promise what the system does not do), the 480s single-video
   ceiling, retention window, prohibited content, upload-rights
   responsibility, liability cap, and the support channel. Linked from the
   create page where credits are committed. Operator input is HTML-escaped.

Tests: shot-framing +4 (multi-position, not-all-front, wide..extreme-close,
hook stays front), series-drama +5 (pin from ep1, never overwritten,
mid-series pin, director exposes anchors, episode director persists them),
upload/guidance +10 (terms content, live policy, escaping, public route,
create-page link). Sweep 89/91.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## fix(phase1-audit): impossible selfie angles, Vietnamese name collisions, and blind avatar spend

Three real defects found auditing the Phase 1 changes line by line.

1. Camera positions the mode's camera cannot physically take.
   The new POSITION_CYCLE was applied to every creative mode, so a phone-selfie
   video — where the camera IS the subject's outstretched arm — got back_view and
   over_the_shoulder shots. Positions are now scoped per mode, and separately any
   beat carrying a spokenLine (or its continuation chunks) stays front-on in every
   mode: those become lip-synced avatar shots, and a keyframe with no visible mouth
   gives the avatar model nothing to animate. Cinematic and long-form keep the full
   crewed rotation.

2. Series face pinning destroyed Vietnamese names.
   The cast/anchor key slugged straight to [a-z0-9], which deletes every accented
   vowel: "Bác Hùng" and "Bác Hằng" both became "b_c_h_ng" (one character wearing
   the other's face for the rest of the series) and every name starting with Đ lost
   its stem ("Đức" -> "c"). Matching is now exact-first on Unicode letters, with
   accent folding only as a fallback, and any folded key claimed by more than one
   portrait is treated as ambiguous and refused — an unpinned face costs one
   portrait, a wrongly pinned face ruins the series. The existing tests used only
   ASCII names, which is how this shipped; they now use Vietnamese ones.

3. Avatar renders were bought without measuring the voice they animate.
   A talking clip runs for exactly its audio's length, so an under-written script
   silently yields a short video — and the only thing that noticed was the delivery
   gate, which fires after every keyframe, voice track and avatar render is paid
   for. That is how an 18s acceptance render cost full price and delivered 7.274s.
   The talking-shot stage now ffprobes each voice track it just bought (cents) and
   stops a provably-short video before the avatar renders (dollars each), with
   plain-Vietnamese guidance for the customer. Fail-open throughout: a missing or
   failing prober can never manufacture a shortfall.

Sweep 90 pass / 2 known paid-evidence fails.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## fix(audit): punctuation-bypassed safety gate, dropped style keys, Vietnamese identity keys, CJK duration

Thirteen defects confirmed by an adversarial audit of the Phase 1 work, verified
individually against the built code before and after each fix.

Content safety: the proximity rules bridged their two signals with `[\s\w]{0,40}`,
so a single comma broke the match and walked a brief past the ABSOLUTE minor-safety
prohibition. Vietnamese prose is comma-heavy, which made the bypassing spelling the
common one. Punctuation is now flattened in the normalizer, fixing every rule at
once, and the new smoke locks BOTH directions — 14 prohibited spellings blocked, 14
ordinary Vietnamese briefs (children's skincare, birthday clips, preschools) still
admitted, because a gate that only ever blocks more costs customers.

Style keys never reached the renderer: the short-pipeline handoff caps metadata at
50 entries, and shortViralCreativeMode was not in the priority list, so it lost the
alphabetical spillover to shortDirectorCreativeMode every single time (4/4 realistic
briefs). The shot planner then read a DIFFERENT vocabulary that matched no palette
and fell through to the crewed default — a phone-selfie video was framed with long
shots and the prompt asked for a camera standing behind someone filming themselves.
Both vocabularies now map to palettes, and the tests drive the real
planner -> handoff -> shot-planner chain rather than the planner alone.

Vietnamese identity keys: "An Khang" collapsed to "khang" because the English
article strip ate the first syllable of ordinary Vietnamese names, merging two real
people onto one portrait; the article is now stripped only from a lowercase
description. Face pinning judged ambiguity portrait-vs-portrait, so a lone anchor
for "Dũng" was handed to "Dung"; ambiguity is now judged against the whole cast, a
member's own name outranks a characterId that collides with someone else's, and
mid-series ids fold diacritics instead of deleting them (which had merged "Bác Hùng"
with "Bác Hằng" and dropped the second character, and her paid portrait, entirely).
Two grep-only checks that stayed green with the feature deleted are replaced by
behavioural ones through the path the HTTP route actually calls.

Duration: both pre-spend checks compared a raw clip sum against the delivery gate's
floor while the assembled file is that sum minus one crossfade per boundary, leaving
a band (0.7s at 18s/3 shots, 27.65s at 480s/80) that passed the check, bought every
avatar render, and was then rejected at delivery. Voice-track probes are bounded at
15s and run in parallel — they were serial network reads inheriting a 30-minute
default, where one stalled CDN pinned the single worker and every queued customer.

Also: Vietnamese typed in decomposed form (Unikey "tổ hợp", macOS/iOS) read as
non-Vietnamese and produced a video written and voiced in English — requests are
normalized to NFC at the boundary. Chinese and Japanese have no spaces, so a whole
line counted as one word and every CJK talking order was hard-refused despite being
a sellable option; speech length is now counted per CJK character. Auto-enabled
visual curation is advisory, so a cosmetic S2 note ranks candidates instead of
buying a re-render and then failing a fully paid job. The cost estimate now counts
repair takes' vision calls.

Sweep 91 pass / 2 known paid-evidence fails.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## chore: one command to check the project, and fix what that command uncovered

The owner of this project does not read code and depends on AI assistants to
change it, but had no way to ask "is it still working?". There were 156 npm
scripts and no `npm test`; the one curated suite names its checks by hand and
covers 19 of the 93 offline checks, so anything added since is simply absent and
nothing says so.

`npm test` now discovers every scripts/run-*-smoke.mjs on disk, so a new check is
included the moment it is written, and runs the five whole-repository audits that
no command was running at all. It reports in plain Vietnamese and separates the
two kinds of red: a handful of checks are deliberately failing while they wait on
evidence from a paid render, and mixing those into the same count trains the owner
to ignore red. Those are listed apart with their reason and do not fail the run;
a check that turns green is flagged so its exemption gets removed rather than
quietly becoming permanent.

Three of the five audits had been failing unwatched. Their findings, now fixed:

- A subtitle download wrote its own response headers instead of going through the
  sender helpers, so it shipped without the base security headers — no nosniff,
  no frame-deny — which matters more on a text/plain attachment than on an mp4.
- The customer-facing create page named a competitor in two comments that are
  served to the browser inside the page's own stylesheet and script.
- The disk guard read CINEJELLY_OUTPUT_DIR itself, hiding a deployment-wide
  setting in a low-level helper; it takes the directory as an argument now.
- src/index.ts was missing 21 modules from the public surface.
- A structural rule demanded the literal English "Build Review Plan" and went red
  the day the shell was translated, reporting a problem that did not exist.

Snapshot governance was also incomplete: three third-party snapshots sat on disk
outside it, two of them with no license file at all — which reserves every right
to their authors. All three are now declared as a new reference-only class:
inventoried and policed like any other, but carrying no source-lineage record,
because a lineage record asserts product logic was translated from a snapshot and
for these the whole point is that none was. The audit now also fails on any
snapshot directory that appears without being declared, which is how these went
unnoticed. docs/SUBTREE_POLICY.md records the distinction and flags AGPL-3.0
(openmontage) as the license that would oblige the whole product open if its code
were ever imported.

Also removed two abandoned scratch probes from the repository root.

Sweep 91/93 (2 awaiting paid-render evidence); repo audits 5/5 with one known
report-contract drift registered as debt.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## fix: customers could not watch their video; a colour name was read as child sexual content

Two product-breaking defects found by a whole-repository survey, plus the project
map the owner actually needs.

The Studio's watch button never worked. The page Content-Security-Policy is
deny-by-default and declared no media-src, so the <video> element — handed a blob:
URL after the finished MP4 is fetched — was blocked by the browser with no visible
error. A customer paid, the render succeeded, and the player simply never started.
Nothing tested the CSP, which is how it shipped; the security smoke now asserts
both halves, that the policy stays deny-by-default AND that it permits the media
the product itself serves.

"Nude" is a colour name in Vietnamese beauty and fashion copy — "màu nude", "tông
nude", "son nude" all mean beige. Sitting in the sexual signal list it produced the
worst false positive available: an ordinary brief for children's clothing in a
beige colourway was refused and labelled minor_sexual, i.e. the platform accused a
paying customer of requesting child sexual content over a colour swatch. The colour
sense is now neutralised before matching, and only where it unambiguously names a
colour, so "video khỏa thân" and bare "nude" still match.

Also: a stop message told the customer the render "did not charge" while credits
are taken up front and the default refund policy queues the case for a human
rather than returning them. A false statement about money is worse than the
failure it accompanies; it now describes what actually happens and points at the
refund policy.

Removed three files confirmed dead by an adversarial pass that refuted 25 of 28
dead-code claims — the codebase is far less abandoned than a first look suggests.

BAN-DO-DU-AN.md is new and is the answer to "the project is too confusing". The
code has moved 124 commits across 88 source files since 2026-07-05 and exactly one
document was updated in that time, so the docs described a product that no longer
exists. The map covers what the product is, which file to change for which
outcome, the full render sequence marked with which steps cost money and where
each gate sits relative to them, the license status of every reference snapshot,
and what is still unfinished. README is now a short pointer to it instead of a
401-line changelog.

The survey's most useful finding for the roadmap: every capability the product
promises — series with persistent faces, long form, dubbing and subtitles,
image-to-script — already exists and works behind /v1 endpoints. What is missing
is a menu; customers can only reach one of them.

Sweep 91/93, repo audits 4/5 with one registered debt.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## chore: retire what was retired, register what was added, and mark the frozen docs as frozen

An audit command had been failing for a long time with nobody watching, and the
reason turned out to be bookkeeping rather than code.

`validation:backend-system-readiness` was guaranteed to fail. Its hand-maintained
catalog still listed `validation:product-url-extraction` for a feature retired by
owner decision on 2026-07-23 — live product-URL scraping is fragile and routinely
anti-botted, and the route now answers 410 — while 17 validation commands added
since were never registered at all. The catalog is synced with package.json, the
retired entry and its report contract and schema are gone, and the audit now runs
inside `npm test` so it cannot drift unwatched again.

Four report contracts were failing because they described behaviour that had
deliberately changed, which made them read as regressions:

- A visual-bible session render was pinned to 422. It answers 202 since 293f232,
  which fixed the #1 self-serve blocker: choosing Long/UGC/60s+ used to dead-end on
  an "assets not approved" wall, and the director now generates the portraits
  itself. The schema said the block was still there.
- The prompt-contract diagnostics still required hasPacingContract,
  hasMotionContinuity and hasInterShotBridge. Those three sections were merged into
  two — they carried ~230 words of overlapping boilerplate and printed the
  transition intent twice — so the prompt got tighter, not weaker.
- endpointsCovered required 4 short-pipeline endpoints; the fourth was the retired
  product-URL route.

Each schema now records WHY the value is what it is, so the next reader does not
have to re-derive it from git history.

Documentation: every long-form spec except one deploy guide was frozen on
2026-07-04/05 while the code moved 124 commits across 88 source files — and
AGENTS.md ordered every AI to read the frozen context file FIRST. That is the
mechanism by which each new assistant started from a description of a product that
no longer exists. AGENTS.md now points at BAN-DO-DU-AN.md and `npm test` first, and
twelve design docs carry a dated banner saying they are historical intent and that
the code wins when they disagree.

The acceptance guide presented two commands as the paid render while neither could
ever spend: both config files lack the storyboard approval the gate requires, so
they stop before the first dollar. It now says so and shows what to add.

`npm test` retries a failed check once on its own before calling it a regression.
Several checks boot a real HTTP server; run eight at a time they collide over ports
and fail for reasons unrelated to the code. The owner cannot read the code to tell
a flake from a break, so a runner that cries wolf is a runner they stop believing.

Removed a 1,539-line audit of a branch that no longer exists, a snapshot map that
counted 11 of 12 repositories, and two unreferenced acceptance fixtures.

Sweep 91/93; repo audits 4/6 with both reds waiting on paid-render evidence.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## docs: a README in every area, so the map is where the code is

BAN-DO-DU-AN.md answers "what is this project"; these answer "what am I looking
at" for someone who has already opened a folder. Five files, each written for the
two readers this repository actually has: an owner who does not read code, and an
AI asked to change it.

src/README.md carries the table that matters most — which directory may call the
network, which may read the environment, and which may do neither — and says why,
because a rule without a reason gets broken by the next assistant. Both columns are
machine-enforced, so the table is a description of what the tests already check
rather than an aspiration.

src/agents/README.md explains how to read a 3,000-line orchestrator: one method
matters, and three kinds of line inside it. It also documents the fail-open versus
fail-closed split, which is the distinction most likely to be broken by accident —
polish and analysis stages must never kill a paid job, while money and delivery
stages must stop rather than guess. Turning a cosmetic stage fail-closed already
cost a fully-paid render once.

src/core/README.md records the two traps that have each produced real defects: the
crossfade subtraction, whose blind spot reaches 27 seconds on an eight-minute
order, and the Vietnamese-text rules — fold diacritics rather than deleting them,
normalize to NFC at the boundary, count speech units rather than whitespace, and
remember that "nude" is a colour and "An"/"A"/"Thế" are name syllables.

src/api/README.md documents the customer menu as it actually is, because the survey
that prompted this work reported those features as unreachable and that was wrong:
all four entries are wired and functional, and long-form is the duration field of
the first one rather than a separate mode. It also states the response-sender and
CSP rules next to the incidents that motivated them.

scripts/README.md explains the difference between a check that runs code and one
that greps source text for a string, and how to write a new one so the runner picks
it up automatically.

Sweep 91/93; repo audits 4/6 with both reds waiting on paid-render evidence.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## policy: delegate content moderation to the model provider (owner decision 2026-07-29)


## refactor: product name becomes a setting; behaviour checks get their own directory

De-branding is now a configuration change. src/config/product-identity.ts is the
single source of the public name, read from PRODUCT_NAME with a neutral default,
and the Studio header, page titles and terms page take it from there. Setting one
environment variable rebrands the whole customer surface without touching code.

Deliberately scoped to what a customer can see. Three things keep the old name and
the file records why: environment variables (renaming breaks every deployed .env
the moment the build ships), report schema versions (renaming invalidates every
archived report and the contracts that validate them), and browser storage keys
(renaming signs out every logged-in customer). Each is wiring rather than branding,
and a future owner who wants them renamed should do it as its own migration with a
compatibility period.

scripts/ held 153 files mixing two unrelated things: checks that prove the code
works, and tools an operator runs by hand. Nobody looking at it could tell which
was which. The 93 behaviour checks move to tests/ and scripts/ keeps the operator
tooling plus the six whole-repository audits. Both directories document what they
are and how to add to them.

Sweep 91/93; repo audits 4/6 with both reds waiting on paid-render evidence.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## fix: a fail-closed gate was charging the customer before it refused, and the test said otherwise

The long-form release battery (timeline -> creative -> readiness) kills the job when
it blocks, so it has to run while dying is still free. It ran after the keyframe
images and the voice tracks were already bought. Every block was billed for a full
set of both first.

It got there by accident. A redundancy pass removed what it called a duplicate
second build, but removed the EARLY one and kept the late one, then left a comment
above the survivor claiming the gates 'already ran fail-closed above, before any
keyframe-image or TTS provider spend'. There was exactly one call site and it sat
after both. Running it early is sound for the reason that same comment gives:
keyframe binding attaches a still reference and never changes shot count, duration
or ordering, so the schedule it gates is identical either way. The post-keyframe
pass stays - it costs ~80ms and no money - so delivered evidence still describes
the schedule actually rendered.

The ordering checks were green paint of the worst kind. They compared where strings
appear in the source: one read the gate DEFINITION (above the keyframe call) and
concluded 'before spend', another read its single CALL (below) and concluded 'after
keyframe'. Both passed. One file asserted the same gate ran on both sides of the
spend and nobody noticed. They are replaced by a run of the real DirectorAgent with
counting stubs, asserting the only thing money depends on: zero images, zero voice
tracks and zero clips bought before the gate decides.

Also switched on the character turnaround. planCastPortraitRequests has supported
front/three-quarter/side since it was written and was never passed the parameter,
so every character had one reference image, taken head-on; the moment a shot turned
them the video model had no evidence for the side of their face and invented it -
the drift customers read as 'the actor changed'. The budget estimate now multiplies
the character term by the view count so maxCostUsd stays a real ceiling.

Sweep 91/93.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## fix: the pre-spend ceiling counted the scriptwriter as one call when it can make two

The architect makes a second bounded call to continue the script when the scheduled
speech falls short of the ordered runtime - the common case on talking or >=120s
orders, not an exotic one. The estimate counted it once, and the same expression
feeds both the early planning cap and the full budget gate, so the undercount
applied twice to the only ceiling that runs before any provider is touched.

Sweep 91/93.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## feat: store what a failed render already paid for, so a retry does not buy it twice

DirectorAgent.run() throws when any shot fails inspection after its candidates and
repairs are exhausted. Renders run two at a time, so by the time shot 7 of 10 fails
six to eight clips are already rendered and billed - and they vanished with the
exception. The customer's credits went to a manual refund queue and their next
attempt paid for all ten again. On a 60-second cinematic order (~$54.58) a late
failure destroyed roughly $49 of finished work.

The store keeps only the provider's predictionId per shot. Re-fetching a completed
prediction is a status GET (video.get_prediction), not a generation call, so
recovering a clip costs nothing - and it keeps output URLs out of durable state,
which production-graph-resume-state.ts already treats as a contract
(outputUrlsStored: false).

Scope is deliberately narrow: it salvages a retry of THE SAME job and is not a
content-addressed cache. Nothing is matched by prompt. That removes both failure
modes a cache would add - a customer who edits their brief being served the previous
video, and one account's footage appearing in another's render. Change anything and
you get a new job and pay for it, which is what customers expect.

Keyed on requestId, not projectId: the Studio sends a hard-coded hidden projectId of
short_create_shell for every customer and every render, so keying on it would hand
each customer everyone else's clips. clientId is recorded and must match on read, so
a guessed requestId still cannot cross accounts. Records expire after seven days
(owner decision) - long past any real retry window, and storage is not free.

recordShot never throws: it runs on the success path of an already-billed render, and
losing a record costs one re-rendered shot while an exception would cost the job.
Writes are serialized per request because shots finish concurrently into one file,
and atomic because a half-written record is one a retry would trust.

25 checks, with isolation and concurrency as the load-bearing ones. Not yet wired
into the director - that lands next, with its own end-to-end proof.

Sweep 92/94.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## fix: a provider failure now re-renders the shot in every quality mode

Economy buys zero repair attempts, which is a fair quality choice: the customer
accepted the first take. But that budget was also the only thing standing between a
FAILED Atlas prediction and a dead job. Nothing is wrong with the request when the
provider returns a failure or a success with no output URL - the render simply did
not happen - and one dead shot kills the whole job at the inspection gate, taking
every other clip already paid for with it.

Provider failures now get their own small budget, granted in every quality mode, and
re-submit the same prompt because there is nothing to correct. Bounded at two extra
attempts so a real Atlas outage surfaces fast instead of retrying through the
customer's balance, and included in the cost ceiling so maxCostUsd still holds.

Output retention drops from 14 days to 7 (owner decision): a week is long enough for
a customer to download their video, and storage is not free.

Reverted the clip-salvage store added earlier this session. It solved the wrong
problem - keeping clips for a LATER retry - and an adversarial design review then
showed it could not have worked: story prompts are regenerated by the LLM with no
temperature pinned, so no fingerprint would ever match twice; the failing run never
persists the plan it used; and reuse keyed on provider status would hand back the
clip that failed inspection, which fails again on every re-run and leaves the job
permanently unfinishable. Better no feature than a dead one.

Also replaced a stale source-text assertion that pinned the keyframe cost formula as
a literal string and went red when the formula became more accurate.

Sweep 91/93.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## fix: 'could be better' must not destroy a fully paid render

Every clip reaching the inspection gate has been rendered and billed and its repair
budget is spent. At that point the question is no longer whether the shot could be
improved - it is whether the video is deliverable. The inspector answers those with
different severities, and the gate ignored the difference: it refused on repair,
rerender AND block alike, so one mild 'could be better' verdict on shot 7 of 10
destroyed the other nine finished clips and the customer received nothing after
paying for everything.

Only unusable clips refuse now - rerender/block, the same predicate the test-take
gate already used. A surviving 'repair' verdict is recorded as a warning, carried
into the delivered evidence, and the video ships. The repair loop is unchanged and
still spends its budget trying to improve those shots; only the delivery decision
moved. The delivery gate downstream keeps the final say on the assembled file, so
shipping an imperfect shot still cannot ship a broken one.

This is the same class of defect as the auto-curation fix earlier this session,
where a cosmetic S2 note from the vision model could fail a paid job. Worth stating
plainly: a quality signal that can only be acted on BEFORE the money is spent must
never be wired to a decision made AFTER it.

19 checks lock both severities apart, that the provider-retry loop re-submits the
unchanged prompt, and that the cost ceiling counts those retries.

Sweep 92/94.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## fix: making the brand configurable broke login - no header name may be a variable

Rewriting every 'CineJelly' in the Studio page to an interpolated brand variable hit
four occurrences that were not display text at all but HTTP HEADER NAMES.
X-CineJelly-Session became X-AI Video Studio-Session: a name the server never reads
and not even a legal header name. Login broke completely for every customer.

Nothing caught it. The build was clean and the whole suite was green, because every
existing check exercised either the server or the planner and none compared the two
sides of the wire. That is the gap, not the typo.

The four names are restored, and a new check enforces the distinction that matters:
display text may be interpolated from config, wire tokens may not. It refuses any
header name containing a template expression or a space, and it walks both
directions - every header the page sends must be one the server reads, and every
header the page reads back must be one the server sends. That second direction is
the one that broke. Browser storage keys are covered by the same rule, since
renaming one signs every customer out.

Sweep 93/95.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## docs: state plainly whose code external/upstream is, before publishing it

The repository is going public with the reference snapshots included, so the
attribution has to be unmissable rather than buried in an inventory table. The notice
records that every directory belongs to its original authors, is unmodified, keeps its
LICENSE in place, and is never imported by production code - a boundary npm test
already enforces.

It also separates the two license situations honestly. openmontage is AGPL-3.0:
redistributing an unmodified snapshot with its license intact is permitted; copying
its code into the product is what would oblige the whole product open, and that is
why it stays behaviour notes only. Four snapshots carry no license at all, which
reserves every right to their authors - they are read-only, nothing may be translated
from them, and any author asking for removal gets it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

