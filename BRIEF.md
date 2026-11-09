# Signal Room – Build Brief for Claude Code

Nov 5, 2026

## How to use this brief

This brief tells Claude Code what to build: a live, shared web experience for a 30-minute AI trends segment, hosted on Cloudflare. Work through it one phase at a time.

The project folder contains: `BRIEF.md` (this file), `signals.json` (all 25 signals with stats, stories, guess questions and hot takes), `config.json` (session settings), `images/` (duotone photos) and `prototype.html` (the earlier page, as a visual reference and the source of the canvas artwork).

1. Start with planning only: read everything, summarise the app, propose the file structure and the WebSocket message protocol, list questions. Do not write code yet.
2. When the plan is approved, build **one phase at a time** and stop after each phase so the presenter can test it.
3. Phase 1 alone must already be usable as a normal presentation.

## Context and goal

Build **Signal Room**: one website that is both the presentation and a light, shared interactive space for a 40-minute in-person session called *Innovation In & Out*. The app covers the first 30 minutes, on 25 external AI signals. The last 10 minutes are a normal talk and need nothing from the app.

- **Audience:** 10 to 30 colleagues in one room, a mix of business and technical people. The exact number is unknown, so everything must look good at 3 or at 30 participants.
- **Setup:** the presenter shares one laptop screen on the room display. There is no separate presenter monitor, so the shared screen is the stage and presenter controls must stay discreet.
- **Phones:** optional. People scan a QR code and join with no login. Phones are used only for short prompts of 30 seconds or less, then show "Eyes up".
- **Goal:** spark conversation in the room. The digital interaction is a trigger for discussion, not a game. No teams, scores or leaderboards.
- **Afterwards:** the same site works as a self-serve explorer of all 25 signals, so people can keep reading.

## Session flow the app must support

The 30 minutes alternate between short phone moments and longer conversations. The presenter moves between phases with the keyboard. Every phase can be skipped or repeated.

| Time | Phase | Stage (shared screen) | Phone |
| --- | --- | --- | --- |
| 0–3 min | **Join + warm-up** | Big QR code and room code, live count of people joined. Then one warm-up question, results shown as a bar of dots. | Join screen, then three buttons: "AI touched my work this week: not at all / a bit / a lot" |
| 3–6 min | **Map reveal + heart pick** | The signal map appears: 25 nodes in 6 clusters. A 60-second timer runs; hearts fly onto nodes live, the most-hearted nodes glow. At the end, the top 3 are highlighted. | Scrollable list of the 25 signals with a heart button each, maximum 3 hearts |
| 6–27 min | **3 deep dives, about 7 min each** | See the four steps below | See below |
| 27–30 min | **Flyover + close** | Auto-advance through the remaining signals, 15 s each, then a closing screen with a QR code to the explorer | "Thanks — keep exploring" with a link to the explorer |

**Each deep dive has four steps:**

1. **Guess the number** (30 s): the stage shows a question and a slider scale. Phones show the slider. When the presenter reveals, the room's guesses appear as dots on the scale, then the real value animates in with a marker and a one-line source.
2. **The story** (about 3 min): the stage zooms into the signal: hero image, title, hook, the three stats, "Why it matters for our customers". Phones show "Eyes up".
3. **Hot take** (20 s): one provocative statement. Phones show Agree / Disagree. On reveal, the stage shows the split as a large two-colour bar.
4. **Conversation** (about 3 min): the split stays on screen while the presenter invites one person from each side to speak. Phones show "Eyes up".

The presenter picks which signal to deep-dive. The default suggestion is the next most-hearted signal not yet covered.

## Views and features

The app has three routes on one domain. Stage and explorer share the same map and signal components.

| Route | Who | Purpose |
| --- | --- | --- |
| `/stage?room=CODE&key=SECRET` | Presenter, shared on screen | The live show: map, phases, results |
| `/` (and `/join/CODE` from the QR) | Audience phones | Join and answer prompts |
| `/explore` | Anyone, after the session | Read-only map and all 25 signal stories, no live features |

### Stage

- **Signal map:** 25 nodes grouped into 6 labelled clusters (the six acts). Each node shows its icon and short title. Clicking a node zooms smoothly into its story; Escape zooms out. Node glow scales with heart count.
- **Signal story view:** full-bleed duotone image or generated artwork, title, hook, three stat tiles (big number + label + source marker), a "Why it matters for our customers" panel, sources in small type.
- **Result visuals:** dot plot for guesses, two-colour bar for hot takes, dot row for the warm-up. Results stay hidden until the presenter reveals them, to avoid anchoring.
- **Room badge:** small, always visible in a corner: room code and number of people connected.

### Presenter controls (on the shared screen, discreet)

- Keyboard shortcuts (documented in a help overlay on `?`):
  - `→` / `←` next / previous step in the current phase
  - `J` join screen, `M` map, `H` start heart pick, `G` open guess, `T` open hot take
  - `R` reveal results, `E` send phones to "Eyes up", `F` flyover, `C` close screen
  - `1`–`9` pick one of the suggested signals for the next deep dive
- A control bar that appears only when the mouse moves to the bottom edge, then hides again after 3 seconds.
- The presenter can override everything: open any signal, skip any prompt, reset a prompt.

### Phone

- Mobile-first, one action per screen, big touch targets, works on iOS Safari and Android Chrome.
- Join: room code pre-filled from the QR, optional first name, then "You're in".
- Screens follow the phase pushed by the server: warm-up buttons, heart list, guess slider, agree/disagree, eyes up, thanks.
- After submitting: a confirmation state, "Waiting for the reveal". One answer per prompt; it can be changed until the reveal.
- Reconnects automatically and lands on the current phase.

## Architecture on Cloudflare

One Worker serves everything, and one Durable Object per room holds the live state, so all phones and the stage see the same thing within a second.

```
 Stage (presenter laptop) ──WebSocket──┐
 Phones (10 to 30) ─────────WebSocket──┼──►  Cloudflare Worker  ◄──►  Room (Durable Object)
 Explorer (after session) ──HTTPS only─┘     - serves site + images    - holds the live state
                                             - routes /ws to the room  - validates every answer
                                             - checks presenter key    - broadcasts, saves to storage
                                                     │
                                                     └ ─ ►  Workers AI (optional, off by default)
```

The stage and phones keep a WebSocket open to the room; the explorer is plain static pages and works even if the live part is down.

**Stack**

- TypeScript throughout. A single Worker with static assets, configured in `wrangler.toml` (or Pages + Functions if you recommend it). Front end built with Vite; vanilla TypeScript or Preact, whichever is simplest.
- Durable Object class `Room`, using the WebSocket Hibernation API so idle connections cost nothing. Room state is saved to Durable Object storage after every change, so a restart loses nothing.
- Presenter key stored as a Worker secret (`wrangler secret put PRESENTER_KEY`).

**Room state (in the Durable Object)**

```ts
type RoomState = {
  phase: 'lobby' | 'warmup' | 'hearts' | 'guess' | 'story' | 'hottake' | 'discuss' | 'flyover' | 'close';
  activeSignalId: string | null;
  revealed: boolean;
  covered: string[];                       // signals already deep-dived
  participants: Record<string, { name?: string; lastSeen: number }>;
  warmup: Record<string, number>;          // participantId -> option index
  hearts: Record<string, string[]>;        // participantId -> signal ids (max 3)
  guesses: Record<string, Record<string, number>>;   // signalId -> participantId -> value
  takes: Record<string, Record<string, 'agree' | 'disagree'>>;
};
```

**WebSocket messages (JSON)**

| Direction | Type | Payload |
| --- | --- | --- |
| phone → room | `join` | `{ participantId, name? }` |
| phone → room | `answer` | `{ kind: 'warmup' / 'heart' / 'guess' / 'take', signalId?, value }` |
| stage → room | `control` | `{ key, action: 'setPhase' / 'setSignal' / 'reveal' / 'reset', value? }` |
| room → all | `state` | The public view of the state: phase, active signal, revealed flag, participant count |
| room → stage | `results` | Aggregates only: counts, guess values, agree/disagree totals |
| room → phone | `you` | That phone's own answers, so it can restore its screen after a reconnect |

Phones never receive other people's answers, only aggregates after a reveal.

## Content model and assets

All content lives in `signals.json`; the code never hard-codes a signal. The presenter edits that one file to change wording, numbers or questions. Read the real file for the full structure; each signal has: `id`, `n`, `act`, `title`, `short`, `status`, `isNew`, `icon`, `image`, `art`, `hook`, `why`, `story`, `stats[]` (`value`, `label`, `fresh`), `guess` (`question`, `min`, `max`, `unit`, `answer`, `answerLabel`, `source`), `hotTake`, `sources[]`.

- **`image` or `art`:** 10 signals have a duotone photo in `images/`. The other 15 have `image: null` and an `art` key naming a generated canvas motif (network, molecules, orbit, ripples, lenses, waves, hub, ladder, tiers, falling, rising, layers, bolt, stars, ecg). Port these motifs from `prototype.html` (the `ART` object in its script) as reusable canvas functions. `images/hero.jpg` is the opening image.
- **`fresh`:** `checked` (verified against a source in November 2026) or `deck` (carried over from the June deck, not re-checked). Show a small marker so the presenter knows which figures to verify.
- **`icon`:** a Lucide icon name; use the `lucide` package.
- **`guess` and `hotTake`:** drafted for every signal, so any signal can be a deep dive. The presenter reviews them before the session.

## Design direction

Keep the visual world of `prototype.html` ("Too Late To Ignore"): cinematic, dark and warm, built for a projector.

- **Palette:** night navy background `#080C1E`, surfaces `#10162F` / `#182044`, signal orange `#F07A2E` as the one accent, warm highlight `#FFB37A`, teal `#5ED3C2` only for "new since June" and live indicators.
- **Type:** Archivo 800–900 for titles and big numbers, IBM Plex Sans for body, IBM Plex Mono for small labels. Stage text must read from the back of a room: body at least 24 px, titles 64 px and up at 1920×1080.
- **Imagery:** every signal has a full-bleed visual in the same duotone (navy → orange → cream). Generated artwork uses the same palette, so photos and art feel like one set.
- **Motion:** smooth zoom from map to story (about 600 ms), hearts that float up to their node, numbers that count up on reveal. Respect `prefers-reduced-motion`.
- **Stage layout:** designed for 16:9 at 1920×1080 and still legible at 1280×720. Nothing important near the edges, because projectors crop.
- **Phone layout:** single column, one big action, high contrast; works in bright rooms.
- **Tone of words:** short, direct, no jargon. Buttons say exactly what happens.

## Build phases

Build in this order, and stop after each phase for testing. Each phase leaves a working product, so if time runs out the session can still run on what exists.

### Phase 1 — Map and stories (no live features)

Scaffold the project, load `signals.json`, build the map, the story view and `/explore`, and deploy to Cloudflare.

- [ ] `/explore` and `/stage` show the map with 25 nodes in 6 clusters
- [ ] Clicking a node zooms into its story; Escape returns to the map
- [ ] Images and generated artwork render in the duotone style
- [ ] Arrow keys step through signals; the help overlay opens on `?`
- [ ] Deployed on a Cloudflare URL and readable on a 1280×720 screen

### Phase 2 — Live room: join, warm-up, hearts

Add the Durable Object, the WebSocket connection, the phone view and the first two interactions.

- [ ] The presenter creates a room; the stage shows a QR code and the live join count
- [ ] A phone joins by QR in under 10 seconds, with no login
- [ ] Warm-up answers appear on stage only after `R`
- [ ] Heart pick: max 3 hearts per person, hearts animate onto nodes, top 3 highlighted
- [ ] Refreshing a phone or the stage restores the current state

### Phase 3 — Deep dives: guess, hot take, flyover

- [ ] Guess-the-number prompt with slider on phones; reveal shows the guess dots, then the real value
- [ ] Hot take with Agree / Disagree; reveal shows the split bar
- [ ] "Eyes up" screen on phones between prompts
- [ ] Flyover auto-advances through unvisited signals; closing screen with an explorer QR code
- [ ] Presenter controls work by keyboard and by the hidden control bar

### Phase 4 — Polish and rehearsal mode

- [ ] Motion polish: zoom, floating hearts, counting numbers; reduced-motion respected
- [ ] **Rehearsal mode:** `?simulate=20` adds 20 fake participants who answer randomly, so the presenter can practise alone
- [ ] Reset room button (with confirmation) to clear all answers before the real session
- [ ] Optional, behind a flag: an AI summary on the closing screen (see Defaults)

## Requirements, fallback and rehearsal

**Requirements**

- **Scale:** 50 concurrent phones per room with headroom; one room is enough.
- **Latency:** an answer appears on stage within 1 second on normal Wi-Fi.
- **Privacy:** no personal data stored beyond an optional first name. Phones get a random anonymous id in `localStorage`. Room data can be deleted with the reset button.
- **Security:** stage controls require the secret `key` in the URL (stored as a Worker secret). Phones can only send their own answers, validated server-side (one answer per prompt, 3 hearts max, slider within range).
- **Accessibility:** keyboard-operable stage, visible focus, sufficient contrast, alt text for images.

**Fallback**

- If the WebSocket fails, the stage keeps working as a normal presentation: map, stories and keyboard navigation need no connection.
- The phone view shows a friendly "Reconnecting…" state and retries with backoff.
- If WebSockets are blocked on the office network, fall back to polling every 2 seconds.

**Rehearsal checklist (in the actual room, at least a day before)**

- [ ] Open the stage on the laptop you'll present from, shared on the room display
- [ ] Join with 3–4 real phones on the office Wi-Fi and on mobile data
- [ ] Check the QR code scans from the back row
- [ ] Run one full deep dive with `?simulate=20`
- [ ] Read every stage text from the back of the room
- [ ] Reset the room, and check that the figures marked "from June deck" have been verified or removed

## Defaults chosen and open decisions

Where the session design left a choice open, the brief uses these defaults. Each is a setting in `config.json`, so it can change without code changes.

| Setting | Default | Alternative |
| --- | --- | --- |
| Number of deep dives | 3 (about 7 min each) | 4 (about 5 min each) |
| When results appear | Hidden until the presenter presses `R` | Live as answers arrive |
| Hearts per person | 3 | 1 to 5 |
| Heart pick duration | 60 s | 30–90 s |
| AI summary on the closing screen | Off | On: one Worker call that turns the room's answers into three lines, only if company policy allows sending them to an AI service |
| Names on phones | Optional first name, never shown on stage | Fully anonymous |

**Out of scope:** teams, scores, leaderboards, audience-submitted trends, brainstorming about customers, remote participants, user accounts.
