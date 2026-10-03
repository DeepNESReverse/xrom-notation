/**
 * Ticks read as NOTATION: note values, dots, ties and bar lines.
 *
 * Nothing here quantises, because nothing has to: one tick is exactly a
 * sixty-fourth note (a sixteenth of a quarter), so every note given already
 * sits on the grid notation is written on. That is what makes music read out
 * of a game cartridge writable at all — the usual failure of notation built
 * from MIDI is a performance that lands a few milliseconds off the beat, and
 * a sound driver gives no performance, only the integers it counts. Anything
 * else has to be quantised to sixty-fourths before it comes here.
 *
 * The rules were made on Battletoads (NES), whose driver counts in exactly
 * these ticks, and checked by ear on its twenty tracks; the examples in these
 * comments are the bars that decided them.
 *
 * Durations come out as VexFlow codes (`w h q 8 16 32 64`), pitches as VexFlow
 * keys (`c#/4`) — the shortest names there are, and what a renderer reads.
 */

/** Engine ticks in a quarter note. The driver's own grid, not a choice. */
export const TICKS_PER_QUARTER = 16;
export const BEATS_PER_MEASURE = 4;
/**
 * A bar of 4/4, which is what all but one track is written in and what every
 * caller gets by default.
 *
 * Not a constant of the music: Volkmire's Inferno Race is in 2/4, and its
 * sections — the change to D major among them — start on odd multiples of half
 * a 4/4 bar, so no 64-tick bar line can hold them. So everything here takes the
 * bar length it is barring to, and `MEASURE_TICKS` is only the default.
 */
export const MEASURE_TICKS = TICKS_PER_QUARTER * BEATS_PER_MEASURE;
/** Quarters in a bar of `measureTicks` ticks. */
export const beatsIn = (measureTicks: number): number => measureTicks / TICKS_PER_QUARTER;

/**
 * A bar of so many ticks as a time signature.
 *
 * In the note value that measures it WHOLE: 64 ticks are 4/4 and 32 are 2/4,
 * but an opening bar of 38 is no number of quarters — it is 19 thirty-seconds,
 * and 19/32 is what a reader is shown.
 */
export function timeSignatureOf(
  measureTicks: number,
  /**
   * The note value a bar is counted in, when the reading names one: 2 writes a
   * bar of 128 ticks as 4/2 rather than 8/4. Left out — or not dividing the bar,
   * as an opening bar of its own length may not — it is chosen as below.
   */
  beatValue?: number
): { beats: number; beatValue: number } {
  if (beatValue) {
    const beat = (TICKS_PER_QUARTER * 4) / beatValue;
    if (Number.isInteger(beat) && measureTicks % beat === 0) {
      return { beats: measureTicks / beat, beatValue };
    }
  }
  for (const beatValue of [4, 8, 16, 32, 64] as const) {
    const beat = (TICKS_PER_QUARTER * 4) / beatValue;
    if (measureTicks % beat === 0) return { beats: measureTicks / beat, beatValue };
  }
  return { beats: measureTicks, beatValue: 64 };
}

/**
 * Where the bar lines of a piece fall: every bar `measureTicks` long, except
 * the first.
 *
 * The opening bar has its own length because a pickup written as a bar of rests
 * is a lie about the music: Volkmire's Inferno Race opens with a run and a held
 * note that together are six ticks longer than two of its 2/4 bars, and a
 * reader meets that as one bar of 19/32 and then 2/4 throughout, rather than as
 * a bar of rests, a bar line through the run, and a note tied over it.
 *
 * `firstBarTicks` equal to `measureTicks` is the ordinary case, and then the
 * grid is the plain multiples every other piece uses.
 *
 * `oddBars` are bars later in the piece with a length of their own — a bar of
 * 2/4 in a piece in 4/4. Arctic Caverns has one: after six bars of 4/4 the bass
 * runs up E F# G A B C D E in 32 ticks, and everything after that run, every
 * section and the loop's end, sits half a bar past the 4/4 grid.
 */
export interface BarGrid {
  measureTicks: number;
  firstBarTicks: number;
  /** Bars after the first with their own length, by bar index, in order. */
  oddBars?: readonly OddBar[];
}

/** A bar after the first whose length is not the metre's — see `BarGrid`. */
export interface OddBar {
  /** The bar's index, from 0 — never the first bar, which has `firstBarTicks`. */
  bar: number;
  ticks: number;
}

export const barGrid = (
  measureTicks = MEASURE_TICKS,
  firstBarTicks = measureTicks,
  oddBars: readonly OddBar[] = []
): BarGrid => ({
  measureTicks,
  firstBarTicks,
  ...(oddBars.length ? { oddBars: [...oddBars].sort((a, b) => a.bar - b.bar) } : {}),
});

const oddBarsOf = (grid: BarGrid): readonly OddBar[] =>
  (grid.oddBars ?? []).filter((odd) => odd.bar >= 1);

/** The tick a bar begins on. */
export const barStartOf = (grid: BarGrid, index: number): number => {
  if (index <= 0) return 0;
  let start = grid.firstBarTicks + (index - 1) * grid.measureTicks;
  for (const odd of oddBarsOf(grid)) {
    if (odd.bar >= index) break;
    start += odd.ticks - grid.measureTicks;
  }
  return start;
};

/** How long a bar is: the first and any odd bar have their own length, the rest the metre's. */
export const barTicksOf = (grid: BarGrid, index: number): number =>
  index === 0
    ? grid.firstBarTicks
    : (oddBarsOf(grid).find((odd) => odd.bar === index)?.ticks ?? grid.measureTicks);

/** Which bar a tick falls in. Ticks before the piece belong to its first bar. */
export const barAt = (grid: BarGrid, tick: number): number => {
  if (tick < grid.firstBarTicks) return 0;
  let bar = 1;
  let start = grid.firstBarTicks;
  for (const odd of oddBarsOf(grid)) {
    const oddStart = start + (odd.bar - bar) * grid.measureTicks;
    if (tick < oddStart) break;
    if (tick < oddStart + odd.ticks) return odd.bar;
    bar = odd.bar + 1;
    start = oddStart + odd.ticks;
  }
  return bar + Math.floor((tick - start) / grid.measureTicks);
};

/** How many bars a piece of `totalTicks` takes, the last one counted however little it holds. */
export const barCountOf = (grid: BarGrid, totalTicks: number): number =>
  totalTicks <= grid.firstBarTicks ? 1 : barAt(grid, totalTicks - 1) + 1;

/** One writable note value: how long it is, what it is called, how many dots. */
export interface NoteValue {
  ticks: number;
  /** VexFlow duration code. */
  duration: string;
  dots: number;
}

/** Longest first — `decompose` takes the first that fits its own grid. */
const VALUES: readonly NoteValue[] = [
  { ticks: 64, duration: 'w', dots: 0 },
  { ticks: 56, duration: 'h', dots: 2 },
  { ticks: 48, duration: 'h', dots: 1 },
  { ticks: 32, duration: 'h', dots: 0 },
  { ticks: 28, duration: 'q', dots: 2 },
  { ticks: 24, duration: 'q', dots: 1 },
  { ticks: 16, duration: 'q', dots: 0 },
  { ticks: 14, duration: '8', dots: 2 },
  { ticks: 12, duration: '8', dots: 1 },
  { ticks: 8, duration: '8', dots: 0 },
  // Seven ticks are one head, not a dotted sixteenth tied to a sixty-fourth: Level Complete, pulse 2,
  // where the two heads stood so close the tie vanished and one B3 read as struck twice.
  { ticks: 7, duration: '16', dots: 2 },
  { ticks: 6, duration: '16', dots: 1 },
  { ticks: 4, duration: '16', dots: 0 },
  { ticks: 3, duration: '32', dots: 1 },
  { ticks: 2, duration: '32', dots: 0 },
  { ticks: 1, duration: '64', dots: 0 },
];

/** What one written head costs. Dominates everything else: a tie is the ugliest thing on a staff. */
const PIECE_COST = 100;
/** A value begun off its own grid — a syncopation. Worth avoiding, never worth a tie. */
const OFF_GRID_COST = 10;
/** A value that hides beat three, the middle of a 4/4 bar. The last tie-break. */
const HIDES_MIDDLE_COST = 1;

function pieceCost(value: NoteValue, pos: number, measureTicks: number): number {
  // A dotted value sits on the grid of the value it dots: two thirds of its length with one dot,
  // four sevenths with two.
  const grid = (value.ticks * 2 ** value.dots) / (2 ** (value.dots + 1) - 1);
  const half = measureTicks / 2;
  const hidesMiddle = pos % measureTicks !== 0 && pos < half && pos + value.ticks > half;
  return (
    PIECE_COST + (pos % grid === 0 ? 0 : OFF_GRID_COST) + (hidesMiddle ? HIDES_MIDDLE_COST : 0)
  );
}

interface Spelling {
  cost: number;
  pieces: NoteValue[];
  /** Heads begun off their own grid. */
  offGrid: number;
}

const decomposeCache = new Map<number, Spelling>();

/**
 * A length as a sum of writable note values, from a position in the bar.
 *
 * The FEWEST heads, and only then the tidiest. The first version was greedy and
 * took a value only when it started on its own grid, which reads well in a
 * rulebook and terribly on a staff: four ticks from the second thirty-second of
 * a beat came out as a dotted thirty-second tied to a sixty-fourth — a
 * sixteenth written as two heads, which nobody writes. Here the head count is
 * minimised outright (a sixteenth begun off the beat is a syncopation, and a
 * syncopation is one head), and starting on the grid and keeping beat three
 * visible only break ties between spellings with the same count.
 */
export function decompose(
  position: number,
  length: number,
  measureTicks = MEASURE_TICKS
): NoteValue[] {
  return solve(
    ((position % measureTicks) + measureTicks) % measureTicks,
    length,
    measureTicks
  ).pieces.slice();
}

function solve(pos: number, left: number, measureTicks: number): Spelling {
  if (left <= 0) return { cost: 0, pieces: [], offGrid: 0 };
  const key = (measureTicks * 4096 + pos) * 4096 + left;
  const cached = decomposeCache.get(key);
  if (cached) return cached;

  let best: Spelling | null = null;
  // Longest first, and only a strictly cheaper spelling replaces one found
  // earlier — so among equals the long value comes first.
  for (const value of VALUES) {
    if (value.ticks > left) continue;
    const rest = solve((pos + value.ticks) % measureTicks, left - value.ticks, measureTicks);
    const own = pieceCost(value, pos, measureTicks);
    const cost = own + rest.cost;
    if (!best || cost < best.cost) {
      const offGrid = rest.offGrid + (own - PIECE_COST >= OFF_GRID_COST ? 1 : 0);
      best = { cost, pieces: [value, ...rest.pieces], offGrid };
    }
  }
  decomposeCache.set(key, best!);
  return best!;
}

/** A note of one voice, in the integers the ROM holds. */
export interface TickNote {
  /** Ticks from the start of the piece. */
  start: number;
  ticks: number;
  /** MIDI number. */
  midi: number;
}

/**
 * One head of a tuplet: three notes written in the time of two.
 *
 * `num` heads in the time of `occupied`, and the bracket is drawn over the run
 * from `first` to `last` — VexFlow needs the group, not the single head.
 */
export interface TupletSpan {
  num: number;
  occupied: number;
  first: boolean;
  last: boolean;
}

/** One head or rest on the staff — already a writable value. */
export interface StaffItem {
  start: number;
  ticks: number;
  /** null is a rest. */
  midi: number | null;
  duration: string;
  dots: number;
  /** Set on each head of a tuplet — see `tupletGroups`. */
  tuplet?: TupletSpan;
  /**
   * Still the same sounding note as the head before it / after it.
   *
   * A tie is the difference between one note and two, and one crossing a bar
   * line is drawn as two half curves that meet at it.
   */
  tieStart: boolean;
  tieStop: boolean;
}

export interface StaffMeasure {
  /** Bar number from the start of the piece, counting from 0. */
  index: number;
  /** Tick the bar starts on. */
  start: number;
  items: StaffItem[];
}

/**
 * A voice's notes as a continuous ribbon: rests where it is silent, cut at
 * every bar line, and every piece already a writable value.
 *
 * Monophonic by construction — the driver walks one stream per channel — so an
 * overlap can only mean the previous note is still counted as sounding, and the
 * cursor simply moves on rather than stacking a chord that the hardware cannot
 * play.
 */
/**
 * The divisions a tuplet may fill: a written value, so the bracket spans
 * something a reader can name. Three heads in the time of two.
 */
const TUPLET_TOTALS = [8, 16, 32, 64];

/** One head of a tuplet, with the value it is written as. */
interface TupletHead {
  span: TupletSpan;
  value: NoteValue;
}

/**
 * Where the music divides a written value into THREE.
 *
 * One tick is a sixty-fourth, so a third of anything is not a whole number and
 * the driver cannot hold a true triplet: it writes the nearest integers it can,
 * and the give-away is a run of three that sums to a written value and divides
 * as evenly as integers allow without dividing evenly. A quarter triplet is
 * 10+11+11 of the half's 32 ticks; a sixteenth triplet is 2+3+3 of the
 * eighth's 8. Spelt by `decompose` instead, each of those becomes two heads
 * under a tie, and a bar of them is unreadable — which is how this was found.
 *
 * The rule is deliberately narrow, and it is checked against the ROM rather
 * than reasoned about: over all twenty tracks it fires exactly twice — title
 * music's bar 39, where pulse 1, pulse 2, the triangle and the drums all take
 * it together, and Clinger Winger's drums, once a bar for five bars. Nothing
 * else in the cartridge matches, so nothing else is re-spelt.
 *
 * Even thirds are NOT tuplets: three heads of the same written value need no
 * bracket, and the ROM has none inside these totals anyway.
 */
export function tupletGroups(
  notes: readonly TickNote[],
  grid: BarGrid = barGrid()
): Map<number, TupletHead> {
  const out = new Map<number, TupletHead>();
  for (let at = 0; at + 2 < notes.length; at++) {
    const run = notes.slice(at, at + 3);
    const ticks = run[0].ticks + run[1].ticks + run[2].ticks;
    if (!TUPLET_TOTALS.includes(ticks)) continue;
    // Adjacent, and inside one bar: a bracket cannot cross a bar line.
    if (
      run.some(
        (note, index) => index > 0 && run[index - 1].start + run[index - 1].ticks !== note.start
      )
    )
      continue;
    const bar = barAt(grid, run[0].start);
    if (run[0].start - barStartOf(grid, bar) > barTicksOf(grid, bar) - ticks) continue;
    const lengths = run.map((note) => note.ticks);
    if (Math.max(...lengths) - Math.min(...lengths) > 1) continue;
    if (lengths.some((length) => length * 3 === ticks)) continue;
    // Three in the time of two, so each head is written as half the division.
    const value = VALUES.find((candidate) => candidate.ticks === ticks / 2 && candidate.dots === 0);
    if (!value) continue;
    run.forEach((_, index) =>
      out.set(at + index, {
        value,
        span: { num: 3, occupied: 2, first: index === 0, last: index === 2 },
      })
    );
    at += 2;
  }
  return out;
}

/** Spans an exact tuplet may fill, in ticks: a sixteenth to a whole note. */
const TUPLET_SPANS = [4, 8, 16, 32, 64];
/** How many notes a tuplet may divide its span into — every count that is not a power of two. */
const TUPLET_COUNTS = [3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
/** How close a start must be to a tuplet's grid, in ticks, to stand on it. */
const ON_GRID = 1e-6;

/** The notes a tuplet of `num` is written in the time of: the largest power of two below it. */
export const tupletOccupied = (num: number): number => 2 ** Math.floor(Math.log2(num - 1e-9));

/** One exact tuplet run: notes `from`..`to` (exclusive) of the ordered list, and its items. */
interface TupletRun {
  to: number;
  start: number;
  span: number;
  items: StaffItem[];
}

const near = (value: number) => Math.abs(value - Math.round(value)) < ON_GRID;

/**
 * Tuplets of any count, read from notes whose starts and ends divide a written value exactly.
 *
 * A sound driver counts whole ticks, and its triplets are 10 + 11 + 11 (`tupletGroups`). Music from
 * anywhere else can say what it means: five notes from 0 to 16, each 3.2 ticks — a quintuplet of
 * sixteenths in a quarter. A run is read as a tuplet of `num` in the time of `tupletOccupied(num)`
 * when every start and end in it falls on its grid of `span / num`, the run fills `span` from a
 * point that span may start on, and at least one of its edges is off the grid of whole ticks — so a
 * line of ordinary values is never re-read. Inside, notes may be any whole number of the grid's
 * steps — a quarter and an eighth in an eighth triplet — and the steps no note takes are rests.
 *
 * Whole-tick music never has one: no span here divides by three, five or seven into whole ticks.
 */
function exactTuplets(notes: readonly TickNote[], grid: BarGrid): Map<number, TupletRun> {
  const runs = new Map<number, TupletRun>();
  for (let from = 0; from < notes.length; from++) {
    const begin = notes[from].start;
    const bar = barAt(grid, begin + ON_GRID);
    const barStart = barStartOf(grid, bar);
    const barEnd = barStart + barTicksOf(grid, bar);
    let found: TupletRun | null = null;
    for (const span of TUPLET_SPANS) {
      if (found) break;
      // On the grid the span itself keeps — a beat for anything a beat or longer.
      const step = Math.min(span, TICKS_PER_QUARTER);
      for (let start = Math.floor((begin - barStart) / step) * step + barStart; start <= begin + ON_GRID && !found; start += step) {
        if (start + span > barEnd + ON_GRID) break;
        for (const num of TUPLET_COUNTS) {
          const unit = span / num;
          const run: TickNote[] = [];
          for (let j = from; j < notes.length && notes[j].start < start + span - ON_GRID; j++) run.push(notes[j]);
          if (!run.length || Math.abs(run[0].start - begin) > ON_GRID) continue;
          // An earlier note that reaches into the span leaves it no clean start.
          if (from > 0 && notes[from - 1].start + notes[from - 1].ticks > start + ON_GRID) continue;
          const steps = run.map((note) => [(note.start - start) / unit, (note.start + note.ticks - start) / unit]);
          if (!steps.every(([a, b]) => near(a) && near(b) && b <= num + ON_GRID && a >= -ON_GRID)) continue;
          const edges = run.flatMap((note) => [note.start, note.start + note.ticks]);
          if (edges.every((edge) => near(edge))) continue;
          // The pieces: notes and the steps between them, each a value one head writes.
          const occupied = tupletOccupied(num);
          const written = span / occupied;
          const pieces: { from: number; length: number; midi: number | null; at?: number }[] = [];
          let at = 0;
          for (let k = 0; k < run.length; k++) {
            const a = Math.round(steps[k][0]);
            const b = Math.round(steps[k][1]);
            if (a < at) break;
            if (a > at) pieces.push({ from: at, length: a - at, midi: null });
            pieces.push({ from: a, length: b - a, midi: run[k].midi, at: run[k].start });
            at = b;
          }
          if (at < num) pieces.push({ from: at, length: num - at, midi: null });
          const values = pieces.map((piece) =>
            VALUES.find((value) => Math.abs(value.ticks - piece.length * written) < ON_GRID)
          );
          if (pieces.reduce((sum, piece) => sum + piece.length, 0) !== num || values.some((value) => !value)) continue;
          // Each piece from where it starts — a note's own start, so its marks find it — to the next.
          const starts = pieces.map((piece, index) =>
            piece.at !== undefined ? piece.at : index === 0 ? start : start + Math.round(piece.from * unit * 1e9) / 1e9
          );
          const items = pieces.map((piece, index): StaffItem => {
            const pieceStart = starts[index];
            const pieceEnd = index + 1 < pieces.length ? starts[index + 1] : start + span;
            return {
              start: pieceStart,
              ticks: pieceEnd - pieceStart,
              midi: piece.midi,
              duration: values[index]!.duration,
              dots: values[index]!.dots,
              tieStart: false,
              tieStop: false,
              tuplet: { num, occupied, first: index === 0, last: index === pieces.length - 1 },
            };
          });
          found = { to: from + run.length, start, span, items };
          break;
        }
      }
    }
    if (found) {
      runs.set(from, found);
      from = found.to - 1;
    }
  }
  return runs;
}

/**
 * The exact tuplets, a run on the same grid that carries on to the beat read as one: two
 * sixteenth triplets that fill a quarter are a sextuplet, as a reader writes six in a beat. Not
 * past the beat — twelve in a half is four triplets.
 */
function exactTupletsByBeat(notes: readonly TickNote[], grid: BarGrid): Map<number, TupletRun> {
  const runs = exactTuplets(notes, grid);
  const merged = new Map<number, TupletRun>();
  const ordered = [...runs.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < ordered.length; i++) {
    const [from, run] = ordered[i];
    const next = ordered[i + 1];
    const num = run.items[0].tuplet!.num;
    const double = num * 2;
    if (
      next &&
      run.span * 2 <= TICKS_PER_QUARTER &&
      (run.start - barStartOf(grid, barAt(grid, run.start + ON_GRID))) % (run.span * 2) === 0 &&
      TUPLET_COUNTS.includes(double) &&
      next[0] === run.to &&
      Math.abs(next[1].start - (run.start + run.span)) < ON_GRID &&
      next[1].span === run.span &&
      next[1].items[0].tuplet!.num === num
    ) {
      const items = [...run.items, ...next[1].items].map((item, index, all) => ({
        ...item,
        tuplet: { num: double, occupied: tupletOccupied(double), first: index === 0, last: index === all.length - 1 },
      }));
      // The written value stays: the bracket counts the same steps, twice as many of them.
      merged.set(from, { to: next[1].to, start: run.start, span: run.span * 2, items });
      i++;
      continue;
    }
    merged.set(from, run);
  }
  return merged;
}

export function staffItems(
  notes: readonly TickNote[],
  totalTicks: number,
  grid: BarGrid = barGrid()
): StaffItem[] {
  const items: StaffItem[] = [];
  const ordered = [...notes].sort((a, b) => a.start - b.start);
  let cursor = 0;

  const push = (start: number, length: number, midi: number | null) => {
    let position = start;
    let left = length;
    let first = true;
    while (left > 0) {
      const bar = barAt(grid, position);
      const barStart = barStartOf(grid, bar);
      const barTicks = barTicksOf(grid, bar);
      const chunk = Math.min(left, barStart + barTicks - position);
      const carriesOn = chunk < left;

      const pieces = decompose(position - barStart, chunk, barTicks);
      let at = position;
      pieces.forEach((piece, index) => {
        items.push({
          start: at,
          ticks: piece.ticks,
          midi,
          duration: piece.duration,
          dots: piece.dots,
          // A head is tied to the one before it when it is a continuation:
          // of an earlier bar's remainder, or of the piece beside it.
          tieStop: midi !== null && (!first || index > 0),
          tieStart: midi !== null && (carriesOn || index < pieces.length - 1),
        });
        at += piece.ticks;
      });

      position += chunk;
      left -= chunk;
      first = false;
    }
  };

  const tuplets = tupletGroups(ordered, grid);
  // Exact tuplets only where some note is off the whole-tick grid: whole-tick music has none.
  const exact = ordered.some((note) => !Number.isInteger(note.start) || !Number.isInteger(note.ticks))
    ? exactTupletsByBeat(ordered, grid)
    : null;
  let skipTo = -1;

  ordered.forEach((note, index) => {
    if (index < skipTo) return;
    const run = exact?.get(index);
    if (run) {
      if (run.start > cursor) push(cursor, run.start - cursor, null);
      items.push(...run.items);
      cursor = run.start + run.span;
      skipTo = run.to;
      return;
    }
    if (note.start > cursor) push(cursor, note.start - cursor, null);
    cursor = Math.max(cursor, note.start);

    const length = Math.min(note.ticks, Math.max(0, totalTicks - cursor));
    if (length <= 0) return;

    // A tuplet head is written whole, at the value the bracket says: its ticks
    // are not a written value and `decompose` would tie it into scraps.
    const head = tuplets.get(index);
    if (head) {
      items.push({
        start: cursor,
        ticks: length,
        midi: note.midi,
        duration: head.value.duration,
        dots: 0,
        tieStart: false,
        tieStop: false,
        tuplet: head.span,
      });
      cursor += length;
      return;
    }

    push(cursor, length, note.midi);
    cursor += length;
  });

  if (cursor < totalTicks) push(cursor, totalTicks - cursor, null);
  return items;
}

/**
 * The ribbon cut into bars, each one filled to the bar line.
 *
 * A bar short of its four beats is not a bar — a formatter given one spaces it
 * as though the missing time did not exist, and the staff stops lining up with
 * the music beside it — so whatever is left at the end is padded with rests.
 */
export function staffMeasures(
  items: readonly StaffItem[],
  totalTicks: number,
  grid: BarGrid = barGrid()
): StaffMeasure[] {
  const count = Math.max(1, barCountOf(grid, totalTicks));
  const measures: StaffMeasure[] = [];
  // `staffItems` hands the ribbon over in order, and then each bar is the next
  // run of it: one walk instead of a filter over the whole piece per bar.
  let sorted = true;
  for (let at = 1; at < items.length && sorted; at++)
    sorted = items[at - 1].start <= items[at].start;
  let next = 0;

  for (let index = 0; index < count; index++) {
    const start = barStartOf(grid, index);
    const barTicks = barTicksOf(grid, index);
    let inBar: StaffItem[];
    if (sorted) {
      while (next < items.length && items[next].start < start) next++;
      inBar = [];
      while (next < items.length && items[next].start < start + barTicks) inBar.push(items[next++]);
    } else {
      inBar = items.filter((item) => item.start >= start && item.start < start + barTicks);
    }
    const filled = inBar.reduce((sum, item) => sum + item.ticks, 0);

    // Filled to within a hair is full: a tuplet's steps are sums of fractions.
    if (barTicks - filled > ON_GRID) {
      let at = start + filled;
      for (const piece of decompose(filled, barTicks - filled, barTicks)) {
        inBar.push({
          start: at,
          ticks: piece.ticks,
          midi: null,
          duration: piece.duration,
          dots: piece.dots,
          tieStart: false,
          tieStop: false,
        });
        at += piece.ticks;
      }
    }

    measures.push({ index, start, items: inBar });
  }
  return measures;
}

const STEPS = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'];
const FLAT_STEPS = ['c', 'd', 'd', 'e', 'e', 'f', 'g', 'g', 'a', 'a', 'b', 'b'];
const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
/** The white keys with a flat spelling — B as C-flat, E as F-flat — by pitch class. */
const WHITE_FLATS: Readonly<Record<number, string>> = { 4: 'f', 11: 'c' };

/**
 * A MIDI number as a VexFlow key — `c#/4` for 61, `db/4` in a key that flats D.
 *
 * A black key is spelt the way the KEY SIGNATURE has it when the signature
 * alters either of its letters, and as a sharp otherwise. A flat key spelt in
 * sharps prints D-sharp against a signature that flattens E — a sign on nearly
 * every note — which is what rat race looked like before flats could be written.
 * Spelling EVERY black key flat in a flat key was the next mistake: Volkmire's
 * Inferno, in E-flat, climbs F to F-sharp, and printing that as G-flat put a
 * flat on a note a reader took for a B-flat already in the key.
 *
 * Two white keys have a flat spelling of their own: B is C-flat and E is F-flat. They take it only
 * in a key that flattens that letter — six flats for C-flat. Rat race is in E-flat minor, whose
 * sixth degree is C-flat; written as B it printed a natural against the B-flat of the signature.
 */
export function staffKey(midi: number, key?: KeySignature): string {
  const index = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const flatWhite = WHITE_FLATS[index];
  if (flatWhite && key?.accidental === 'b' && key.letters.includes(flatWhite)) {
    // C-flat sits in the octave above its B: C-flat 4 is B3.
    return `${flatWhite}b/${index === 11 ? octave + 1 : octave}`;
  }
  if (!BLACK[index]) return `${STEPS[index]}/${octave}`;
  const flat =
    (key?.accidental === 'b' && key.letters.includes(FLAT_STEPS[index])) ||
    (key?.spelt?.includes(FLAT_STEPS[index]) ?? false);
  return flat ? `${FLAT_STEPS[index]}b/${octave}` : `${STEPS[index]}#/${octave}`;
}

/** Letters by diatonic step, and the steps an interval of n semitones spans when spelt plainly. */
const LETTER_STEP: Readonly<Record<string, number>> = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
const PLAIN_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];

/** The other spelling of a black key: `c#/4` ↔ `db/4`. Null for a white key. */
function otherSpelling(midi: number, spelt: string): string | null {
  const index = ((midi % 12) + 12) % 12;
  if (!BLACK[index]) return null;
  const octave = Math.floor(midi / 12) - 1;
  return spelt.includes('#') ? `${FLAT_STEPS[index]}b/${octave}` : `${STEPS[index]}#/${octave}`;
}

/** Diatonic position of a VexFlow key: letter step plus seven a an octave. */
const stepOf = (key: string) => {
  const [name, octave] = key.split('/');
  return LETTER_STEP[name[0]] + 7 * Number(octave);
};

/**
 * The heads of a chord as VexFlow keys, each black key spelt so the chord reads as intervals do.
 *
 * `staffKey` spells one note against the key, and for a line that is right: Volkmire's Inferno, in
 * E-flat, climbs F to F-sharp. A chord is read the other way — by the intervals between its heads.
 * Paganini's Caprice 17, in E-flat, strikes E-flat with G-flat: written E-flat and F-sharp, that is
 * an augmented second where a minor third sounds. So for the black keys of a chord both spellings
 * are tried, and the one whose intervals span the letters their size asks for wins — a third across
 * three letters, a second across two; where the intervals cannot tell, `staffKey` decides. In the
 * order given.
 */
export function chordKeys(midis: readonly number[], key?: KeySignature): string[] {
  const plain = midis.map((midi) => staffKey(midi, key));
  const choices = midis.map((midi, i) => {
    const other = otherSpelling(midi, plain[i]);
    return other ? [plain[i], other] : [plain[i]];
  });
  const cost = (keys: readonly string[]) => {
    let wrong = 0;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const [lo, hi] = midis[i] <= midis[j] ? [i, j] : [j, i];
        const semitones = midis[hi] - midis[lo];
        const steps = stepOf(keys[hi]) - stepOf(keys[lo]);
        const expected = PLAIN_STEPS[semitones % 12] + 7 * Math.floor(semitones / 12);
        if (steps !== expected) wrong++;
      }
    }
    return wrong;
  };
  let best = plain;
  let bestCost = cost(plain);
  const walk = (at: number, picked: string[]) => {
    if (at === choices.length) {
      const c = cost(picked);
      if (c < bestCost) {
        bestCost = c;
        best = picked.slice();
      }
      return;
    }
    for (const option of choices[at]) walk(at + 1, [...picked, option]);
  };
  if (choices.some((options) => options.length > 1)) walk(0, []);
  return best;
}

/** What a key signature does: which letters it alters, and which way. */
export interface KeySignature {
  /** `#` for a sharp key, `b` for a flat one. C has neither and no letters. */
  accidental: '#' | 'b';
  letters: readonly string[];
  /** Letters whose black key is written flat although the key leaves the letter alone — see `keyOf`. */
  spelt?: readonly string[];
}

const SHARP_ORDER = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
const FLAT_ORDER = ['b', 'e', 'a', 'd', 'g', 'c', 'f'];
/** Signed number of sharps (+) or flats (−) by VexFlow major key name. */
const KEY_ALTERATIONS: Readonly<Record<string, number>> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  'F#': 6,
  'C#': 7,
  F: -1,
  Bb: -2,
  Eb: -3,
  Ab: -4,
  Db: -5,
  Gb: -6,
  Cb: -7,
};

/**
 * A key signature by its VexFlow name (`G` one sharp, `Eb` three flats).
 * A name it does not know is C — written with every sign at its note rather
 * than guessed at.
 */
export function keyOf(name?: string): KeySignature {
  const [signature, ...flats] = (name ?? '').split('+');
  const count = signature ? (KEY_ALTERATIONS[signature] ?? 0) : 0;
  const key: KeySignature =
    count < 0
      ? { accidental: 'b', letters: FLAT_ORDER.slice(0, -count) }
      : { accidental: '#', letters: SHARP_ORDER.slice(0, count) };
  return flats.length ? { ...key, spelt: flats.map((flat) => flat[0].toLowerCase()) } : key;
}

/**
 * The signature part of a key name, the one VexFlow is given — `F` of `F+Db+Ab`.
 *
 * What follows a `+` is spelling, not signature: black keys to write as those flats although the
 * key does not flatten their letters. Turbo tunnel, in D minor with one flat, falls D, D-flat, C in
 * the bass; the rule for black keys wrote the middle chord as C-sharp and G-sharp.
 */
export const signatureName = (name?: string): string | undefined => name?.split('+')[0];

/**
 * Treble or bass for a voice, from where it actually sits.
 *
 * The median rather than the mean: one low pickup note must not drag a melody
 * onto ledger lines below the bass staff. The boundary is middle C's octave —
 * a voice whose middle is below A3 spends more of its time under the treble
 * staff than in it.
 */
export function chooseClef(notes: readonly { midi: number }[]): 'treble' | 'bass' {
  if (notes.length === 0) return 'treble';
  const pitches = notes.map((note) => note.midi).sort((a, b) => a - b);
  const median = pitches[Math.floor(pitches.length / 2)];
  return median < 57 ? 'bass' : 'treble';
}

/**
 * How hard a voice is to read from a given bar line: its heads, plus one for
 * every head that starts off its own grid.
 *
 * The measureTicks `voicePhase` minimises. A run of ticks written as
 * one note on the beat costs 1. The syncopation counts as much as a tie, and
 * that is deliberate: `decompose` writes an off-beat run as ONE head, so by
 * heads alone every bar line would look equally good, and the search would
 * happily put the whole piece a sixteenth off the beat.
 */
export function notationCost(
  notes: readonly TickNote[],
  offset: number,
  measureTicks = MEASURE_TICKS
): number {
  let pieces = 0;
  for (const note of notes) {
    // A tuplet's note is off the tick grid; the phase is read from the rest.
    if (!Number.isInteger(note.start) || !Number.isInteger(note.ticks)) continue;
    // + 2 bars so a shift past the first note still lands on a positive tick.
    // Measured on the plain grid: what it weighs is the phase of a voice
    // against the beat, which the opening bar's own length does not change.
    let position = note.start - offset + measureTicks * 2;
    let left = note.ticks;
    while (left > 0) {
      const inBar = position % measureTicks;
      const chunk = Math.min(left, measureTicks - inBar);
      pieces += spellingCost(inBar, chunk, measureTicks);
      position += chunk;
      left -= chunk;
    }
  }
  return pieces;
}

/**
 * `solve`'s heads plus off-grid heads for a run inside one bar, from a flat
 * table per bar length. `voicePhase` asks this for every piece of every note,
 * four times over, and a `Map` keyed by a number past 2^31 is the slow part of
 * that — so whole-tick runs are looked up by index instead.
 */
const costTables = new Map<number, Int32Array>();

function spellingCost(inBar: number, chunk: number, measureTicks: number): number {
  if (
    !Number.isInteger(measureTicks) ||
    !Number.isInteger(inBar) ||
    !Number.isInteger(chunk) ||
    inBar < 0
  ) {
    const spelling = solve(inBar, chunk, measureTicks);
    return spelling.pieces.length + spelling.offGrid;
  }
  let table = costTables.get(measureTicks);
  if (!table) {
    table = new Int32Array(measureTicks * (measureTicks + 1));
    costTables.set(measureTicks, table);
  }
  const index = inBar * (measureTicks + 1) + chunk;
  let cost = table[index];
  if (cost === 0) {
    const spelling = solve(inBar, chunk, measureTicks);
    // Stored one up, so 0 can mean "not worked out yet".
    cost = spelling.pieces.length + spelling.offGrid + 1;
    table[index] = cost;
  }
  return cost - 1;
}

/**
 * How many ticks one channel is written behind the beat. Never more than
 * `MAX_PHASE`.
 *
 * The delay is AUTHORED, not the driver's. Nearly every track opens a channel
 * or two with an explicit `$80` rest one sixty-fourth long, and Intruder
 * Excluder puts a three-tick rest ahead of pulse 2's copy of pulse 1's bass
 * line — a two-tick echo, some 60ms, and audible as one. (An earlier version of
 * this comment called it the cost of setup commands; the stream dump says
 * otherwise.)
 *
 * On a staff, though, it is the difference between a quarter note and a chain
 * of tied scraps, so the notes are written on the beat and the delay is
 * STATED: a staff should label every voice it moved, and not move its playhead.
 * Longer echoes (Surf City's six ticks) are past `MAX_PHASE` and are written as
 * they sound.
 */
export const MAX_PHASE = 3;

export function voicePhase(
  notes: readonly TickNote[],
  offset: number,
  measureTicks = MEASURE_TICKS
): number {
  let best = 0;
  let bestCost = Infinity;
  for (let phase = 0; phase <= MAX_PHASE; phase++) {
    const cost = notationCost(notes, offset + phase, measureTicks);
    if (cost < bestCost) {
      bestCost = cost;
      best = phase;
    }
  }
  return best;
}

/**
 * A voice moved `by` ticks along the staff's clock, cut at tick 0.
 *
 * Taking a channel's delay out can carry its first sliver before the music
 * starts: ragnarok's canyon opens the noise channel with a one-tick hit on
 * tick 0 and then plays everything a tick late. Refusing the phase for the sake
 * of that sliver — which is what a guard in `voicePhase` once did — left every
 * drum on an odd tick, and each of those gave the formatter a column of
 * its own: a gap between the first two sixteenths of pulse 1 in every bar. So
 * the phase is taken, and what lands before tick 0 is cut off there.
 */
export function shiftNotes<T extends TickNote>(notes: readonly T[], by: number): T[] {
  const out: T[] = [];
  for (const note of notes) {
    const start = note.start + by;
    const ticks = start < 0 ? note.ticks + start : note.ticks;
    if (ticks > 0) out.push({ ...note, start: Math.max(0, start), ticks });
  }
  return out;
}

/*
 * Where the bar line falls: at the track's FIRST TICK. There is no search.
 *
 * There used to be — a search tried all 64 bar lines and kept the one that
 * wrote the music with the fewest heads, on the reasoning a transcriber uses by
 * ear. It is blind to exactly the mistake that matters: this music repeats in
 * whole-bar patterns on a sixteenth grid, so a bar line an eighth or two off
 * writes it with almost the same number of heads. Ragnarok's canyon came out at
 * 17 (1060 heads) against 1 (1064), and every bar of the score opened two
 * eighths early — heard wrong at once, while the numbers called it a win. Nine
 * of the twenty tracks were moved off tick 0 that way, most by a margin under a
 * percent.
 *
 * Tick 0 is what the evidence says instead: every channel of a track starts
 * there, the repeat points sit on ticks 1..4 in most tracks, and the MusicXML
 * export has always barred from tick 0, and the two agree. A channel's own authored delay (at most `MAX_PHASE` ticks) is still
 * taken out per voice by `voicePhase`.
 */

/**
 * Ticks to ADD to a piece's own clock to get the staff's, for a bar line
 * `offset` ticks in.
 *
 * Less than a bar, so a piece barred off its first tick gets a pickup bar
 * rather than notes before tick zero — and nothing at all for offset 0, which
 * is what every track uses: an empty bar in front of the music says the music
 * starts a bar late.
 */
export function staffShift(offset: number, measureTicks = MEASURE_TICKS): number {
  return (measureTicks - (offset % measureTicks)) % measureTicks;
}

/**
 * How a piece is barred: where its bar lines fall, and what its notes are moved
 * by to sit behind them.
 *
 * Two readings of the same pickup. Left alone it gets a bar of its own, padded
 * in front with rests, and the music starts part way into bar one. `merged`
 * instead makes the OPENING BAR longer by the pickup and moves nothing: the run
 * and the note it lands on are one bar of 19/32, and the metre takes over after
 * it. The second reads better whenever the pickup is not a whole phrase — a bar
 * line through the middle of a run is worse than an irregular first bar.
 */
export function barring(
  offset: number,
  measureTicks = MEASURE_TICKS,
  merged = false,
  /** Bars later in the piece with a length of their own — see `BarGrid`. */
  oddBars: readonly OddBar[] = []
): { grid: BarGrid; shift: number } {
  const pickup = ((offset % measureTicks) + measureTicks) % measureTicks;
  return merged
    ? { grid: barGrid(measureTicks, measureTicks + pickup, oddBars), shift: 0 }
    : {
        grid: barGrid(measureTicks, measureTicks, oddBars),
        shift: staffShift(offset, measureTicks),
      };
}

export type Clef = 'treble' | 'bass';

/**
 * The outer LINES of each staff, as MIDI numbers: E4..F5 and G2..A3.
 *
 * Not the centres — what matters for room is where the ledger lines start.
 */
export const STAFF_SPAN: Record<Clef, readonly [number, number]> = {
  treble: [64, 77],
  bass: [43, 57],
};

/**
 * The pitch each staff is centred on: B4 on the treble, D3 on the bass. Kept
 * for callers that want the middle line; the clef is not chosen by it.
 */
export const CLEF_CENTRE: Record<Clef, number> = { treble: 71, bass: 50 };

/**
 * How much better the other clef has to be before a bar switches, in semitones
 * of the ladder it saves.
 *
 * Without it a line hovering between the two staves changes clef every other
 * bar, which is unreadable in a way that ledger lines are not.
 */
export const CLEF_HYSTERESIS = 3;

/**
 * How much better a clef change PART WAY through a bar has to be than the best
 * clef for the whole bar, in semitones of the ladder it saves.
 *
 * Higher than `CLEF_HYSTERESIS`, because a change inside a bar is louder. At 3,
 * a line that crosses between the staves on every beat changed clef inside
 * bar after bar — Ragnarok's canyon went treble, bass, treble, bass through
 * bars 5 to 9 — for ladders that were only a few rungs shorter. Measured over
 * the twenty tracks' voices: at 3, 92 changes inside bars; at 6, the bar that
 * drops an octave still splits and the see-saw is gone.
 */
export const CLEF_SPLIT_MARGIN = 6;

/**
 * What a bar costs on one clef: the TALLEST ladder of ledger lines in it, with
 * the average as a tie-break.
 *
 * The tallest, not the average, and that is the whole rule. Averaging is what a
 * first version did, and it reads the bar as a crowd: a bar of eight low notes
 * and two very high ones votes for the low clef, and the two high notes then
 * get a fourteen-rung ladder that runs off the top of the strip. What decides
 * whether a bar can be READ is its worst excursion — one note an octave out is
 * two ledger lines and fine, one note two octaves out is unreadable however
 * many of its neighbours sit comfortably.
 *
 * Measured over the twenty tracks, choosing by the worst excursion instead of
 * the average halves the bars carrying a ladder over 18 semitones (37 → 17) and
 * takes fewer clef changes to do it (129 → 112).
 */
/** How far a pitch sits off a staff, in semitones: 0 on it. */
function outside(midi: number, clef: Clef): number {
  const [low, high] = STAFF_SPAN[clef];
  return Math.max(0, midi - high, low - midi);
}

function clefCost(pitches: readonly number[], clef: Clef): number {
  const worst = pitches.reduce((max, midi) => Math.max(max, outside(midi, clef)), 0);
  const mean = pitches.reduce((sum, midi) => sum + outside(midi, clef), 0) / pitches.length;
  // The average never outweighs a semitone of the worst ladder; it only settles
  // bars the worst excursion calls a draw.
  return worst + mean / 100;
}

/**
 * A clef per bar — a real score changes clef, and for this music it has to.
 *
 * These channels are not instruments with a range: one voice carries the bass
 * for eight bars and then a melody three octaves up, and on one fixed clef a
 * TENTH of all the notes in the cartridge land more than an octave off the
 * staff — a ladder of ledger lines, most of it clipped by the strip's edge.
 * Chosen per bar the same figure is 1.35%, at a cost of one clef change every
 * twelve bars. What a bar costs on each clef is `clefCost`.
 *
 * A bar with nothing in it keeps the running clef rather than voting: a rest is
 * not evidence about register, and letting silence switch the clef puts the
 * change in the wrong bar.
 *
 * A bar can also change clef PART WAY THROUGH, once, where the music drops or
 * climbs into the other register. Chosen for the bar as a whole, a register
 * change inside it is paid for by every note on the wrong side of it: bar 5 of
 * Ragnarok's canyon is eleven E4s and then five E3s, and the whole bar went to
 * the bass clef — eleven heads on ledger lines to spare five. A split is taken
 * when it beats the best whole-bar clef by `CLEF_SPLIT_MARGIN`, and only from
 * the clef the bar opens in, so a bar never carries two changes.
 */
export function clefPlan(bars: readonly (readonly BarNote[])[], start: Clef = 'treble'): BarClef[] {
  const plan: BarClef[] = [];
  let current: Clef | null = null;

  for (const notes of bars) {
    if (notes.length === 0) {
      plan.push({ clef: current ?? start });
      continue;
    }
    const pitches = notes.map((note) => note.midi);
    const bass = clefCost(pitches, 'bass');
    const treble = clefCost(pitches, 'treble');
    let want: Clef = bass <= treble ? 'bass' : 'treble';
    if (current && want !== current && Math.abs(bass - treble) < CLEF_HYSTERESIS) want = current;

    const from = current ?? start;
    const split = bestSplit(notes, from);
    if (split && split.cost + CLEF_SPLIT_MARGIN <= clefCost(pitches, want)) {
      current = otherClef(from);
      plan.push({ clef: from, change: { tick: split.tick, clef: current } });
    } else {
      current = want;
      plan.push({ clef: want });
    }
  }
  return plan;
}

/** A note as the clef reads it: the tick of the bar it starts on, and its pitch. */
export interface BarNote {
  tick: number;
  midi: number;
}

/** The clef one bar opens in, and the one change inside it, if it has one. */
export interface BarClef {
  clef: Clef;
  /** From this tick of the bar on, the staff reads in `change.clef`. */
  change?: { tick: number; clef: Clef };
}

/** The clef a note starting on `tick` of the bar is written in. */
export function clefAt(bar: BarClef, tick: number): Clef {
  return bar.change && tick >= bar.change.tick ? bar.change.clef : bar.clef;
}

/** The clef a bar hands on to the next one. */
export function clefAfter(bar: BarClef): Clef {
  return bar.change?.clef ?? bar.clef;
}

function otherClef(clef: Clef): Clef {
  return clef === 'treble' ? 'bass' : 'treble';
}

/**
 * The cheapest place to leave `from` for the other clef inside a bar, and what
 * the worse half of the bar then costs.
 *
 * Only at a note: the change goes in front of the first head it is for. Never
 * at the first one — a bar that is all in the other clef changes at its bar
 * line. On a tie the LATER place wins, so the clef stands next to the notes
 * that need it rather than in front of ones that were fine either way.
 */
function bestSplit(notes: readonly BarNote[], from: Clef): { tick: number; cost: number } | null {
  // Each half's `clefCost` from running totals rather than a filter per place:
  // the worst ladder and the sum of the ladders before it, and from it on.
  const ordered = [...notes].sort((a, b) => a.tick - b.tick);
  const n = ordered.length;
  const to = otherClef(from);
  const worstBefore = new Float64Array(n + 1);
  const sumBefore = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const out = outside(ordered[i].midi, from);
    worstBefore[i + 1] = Math.max(worstBefore[i], out);
    sumBefore[i + 1] = sumBefore[i] + out;
  }
  const worstAfter = new Float64Array(n + 1);
  const sumAfter = new Float64Array(n + 1);
  for (let i = n - 1; i >= 0; i--) {
    const out = outside(ordered[i].midi, to);
    worstAfter[i] = Math.max(worstAfter[i + 1], out);
    sumAfter[i] = sumAfter[i + 1] + out;
  }
  let best: { tick: number; cost: number } | null = null;
  // Never at the first note: from the first head that starts later on.
  for (let at = 1; at < n; at++) {
    if (ordered[at].tick === ordered[at - 1].tick) continue;
    const cost = Math.max(
      worstBefore[at] + sumBefore[at] / at / 100,
      worstAfter[at] + sumAfter[at] / (n - at) / 100
    );
    if (!best || cost <= best.cost) best = { tick: ordered[at].tick, cost };
  }
  return best;
}

/** A pitch's distance outside its staff, in DIATONIC steps — one ledger position each. */
function stepsOutside(midi: number, clef: Clef): { above: number; below: number } {
  const [low, high] = STAFF_SPAN[clef];
  const semitones = (value: number) => Math.max(0, Math.round((value * 7) / 12));
  return { above: semitones(midi - high), below: semitones(low - midi) };
}

/**
 * How far this music reaches above and below the staff, in ledger positions.
 *
 * What it is FOR: a strip has a fixed amount of room around the staff, and
 * splitting it evenly suits almost no voice. A bass line spends the whole track
 * under the staff and a lead over it — measured across the twenty tracks, only
 * a third of the voices fit an even split, while the same room divided in
 * proportion to where the notes actually go fits nearly all of them. The staff
 * is put where the music needs it rather than in the middle.
 *
 * Read over the WHOLE piece, not the bars on screen: a staff that slid up and
 * down as the melody moved would be unreadable, and would take the bar lines
 * and the pinned clef with it.
 */
export function staffRoom(
  bars: readonly (readonly BarNote[])[],
  clefs: readonly BarClef[]
): { above: number; below: number } {
  let above = 0;
  let below = 0;
  bars.forEach((notes, index) => {
    const bar = clefs[index] ?? { clef: 'treble' };
    for (const { tick, midi } of notes) {
      const out = stepsOutside(midi, clefAt(bar, tick));
      above = Math.max(above, out.above);
      below = Math.max(below, out.below);
    }
  });
  return { above, below };
}
