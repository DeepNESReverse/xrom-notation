import { describe, expect, it } from 'vitest';
import {
  barAt,
  barCountOf,
  barGrid,
  barStartOf,
  barTicksOf,
  MEASURE_TICKS,
  chooseClef,
  chordKeys,
  clefPlan,
  decompose,
  keyOf,
  signatureName,
  notationCost,
  shiftNotes,
  staffShift,
  staffItems,
  staffKey,
  staffMeasures,
  staffRoom,
  timeSignatureOf,
  tupletGroups,
  voicePhase,
  type TickNote,
} from '../src/notation.js';

const lengths = (pieces: { ticks: number }[]) => pieces.map((piece) => piece.ticks);
const names = (pieces: { duration: string; dots: number }[]) =>
  pieces.map((piece) => piece.duration + '.'.repeat(piece.dots));

describe('decompose', () => {
  it('names a whole bar and the plain values', () => {
    expect(names(decompose(0, 64))).toEqual(['w']);
    expect(names(decompose(0, 16))).toEqual(['q']);
    expect(names(decompose(0, 8))).toEqual(['8']);
    expect(names(decompose(0, 1))).toEqual(['64']);
  });

  it('writes a dot where the length is one and a half of a value', () => {
    expect(names(decompose(0, 24))).toEqual(['q.']);
    expect(names(decompose(0, 12))).toEqual(['8.']);
  });

  it('writes two dots where the length is seven quarters of a value, as one head', () => {
    // Level Complete, pulse 2: a B3 of seven ticks was 16. tied to a 64th, heads almost touching.
    expect(names(decompose(52, 7))).toEqual(['16..']);
    expect(names(decompose(0, 14))).toEqual(['8..']);
    expect(names(decompose(0, 28))).toEqual(['q..']);
  });

  it('writes an off-beat length as one syncopated head, not a chain of ties', () => {
    // A sixteenth from the second thirty-second of a beat: the old greedy rule
    // wrote it as a dotted thirty-second tied to a sixty-fourth.
    expect(names(decompose(2, 4))).toEqual(['16']);
    expect(names(decompose(4, 16))).toEqual(['q']);
    expect(names(decompose(6, 6))).toEqual(['16.']);
  });

  it('takes one head off the grid over two on it', () => {
    // 8. from the second sixteenth is a syncopation; 16 + 8 is a tie.
    expect(names(decompose(4, 12))).toEqual(['8.']);
    // A syncopated quarter across beat three is still better than 8 + 8 tied.
    expect(names(decompose(24, 16))).toEqual(['q']);
  });

  it('puts the heads on their grid when the count is the same', () => {
    // Ten ticks from tick 6: 8 + 32 starts the eighth off the beat, 32 + 8
    // lands it on one.
    expect(names(decompose(6, 10))).toEqual(['32', '8']);
  });

  it('always sums to the length it was given', () => {
    for (let position = 0; position < MEASURE_TICKS; position++) {
      for (let length = 1; length <= MEASURE_TICKS - position; length++) {
        const total = lengths(decompose(position, length)).reduce((a, b) => a + b, 0);
        expect(total).toBe(length);
      }
    }
  });
});

describe('staffItems', () => {
  it('fills the silence before and after a note with rests', () => {
    const items = staffItems([{ start: 16, ticks: 16, midi: 60 }], 64);
    expect(items.map((item) => [item.start, item.ticks, item.midi])).toEqual([
      [0, 16, null],
      [16, 16, 60],
      [32, 32, null],
    ]);
  });

  it('cuts a note at the bar line and ties the halves', () => {
    const items = staffItems([{ start: 48, ticks: 32, midi: 60 }], 128);
    const sounding = items.filter((item) => item.midi !== null);
    expect(sounding.map((item) => [item.start, item.ticks])).toEqual([
      [48, 16],
      [64, 16],
    ]);
    expect(sounding[0].tieStart).toBe(true);
    expect(sounding[1].tieStop).toBe(true);
  });

  it('never ties a rest', () => {
    const items = staffItems([], 128);
    expect(items.every((item) => !item.tieStart && !item.tieStop)).toBe(true);
  });

  it('truncates a note that runs past the end of the piece', () => {
    const items = staffItems([{ start: 32, ticks: 64, midi: 60 }], 64);
    const total = items.reduce((sum, item) => sum + item.ticks, 0);
    expect(total).toBe(64);
  });

  // Title music, bar 39: a half note, then the half after it divided in three —
  // 10+11+11 — in all three voices and the drums at once.
  it('writes a three-way division as one head each, not as ties', () => {
    const items = staffItems(
      [
        { start: 0, ticks: 32, midi: 57 },
        { start: 32, ticks: 10, midi: 57 },
        { start: 42, ticks: 11, midi: 57 },
        { start: 53, ticks: 11, midi: 58 },
      ],
      64
    );
    expect(items.map((item) => [item.ticks, item.duration, item.dots])).toEqual([
      [32, 'h', 0],
      [10, 'q', 0],
      [11, 'q', 0],
      [11, 'q', 0],
    ]);
    expect(items.every((item) => !item.tieStart && !item.tieStop)).toBe(true);
    expect(items.slice(1).map((item) => item.tuplet)).toEqual([
      { num: 3, occupied: 2, first: true, last: false },
      { num: 3, occupied: 2, first: false, last: false },
      { num: 3, occupied: 2, first: false, last: true },
    ]);
  });
});

describe('tupletGroups', () => {
  const groups = (notes: TickNote[]) => tupletGroups(notes).size / 3;

  // Clinger Winger's drums: an eighth split three ways in a run of sixteenths.
  it('finds an eighth divided in three', () => {
    const notes = [
      { start: 0, ticks: 3, midi: 8 },
      { start: 3, ticks: 3, midi: 8 },
      { start: 6, ticks: 2, midi: 8 },
    ];
    expect(groups(notes)).toBe(1);
    expect(tupletGroups(notes).get(0)?.value.duration).toBe('16');
  });

  it('leaves an even third alone — three equal heads need no bracket', () => {
    expect(
      groups([
        { start: 0, ticks: 8, midi: 60 },
        { start: 8, ticks: 8, midi: 60 },
        { start: 16, ticks: 8, midi: 60 },
      ])
    ).toBe(0);
  });

  it('refuses a run with a gap in it, and one that crosses the bar line', () => {
    expect(
      groups([
        { start: 0, ticks: 10, midi: 60 },
        { start: 11, ticks: 11, midi: 60 },
        { start: 22, ticks: 11, midi: 60 },
      ])
    ).toBe(0);
    expect(
      groups([
        { start: 48, ticks: 10, midi: 60 },
        { start: 58, ticks: 11, midi: 60 },
        { start: 69, ticks: 11, midi: 60 },
      ])
    ).toBe(0);
  });

  it('refuses three notes that are merely unequal', () => {
    expect(
      groups([
        { start: 0, ticks: 4, midi: 60 },
        { start: 4, ticks: 4, midi: 60 },
        { start: 8, ticks: 8, midi: 60 },
      ])
    ).toBe(0);
  });
});

describe('staffMeasures', () => {
  it('fills a short last bar so every bar is four beats', () => {
    const measures = staffMeasures(staffItems([{ start: 0, ticks: 16, midi: 60 }], 16), 16);
    expect(measures).toHaveLength(1);
    const total = measures[0].items.reduce((sum, item) => sum + item.ticks, 0);
    expect(total).toBe(MEASURE_TICKS);
  });

  it('keeps every item, once, in the bar it starts in', () => {
    const items = staffItems([{ start: 48, ticks: 64, midi: 60 }], 192);
    const measures = staffMeasures(items, 192);
    expect(measures).toHaveLength(3);
    for (const measure of measures) {
      const total = measure.items.reduce((sum, item) => sum + item.ticks, 0);
      expect(total).toBe(MEASURE_TICKS);
      for (const item of measure.items) {
        expect(item.start).toBeGreaterThanOrEqual(measure.start);
        expect(item.start).toBeLessThan(measure.start + MEASURE_TICKS);
      }
    }
  });
});

describe('a bar of 2/4', () => {
  it('bars the music in halves, each bar filled to two beats', () => {
    // Volkmire's Inferno Race is written in 32-tick bars — see `METERS`.
    const items = staffItems([{ start: 0, ticks: 16, midi: 60 }], 96, barGrid(32));
    const measures = staffMeasures(items, 96, barGrid(32));
    expect(measures.map((measure) => measure.start)).toEqual([0, 32, 64]);
    for (const measure of measures) {
      expect(measure.items.reduce((sum, item) => sum + item.ticks, 0)).toBe(32);
    }
  });

  it('ties a note over the nearer bar line', () => {
    // 4/4 writes 32 ticks from tick 16 as one half note; 2/4 has a bar line in the middle of it.
    const whole = staffItems([{ start: 16, ticks: 32, midi: 60 }], 64).filter(
      (item) => item.midi !== null
    );
    expect(whole.map((item) => [item.start, item.ticks])).toEqual([[16, 32]]);
    const halves = staffItems([{ start: 16, ticks: 32, midi: 60 }], 64, barGrid(32)).filter(
      (item) => item.midi !== null
    );
    expect(halves.map((item) => [item.start, item.ticks])).toEqual([
      [16, 16],
      [32, 16],
    ]);
    expect(halves[0].tieStart && halves[1].tieStop).toBe(true);
  });

  it('puts the pickup bar a bar of its own length in front', () => {
    // The whole of a 10-tick pickup stands in the bar before the first bar line.
    expect(staffShift(10, 32)).toBe(22);
    expect(staffShift(10)).toBe(54);
  });
});

describe('keyOf and flat spelling', () => {
  it('spells a black key the way the key signature has it', () => {
    // Five flats (rat race): every black key is in the signature.
    expect([61, 63, 66, 68, 70].map((midi) => staffKey(midi, keyOf('Db')))).toEqual([
      'db/4',
      'eb/4',
      'gb/4',
      'ab/4',
      'bb/4',
    ]);
    expect(staffKey(64, keyOf('Db'))).toBe('e/4');
  });

  it('spells a black key the signature does not alter as a sharp', () => {
    // Volkmire's Inferno in E-flat: F to F-sharp, not F to G-flat.
    expect([54, 58, 51, 56, 61].map((midi) => staffKey(midi, keyOf('Eb')))).toEqual([
      'f#/3',
      'bb/3',
      'eb/3',
      'ab/3',
      'c#/4',
    ]);
  });

  it('reads a key name as the letters it alters', () => {
    expect(keyOf('Eb')).toEqual({ accidental: 'b', letters: ['b', 'e', 'a'] });
    expect(keyOf('G')).toEqual({ accidental: '#', letters: ['f'] });
    expect(keyOf('Cm?')).toEqual({ accidental: '#', letters: [] });
    expect(keyOf()).toEqual({ accidental: '#', letters: [] });
  });
});

describe('staffKey', () => {
  it('puts middle C in octave 4 and spells the black keys as sharps', () => {
    expect(staffKey(60)).toBe('c/4');
    expect(staffKey(61)).toBe('c#/4');
    expect(staffKey(59)).toBe('b/3');
  });
});

describe('chooseClef', () => {
  it('reads the median, so one low note does not move the clef', () => {
    expect(chooseClef([{ midi: 36 }, { midi: 72 }, { midi: 74 }, { midi: 76 }])).toBe('treble');
    expect(chooseClef([{ midi: 40 }, { midi: 43 }, { midi: 45 }, { midi: 72 }])).toBe('bass');
    expect(chooseClef([])).toBe('treble');
  });
});

describe('the bar line and each voice’s phase', () => {
  it('writes a voice begun a few ticks late on the beat', () => {
    // Four quarter notes a bar, the whole thing begun three ticks late.
    const notes: { start: number; ticks: number; midi: number }[] = [];
    for (let bar = 0; bar < 4; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        notes.push({ start: 3 + bar * 64 + beat * 16, ticks: 16, midi: 60 });
      }
    }
    expect(voicePhase(notes, 0)).toBe(3);
    expect(notationCost(notes, 3)).toBe(notes.length);
  });

  it('takes out each channel’s own delay separately', () => {
    const lead = [0, 16, 32, 48].map((start) => ({ start: start + 1, ticks: 16, midi: 72 }));
    const bass = [0, 32].map((start) => ({ start, ticks: 32, midi: 48 }));
    expect(voicePhase(lead, 0)).toBe(1);
    expect(voicePhase(bass, 0)).toBe(0);
  });

  it('takes a delay out even when the voice opens with a sliver on tick 0', () => {
    // Ragnarok's noise channel: a one-tick hit on tick 0, then everything a tick late.
    const notes = [
      { start: 0, ticks: 1, midi: 60 },
      ...[0, 1, 2, 3, 4, 5].map((beat) => ({ start: 1 + beat * 16, ticks: 16, midi: 60 })),
    ];
    expect(voicePhase(notes, 0)).toBe(1);
  });

  it('cuts a note moved before tick zero at it, and drops one left with nothing', () => {
    const moved = shiftNotes(
      [
        { start: 0, ticks: 1, midi: 60 },
        { start: 0, ticks: 4, midi: 62 },
        { start: 1, ticks: 16, midi: 64 },
      ],
      -1
    );
    expect(moved).toEqual([
      { start: 0, ticks: 3, midi: 62 },
      { start: 0, ticks: 16, midi: 64 },
    ]);
  });

  it('adds no empty bar in front of a piece barred on its first tick', () => {
    expect(staffShift(0)).toBe(0);
    expect(staffShift(3)).toBe(MEASURE_TICKS - 3);
  });
});

/** A bar of pitches, one every four ticks. */
const bar = (pitches: number[]) => pitches.map((midi, index) => ({ tick: index * 4, midi }));
/** A plan as text: `treble`, or `treble>bass@44` for a bar that changes part way. */
const read = (plan: ReturnType<typeof clefPlan>) =>
  plan.map((b) => (b.change ? `${b.clef}>${b.change.clef}@${b.change.tick}` : b.clef));

describe('clefPlan', () => {
  const low = bar([45, 47, 48]);
  const high = bar([79, 81, 83]);

  it('reads each bar, so a voice that changes register changes clef', () => {
    expect(read(clefPlan([low, low, high, high]))).toEqual(['bass', 'bass', 'treble', 'treble']);
  });

  it('keeps the running clef through an empty bar', () => {
    expect(read(clefPlan([high, [], high]))).toEqual(['treble', 'treble', 'treble']);
  });

  it('will not switch for a bar that is barely closer to the other staff', () => {
    // Sitting between the two staves: the second bar leans treble by less than
    // the hysteresis, and a clef that changes every other bar is unreadable.
    expect(read(clefPlan([bar([55, 57]), bar([61, 62])]))).toEqual(['bass', 'bass']);
  });

  it('uses the starting clef for a piece that is nothing but rests', () => {
    expect(read(clefPlan([[], []], 'bass'))).toEqual(['bass', 'bass']);
  });

  it('changes clef inside the bar where the register drops, not at its bar line', () => {
    // Ragnarok's canyon, bar 5: eleven E4s, then five E3s. For the bar as a
    // whole the bass clef wins, and eleven heads that sit on the treble staff
    // went onto ledger lines.
    const drop = bar([...Array(11).fill(64), ...Array(5).fill(52)]);
    const plan = clefPlan([bar(Array(16).fill(64)), drop, bar([50, 52, 45])]);
    expect(read(plan)).toEqual(['treble', 'treble>bass@44', 'bass']);
  });

  it('does not change inside a bar for one note that is barely off the staff', () => {
    expect(read(clefPlan([bar([64, 64, 64, 60])]))).toEqual(['treble']);
  });
});

describe('staffRoom', () => {
  it('measures the reach on each side separately, in ledger positions', () => {
    // G5 is one step above the treble staff's top line, C4 two below its bottom.
    const room = staffRoom([bar([79, 60])], [{ clef: 'treble' }]);
    expect(room).toEqual({ above: 1, below: 2 });
  });

  it('is zero for music that stays on the staff', () => {
    expect(staffRoom([bar([64, 71, 77])], [{ clef: 'treble' }])).toEqual({ above: 0, below: 0 });
  });

  it('reads each bar against ITS OWN clef', () => {
    // The same pitch is under the treble staff and on the bass one.
    expect(staffRoom([bar([50])], [{ clef: 'bass' }])).toEqual({ above: 0, below: 0 });
    expect(staffRoom([bar([50])], [{ clef: 'treble' }]).below).toBeGreaterThan(0);
  });

  it('reads each note against the clef in force where it starts', () => {
    const plan = [{ clef: 'treble' as const, change: { tick: 4, clef: 'bass' as const } }];
    expect(staffRoom([bar([64, 50])], plan)).toEqual({ above: 0, below: 0 });
  });

  it('takes the whole piece, so the staff does not move as the melody does', () => {
    expect(staffRoom([bar([88]), bar([40])], [{ clef: 'treble' }, { clef: 'treble' }])).toEqual({
      above: 6,
      below: 14,
    });
  });
});

describe('clefPlan — the worst ladder decides, not the average', () => {
  it('follows the two notes that would need a ladder, not the eight that would not', () => {
    // Eight notes sitting on the bass staff and two an octave and a half above
    // it. By average distance the crowd wins and the two high notes get a
    // fourteen-rung ladder; by worst excursion the bar goes treble, where the
    // low notes need three ledger lines and the high ones none.
    const notes = bar([51, 51, 51, 53, 53, 54, 56, 56, 82, 82]);
    expect(read(clefPlan([notes]))).toEqual(['treble']);
  });

  it('leaves a bar that really is low alone', () => {
    expect(read(clefPlan([bar([43, 45, 47, 50, 52, 55, 57])]))).toEqual(['bass']);
  });
});

describe('a bar of its own length later in the piece', () => {
  // Arctic Caverns: six bars of 4/4, a run of 2/4, and 4/4 again half a bar later.
  const grid = barGrid(64, 64, [{ bar: 6, ticks: 32 }]);

  it('moves every bar line after it by the difference', () => {
    expect([5, 6, 7, 8].map((bar) => barStartOf(grid, bar))).toEqual([320, 384, 416, 480]);
    expect([5, 6, 7].map((bar) => barTicksOf(grid, bar))).toEqual([64, 32, 64]);
  });

  it('finds the bar a tick falls in on either side of it', () => {
    expect([383, 384, 415, 416, 479, 480].map((tick) => barAt(grid, tick))).toEqual([
      5, 6, 6, 7, 7, 8,
    ]);
  });

  it('puts the 1440-tick loop on a bar line', () => {
    expect(barStartOf(grid, barAt(grid, 1440))).toBe(1440);
    expect(barCountOf(grid, 1440)).toBe(23);
  });

  it('stays the plain grid without one', () => {
    expect(barStartOf(barGrid(), 7)).toBe(448);
    expect(barAt(barGrid(64, 38), 38)).toBe(1);
  });
});

describe('white keys spelt flat', () => {
  it('writes B as C-flat, an octave up, in a key that flattens C', () => {
    expect(staffKey(59, keyOf('Gb'))).toBe('cb/4');
    expect(staffKey(71, keyOf('Gb'))).toBe('cb/5');
  });

  it('keeps B and E as they are where the key leaves C and F alone', () => {
    expect(staffKey(59, keyOf('Db'))).toBe('b/3');
    expect(staffKey(64, keyOf('Gb'))).toBe('e/4');
    expect(staffKey(59)).toBe('b/3');
  });
});

describe('flats the key does not carry', () => {
  it('writes the named black keys flat and leaves the signature as it is', () => {
    const key = keyOf('F+Db+Ab');
    expect(key.letters).toEqual(['b']);
    expect([61, 68, 66].map((midi) => staffKey(midi, key))).toEqual(['db/4', 'ab/4', 'f#/4']);
    expect(signatureName('F+Db+Ab')).toBe('F');
    expect(signatureName('Eb')).toBe('Eb');
  });
});

describe('timeSignatureOf with a named beat', () => {
  it('writes a bar of 128 ticks in halves when asked, and in quarters when not', () => {
    expect(timeSignatureOf(128, 2)).toEqual({ beats: 4, beatValue: 2 });
    expect(timeSignatureOf(128)).toEqual({ beats: 8, beatValue: 4 });
  });

  it('falls back when the named beat does not divide the bar', () => {
    expect(timeSignatureOf(38, 2)).toEqual(timeSignatureOf(38));
    expect(timeSignatureOf(64)).toEqual({ beats: 4, beatValue: 4 });
    expect(timeSignatureOf(32)).toEqual({ beats: 2, beatValue: 4 });
  });
});

describe('all fifteen keys', () => {
  it('knows seven sharps and seven flats', () => {
    expect(keyOf('C#').letters).toEqual(['f', 'c', 'g', 'd', 'a', 'e', 'b']);
    expect(keyOf('Cb').letters).toEqual(['b', 'e', 'a', 'd', 'g', 'c', 'f']);
    // B3 is C-flat 4, in the octave above its B.
    expect(staffKey(59, keyOf('Cb'))).toBe('cb/4');
  });
});

describe('chordKeys', () => {
  it('spells a chord by its intervals: E-flat with G-flat, not F-sharp', () => {
    const eb = keyOf('Eb');
    expect(staffKey(66, eb)).toBe('f#/4');
    expect(chordKeys([63, 66], eb)).toEqual(['eb/4', 'gb/4']);
    expect(chordKeys([63, 66, 68], eb)).toEqual(['eb/4', 'gb/4', 'ab/4']);
  });

  it('keeps a chord the key already spells, and a single note as staffKey has it', () => {
    expect(chordKeys([62, 66, 69], keyOf('D'))).toEqual(['d/4', 'f#/4', 'a/4']);
    expect(chordKeys([61], keyOf('C'))).toEqual(['c#/4']);
  });
});

describe('exact tuplets', () => {
  const tupletOf = (items: { tuplet?: { num: number; occupied: number } }[]) =>
    items.filter((item) => item.tuplet).map((item) => `${item.tuplet!.num}:${item.tuplet!.occupied}`);
  const fifth = 16 / 5;

  it('reads five sixteenths in a quarter as a quintuplet', () => {
    const notes = Array.from({ length: 5 }, (_, i) => ({ start: i * fifth, ticks: fifth, midi: 60 + i }));
    const items = staffItems([...notes, { start: 16, ticks: 48, midi: 72 }], 64);
    expect(tupletOf(items)).toEqual(['5:4', '5:4', '5:4', '5:4', '5:4']);
    expect(items.slice(0, 5).map((item) => item.duration)).toEqual(['16', '16', '16', '16', '16']);
    expect(items[5]).toMatchObject({ start: 16, duration: 'h', dots: 1 });
  });

  it('reads seven in the time of four, nine in the time of eight, and six in the time of four', () => {
    for (const [num, span, occupied, duration] of [
      [7, 16, 4, '16'],
      [9, 32, 8, '16'],
      [6, 16, 4, '16'],
      [11, 32, 8, '16'],
      [13, 64, 8, '8'],
    ] as const) {
      const unit = span / num;
      const notes = Array.from({ length: num }, (_, i) => ({ start: i * unit, ticks: unit, midi: 60 }));
      const items = staffItems(notes, 64);
      expect(tupletOf(items).length).toBe(num);
      expect(items[0].tuplet).toMatchObject({ num, occupied, first: true });
      expect(items[num - 1].tuplet).toMatchObject({ last: true });
      expect(items[0].duration).toBe(duration);
    }
  });

  it('takes mixed values and rests inside one bracket: a quarter and an eighth in an eighth triplet', () => {
    const third = 16 / 3;
    const items = staffItems(
      [
        { start: 0, ticks: 2 * third, midi: 67 },
        { start: 2 * third, ticks: third, midi: 69 },
        { start: 16 + third, ticks: 2 * third, midi: 71 },
      ],
      32
    );
    expect(items.map((item) => [item.midi, item.duration, item.tuplet?.num ?? 0])).toEqual([
      [67, 'q', 3],
      [69, '8', 3],
      [null, '8', 3],
      [71, 'q', 3],
    ]);
  });

  it('fills the bar to its line after a tuplet', () => {
    const notes = Array.from({ length: 5 }, (_, i) => ({ start: i * fifth, ticks: fifth, midi: 60 }));
    const bars = staffMeasures(staffItems(notes, 64), 64);
    expect(bars).toHaveLength(1);
    expect(bars[0].items.reduce((sum, item) => sum + item.ticks, 0)).toBeCloseTo(64, 9);
  });

  it('leaves whole-tick music as it was — a driver triplet is still 10 + 11 + 11', () => {
    const items = staffItems(
      [
        { start: 0, ticks: 10, midi: 60 },
        { start: 10, ticks: 11, midi: 62 },
        { start: 21, ticks: 11, midi: 64 },
      ],
      32
    );
    expect(tupletOf(items)).toEqual(['3:2', '3:2', '3:2']);
  });
});

describe('which bracket', () => {
  const third = 16 / 3;
  it('puts one bracket over a beat with a rest in its middle, not two over its halves', () => {
    const items = staffItems(
      [
        { start: 0, ticks: third, midi: 71 },
        { start: 2 * third, ticks: third, midi: 72 },
      ],
      16
    );
    expect(items.map((item) => [item.midi, item.duration, item.tuplet?.num ?? 0])).toEqual([
      [71, '8', 3],
      [null, '8', 3],
      [72, '8', 3],
    ]);
  });

  it('keeps a sixteenth triplet to the half of the beat it is in', () => {
    const items = staffItems(
      [
        { start: 0, ticks: 8 / 3, midi: 60 },
        { start: 8 / 3, ticks: 8 / 3, midi: 62 },
        { start: 16 / 3, ticks: 8 / 3, midi: 64 },
        { start: 8, ticks: 8, midi: 65 },
      ],
      16
    );
    expect(items.map((item) => [item.midi, item.duration, item.tuplet ? `${item.tuplet.num}:${item.tuplet.occupied}` : ''])).toEqual([
      [60, '16', '3:2'],
      [62, '16', '3:2'],
      [64, '16', '3:2'],
      [65, '8', ''],
    ]);
  });
});
