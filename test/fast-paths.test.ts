import { describe, expect, it } from 'vitest';
import {
  STAFF_SPAN,
  barGrid,
  clefPlan,
  decompose,
  notationCost,
  staffItems,
  staffMeasures,
  type BarNote,
  type Clef,
  type StaffItem,
  type TickNote,
} from '../src/notation.js';

/** A small, repeatable random source, so a failure can be run again. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/*
 * The rules as they were first written — a filter per bar, a filter per place
 * in a bar — kept here as the reference the faster versions must agree with.
 */
function naiveMeasures(items: readonly StaffItem[], starts: number[], lengths: number[]) {
  return starts.map((start, index) =>
    items.filter((item) => item.start >= start && item.start < start + lengths[index])
  );
}

function naiveClefCost(pitches: readonly number[], clef: Clef): number {
  const [low, high] = STAFF_SPAN[clef];
  const outside = (midi: number) => Math.max(0, midi - high, low - midi);
  const worst = pitches.reduce((max, midi) => Math.max(max, outside(midi)), 0);
  const mean = pitches.reduce((sum, midi) => sum + outside(midi), 0) / pitches.length;
  return worst + mean / 100;
}

function naiveClefPlan(bars: readonly (readonly BarNote[])[], start: Clef = 'treble') {
  const other = (clef: Clef): Clef => (clef === 'treble' ? 'bass' : 'treble');
  const plan: { clef: Clef; change?: { tick: number; clef: Clef } }[] = [];
  let current: Clef | null = null;
  for (const notes of bars) {
    if (notes.length === 0) {
      plan.push({ clef: current ?? start });
      continue;
    }
    const pitches = notes.map((note) => note.midi);
    const bass = naiveClefCost(pitches, 'bass');
    const treble = naiveClefCost(pitches, 'treble');
    let want: Clef = bass <= treble ? 'bass' : 'treble';
    if (current && want !== current && Math.abs(bass - treble) < 3) want = current;
    const from = current ?? start;
    const ticks = [...new Set(notes.map((note) => note.tick))].sort((a, b) => a - b);
    let split: { tick: number; cost: number } | null = null;
    for (const tick of ticks.slice(1)) {
      const before = notes.filter((note) => note.tick < tick).map((note) => note.midi);
      const after = notes.filter((note) => note.tick >= tick).map((note) => note.midi);
      const cost = Math.max(naiveClefCost(before, from), naiveClefCost(after, other(from)));
      if (!split || cost <= split.cost) split = { tick, cost };
    }
    if (split && split.cost + 6 <= naiveClefCost(pitches, want)) {
      current = other(from);
      plan.push({ clef: from, change: { tick: split.tick, clef: current } });
    } else {
      current = want;
      plan.push({ clef: want });
    }
  }
  return plan;
}

function randomVoice(next: () => number, count: number, low: number, span: number): TickNote[] {
  const notes: TickNote[] = [];
  let at = Math.floor(next() * 8);
  for (let i = 0; i < count; i++) {
    const ticks = 1 + Math.floor(next() * 40);
    notes.push({ start: at, ticks, midi: low + Math.floor(next() * span) });
    at += ticks + (next() < 0.3 ? Math.floor(next() * 20) : 0);
  }
  return notes;
}

describe('the fast paths say what the plain rules say', () => {
  it('cuts bars by one walk exactly as by a filter per bar', () => {
    const next = random(7);
    for (let round = 0; round < 40; round++) {
      const grid = barGrid(
        round % 2 ? 32 : 64,
        round % 3 ? 64 : 38,
        round % 5 ? [] : [{ bar: 3, ticks: 32 }]
      );
      const notes = randomVoice(next, 60, 40, 40);
      const total = notes[notes.length - 1].start + notes[notes.length - 1].ticks + 10;
      const items = staffItems(notes, total, grid);
      const measures = staffMeasures(items, total, grid);
      const reference = naiveMeasures(
        items,
        measures.map((m) => m.start),
        measures.map((m, i) => (measures[i + 1]?.start ?? Infinity) - m.start)
      );
      measures.forEach((measure, index) => {
        const own = measure.items.slice(0, reference[index].length);
        expect(own).toEqual(reference[index]);
      });
    }
  });

  it('cuts bars the same way when the items come out of order', () => {
    const notes = randomVoice(random(3), 40, 50, 20);
    const total = 1200;
    const items = staffItems(notes, total);
    const shuffled = [...items].reverse();
    const inOrder = staffMeasures(items, total).map((m) =>
      m.items.map((i) => i.start).sort((a, b) => a - b)
    );
    const outOfOrder = staffMeasures(shuffled, total).map((m) =>
      m.items.map((i) => i.start).sort((a, b) => a - b)
    );
    expect(outOfOrder).toEqual(inOrder);
  });

  it('chooses every clef, and every change inside a bar, as the plain search does', () => {
    const next = random(11);
    for (let round = 0; round < 200; round++) {
      const bars: BarNote[][] = Array.from({ length: 12 }, () =>
        Array.from({ length: Math.floor(next() * 14) }, () => ({
          tick: Math.floor(next() * 16) * 4,
          midi: 28 + Math.floor(next() * 64),
        }))
      );
      const start: Clef = round % 2 ? 'bass' : 'treble';
      expect(clefPlan(bars, start)).toEqual(naiveClefPlan(bars, start));
    }
  });

  it('costs a voice the same from the table as from the spelling itself', () => {
    // Heads, plus one for each head begun off the grid of the value it is.
    const reference = (notes: readonly TickNote[], offset: number, measureTicks: number) => {
      let cost = 0;
      for (const note of notes) {
        let position = note.start - offset + measureTicks * 2;
        let left = note.ticks;
        while (left > 0) {
          const inBar = position % measureTicks;
          const chunk = Math.min(left, measureTicks - inBar);
          let at = inBar;
          for (const piece of decompose(inBar, chunk, measureTicks)) {
            const grid = (piece.ticks * 2 ** piece.dots) / (2 ** (piece.dots + 1) - 1);
            cost += 1 + (at % grid === 0 ? 0 : 1);
            at += piece.ticks;
          }
          position += chunk;
          left -= chunk;
        }
      }
      return cost;
    };
    const next = random(5);
    for (let round = 0; round < 30; round++) {
      const notes = randomVoice(next, 50, 40, 30);
      for (const measureTicks of [64, 32, 38, 48]) {
        for (const offset of [0, 1, 6, 17]) {
          expect(notationCost(notes, offset, measureTicks)).toBe(
            reference(notes, offset, measureTicks)
          );
        }
      }
    }
  });
});
