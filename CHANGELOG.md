# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [0.15.0] — 2026-11-20

### Changed
- `react("nod")`: the face goes down and up (`faceY` on the result, a new
  field), the second dip smaller, eyes half-closing at the bottom, the hat
  tipping with it; the body barely squashes (a squash read as a hop).

### Added
- `Reacting.faceY`: the face tipping up or down on the body.

## [0.14.0] — 2026-11-20

A second round of five reviews (fluidity 7/10, faces 6.5, acting 6, a fresh
viewer 6, and a sound-design pass) found the follow-through now too loose,
blinks too long, and voices too thin.

### Changed
- `follow()` damping 0.45 → 0.6 (about 10% overshoot, settled in ~8 frames);
  `react("surprise")` keeps the hat on the head (tilt ±12°, lift ≤ 4).
- The smear in-between of a hard take is half-way in height too (it was
  already at full stretch, so the pop still read as one frame).
- `BLINK` is 5 frames (half, shut 2, half, nearly open) and `LONG_BLINK` 7;
  double blinks 10% of the time (was 20%).
- `jump()`: the hat is pressed down on the way up and floats on the way down
  (drag, not lead); landings are softer (strength ≤ 1).
- `babble({ syllables })`: a third formant, vibrato on syllables longer than
  0.15 s, and a short consonant click (noise, tuned by the onset: s/z bright,
  t/d mid, others lower) at every syllable with an onset.

## [0.13.0] — 2026-11-20

Voices with intention. Gibberish voices are understood by the melody of their
words, not the words (the people who voice the best-known cartoon gibberish
say as much), and measured reference speech in that style runs at about 4–6
syllables a second, pitched up whole. romp's `babble` picked its pitches at
random, so its melody said nothing.

### Added
- **`prosody(syllables, { swing, seed })`**: a line's melody as pitch per
  syllable (`st0`, `st1` semitones, `gain`): each phrase drifts down, stressed
  syllables get an accent, and the ending says what it is: a statement falls
  4 semitones, a mid-sentence pause lifts 2, a question rises 5, an
  exclamation is 3 higher and louder throughout.
- Syllables carry **`end`** (`.`, `,`, `?`, `!`) from their punctuation
  (Chinese punctuation too); a line without any ends as a statement.
- **`babble({ shift })`**: pitch a voice up or down in semitones, formants
  with it (a sped-up recording, not a pitch-shifted one).

### Changed
- `babble({ syllables })` sings the line's `prosody` instead of random steps.

## [0.12.0] — 2026-11-20

Flow. Five reviews of a film's character animation, every frame against
reference footage, agreed on what still read as mechanical: a take that
jumped from squash to full stretch in one frame (the "smear" was a bigger
copy of the pose, not an in-between), a hat locked to the body, an
anticipation that only squinted, mouths flickering a new shape every frame,
blinks firing during pursuit, and a double take too quick to see.

### Changed
- **Takes pop through 3 frames**: a half-way in-between stretched along the
  move (the smear, `smear: 1` from `takeCurve`), then past the accent, then
  the accent (hard: `pop` 2, `hold` 3).
- **`react("surprise")`**: the anticipation sinks and squashes the body (0.85)
  and tips the hat down; the accent widens the eyes (`eyeScale` 1.25 → 1.1);
  the hat follows the body on a spring, a frame behind, and carries past it;
  loose parts start moving as the anticipation ends.
- **`react("doubleTake")`**: the first look, a look away with a blink, then
  the take, each look a 3-frame saccade; `lead` sets how long (24 frames reads
  on screen). `reactionFrames(kind, o)`.
- **`talk()`**: mouths held on twos (`onTwos`), the jaw stays open between the
  syllables of a word, m/b/p/f/v closures last 3 frames.
- **`talkPose()`**: a slow lean across the phrase, a dip and nod on stresses,
  led by a small lift.
- **`gaze()`**: no blink when a look ends a pursuit or within 12 frames of
  another; the short blink for medium looks, the long one only for big ones.
- **`jump()`**: the hat drags 2 frames behind.

### Added
- `follow(curve, frame)`: a loose part as a damped spring dragging after any
  curve. `blendPose(a, b, w)` and `handoff(frame, at, frames)` for hand-offs
  between behaviours.

## [0.11.0] — 2026-11-20

Tuned against reference. Studying slapstick reference frame by frame (how long
poses hold, how fast moves between them are, how eyes follow a moving thing,
how a limbless body walks) and reading the classic texts (Williams on holds,
lip-sync and accents; Lasseter's SIGGRAPH 1987 principles; Disney Research on
blinks) found romp's characters moving too much between poses, mouths in step
with the sound instead of ahead of it, blinks shaped symmetrically and too
often, and a hop that eased into its landing.

### Added
- **Lip-sync lead**: `talk(t, syl, { lead })` shows the mouth 2 frames before
  the sound by default; `talkPose`'s nod leads by 4. Syllables carry their
  `onset`, and m, b and p keep the lips shut for 2 frames before the vowel.
  Vowels pop open with no in-between.
- **Pursuit**: a gaze key with `pursue: true` glides the eyes to the next key
  (following something moving) instead of holding and jumping.
- **`waddle(frame, { period, angle, bob })`**: a limbless walk or happy dance,
  rocking about the feet, lingering at each side, bobbing up through upright.
- `jump({ weight })`: 0 light … 1 heavy; heavier squashes and stretches less
  and crouches longer.
- Hard takes draw one **smear** frame (stretched past the accent) on the way in
  (`takeCurve({ smear })`, on by default).
- `BLINK` and `LONG_BLINK`: blink shapes, closing fast and opening slowly.

### Changed
- `blinks()`: 2 frames closing, 1 shut, 4 opening (was 2 shut, 2 half), about
  14 a minute (was 15–27; `perMinute`), doubles less often.
- `gaze()`: a big look brings a long blink (3 closing, 2 shut, 5 opening) from
  its first frame; mid-sized looks blink sometimes, more often the bigger they are.
- `hop()`: falls fastest into the ground and squashes on the contact frame,
  cushions out, then crouches for the next take-off (it eased into the contact).
- `alive()`: less sway (holds read), and `talkPose()` moves the body less.
- `talkPose`, `jump`, `react` and `waddle` breathe and blink with `alive()` (they used `idle()`'s metronome blinks).

## [0.10.0] — 2026-11-20

Reactions built the way character animators build them. Reading how a take is
timed (School of Motion's take breakdown, The Animator's Survival Kit on hard
and soft accents) and how Illumination's animators describe the Minions
(emotion from clear poses and attitude, like a silent film, with some
stiffness kept) showed what 0.9's reactions lacked: no accent held on its
extreme, no bounce back into a held settle, and no double takes, acting blinks
or moving holds.

### Added
- **`takeCurve(dt, options)`**: Start → Anticipation → Accent → Settle as one
  value (−anticipation … 1 … settle … 0) to map onto any pose. Hard accents pop
  in a frame, hold 2 and bounce back; soft accents ease in. Defaults are the
  classic 24 fps counts scaled to 30 (anticipation 6, hold 2, settle 9).
  `takeLength()`.
- `react()`: **`doubleTake`** (a glance away and back, 3 frames apart, then the
  take), **`realize`** (the acting blink: a dip with the eyes shut, then eyes
  open and the head up) and **`tremble`** (a moving hold: two poses alternating
  every 2 frames). Every reaction returns `contact` on its accent frame.
- `gaze()` returns `dip`: a body's small dip just before a big look.

### Changed
- `react("surprise")` is now a hard take: squash and squint, pop tall with eyes
  wide and the hat up, held 2 frames, bounced back into a softer held
  surprise, then relaxed (36 frames, was 34). `nod` lifts a little first.
- `gaze()`'s head overshoots its turn slightly (about 5%) and settles, instead of
  creeping in.

## [0.9.0] — 2026-11-20

Characters that act. A review of a film's cast found them moving like
animations, not characters: mouths flapping on a fixed beat whatever the words,
eyes that slid or never moved, jumps with no crouch, every blink on the same
metronome, and squash that changed the body's size. The rules animators use
for each are now pure functions of the frame in romp/core.

### Added
- **Speech**: `syllables(text, { rate, seed, fit, pause, gap })` turns words
  into timed syllables (English by vowel group, with a silent final e; Chinese,
  Japanese and Korean by character), with pauses after punctuation and
  stressed syllables a little longer. `talk(t, syllables)` gives the mouth at
  any moment (opening on each vowel's attack, round for o/u, wide for i,
  closed in pauses), `talkPose()` a body that nods on stresses.
- **`babble(t, dur, out, { syllables })`** in romp/audio voices the given
  syllables (their times, vowel formants and stresses), so the voice says what
  the mouth shows. Without `syllables` it behaves as before.
- **`gaze(frame, { keys })`**: saccades (a look in 3 frames, then a hold),
  small drifts while holding, a blink with a big change of look, and `head`
  following the eyes on a critically damped spring two frames behind.
- **`jump(frame, at, { height, air, crouch })`**: anticipation crouch, a
  take-off stretched by its speed, a parabola that hangs round at the top, and
  `landing()` sized by the height; contacts marked for the motion check.
- **`react(frame, at, kind)`**: `surprise` (a flinch, then a pop with a round
  mouth and the hat flying), `giggle`, `nod`, `shake` (eyes and head);
  `REACTION_FRAMES`.
- **`alive(frame, seed)`**: idle with uneven breathing (in slower than out), a
  weight shift now and then, and `blinks()`: one every 2.2–4 s at a seeded
  moment, sometimes doubled. `keepVolume(squashY, k)`, `hash01()`.
- Docs: "Acting" in the guides; the API reference.

### Changed
- `hop()`: the contact squash eases in and out over several frames instead of
  switching on for two, the air stretch follows the speed, and the width keeps
  the volume.

## [0.8.0] — 2026-11-20

A timing analysis of a real 4K film made in code found most of the wall clock
wasn't the check: it was full renders made only to look at the film (review
sheets of one frame a second, each a full 4K render), full re-renders for
one-scene fixes, and the soundtrack rendered again every round. This release
adds the pipeline around a film: framework-free in `romp/pipeline`, with a
thin Remotion binding in `romp/remotion/render` and CLI commands.

### Added
- **`romp sheet`**: review contact sheets straight from the composition. One
  `renderFrames` call renders every Nth frame (default one a second) at half
  scale as JPEGs, laid out 4×3 per page with a timestamp, frame and scene name
  per tile (in headless Chromium: no ffmpeg font filter needed). `--scene`,
  `--from/--to`, `--every`, `--scale`, `--cols/--rows`, `--tile`, `--out`;
  `--still <frame>` for one full-size frame. On a 6,000-frame, 20-scene 4K portrait film: 6.7 s for 200 tiles (2.4 s for one scene), against 175 s for a full render and frame grab.
- **`romp render`**: per-scene rendering with a cache. Segments are cut at
  scene boundaries and never inside a transition (an overlap of two scenes,
  or a declared span); each segment is keyed by the scenes it shows (their
  props, own files by content, media by size and time), the rest of the
  sources, and the render settings. Only changed segments render (muted,
  `frameRange`, one browser), then they're joined with `ffmpeg -c copy` and
  the soundtrack is muxed once. Writes a manifest of what was rebuilt.
  A one-scene fix on that film: 28 s (3 of 39 segments) against 167 s for a
  full re-render; the soundtrack's AAC is encoded once and copied in.
- **Soundtrack cache**: `romp sound --cache dir` keys by the bundled module
  (schedule, voices, timeline), its argument and the loudness.
  `soundKey(schedule, opts, ...deps)` in romp/audio. 43 s → 0.2 s when unchanged.
- **`romp lint plan.ts`**, `lintPlan()`: the plan lint. A plan is data (per
  scene and beat: boxes, font sizes, native screen sizes, the camera); it runs
  the frame check's layout rules with the same names and thresholds (offsafe,
  covers, overlap, legibility after zoom, cropped, clipped, anchor,
  occupancy) and four of its own: `fill`, `focus`, `banned`, `band`. No
  browser; milliseconds.
- **`romp bench`**: the fastest Remotion concurrency on this machine.
- **`romp encode`**, `encodeArgs()`: one decode, several sizes, one ffmpeg
  process (a 4K master and a 1080p share copy).
- **Capture helpers**: `romp lock <name> -- <command>` / `acquireLock()` (one
  process per device; a second is refused, a dead holder's lock taken over),
  and `romp marks` / `marksFromVideo()` (cut points in a long recording by
  frame difference).
- `romp/remotion`: `renderPlan(timeline)` gives the scenes and transitions
  for the config. `romp/pipeline`: `planSegments`, `keyOf`, `stableKey`,
  `cachedFile`, `hashFiles`, `stampFiles`, `montage`, `concat`, `probe`.
- `examples/pipeline`: a 20-scene, 6,000-frame 4K portrait film wired for all
  of it (`romp.render.ts`, `plan.ts`, `sound.ts`).
- Docs: render settings (concurrency from `romp bench`, `gl: "angle"` for
  WebGL on macOS, one h264 CRF so joins stay copy-only) and how a project
  wires its capture tools around the lock and marks.

## [0.7.0] — 2026-11-20

A timing analysis of a real film found `romp check` slow (a 5,700-frame film
took over three minutes) and missing faults that came back in review after
review: empty frames between scenes, screenshots cut off by the phone they sit
in, labels set too small, a heading laid on a screenshot, and words on screen
nobody had tracked.

### Faster
- Each frame is seeked with React flushed synchronously, instead of waiting
  two animation frames, in Chromium with its frame-rate limit off. A synthetic
  6,000-frame composition: 201 s → 9.2 s on one page, 6.6 s on six. The rows
  match the paced run's exactly. `--paced` keeps the old pacing (now
  unthrottled) for a film that updates itself in effects.
- `--jobs N` shares frames across N pages, each in its own context (default:
  half the cores, at most 8). Rows are merged in frame order and checked as one
  film, so rules over neighbouring frames see across shard edges.
- `--scenes` lists the scenes and `--scene <name|n>` checks one (about a
  second for 300 frames): the entry's `sections`, which `timeline().check` now
  carries by name, or its `scenes` cuts numbered from 1.
- `--every N` reads every Nth frame and runs only the layout rules (cropped,
  offsafe, covers, overlap, legibility, anchor, clipped, blank, occupancy):
  6,000 frames in 2.3 s at `--every 5`. `analyze(…, { layoutOnly: true })`.
- On a page crash, the check prints the page's latest console output, replays
  that stretch and names the frame it died on, and exits 2.
- `--no-media` skips loading video and audio files during a layout check.

### Added
- **`blank`**: nothing tracked is visible (or only `role: "background"`) for
  more than 0.5 s outside `covered` spans. On once anything has a role, or
  under `strict`.
- **`clipped`**: a `screen` cut by a clipping ancestor (`overflow: hidden`).
  `collectDom` now works out each sample's `clip` through its clipping
  ancestors, not just the frame.
- **Text size**: `legibility` now covers `role: "text"`, from its smallest
  font-size × on-screen scale (`fontPx`, read by `collectDom`), under
  `textPx` (20 px at a 1080 short side). Labels no longer need tagging as
  screens.
- **`occupancy`** (opt-in: `occupancy` option or `--occupancy [share]`): the
  tracked boxes together cover less than 20% of the frame for more than 2 s.
  `unionShare()`.
- **Untracked text**: `--strict` also warns about plain text with no tracked
  ancestor drawn on a tracked text or screen, and surfaces over a screen as
  well as a text. `--untracked error` makes all of these `untracked` issues.
- `role: "background"`, `track(name, { opaque })`, `data-romp-opaque`,
  `data-romp-font-px`.
- Demo: "Plant tiny print".

### Fixed
- `overlap` never compared a text with a `screen` drawn under it (the screen
  counted as a backdrop), so a heading on a screenshot passed `--strict`. A
  text on a screen's content now fails after 0.2 s, unless it has a solid panel
  of its own (`opaque`); a screen drawn over a text fails too.
- `spike` fired at declared scene cuts (a new scene's motion restarting): now
  exempt, like the other speed checks.

## [0.6.0] — 2026-11-20

A film passed `romp check --strict` on 0.5.0 with faults a viewer saw at once:
an app screenshot drawn too small to read, a vehicle and papers crossing a
title, a phone mock 2% off the frame's edge, and a speech bubble that appeared
below its ground line and snapped up to it. Why each got through, and what
catches it now:

- No rule knew what a screenshot was, or how big its text came out.
- The props were untracked, or drawn inside one SVG: the check only follows
  `[data-romp]` elements, and `--strict` only counts untagged *tracked*
  objects. The tracked ones crossed the title in under the 0.2 s overlap limit.
- `cropped` allowed any object 25% outside the frame.
- A 60 px move in one frame is under the strobe limit (~120 px at 1080 wide),
  and the spike rule needs motion on both sides, so a snap at a scene start
  passed.

### Added
- **`legibility`**: a new `screen` role for a screenshot or screen recording,
  with its content's `native` width (390 for a phone, 1440 for a desktop page)
  and an optional `minTextPx` (16). Flags a screen whose body text renders
  under `legiblePx` (20 px on a 1080 px short side, in proportion) for more
  than `legibleSeconds` (0.5 s). Zooming is fine; a zoomed or cropped screen
  passes. `trackScreen(name, nativeWidth)` in romp/remotion,
  `data-romp-native-width` and `data-romp-min-text-px` in the DOM.
- **`jump`**: a move over ~40 px (scaled from 886 px wide; `jumpPx`) in one
  frame between still frames, two either side. Not at a scene cut, not when
  the object changes size that frame.
- **`anchor`**: a text with a `ground` (a y in frame px) that shows below it,
  or with an `anchor` (its speaker's tracked name) that drifts more than
  `anchorPx` (10% of the short side) from it. `data-romp-anchor`,
  `data-romp-ground`; `boxGap()`.
- **`romp check --strict` warnings** about untracked `<svg>`, `<canvas>`,
  `<img>` and `<video>` drawn over a tracked text, which the check can't see
  into. `untrackedOver(root)` lists them; `Report.warnings` carries them.
- A sample's `allowCrop` can be a share (`allowCrop: 0.1`,
  `data-romp-allow-crop="0.1"`).
- Demo: "Plant a snap" makes the caption type in low and jump up.

### Changed
- `cropped`: a `screen` or `focus` that would fit in the frame may have 1%
  outside it (`screenCroppedFraction`), not 25%. One bigger than the frame
  is a zoom and isn't checked.
- `overlap`: a prop drawn over a text is flagged after two frames in a row
  (`propOverlapSeconds`, 0.04 s), not 0.2 s. Two texts still get 0.2 s.
- Speed checks (strobe, teleport, jump) skip frames at a declared scene cut.
- Docs: what the check can't see (untagged elements, props inside one SVG or
  canvas) and how to track them.

## [0.5.0] — 2026-11-20

Words on screen and the soundtrack get checked too. A frame-by-frame review of a
real portrait film turned up faults the motion check couldn't see: captions cut
off mid-word when their scene ended, lines whole for barely a second, a speech
bubble covering the very button it described, bubbles running off the edge,
papers and dots crossing a title, empty bubbles, titles that sat blank under
their underline while they retyped after every cut, and the music dropping out
for half a second at segment joins. Each of those is now a rule, and the timing
helpers make the right lengths the default.

### Added
- **Text rules** in the motion check, for objects tracked with a `role`
  (`"text"`, `"focus"` or `"prop"`): `offsafe` (a legible text outside the safe
  area; `safeArea()` defaults to 5% of the long side at its ends and 3.5% of the
  short side, so 38/96 px at 1080×1920), `covers` (a text over the focus box),
  `overlap` (two texts, or a prop drawn over a text; a prop drawn under it is a
  backdrop), `unfinished` (gone, or its scene cut, before every character
  shows), `unread` (whole for less than its reading time), `empty` (a box with
  no words, or a heading still typing after it appears) and `stale` (opt-in:
  nothing moves long after the words were read). Each has its thresholds as
  options and an `allow` list (names, or a `prefix*`). New `Sample` fields:
  `role`, `chars: { shown, total }`, `text`, `words`, `heading`, `z`, `allow`;
  new options `scenes` (cuts), `strict`, `safe`, `reading` and the thresholds.
- **romp/timing**: `readingTime(text, { wpm = 180, min = 1.5 })`, `wordCount`,
  `captionTiming(text, { cps = 30 })` (`typeFrames`, `holdFrames`,
  `totalFrames`, `typed(frame)`), `timeline(scenes)` (scene lengths from their
  captions, transitions that never land on a caption's reading window, 1.2 s act
  cards, and a `check` with the `covered` spans and cuts to spread into a check
  entry) and `captionAt`. Also exported from `romp` and `romp/remotion`.
- **romp/remotion**: `trackText(name, text, { typed, heading })`,
  `track(name, { role, allow, z })` and `sceneSequence(scene)`. A `CheckEntry`
  takes any `analyze()` option.
- `collectDom` reads `data-romp-role`, `data-romp-text`, `data-romp-chars-shown`,
  `data-romp-chars-total`, `data-romp-words`, `data-romp-heading`,
  `data-romp-allow` and `data-romp-z`, and records each element's paint order.
- **Audio check**: `dropouts(buffer)` in romp/audio flags 0.1–1 s of near
  silence (30 dB under the bed) with sound on both sides; `readWav`,
  `rmsWindows`, `formatDropouts`. `romp check --audio file.wav` runs it, alone
  or with an entry. `crossfadeBed(synth, bus, sections, { fade })` writes one
  continuous bed with equal-power crossfades at every join.
- `romp check --strict`: untagged tracked objects count as props for `overlap`,
  and `stale` runs. `formatReport` widens its kind column for the new kinds.
- Demo: a caption typed in with `captionTiming` and tracked as text, and a
  "Plant a text bug" toggle that cuts it off mid-word.

### Changed
- The text rules are on by default for anything with a role. A film that tags
  nothing reports exactly what it did before.

## [0.4.2] — 2026-11-19

### Fixed
- The **lost** rule's camera test, done properly: the three.js collector splits each
  object's on-screen move into the camera's part (the same world point through last
  frame's camera and this one) and its own; leaving the frame mostly by the
  camera's part means the camera moved on (`Sample.cameraLeft`). 0.4.1's test
  (where it was last in view, through today's camera) missed slow cameras. Tested
  on three camera-driven films: from 40–56 flags per film to the few real exits.

## [0.4.1] — 2026-11-19

### Fixed
- The motion check's **lost** rule no longer flags objects a moving camera leaves
  behind, first try: the three.js collector recorded each object's world position,
  and an object that stayed put in its world while it left the frame was spared.
  Superseded by 0.4.2 (objects that move a little, like a bobbing pin, slipped
  through).

## [0.4.0] — 2026-11-18

### Added
- **romp/particles**: a deterministic particle emitter. Each particle's launch
  comes from a seeded hash of its index and its flight is closed-form (gravity,
  wind, linear drag, sway, spin, confetti flip), so `particlesAt(frame)` is a
  pure function of the frame: any frame, any order, in a live viewer, Remotion
  or the motion check. Particles bounce and come to rest on a `ground` (a y, or
  the polyline you gave `stage.ground()`), grow in and fade out by default (not
  pops), and come out as plain data. Presets `confetti`, `sparks`, `snow` and
  `fountain`; `particleStyle` (DOM), `drawParticles` (canvas), and
  `particleSample` to check a burst as one object.
- `trackBurst(name, particles)` in **romp/remotion**: tracks a particle burst as
  one object for `romp check`.
- **Sound as a signal**: `listen(schedule)` in **romp/audio** runs a schedule
  silently and records every voice it plays; the `Score` answers
  `envelopeAt(t, { bus?, voice?, decay? })`, `beatAt(t)` and
  `onsetsBetween(t0, t1)` as pure functions of film time, for visuals that
  react to the soundtrack without a live analyser.
- **romp/theatre**: `seekSequence`, `followSequence`, `objectsRow` and
  `theatreReport`, so a Theatre.js sequence can host romp-baked motion and the
  motion check can step it.
- **romp/motion-canvas**: `playBaked` (baked poses inside a scene, by its time),
  `centred`, and `motionCanvasReport` / `byKey` / `nodeSample` to run the
  motion check over a Motion Canvas project.
- **romp/lottie** and `romp check --lottie anim.json`: the motion check for
  lottie-web animations (After Effects exports), every layer through its
  parents and precomps: a layer cut in at full size is a pop.
- @theatre/core, @motion-canvas/core, @motion-canvas/2d and lottie-web are
  optional peer dependencies; none of the adapters import them.
- Demo: sparks where the flung character hits, tracked as one burst (the check
  stays clean), and a shelf that brightens on every kick drum, read from the
  score.

## [0.3.1] — 2026-11-18

### Fixed
- Sideways hits are impacts: a body whose horizontal speed reverses sharply (a
  wall, or a neighbour side-on) records an impact with `side: true`, so the motion
  check no longer reads a bounce off a wall as a kink. `landed` ignores side hits,
  and `impactResponse` squashes half as much for them.

## [0.3.0] — 2026-11-18

### Added
- The motion check's **lost** rule: a character that has been in frame leaves it
  entirely and stays out for more than `lostSeconds` (1 s) is flagged; mark a real
  exit with `allowExit` (option, `track(name, { allowExit })`, `userData.allowExit`).
- `impactResponse(body, frame, seed, speedRef, { squash, widen })`: tune how far a
  landing squashes and how much of it spreads sideways, so characters piled
  against each other don't overlap on screen.

### Fixed
- Demo: the flung character no longer bounces out of the picture (walls above the
  frame), can't tunnel through others (`bullet`), turns about its centre instead
  of its feet, and every character is drawn the same round shape as its body, so
  what you see is what collides. The planted-bug sticker keeps dark text in dark mode.

## [0.2.0] — 2026-11-18

### Added
- **Motion check: `cropped`.** A tracked object that's shown and on screen but
  has more than `croppedFraction` (default 0.25) of its own box outside the
  frame for more than `croppedSeconds` (default 0.5 s) in a row. Runs where it's
  entering or leaving (its on-frame share only rises or only falls) and covered
  frames are exempt; opt out per object with `track(name, { allowCrop: true })`
  / `data-romp-allow-crop`, `userData.allowCrop` in three.js, or `allowCrop`
  names. `collectDom` and `motionReport` now report each object's `box`;
  `inFrameShare()` and `screenBox()` are exported.
- `poseAt` / `poseAtTime` take `{ discrete: "nearest" | "previous" }` for how
  booleans and other non-numeric fields blend between baked frames.
- `Stage.add(actor)` sets `actor.stage` before `build()`; `Stage.pose(t)` hands
  every actor with an `apply(pose, t)` its interpolated pose, NaN poses as
  `{ shown: false }`.
- `Drop`: `foot` (a contact circle), `spinAt` and `tilt` that unwind to zero at
  touchdown, `z: [from, to]` depth drift arrested on contact, `rock` direction,
  `ledge` with a `frame` offset; `flight(frame)` and `framePose(frame)`.
  `Body` gains `gravityScale`; `Leap` gains `gravity` and `frame`.
- A docs site at https://isaacrowntree.com/romp/: a live demo (a springy
  wordmark knocked over, a pile of hatted characters whose hats follow through
  with `jiggleParts`, play/pause/scrub with sound on the audio clock, the same
  soundtrack rendered offline to a WAV, and the motion check with a "plant a
  bug" toggle), guides, the API reference (checked against the exports at
  build time) and this changelog. The demo's source is `examples/demo/`.

### Changed
- `romp check` and `motionReport` now pass the frame's height, so the cropped
  check runs by default (this is why it's 0.2.0): an object parked half off the
  edge that passed before is now reported.

## [0.1.1] — 2026-11-18

### Added
- `jiggleParts(parts, dt, strength?, lag?)`: secondary motion for several parts
  at once, each lagging the one before.
- `romp check --arg <json>`: the entry may export a function of the argument,
  so one entry covers several cuts (languages, variants).

### Fixed
- `bin/romp.mjs` is executable, so `bunx romp` / `npx romp` work after
  installing from GitHub.

## [0.1.0] — 2026-11-18

### Added
- **romp/core**: a planck.js (Box2D) `Stage` that bakes a scene once at a fixed
  240 Hz and stores one pose per frame, in screen space (y down) or y-up; the
  actor protocol (`build` / `control` / `sample`); preset actors `Body` (with
  recorded impacts), `SpringyBody` (welds where it lands on its ground), `Drop`
  and `Leap`; collision layers; `poseAt` (frames) and `poseAtTime` (seconds).
- Character motion as pure functions: `impactResponse` (squash, blink,
  follow-through and jiggle from real impacts), `landing`, `hop`, `idle`,
  `blinkAt`, `boing`, `jiggle`, `rock`, `nearImpact`; curves `ease`, `spring`,
  `ringOut`, `stagger`.
- `Clock`: real-time playback driving `seek(t)` on requestAnimationFrame,
  following the audio clock while sound plays.
- **romp/check**: the motion check (`analyze`: pops, strobes, teleports,
  spikes, with whips, covered frames, impacts and seamless swaps exempt),
  `formatReport`, and `collectDom` for `data-romp` elements.
- **romp/remotion** (`track`) and **romp/three** (`motionReport`).
- **romp/audio**: synthesised voices and instruments, `createMix`, and one
  schedule played live (`playLive`) or rendered offline (`renderOffline`,
  `renderWav`); **romp/audio/cartoon** voices.
- CLI: `romp check` (Remotion compositions in headless Chromium) and
  `romp sound` (render a schedule to a loudness-normalised WAV).
- Live demo page in `docs/` and a generated hero GIF.
