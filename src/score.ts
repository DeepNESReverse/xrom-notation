/**
 * A track as a SCORE: each pitched channel on a grand staff, the noise channel
 * on a percussion staff, and the dynamics its volumes imply.
 *
 * Built on `./notation`, so a bar here is spelled exactly the way a single
 * scrolling staff spells it — same bar line, same phase, same
 * note values. What this file adds is the part a page of music needs and a
 * single strip does not: which of two staves a note goes on, and what the
 * volume column says in the words a player reads.
 */

import {
  MEASURE_TICKS,
  TICKS_PER_QUARTER,
  barAt,
  barCountOf,
  barring,
  chooseClef,
  shiftNotes,
  staffItems,
  staffMeasures,
  voicePhase,
  type BarGrid,
  type OddBar,
  type StaffItem,
  type TickNote,
} from './notation.js';

/**
 * Middle C: in a beam group kept on the bass, the heads from here up still go
 * onto the treble and the beam crosses to them — see `crossStaffVoice`.
 */
export const GRAND_STAFF_SPLIT = 60;

export function splitGrandStaff<T extends { midi: number }>(
  notes: readonly T[],
  split = GRAND_STAFF_SPLIT
): { treble: T[]; bass: T[] } {
  const treble: T[] = [];
  const bass: T[] = [];
  for (const note of notes) (note.midi >= split ? treble : bass).push(note);
  return { treble, bass };
}

/** A beam group that never goes below E3 — three ledger lines under the treble — is written on the treble. */
export const TREBLE_FLOOR = 52;

/** Durations beamed together, one group per beat — `beamsFor`'s set. */
const BEAMED = new Set(['8', '16', '32', '64']);

/**
 * A grand-staff part as ONE voice, each item saying which of the two staves it
 * stands on.
 *
 * Decided per BEAM GROUP — the beamed notes of one beat, or a note on its own —
 * because a beam is what a reader follows:
 *
 *  - a group that never goes below E3 (`TREBLE_FLOOR`) is on the treble, E3
 *    included. Ragnarok's canyon, pulse 1, bar 29, the third beat: A3 G3 C4 A3
 *    E4 C4 G4 E4 — a reader wanted it all on the treble.
 *  - a group that does go below E3 stays on the bass, E3s and all — bar 29's
 *    second beat, E3 G3 C3 E3…, which "would be ugly otherwise". Only its heads
 *    from middle C up cross to the treble, and the beam crosses with them — the
 *    piano's cross-staff writing, drawn as one beam between the
 *    staves with no rest on either side. Bar 30's lone G5 among B2s is that case.
 *
 * Every rule tried per BAR before this failed on a bar of this music: a bar
 * that starts low and climbs three octaves has a bass half and a treble half,
 * and the only choices a whole bar has are to tear its beams with rests or put
 * half of it on four ledger lines.
 *
 * A piece tied on from the head before it stays where that head stood; a rest
 * stands where the head before it in the bar did (else the first head after
 * it), and a bar with no heads at all is the treble's, so the bass shows its
 * own bar rest rather than a second one.
 */
export function crossStaffVoice(bars: readonly (readonly ScoreItem[])[]): ScoreItem[][] {
  let carried: 'treble' | 'bass' = 'treble';
  /*
   * A head whose beam runs on into the next bar (`crossBarRuns`) belongs to the group on the OTHER
   * side of the bar line, not to the beat it sits in — so it is written after that group has
   * chosen, and put on the same staff. Ragnarok's canyon, bar 25: the last E3 ends a beat of G4s
   * and went to the treble with them, while the D3 E3 it is beamed to are on the bass, and the
   * beam fell across the whole grand staff.
   */
  let hanging: ScoreItem[] | null = null;
  const written = bars.map((items) => {
    /*
     * The beat a head stands on, counted from ITS OWN bar line — the bar's
     * first item, since a bar is filled from its line. Counted with `%` off the
     * piece's clock instead, as this once was, it is right only while every bar
     * is the same length and the first starts on tick 0: Volkmire's Inferno
     * Race, barred from tick 6 with an opening bar of 19/32, had the two halves
     * of one arpeggio sorted into each other's beats, and the run came out torn
     * between the staves.
     */
    const barStart = items[0]?.start ?? 0;
    const groups = new Map<string, number[]>();
    items.forEach((item, index) => {
      if (item.midi === null) return;
      const key = BEAMED.has(item.duration)
        ? `beat${Math.floor((item.start - barStart) / TICKS_PER_QUARTER)}`
        : `note${index}`;
      groups.set(key, [...(groups.get(key) ?? []), index]);
    });

    const chosen: ('treble' | 'bass')[] = items.map(() => 'treble');
    for (const members of groups.values()) {
      const low = Math.min(...members.map((index) => items[index].midi as number));
      for (const index of members) {
        const midi = items[index].midi as number;
        chosen[index] = low >= TREBLE_FLOOR || midi >= GRAND_STAFF_SPLIT ? 'treble' : 'bass';
      }
    }

    let previous = carried;
    const heads = items.map((item, index) => {
      if (item.midi === null) return item;
      const staff = item.tieStop ? previous : chosen[index];
      previous = staff;
      return { ...item, staff };
    });
    carried = previous;

    const firstHead = heads.find((item) => item.midi !== null)?.staff ?? 'treble';
    let before: 'treble' | 'bass' | undefined;
    const bar = heads.map((item) => {
      if (item.midi !== null) {
        before = item.staff;
        return item;
      }
      return { ...item, staff: before ?? firstHead };
    });

    const reached = bar.find((item) => item.across === 'join');
    if (hanging && reached) {
      for (const item of hanging) item.staff = reached.staff;
      carried = reached.staff ?? carried;
    }
    hanging = bar.filter((item) => item.across === 'start');
    return bar;
  });
  return written;
}

/** The highest a part may reach and still be written on the bass staff alone: E4, two ledger lines up. */
export const BASS_ONLY_MAX = 64;
/** The lowest a part may reach and still be written on the treble staff alone: G3, two ledger lines down. */
export const TREBLE_ONLY_MIN = 55;

/**
 * The staves a part needs: one when every note it plays sits within two ledger
 * lines of a single staff, both otherwise.
 *
 * A grand staff whose other half is a whole track of rests is furniture: the
 * triangle carries the bass in every one of the twenty tracks, and in
 * Ragnarok's canyon it reaches D#4 at most — a ledger line and a half above the
 * bass staff. Where both single staves would do, the part's middle decides.
 */
export function partStaves(notes: readonly { midi: number }[]): ('treble' | 'bass')[] {
  if (notes.length === 0) return ['treble'];
  let low = Infinity;
  let high = -Infinity;
  for (const note of notes) {
    low = Math.min(low, note.midi);
    high = Math.max(high, note.midi);
  }
  const bass = high <= BASS_ONLY_MAX;
  const treble = low >= TREBLE_ONLY_MIN;
  if (bass && treble) return [chooseClef(notes)];
  if (bass) return ['bass'];
  if (treble) return ['treble'];
  return ['treble', 'bass'];
}

export type Dynamic = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';
const DYNAMICS: readonly Dynamic[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];

/**
 * The APU's 0..15 volume in six steps.
 *
 * A READING, not a fact: the nibble is linear in output level and a dynamic is
 * a word about loudness, so the steps are even in the nibble and nothing more
 * is claimed for them.
 */
export function dynamicOf(volume: number): Dynamic {
  const level = Math.max(0, Math.min(15, Math.round(volume)));
  return DYNAMICS[Math.min(DYNAMICS.length - 1, Math.floor((level * DYNAMICS.length) / 16))];
}

/** A change of level closer than this, in ticks, is folded into the mark before it. A quarter note. */
export const DYNAMIC_HOLD = 16;

/** The words a mark can carry after its level: a figure's shape, or "the same again". */
export type DynamicWords = 'dim.' | 'cresc.' | 'sim.';

export interface DynamicMark {
  tick: number;
  dynamic: Dynamic;
  /**
   * How the figure goes from here: `dim.` and `cresc.` are a hairpin after the
   * level, `sim.` is the word alone — the level is the figure's own — with a
   * dashed line for as long as it holds.
   */
  words?: DynamicWords;
  /** With `words`: the tick of the last note the hairpin or the `sim.` covers. */
  until?: number; /**
   * A hairpin from a level the reader is already at: the hairpin alone, no
   * letter — ragnarok's 7 7 4 2, an mp going on from the mp before it.
   */
  bare?: boolean;
}

/** Onset to onset, notes closer than this can make one shaped figure. An eighth note. */
export const FIGURE_GAP = 8;

/**
 * And no closer than this, a sixteenth. Faster is one note's envelope struck
 * again and again — Arctic Caverns' 8 4 2 1 in thirty-seconds on one pitch, an
 * echo — not a figure a player shapes.
 */
export const FIGURE_STEP = 4;

/** A run of notes whose level only falls, or only rises: `[from, to]` are indices, inclusive. */
export interface ShapedFigure {
  from: number;
  to: number;
  words: 'dim.' | 'cresc.';
}

/**
 * Runs of at least three notes, each `FIGURE_STEP` to `FIGURE_GAP` after the one before, whose
 * level moves one way every step and by two or more in all — the 4 3 2 1 under
 * every beat of a fading figure. The six steps of `dynamicOf` cannot show that:
 * 4 and 3 are both p, and the hold folds the pp of 2 and 1 back into it.
 *
 * `notes` must be in order of start.
 */
export function shapedFigures(
  notes: readonly { start: number; volume: number }[],
  gap = FIGURE_GAP
): ShapedFigure[] {
  const figures: ShapedFigure[] = [];
  let from = 0;
  while (from < notes.length - 2) {
    const step = Math.sign(notes[from + 1].volume - notes[from].volume);
    let to = from;
    while (
      step !== 0 &&
      to + 1 < notes.length &&
      notes[to + 1].start - notes[to].start <= gap &&
      notes[to + 1].start - notes[to].start >= FIGURE_STEP &&
      Math.sign(notes[to + 1].volume - notes[to].volume) === step
    ) {
      to++;
    }
    if (to - from >= 2 && Math.abs(notes[to].volume - notes[from].volume) >= 2) {
      figures.push({ from, to, words: step < 0 ? 'dim.' : 'cresc.' });
      from = to + 1;
    } else {
      from++;
    }
  }
  return figures;
}

/**
 * Two figures `sim.` can stand for: the same levels in the same rhythm. Only
 * that — ragnarok's 7 4 2 1 followed by a 7 4 2 is a figure of its own, with a
 * hairpin of its own.
 */
function sameFigure(
  notes: readonly { start: number; volume: number }[],
  a: ShapedFigure,
  b: ShapedFigure
): boolean {
  if (a.to - a.from !== b.to - b.from) return false;
  for (let i = 0; i <= a.to - a.from; i++) {
    if (notes[a.from + i].volume !== notes[b.from + i].volume) return false;
    if (
      i > 0 &&
      notes[a.from + i].start - notes[a.from + i - 1].start !==
        notes[b.from + i].start - notes[b.from + i - 1].start
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Where a voice's level changes, as the marks a score prints.
 *
 * Only at a change, and never two within `DYNAMIC_HOLD`: the driver can move a
 * volume on every note, and a mark under every head is noise. Inside the hold
 * the LOUDER level stands — the accent is what a reader has to see — and a
 * change that comes straight back to the level before it is dropped.
 *
 * A shaped figure (`shapedFigures`) is written as its level and a hairpin under
 * the first, `sim.` under the next one just like it, its dashes running on over
 * the ones after that, until some other mark is printed. A figure that turns straight
 * into one going the other way — wookie hole's 6 4 2 1 2 4 6 8 on one held
 * note — is a level swaying, not a figure, and is read note by note as before.
 * After a hairpin the reader is where it ends, so going back to where it began
 * is written — ragnarok's mp over the 7 after 7 4 2 1 — unless a `sim.` that
 * goes on already says the figure comes round again.
 */
export function dynamicMarks(
  notes: readonly { start: number; volume: number }[],
  hold = DYNAMIC_HOLD
): DynamicMark[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const found = shapedFigures(sorted);
  const swaying = (a: ShapedFigure | undefined, b: ShapedFigure | undefined) =>
    !!a && !!b && b.from === a.to + 1 && a.words !== b.words;
  const figureAt = new Map<number, ShapedFigure>();
  found.forEach((figure, i) => {
    if (!swaying(found[i - 1], figure) && !swaying(figure, found[i + 1])) {
      figureAt.set(figure.from, figure);
    }
  });

  const marks: DynamicMark[] = [];
  // The level the reader is at.
  let heard: Dynamic | null = null;
  // The figure the last words were about, and whether its `sim.` has been printed.
  let stated: ShapedFigure | null = null;
  let similar = false;
  // A plain mark breaks a run of `sim.`; taken back, it gives the run back.
  const broken = new Map<DynamicMark, { stated: ShapedFigure | null; similar: boolean }>();
  const pop = () => {
    const mark = marks.pop()!;
    const run = broken.get(mark);
    if (run) ({ stated, similar } = run);
  };
  /**
   * The next figure after note `i` is one more like `like`, and nothing between says otherwise —
   * Intruder Excluder's 6 6 before each 6 4 2 1 is the same figure coming round, not news.
   */
  const starts = [...figureAt.keys()].sort((a, b) => a - b);
  const simGoesOn = (i: number, like: ShapedFigure) => {
    const next = starts.find((start) => start > i);
    if (next === undefined || !sameFigure(sorted, like, figureAt.get(next)!)) return false;
    const level = dynamicOf(sorted[i].volume);
    for (let k = i + 1; k < next; k++) if (dynamicOf(sorted[k].volume) !== level) return false;
    return true;
  };
  for (let i = 0; i < sorted.length; i++) {
    const note = sorted[i];
    const dynamic = dynamicOf(note.volume);
    const figure = figureAt.get(i);
    const last = marks[marks.length - 1];
    if (figure) {
      // `p`, and a beat later `mp` and a hairpin: the figure's mark says it, as the louder.
      // At the same level the mark stays and the hairpin goes on from it, bare.
      if (
        last &&
        !last.words &&
        note.start - last.tick < hold &&
        DYNAMICS.indexOf(last.dynamic) < DYNAMICS.indexOf(dynamic)
      ) {
        pop();
        // Its level is now the figure's to state.
        heard = marks[marks.length - 1]?.dynamic ?? null;
      }
      const until = sorted[figure.to].start;
      if (stated && sameFigure(sorted, stated, figure)) {
        if (similar) marks[marks.length - 1].until = until;
        else marks.push({ tick: note.start, dynamic, words: 'sim.', until });
        similar = true;
      } else {
        const mark: DynamicMark = { tick: note.start, dynamic, words: figure.words, until };
        if (heard === dynamic) mark.bare = true;
        marks.push(mark);
        stated = figure;
        similar = false;
      }
      // The hairpin has taken the reader down (or up) to where the figure ends.
      heard = dynamicOf(sorted[figure.to].volume);
      i = figure.to;
      continue;
    }
    if (heard === dynamic) continue;
    // Back at the level of a run of `sim.` that goes on: the `sim.` says so already.
    if (stated && dynamic === dynamicOf(sorted[stated.from].volume) && simGoesOn(i, stated)) {
      heard = dynamic;
      continue;
    }
    heard = dynamic;
    if (last && !last.words && note.start - last.tick < hold) {
      if (DYNAMICS.indexOf(dynamic) > DYNAMICS.indexOf(last.dynamic)) last.dynamic = dynamic;
      if (marks[marks.length - 2]?.dynamic === last.dynamic) pop();
      heard = marks[marks.length - 1].dynamic;
      continue;
    }
    const mark: DynamicMark = { tick: note.start, dynamic };
    broken.set(mark, { stated, similar });
    stated = null;
    marks.push(mark);
  }
  return marks;
}

/**
 * Where each NES noise period (`$400E`, 0..15) sits on the percussion staff:
 * high noise at the top and low noise at the bottom.
 */
const NOISE_LINES = [
  'g/5',
  'g/5',
  'g/5',
  'f/5',
  'f/5',
  'e/5',
  'e/5',
  'd/5',
  'd/5',
  'c/5',
  'b/4',
  'a/4',
  'g/4',
  'f/4',
  'e/4',
  'e/4',
];

/**
 * The notehead: a cross for a closed or pedal hat, a circled cross for an open
 * one, a plain head for everything with a skin. The pieces are the ones
 * `@xromdev/drumroll` draws on its kit (`NOISE_DRUM_KINDS`).
 */
const NOISE_HEADS = ['x', 'x', 'x', 'x', 'cx', 'cx', '', '', '', '', '', '', '', '', '', ''];

/** A noise period as a VexFlow key on the percussion staff. Only the low nibble is the period. */
export function noiseKey(period: number): string {
  const index = period & 0x0f;
  return NOISE_HEADS[index] ? `${NOISE_LINES[index]}/${NOISE_HEADS[index]}` : NOISE_LINES[index];
}

/** A pitched note, with the volume it starts at when the channel has one. */
export interface ScoreNote extends TickNote {
  volume?: number;
  /** The note's pitch curve — `[position 0..1, semitones]` — as a piano roll draws it. */
  bend?: readonly (readonly [number, number])[];
  /** Grace notes in front of it, as MIDI numbers in the order they are played. */
  grace?: readonly number[];
  /** A repeat of the note before, quieter — an echo, written in brackets (`echoNotes`). */
  echo?: boolean;
  /**
   * Played short: its `ticks` are the value it is WRITTEN as, and it sounds for
   * less — a staccato dot over the head instead of a rest after it.
   */
  staccato?: boolean;
}

/** What a pitch curve is written as. `ticks` is the whole note's length, over which it moves. */
export type PitchEffect =
  | {
      kind: 'slide';
      /** Where it arrives, in semitones from the written pitch; to a tenth. */
      semitones: number;
      /** Where along the note the movement begins, 0..1. */
      from: number;
      ticks: number;
      /**
       * It lands on the next written note. When it does not — a sweep too wide to be a bend that
       * ends on no note (ragnarok's canyon, triangle, bar 15: E3 down to B2, then a D3) — the
       * staff draws where it lands as a small note in brackets. Set by `effectsOf`.
       */
      arrives?: boolean;
    }
  | {
      /** The pitch moves on the note it started on — a guitarist's bend, or its release downwards. */
      kind: 'bend';
      semitones: number;
      from: number;
      ticks: number;
    }
  | {
      kind: 'vibrato';
      depth: number;
      ticks: number;
      /**
       * The curve itself, `[position 0..1, semitones]`, kept for a vibrato wider than a semitone:
       * a wave glyph says nothing of a swing like Turbo Tunnel Race's, bar 31, a D6 going up four
       * semitones and down two and a half, so the staff draws the curve itself.
       */
      curve?: readonly (readonly [number, number])[];
    };

/** A vibrato swinging further than this, in semitones, is drawn as its curve rather than a wave. */
export const WIDE_VIBRATO = 1;

/**
 * A movement smaller than this, in semitones, is not written at all.
 *
 * 261 of the cartridge's 304 curves are a drift of a fifth of a semitone at the
 * end of a note. The roll draws them as a hairline, which is right for a picture
 * of the sound; on a staff a mark on every one of them would be noise over a
 * third of the notes of some tracks.
 */
export const DRIFT_LIMIT = 0.5;
/** Changes of direction that make a curve a vibrato rather than a slide. */
const VIBRATO_TURNS = 3;
/** A swing back smaller than this, in semitones, is the curve's own jitter, not a change of direction. */
const TURN_MIN = 0.25;
/** The shallowest vibrato written, in semitones either way: Surf City's is a tenth. */
const LIGHT_VIBRATO = 0.09;

/**
 * How many times a curve really changes direction.
 *
 * Counted with hysteresis: a move only turns once the curve has come back
 * `TURN_MIN` from the furthest point it reached. Counting every sign change of
 * the slope read ragnarok's canyon's triangle, bar 15 — a flicker of 0.05
 * semitones and then a steady fall of five to a B — as a vibrato, and it was
 * drawn as a wave where a reader sees a glissando.
 */
function turnsOf(values: readonly number[], turnMin = TURN_MIN): number {
  let turns = 0;
  let direction = 0;
  let pivot = values[0] ?? 0;
  for (const value of values) {
    const move = value - pivot;
    if (direction === 0) {
      if (Math.abs(move) >= turnMin) {
        direction = Math.sign(move);
        pivot = value;
      }
    } else if (Math.sign(move) === direction) {
      pivot = value;
    } else if (Math.abs(move) >= turnMin) {
      turns++;
      direction = -direction;
      pivot = value;
    }
  }
  return turns;
}

/**
 * A note's pitch curve read as notation: a slide to where it arrives, a
 * vibrato, or nothing.
 *
 * Over the twenty tracks that is 33 slides (one to four semitones), 10 vibratos,
 * and the drifts left out — the same split the Battletoads music tooling
 * makes between a slide and a vibrato.
 */
/** How far into a note a strike may reach and still be read as its attack, 0..1. */
/**
 * Alien 3's kick takes three frames of a seventeen-frame bass note — 18% — and at 15% the
 * vibrato after it was still read with the kick in it.
 */
export const STRIKE_SHARE = 0.25;

/**
 * The curve without the strike it opens with, if it opens with one: a pitch
 * away from the note at its first point that comes back to it within
 * `STRIKE_SHARE` of the note. That is how a sound driver hits a note — a
 * triangle bass kicked from an octave up, a frame of a deep thump — and it is
 * timbre, not a movement of the pitch: Alien 3's vibrato on a long G3 read six
 * semitones deep with the kick in front of it, and was drawn as a curve.
 */
function withoutStrike(
  curve: readonly (readonly [number, number])[]
): readonly (readonly [number, number])[] {
  if (Math.abs(curve[0][1]) < DRIFT_LIMIT) return curve;
  const back = curve.findIndex(([, semitones]) => Math.abs(semitones) < 0.05);
  if (back <= 0 || curve[back][0] > STRIKE_SHARE) return curve;
  return curve.slice(back);
}

export function pitchEffect(
  whole: readonly (readonly [number, number])[],
  ticks: number
): PitchEffect | null {
  const curve = whole.length >= 2 ? withoutStrike(whole) : whole;
  if (curve.length < 2) return null;
  const values = curve.map(([, semitones]) => semitones);
  const peak = Math.max(...values.map(Math.abs));
  if (peak < DRIFT_LIMIT) {
    /*
     * Under half a semitone a curve is not written — unless it SWINGS. Surf City wobbles a tenth of
     * a semitone and Intermission a sixth, both audible; wookie hole's
     * and ragnarok's marks, which a looser rule also calls vibrato, are one-way drifts at the end
     * of a two-tick note and stay unwritten. Turns tell the two apart, counted against the curve's
     * OWN depth: a fixed grain either misses a tenth-of-a-semitone swing or counts a drift's jitter.
     */
    return peak >= LIGHT_VIBRATO && turnsOf(values, peak / 2) >= VIBRATO_TURNS
      ? { kind: 'vibrato', depth: peak, ticks }
      : null;
  }

  if (turnsOf(values) >= VIBRATO_TURNS) {
    const depth = Math.max(...values.map(Math.abs));
    return depth > WIDE_VIBRATO
      ? { kind: 'vibrato', depth, ticks, curve }
      : { kind: 'vibrato', depth, ticks };
  }

  const end = values[values.length - 1];
  if (Math.abs(end) < DRIFT_LIMIT) return null;
  const moving = values.findIndex((semitones) => Math.abs(semitones) >= 0.1);
  const from = curve[Math.max(0, moving - 1)][0];
  return { kind: 'slide', semitones: Math.round(end * 10) / 10, from, ticks };
}

/** The most a note's pitch may move on its own and still be a bend: a tone and a half. */
export const BEND_MAX = 3;
/** Ticks between a slide's end and the next note that still count as the slide arriving in it. */
const GLISS_GAP = 1;

/**
 * Each note's effect, read against the note AFTER it in the part.
 *
 * A curve does not say whether the pitch is sliding somewhere or bending on the
 * spot; the music around it does. A slide that ends on the pitch the very next
 * note is written at arrives in that note — a glissando, as in the title music's
 * G4 up to A4. One that goes nowhere written is the note itself bending:
 * ragnarok's canyon, pulse 1, bar 5, a D#4 pulled up 1.3 semitones and then left
 * for an A3 — a guitarist's bend, which a reader said at once, where "gliss." had
 * been printed. Past `BEND_MAX` nothing bends that far, and the sweeps of fifteen
 * to twenty-eight semitones that open a few tracks stay lines.
 *
 * Except when the note after it comes straight back to the pitch the curve left:
 * that is a bend and its release, however far it went. Clinger Winger, pulse 1,
 * an E2 pushed up six and a half semitones over four bars and then struck again
 * as E2 — a reader heard a bend where a line marked "gliss." had been drawn.
 * Across the whole ROM this reads that one note differently and no other.
 */
export function effectsOf(notes: readonly ScoreNote[]): Map<number, PitchEffect> {
  const ordered = [...notes].sort((a, b) => a.start - b.start);
  const effects = new Map<number, PitchEffect>();
  ordered.forEach((note, index) => {
    const effect = note.bend ? pitchEffect(note.bend, note.ticks) : null;
    if (!effect) return;
    if (effect.kind === 'slide') {
      const next = ordered[index + 1];
      const follows = next !== undefined && next.start - (note.start + note.ticks) <= GLISS_GAP;
      const arrives = follows && Math.abs(next.midi - (note.midi + effect.semitones)) <= 0.5;
      const returns = follows && next.midi === note.midi;
      if (!arrives && (returns || Math.abs(effect.semitones) <= BEND_MAX)) {
        effects.set(note.start, { ...effect, kind: 'bend' });
        return;
      }
      effects.set(note.start, { ...effect, arrives });
      return;
    }
    effects.set(note.start, effect);
  });
  return effects;
}

/**
 * A bend's size, in semitones, to one decimal — the arrow says which way.
 *
 * Always the number. The guitar's words (½ for a semitone, "full" for a tone)
 * were printed for sizes near a step and the number for the rest, so one page
 * said "½" over a bend of 0.9 semitones and "1.3" over the next: two systems
 * side by side, and a "½" read as half a semitone.
 */
export function bendLabel(semitones: number): string {
  return Math.abs(semitones).toFixed(1);
}

/** The pitch movement a tied piece carries on from the head of its note. */
export interface EffectCarry {
  /** Where the note starts, and the pitch it is written at. */
  start: number;
  midi: number;
  effect: PitchEffect;
}

/** A staff item, with the pitch effect of the note it is the head of. */
export type ScoreItem = StaffItem & {
  effect?: PitchEffect;
  /**
   * On a piece tied on after the head: the movement it is part of, when that movement is drawn
   * along the note — a glissando or a bend held a bar or more — so a line that runs onto the next
   * system can be carried on there and land where the note ends.
   */
  carry?: EffectCarry;
  /** On a grand staff's voice: the stave the item stands on — see `crossStaffVoice`. */
  staff?: 'treble' | 'bass';
  /** The grace notes of the note this is the head of — see `ScoreNote.grace`. */
  grace?: readonly number[];
  /** The note is leaned on — see `accentedStarts`. */
  accent?: boolean;
  /** The note is an echo — see `ScoreNote.echo`. Its head is written in brackets. */
  echo?: boolean;
  /** The note is played short — see `ScoreNote.staccato`. A dot over its head. */
  staccato?: boolean;
  /**
   * The other heads on this one's stem, struck at the same moment: on a percussion staff, drums by
   * period — a cartridge plays its noise channel and its DMC samples at once, a hat over a kick; on
   * a pitched staff, notes by MIDI number — a violin's double and triple stops.
   */
  chord?: readonly number[];
  /**
   * The APU level the note STARTS at, 0..15, as the ROM holds it — for a renderer to print under
   * the head when asked. The dynamics are a reading of these numbers in six steps, which is what a
   * player needs; the number itself is what the cartridge says, and the two answer different
   * questions. Only on a head, and only where the channel has a volume at all: the triangle has
   * none, so its notes carry nothing.
   */
  volume?: number;
  /** Its beam runs across the bar line — see `crossBarRuns`. */
  across?: 'start' | 'join';
  /** Beams are grouped by this number rather than by the beat — see `accentBeamGroups`. */
  beamGroup?: number;
};

/**
 * How much louder than BOTH its neighbours a note has to start to be written as
 * accented, in nibble steps.
 *
 * Three is the step the tracks themselves use: the driver holds a level and
 * drops or lifts the next note by 3 — ragnarok's canyon, bar 25, alternates 4
 * and 7 through the bar, and 7 against 4 is what the ear hears as the accent.
 */
export const ACCENT_STEP = 3;

/**
 * The notes a voice leans on: louder than the note before it by `ACCENT_STEP`,
 * no quieter than the note after it, and NOT on a beat.
 *
 * Off the beat is the whole point. The driver moves the volume constantly, and
 * a mark on every rise would put one under a third of the heads of some tracks
 * while saying nothing a reader cannot see from the dynamics. What a reader
 * cannot see is a voice that leans between the beats: ragnarok's canyon, bar 25,
 * plays sixteenths at 9 9 7 7 4 7 4 7 4 2 7 7 4 7 4 9 — every beat of the bar
 * but the first is a 4, and the 7s fall in the gaps. On paper that is an even
 * run of sixteenths; in the ears it is a syncopation, and accents are what make
 * the two agree.
 *
 * Read on the notes as the staff has them — after `voicePhase` has taken out a
 * channel's authored delay — or a voice written a tick late would count as
 * off the beat throughout.
 */
export function accentedStarts(
  notes: readonly ScoreNote[],
  beat = TICKS_PER_QUARTER,
  step = ACCENT_STEP
): Set<number> {
  const sounded = [...notes]
    .filter((note): note is ScoreNote & { volume: number } => note.volume !== undefined)
    .sort((a, b) => a.start - b.start);
  const starts = new Set<number>();
  sounded.forEach((note, index) => {
    const before = sounded[index - 1];
    const after = sounded[index + 1];
    if (!before || !after) return;
    if (note.start % beat === 0) return;
    if (note.volume - before.volume < step) return;
    if (note.volume < after.volume) return;
    starts.add(note.start);
  });
  return starts;
}

/**
 * Beam groups that follow the ACCENTS rather than the beat, for a passage that
 * is written in one pulse and played in another.
 *
 * Ragnarok's canyon from bar 25 is the case, and it is a case, not a rule:
 * beats 2, 3 and 4 of every bar sit at volume 4 while the notes between them
 * are at 7, so beaming by the quarter draws four even groups over a bar whose
 * weight lands in five uneven ones — 3 2 3 3 2, each beginning on a note the
 * ROM leans on. Tried as a general rule over the cartridge it made beams of 14,
 * 16 and 32 heads elsewhere (wookie hole, Arctic Caverns), which is why the
 * passage asks for it by tick.
 *
 * Numbers a group per head from `from` on: a new one at every accent, and one
 * after the bar's LOUDEST head when what follows is quieter — the figure's own
 * peak, which ends a group rather than joining the run under it. Bar 25 is the
 * one that needs the second rule: bars 26 to 28 open on the two heads a beam
 * has already carried over the bar line, while 25 opens on the same pair with
 * nothing to carry them, and without it they were swallowed by the five heads
 * up to the first accent.
 */
export function accentBeamGroups(
  bars: ScoreItem[][],
  /** The passage the rule covers, in the staff's ticks: `[from, to)`. */
  { from, to }: { from: number; to: number },
  /** Each head's volume by its start tick — the levels the groups are read from. */
  levels: ReadonlyMap<number, number>
): ScoreItem[][] {
  let group = 0;
  return bars.map((items) => {
    const within = (item: ScoreItem) => item.start >= from && item.start < to;
    const heads = items.filter((item) => item.midi !== null && within(item));
    /*
     * A voice with nothing to lean on keeps the beat. The rule has cuts only where a voice pushes,
     * and the triangle holds one level right through this passage: numbered along with the others
     * it had no cut at all, and its bar came out under a single beam from end to end.
     */
    if (!heads.some((item) => item.accent)) return items;
    const peak = Math.max(...heads.map((item) => levels.get(item.start) ?? 0), 0);
    let previous: number | null = null;
    return items.map((item) => {
      if (!within(item) || item.midi === null) return item;
      const level = levels.get(item.start);
      if (item.accent || (previous !== null && previous >= peak && (level ?? 0) < previous))
        group++;
      previous = level ?? previous;
      return { ...item, beamGroup: group };
    });
  });
}

/** The most notes a beam is carried across a bar line onto — the figure, and no more. */
export const CROSS_BAR_RUN = 4;

/**
 * Figures a bar line cuts in half: a run that starts on the bar's last note and
 * carries the same level into the next bar.
 *
 * Beams do not cross bar lines, and for good reason — the bar line is what a
 * reader counts from. The exception earns itself when the figure is plainly one
 * gesture and the bar line falls inside it: ragnarok's canyon, bars 25 to 28,
 * ends each bar on an accented E3 and opens the next with D3 E3 at the same
 * level 9, the run around it sitting at 7 and 4. Three heads, one gesture, and
 * written bar by bar it reads as a stray sixteenth and a pair.
 *
 * Narrow on purpose: the last note must be ACCENTED (see `accentedStarts`), the
 * run must be unbroken, every note must hold the same volume, and it stops after
 * `CROSS_BAR_RUN` heads. Over the whole cartridge that is three places, all of
 * them this figure. Loosened to "the level holds" alone it caught 148, some of
 * them 240 notes long — a beam over half a track.
 *
 * Returns the start tick of each note in a crossing run, mapped to its part in
 * it: the `start` is the note the beam leaves the bar on, the `join`s are the
 * heads it reaches on the other side.
 */
export function crossBarRuns(
  notes: readonly ScoreNote[],
  grid: BarGrid,
  accents: ReadonlySet<number> = accentedStarts(notes)
): Map<number, 'start' | 'join'> {
  const sounded = [...notes]
    .filter((note): note is ScoreNote & { volume: number } => note.volume !== undefined)
    .sort((a, b) => a.start - b.start);
  const runs = new Map<number, 'start' | 'join'>();
  sounded.forEach((note, index) => {
    if (note.ticks >= TICKS_PER_QUARTER || !accents.has(note.start)) return;
    const next = sounded[index + 1];
    if (!next || next.start !== note.start + note.ticks) return;
    if (barAt(grid, next.start) === barAt(grid, note.start)) return;
    if (next.volume !== note.volume) return;
    const chain: ScoreNote[] = [note];
    for (let at = index + 1; at < sounded.length && chain.length < CROSS_BAR_RUN; at++) {
      const head = sounded[at];
      const before = chain[chain.length - 1];
      if (head.start !== before.start + before.ticks || head.volume !== note.volume) break;
      chain.push(head);
    }
    if (chain.length < 2) return;
    runs.set(note.start, 'start');
    for (const head of chain.slice(1)) runs.set(head.start, 'join');
  });
  return runs;
}

/** Whether an effect is drawn along its note — and so has to carry on where the note does. */
export function drawnAlong(effect: PitchEffect, measureTicks = MEASURE_TICKS): boolean {
  return (
    effect.kind === 'slide' ||
    (effect.kind === 'bend' && effect.ticks >= measureTicks) ||
    (effect.kind === 'vibrato' && effect.curve !== undefined)
  );
}

/**
 * Puts what each note carries on its HEAD — the first piece of it, never a
 * piece tied on after a bar line, which would mark one note twice: its effect,
 * grace notes, accent, echo, level, and its part in a beam across the bar line.
 * The pieces tied on after a head get a `carry` instead, when the effect is
 * drawn along the note.
 *
 * In place, and in one walk: the bars are the ones `buildScore` has just made,
 * and copying every head once for each thing it might carry was a fifth of the
 * time a score took to work out. The marks go on in the order above, so a
 * head's fields read the same whichever of them it has.
 */
function attachHeads(
  bars: StaffItem[][],
  marks: {
    effects?: ReadonlyMap<number, PitchEffect>;
    graces?: ReadonlyMap<number, readonly number[]>;
    accents?: ReadonlySet<number>;
    echoes?: ReadonlySet<number>;
    levels?: ReadonlyMap<number, number>;
    across?: ReadonlyMap<number, 'start' | 'join'>;
    staccatos?: ReadonlySet<number>;
    chords?: ReadonlyMap<number, readonly number[]>;
  }
): ScoreItem[][] {
  const effects = marks.effects?.size ? marks.effects : null;
  const graces = marks.graces?.size ? marks.graces : null;
  const accents = marks.accents?.size ? marks.accents : null;
  const echoes = marks.echoes?.size ? marks.echoes : null;
  const levels = marks.levels?.size ? marks.levels : null;
  const across = marks.across?.size ? marks.across : null;
  const staccatos = marks.staccatos?.size ? marks.staccatos : null;
  const chords = marks.chords?.size ? marks.chords : null;
  if (!effects && !graces && !accents && !echoes && !levels && !across && !staccatos && !chords) {
    return bars;
  }
  let active: EffectCarry | null = null;
  for (const items of bars) {
    for (const plain of items) {
      const item = plain as ScoreItem;
      const head = item.midi !== null && !item.tieStop;
      if (effects) {
        if (head && effects.has(item.start)) {
          const effect = effects.get(item.start)!;
          active = drawnAlong(effect) ? { start: item.start, midi: item.midi!, effect } : null;
          item.effect = effect;
        } else if (active && item.tieStop && item.midi === active.midi) {
          item.carry = active;
        } else if (!item.tieStop) {
          active = null;
        }
      }
      if (!head) continue;
      if (graces?.has(item.start)) item.grace = graces.get(item.start);
      if (accents?.has(item.start)) item.accent = true;
      if (echoes?.has(item.start)) item.echo = true;
      if (levels?.has(item.start)) item.volume = levels.get(item.start);
      if (across?.has(item.start)) item.across = across.get(item.start);
      if (staccatos?.has(item.start)) item.staccato = true;
      if (chords?.has(item.start)) item.chord = chords.get(item.start);
    }
  }
  return bars;
}

/** Each note's own APU level by where it starts — what `attachHeads` puts on its head. */
function levelsOf(notes: readonly { start: number; volume?: number }[]): Map<number, number> {
  const levels = new Map<number, number>();
  for (const note of notes) if (note.volume !== undefined) levels.set(note.start, note.volume);
  return levels;
}

/** A noise hit: when, for how long, and which `$400E` period. */
export interface ScoreHit {
  start: number;
  ticks: number;
  period: number;
  /** The APU level the hit starts at, 0..15 — see `ScoreItem.volume`. */
  volume?: number;
}

export type ScoreStaveKind = 'treble' | 'bass' | 'percussion';

export interface ScoreStave {
  partId: string;
  kind: ScoreStaveKind;
  /**
   * One list of items per bar. Filled to the bar line — except on a grand
   * staff, where it is only what stands on THIS stave, for the layout.
   */
  bars: ScoreItem[][];
  /** On a grand staff's upper stave: the part's whole voice, filled to the bar line, drawn across both. */
  voiceBars?: ScoreItem[][];
  /** On a grand staff's lower stave: its notes belong to the voice of the stave above. */
  follows?: boolean;
}

export interface ScoreModel {
  /** Ticks added to the piece's clock to get the score's — see `staffShift`. */
  shift: number;
  /** Where the bar lines fall: the metre, and the opening bar's own length. */
  grid: BarGrid;
  barCount: number;
  staves: ScoreStave[];
  /** Each part's marks, in the SCORE's ticks. */
  dynamics: Record<string, DynamicMark[]>;
  /**
   * Each part's own delay taken out (`voicePhase`), in ticks: its notes sit
   * this much EARLIER on the staff than on the piece's clock. Anything that
   * compares a staff tick with the piece's — hiding what has not been read
   * yet — has to take it out too.
   */
  phases: Record<string, number>;
}

/** Where a piece changes key: the tick the new key starts on, and its VexFlow name. */
export interface KeyChange {
  /** In the PIECE's ticks, as the ROM holds them. */
  tick: number;
  key: string;
}

/**
 * The key each bar of a score is written in.
 *
 * A change takes effect from the bar its tick falls in — the tick is moved onto
 * the staff's clock by `shift` first — so it stays with the music when the bar
 * line or the metre is read differently. Volkmire's Inferno Race turns from D
 * minor to D major on tick 870, which is bar 29 of its 2/4 score.
 */
export function barKeys(
  barCount: number,
  shift: number,
  grid: BarGrid,
  opening: string,
  changes: readonly KeyChange[] = []
): string[] {
  const names = Array.from({ length: barCount }, () => opening);
  for (const change of changes) {
    const from = Math.max(0, barAt(grid, change.tick + shift));
    for (let bar = from; bar < names.length; bar++) names[bar] = change.key;
  }
  return names;
}

/** The part id the percussion staff carries. */
export const DRUMS_PART = 'drums';

/** How a score is barred and read — everything `buildScore` takes beyond the notes. */
export interface ScoreOptions {
  /** The tick the bar lines are counted from. Default 0. */
  offset?: number;
  /** Ticks in a bar: 64 is 4/4, 32 is 2/4. Default `MEASURE_TICKS`. */
  measureTicks?: number;
  /**
   * Write the pickup as part of the opening bar rather than in a bar of its own.
   *
   * The music then starts on the score's first tick, and the opening bar is as
   * much longer than the metre as the pickup is — one bar of 19/32 in front of
   * Volkmire's Inferno Race's 2/4, instead of a bar of rests with the run in it.
   */
  mergePickup?: boolean;
  /**
   * The passage read by its accents: the only place accents are marked (`accentedStarts`), and
   * where the beams follow them rather than the beat (`accentBeamGroups`). None given, no accents.
   * In the PIECE's ticks, like everything a caller gives; `shift` moves it onto the staff's clock.
   */
  accentBeams?: { from: number; to: number };
  /** Bars later in the piece with a length of their own — see `BarGrid`. */
  oddBars?: readonly OddBar[];
  /**
   * Take a part's own delay of up to `MAX_PHASE` ticks out (`voicePhase`). Default true: a sound
   * driver delays a channel a tick or two on purpose, and the staff writes it on the beat. Music
   * that is already on its beat — a MIDI file — wants it off, or a voice is moved off the beat it
   * keeps.
   */
  alignVoices?: boolean;
}

/**
 * The whole score, worked out once.
 *
 * `options.offset` is the tick the bar lines are counted from and
 * `options.measureTicks` the length of a bar; any other notation view of the
 * same piece should use the same two, so they all bar the music the same way.
 */
export function buildScore(
  parts: readonly {
    id: string;
    notes: readonly ScoreNote[];
    /** Which staves, when the caller decides rather than the notes (`partStaves`). */
    staves?: readonly ('treble' | 'bass')[];
  }[],
  drums: readonly ScoreHit[],
  totalTicks: number,
  {
    offset = 0,
    measureTicks = MEASURE_TICKS,
    mergePickup = false,
    accentBeams,
    oddBars = [],
    alignVoices = true,
  }: ScoreOptions = {}
): ScoreModel {
  const { grid, shift } = barring(offset, measureTicks, mergePickup, oddBars);
  const end = totalTicks + shift;
  const barCount = barCountOf(grid, end);
  const barsOf = (notes: readonly TickNote[]) =>
    staffMeasures(staffItems(notes, end, grid), end, grid).map((bar) => bar.items);
  const phases: Record<string, number> = {};
  const moved = <T extends TickNote>(notes: readonly T[], id?: string): T[] => {
    const phase = alignVoices && notes.length > 0 ? voicePhase(notes, offset, measureTicks) : 0;
    if (id !== undefined) phases[id] = phase;
    return shiftNotes(notes, shift - phase);
  };

  const staves: ScoreStave[] = [];
  const dynamics: Record<string, DynamicMark[]> = {};

  for (const part of parts) {
    /*
     * Notes struck together are one head with a chord on its stem: the highest — the line a
     * reader follows — is the head the rhythm, the staff and the marks are read from, and it
     * holds as long as the longest of them. A part with one note at a time is untouched.
     */
    const together = new Map<number, ScoreNote[]>();
    for (const note of part.notes)
      together.set(note.start, [...(together.get(note.start) ?? []), note]);
    const groups = [...together.values()];
    const leads = groups.map((group) =>
      group.length === 1
        ? group[0]
        : {
            ...group.reduce((top, note) => (note.midi > top.midi ? note : top)),
            ticks: Math.max(...group.map((note) => note.ticks)),
          }
    );
    const notes = moved(leads, part.id);
    const pitchChords = new Map<number, number[]>();
    groups.forEach((group, index) => {
      if (group.length < 2) return;
      const others = [...new Set(group.map((note) => note.midi))]
        .filter((midi) => midi !== leads[index].midi)
        .sort((a, b) => a - b);
      if (others.length) pitchChords.set(notes[index].start, others);
    });
    const range = pitchChords.size
      ? [...notes, ...[...pitchChords.values()].flat().map((midi) => ({ midi }))]
      : notes;
    const kinds = part.staves ? [...part.staves] : partStaves(range);
    // Read over the whole part: the note after a slide may be on the other staff.
    const effects = effectsOf(notes);
    /*
     * Accents only inside the passage read by its accents (`accentBeams`) — a
     * reading by ear, made for ragnarok's canyon, bars 25 to 28. Let loose over
     * the cartridge the rule marked every loud note off the beat, and Arctic
     * Caverns' echo — every second note far quieter than the one before, an
     * imitation of an echo — came out as a column of accents it does not have.
     */
    const accents = accentBeams
      ? new Set(
          [...accentedStarts(notes)].filter(
            (start) => start >= accentBeams.from + shift && start < accentBeams.to + shift
          )
        )
      : new Set<number>();
    const across = crossBarRuns(notes, grid, accents);
    const heads = () => {
      const written = attachHeads(barsOf(notes), {
        effects,
        graces: new Map(
          notes.filter((note) => note.grace?.length).map((note) => [note.start, note.grace!])
        ),
        accents,
        echoes: new Set(notes.filter((note) => note.echo).map((note) => note.start)),
        levels: levelsOf(notes),
        across,
        staccatos: new Set(notes.filter((note) => note.staccato).map((note) => note.start)),
        chords: pitchChords,
      });
      if (!accentBeams) return written;
      return accentBeamGroups(
        written,
        { from: accentBeams.from + shift, to: accentBeams.to + shift },
        levelsOf(notes)
      );
    };
    if (kinds.length === 1) {
      staves.push({ partId: part.id, kind: kinds[0], bars: heads() });
    } else {
      const voice = crossStaffVoice(heads());
      const on = (staff: 'treble' | 'bass') =>
        voice.map((items) => items.filter((item) => item.staff === staff));
      staves.push({
        partId: part.id,
        kind: 'treble',
        bars: on('treble'),
        voiceBars: voice,
      });
      staves.push({
        partId: part.id,
        kind: 'bass',
        bars: on('bass'),
        follows: true,
      });
    }
    const loud = notes.filter(
      (note): note is ScoreNote & { volume: number } => note.volume !== undefined
    );
    dynamics[part.id] = dynamicMarks(loud);
  }

  if (drums.length > 0) {
    /*
     * Hits at the same moment are one chord: the longest is the head the staff's rhythm is
     * written from, the others stand on its stem. A staff of one voice wrote them one after
     * another, and every hat over a kick pushed the rest of the bar a value late.
     */
    const groups = new Map<number, ScoreHit[]>();
    for (const hit of drums) groups.set(hit.start, [...(groups.get(hit.start) ?? []), hit]);
    const leads = [...groups.values()].map((group) =>
      group.reduce((longest, hit) => (hit.ticks > longest.ticks ? hit : longest))
    );
    const others = [...groups.values()].map((group, index) => [
      ...new Set(
        group
          .filter((hit) => hit !== leads[index])
          .map((hit) => hit.period & 0x0f)
          .filter((period) => period !== (leads[index].period & 0x0f))
      ),
    ]);
    const hits = moved(
      leads.map((hit) => ({
        start: hit.start,
        ticks: hit.ticks,
        midi: hit.period & 0x0f,
        volume: hit.volume,
      }))
    );
    const chords = new Map<number, number[]>();
    hits.forEach((hit, index) => {
      if (others[index]?.length) chords.set(hit.start, others[index]);
    });
    /*
     * A drum is struck once. What is left of its slot after the first head —
     * the rest of a long value, or the part carried over a bar line — is
     * written as rest: tied on a percussion staff it reads as a roll, and as a
     * second head it reads as a second hit.
     */
    const bars = attachHeads(
      barsOf(hits).map((items) =>
        items.map((item) =>
          item.tieStop
            ? { ...item, midi: null, tieStart: false, tieStop: false }
            : { ...item, tieStart: false }
        )
      ),
      { levels: levelsOf(hits), chords }
    );
    staves.push({ partId: DRUMS_PART, kind: 'percussion', bars });
  }

  return { shift, grid, barCount, staves, dynamics, phases };
}
