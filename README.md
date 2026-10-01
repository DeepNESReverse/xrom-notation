# @xromdev/notation

Notes in ticks, read as a score — **note values, ties, tuplets, bar lines, key
spelling, clefs, the grand staff and dynamics, with no DOM and no renderer.**

Give it notes as integers — where each starts and how long it lasts, in
sixty-fourth notes — and it tells you how to write them:

- **Note values:** each length is written with the fewest heads. A note that
  crosses a bar line is tied over it, and a syncopation is one head rather
  than a sixteenth tied into scraps. Off-grid runs of three that a sound
  driver could only approximate (10 + 11 + 11 ticks) are written as triplets.
- **Bar lines:** any metre, an opening bar of its own length (a 19/32 pickup
  bar in front of 2/4), and odd bars later in the piece. A channel's own
  delay of a tick or three is taken out, so its notes sit on the beat.
- **Pitch spelling** in the key and through key changes. Black keys are
  written the way the signature has them, and C♭ and F♭ appear where the key
  flattens those letters.
- **Clefs:** chosen per bar, by a part's worst ledger-line ladder rather than
  its average. A bar that drops into the other register changes clef partway
  through.
- **A grand staff:** a part that needs two staves is split by beam group, and
  a beam crosses between the staves the way piano music does.
- **Percussion:** a percussion staff for the NES noise channel, its sixteen
  rates mapped onto the drum lines.
- **Dynamics, bends and accents:**
  - dynamics read from volume levels;
  - slides, bends and vibrato read from pitch curves;
  - grace notes and echoes in brackets;
  - accents and beams that follow them, in a passage you name.

Every rule was made on the music of Battletoads (NES), whose sound driver
counts in exactly these ticks, and checked by ear across its twenty tracks.
The comments in the source name the bars that decided each one.

The output is a model for whatever draws it. Durations come out as VexFlow
codes (`w h q 8 16 32 64` plus dots) and pitches as VexFlow keys (`f#/4`), so
[VexFlow](https://www.vexflow.com) can draw it as it stands.

**See it:** the score pages at [xrom.dev](https://xrom.dev).

## Install

```sh
npm install @xromdev/notation
```

## A score

```ts
import { buildScore, keyOf, staffKey, noiseKey } from '@xromdev/notation';

// 16 ticks to a quarter: 16 is a quarter, 8 an eighth, 64 a bar of 4/4.
const lead = [
  { start: 0, ticks: 16, midi: 64, volume: 12 },
  { start: 16, ticks: 8, midi: 66, volume: 12 },
  { start: 24, ticks: 8, midi: 67, volume: 8 },
  { start: 32, ticks: 32, midi: 71, volume: 12 },
];
const drums = [
  { start: 0, ticks: 8, period: 15 }, // NES noise rates: 15 kick
  { start: 16, ticks: 8, period: 7 }, //                  7 snare
];

const score = buildScore([{ id: 'lead', notes: lead }], drums, 64, {
  measureTicks: 64, // 4/4
});

const key = keyOf('G');
for (const stave of score.staves) {
  for (const bar of stave.bars) {
    for (const item of bar) {
      const pitch =
        item.midi === null ? 'rest'
        : stave.kind === 'percussion' ? noiseKey(item.midi)
        : staffKey(item.midi, key);
      console.log(stave.kind, pitch, item.duration + '.'.repeat(item.dots));
    }
  }
}
// treble e/4 q · f#/4 8 · g/4 8 · b/4 h
// percussion e/4 8 · rest 8 · d/5 8 · rest 8 · rest h
console.log(score.dynamics.lead); // [{ tick: 0, dynamic: 'f' }]
```

`ScoreModel` holds:
- `staves` — each with its bars, already filled to the bar line. A grand
  staff also carries `voiceBars` (the part as one voice across both staves).
- `grid` and `shift` — where the bar lines fall.
- `barCount`.
- `dynamics` and `phases` per part. `phases` is the delay taken out of each part.

Each item is a head or a rest, with:
- `start`, `ticks`, `duration`, `dots`;
- ties (`tieStart`, `tieStop`) and `tuplet`;
- and, where they apply: `effect`, `grace`, `accent`, `echo`, `volume`,
  `staff` and `beamGroup`.

### Options

| option | default | |
|---|---|---|
| `offset` | 0 | The tick the bar lines are counted from. |
| `measureTicks` | 64 | Ticks in a bar: 64 is 4/4, 32 is 2/4, 48 is 3/4. |
| `mergePickup` | false | Put a pickup into a longer opening bar instead of a bar of rests. |
| `oddBars` | `[]` | `{ bar, ticks }` — later bars with a length of their own. |
| `accentBeams` | none | `{ from, to }` ticks: mark accents there, and beam by them. |

A part's notes may also carry:
- `volume` (0..15), from which the dynamics and accents are read;
- `bend` — a pitch curve as `[position 0..1, semitones]` pairs;
- `grace` — MIDI numbers played in front of the note;
- `echo` — a quieter repeat, written in brackets.

## One staff

The pieces under `buildScore`, for a single strip of music:

```ts
import { barring, voicePhase, shiftNotes, staffItems, staffMeasures, clefPlan } from '@xromdev/notation';

const { grid, shift } = barring(offset, 64);
const phase = voicePhase(notes, offset, 64);
const end = totalTicks + shift;
const bars = staffMeasures(staffItems(shiftNotes(notes, shift - phase), end, grid), end, grid);
```

`clefPlan` gives each bar's clef, and `staffRoom` how far the music reaches
above and below the staff. `decompose(position, length)` spells a single run
of ticks. `keyOf`, `staffKey` and `barKeys` handle keys and key changes.

## Speed

Measured on 46 real pieces (Battletoads, Battletoads & Double Dragon,
Alien 3, RoboCop 1 and 3, Terminator 2) on a laptop:

| | per piece |
|---|---|
| A whole score (`buildScore`) | ~0.9 ms |
| Each channel's single staff | ~0.6 ms |

Both are computed once per piece, not per frame. About 6 KB minified and gzipped.

## Development

```sh
npm install
npm test
```

## License

MIT © Oleksandr Maksymov
