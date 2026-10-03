import { describe, expect, it } from 'vitest';
import { MEASURE_TICKS, barGrid, type StaffItem } from '../src/notation.js';
import {
  DRUMS_PART,
  accentBeamGroups,
  accentedStarts,
  barKeys,
  crossBarRuns,
  bendLabel,
  buildScore,
  crossStaffVoice,
  drawnAlong,
  effectsOf,
  dynamicMarks,
  dynamicOf,
  noiseKey,
  partStaves,
  pitchEffect,
  splitGrandStaff,
} from '../src/score.js';

describe('splitGrandStaff', () => {
  it('puts middle C and above on the treble staff, the rest on the bass', () => {
    const { treble, bass } = splitGrandStaff([
      { midi: 59 },
      { midi: 60 },
      { midi: 72 },
      { midi: 36 },
    ]);
    expect(treble.map((note) => note.midi)).toEqual([60, 72]);
    expect(bass.map((note) => note.midi)).toEqual([59, 36]);
  });
});

describe('pitchEffect', () => {
  it('leaves out a drift of less than half a semitone', () => {
    expect(
      pitchEffect(
        [
          [0, 0],
          [1, 0.2],
        ],
        8
      )
    ).toBeNull();
  });

  it('reads a curve that moves one way and stays as a slide, from where it starts moving', () => {
    const curve = [
      [0, 0],
      [0.5, 0],
      [0.6, 0.4],
      [1, 1.3],
    ] as const;
    expect(pitchEffect(curve, 24)).toEqual({ kind: 'slide', semitones: 1.3, from: 0.5, ticks: 24 });
  });

  it('does not mistake a flicker before a slide for a vibrato', () => {
    // Ragnarok's canyon, triangle, bar 15: E3 flickers by 0.05, then falls five semitones to a B.
    const curve = [
      [0, 0],
      [0.0556, 0],
      [0.1111, 0.051],
      [0.1667, 0],
      [0.2222, 0.051],
      [0.2778, -0.554],
      [0.3333, -1.044],
      [0.3889, -1.613],
      [0.4444, -2.073],
      [0.5, -2.61],
      [0.5556, -3.045],
      [0.6111, -3.553],
      [0.6667, -3.965],
      [0.7222, -4.447],
      [0.7778, -4.839],
      [0.8333, -5.298],
      [0.8889, -5.26],
      [0.9444, -5.298],
      [1, -5.26],
    ] as const;
    expect(pitchEffect(curve, 16)).toMatchObject({ kind: 'slide', semitones: -5.3 });
    // Too far to bend, so it stays a glissando line down to the B — landing on no written note
    // (a D3 follows), which is what puts a bracketed B at the end of the line.
    const effect = effectsOf([
      { start: 898, ticks: 16, midi: 52, bend: curve },
      { start: 916, ticks: 8, midi: 50 },
    ]).get(898);
    expect(effect).toMatchObject({ kind: 'slide', arrives: false });
  });

  it('reads a curve that swings back and forth as a vibrato', () => {
    const curve = [
      [0, 0],
      [0.1, 1],
      [0.2, -1],
      [0.3, 1],
      [0.4, -1],
      [0.5, 0],
    ] as const;
    expect(pitchEffect(curve, 32)).toEqual({ kind: 'vibrato', depth: 1, ticks: 32 });
  });

  it('keeps the curve of a vibrato wider than a semitone, so the staff can draw it', () => {
    // Turbo Tunnel Race, bar 31: a D6 swinging four semitones up and two and a half down.
    const curve = [
      [0, 0],
      [0.2, 4.1],
      [0.4, -2.6],
      [0.6, 4.1],
      [0.8, -2.6],
      [1, 0],
    ] as const;
    const effect = pitchEffect(curve, 64);
    expect(effect).toMatchObject({ kind: 'vibrato', ticks: 64, curve });
    expect(effect && drawnAlong(effect)).toBe(true);
  });

  it('writes a light vibrato as a wave, without its curve', () => {
    // Surf City, pulse 1, bar 2: a wobble of a tenth of a semitone, which the roll shows and the ear hears.
    const curve = [
      [0, 0],
      [0.0741, 0],
      [0.1481, 0.097],
      [0.2222, 0.097],
      [0.2963, -0.096],
      [0.3704, 0.097],
      [0.4444, 0.097],
      [0.5185, -0.096],
      [0.5926, 0.097],
      [0.6667, 0.097],
      [0.7407, -0.096],
      [1, 0],
    ] as const;
    const effect = pitchEffect(curve, 32);
    expect(effect).toMatchObject({ kind: 'vibrato', ticks: 32 });
    expect((effect as { curve?: unknown } | null)?.curve).toBeUndefined();
  });

  it('leaves a one-way drift at the end of a short note unwritten', () => {
    // Wookie hole, pulse 1, bar 11: two ticks that end 0.18 above the note. The music tool calls it
    // vibrato — the modulation is on — but nothing swings inside the note.
    const curve = [
      [0, 0],
      [0.25, 0],
      [0.5, 0],
      [0.75, 0],
      [1, 0.184],
    ] as const;
    expect(pitchEffect(curve, 2)).toBeNull();
  });
});

describe('effectsOf', () => {
  const up = (semitones: number) =>
    [
      [0, 0],
      [0.5, 0],
      [1, semitones],
    ] as const;

  it('reads a slide that goes nowhere written as a bend on its own note', () => {
    // Ragnarok's canyon, pulse 1, bar 5: D#4 pulled up 1.3, then an A3.
    const effects = effectsOf([
      { start: 296, ticks: 24, midi: 63, bend: up(1.3) },
      { start: 320, ticks: 4, midi: 57 },
    ]);
    expect(effects.get(296)?.kind).toBe('bend');
  });

  it('reads a slide that arrives on the next note as a glissando', () => {
    // The title music: G4 up 1.9 into an A4 straight after it.
    const effects = effectsOf([
      { start: 318, ticks: 16, midi: 67, bend: up(1.9) },
      { start: 334, ticks: 16, midi: 69 },
    ]);
    expect(effects.get(318)).toMatchObject({ kind: 'slide', arrives: true });
  });

  it('reads a sweep of any size as a bend when the next note returns to where it started', () => {
    // Clinger Winger, pulse 1: E2 pushed up 6.7 over four bars, then E2 again.
    const effects = effectsOf([
      { start: 128, ticks: 255, midi: 40, bend: up(6.7) },
      { start: 384, ticks: 4, midi: 40 },
    ]);
    expect(effects.get(128)).toMatchObject({ kind: 'bend', semitones: 6.7 });
  });

  it('carries a movement drawn along its note onto every piece tied on after the head', () => {
    // The same E2 over four bars: its bars after the first must know the line runs through them.
    const model = buildScore(
      [
        {
          id: 'p',
          notes: [
            { start: 128, ticks: 255, midi: 40, bend: up(6.7) },
            { start: 384, ticks: 4, midi: 40 },
          ],
        },
      ],
      [],
      448
    );
    const items = model.staves[0].bars.flat();
    const head = items.find((item) => item.effect);
    const carried = items.filter((item) => item.carry);
    expect(head).toMatchObject({ start: 128, effect: { kind: 'bend' } });
    expect(carried.length).toBeGreaterThanOrEqual(3);
    expect(carried.every((item) => item.carry?.start === 128 && item.carry.midi === 40)).toBe(true);
    // The E2 struck again after the bend is a note of its own, not part of the line.
    expect(items.find((item) => item.start === 384)?.carry).toBeUndefined();
  });

  it('keeps a sweep too wide to bend as a line', () => {
    const effects = effectsOf([{ start: 2, ticks: 126, midi: 91, bend: up(-20.7) }]);
    expect(effects.get(2)?.kind).toBe('slide');
  });
});

describe('bendLabel', () => {
  it('writes every bend as its size in semitones, one decimal, whichever way it goes', () => {
    expect([1, 2, 3, -2.6, 0.91, 1.302].map(bendLabel)).toEqual([
      '1.0',
      '2.0',
      '3.0',
      '2.6',
      '0.9',
      '1.3',
    ]);
  });
});

describe('crossStaffVoice', () => {
  const item = (
    start: number,
    midi: number | null,
    duration = '16',
    ticks = 4,
    extra: Partial<StaffItem> = {}
  ): StaffItem => ({
    start,
    ticks,
    midi,
    duration,
    dots: 0,
    tieStart: false,
    tieStop: false,
    ...extra,
  });
  const beat = (start: number, pitches: number[]) =>
    pitches.map((midi, i) => item(start + i * 4, midi));
  const staffs = (bars: StaffItem[][]) =>
    crossStaffVoice(bars).map((bar) => bar.map((i) => i.staff));

  it('puts a beat that never goes below E3 on the treble, and one that does on the bass', () => {
    // Ragnarok's canyon, pulse 1, bar 29: an arpeggio from A2 up to G5.
    const bar = [
      ...beat(0, [45, 48, 45, 52]),
      // E3 G3 C3 E3: it goes under E3, so it stays on the bass, E3s and all.
      ...beat(16, [52, 55, 48, 52]),
      // A3 G3 C4 A3: never under E3, so the treble.
      ...beat(32, [57, 55, 60, 57]),
      ...beat(48, [69, 67, 72, 69]),
    ];
    expect(staffs([bar])).toEqual([[...Array(8).fill('bass'), ...Array(8).fill('treble')]]);
  });

  it('sends the heads from middle C up across to the treble from a beat kept on the bass', () => {
    // Bar 30: B2 with a lone G5 among the low notes.
    expect(staffs([beat(0, [47, 79, 51, 47])])).toEqual([['bass', 'treble', 'bass', 'bass']]);
  });

  it('writes a note on its own by its pitch: E3 and up on the treble', () => {
    const bar = [item(0, 50, 'q', 16), item(16, 52, 'q', 16), item(40, 63, 'q', 24, { dots: 1 })];
    expect(staffs([bar])).toEqual([['bass', 'treble', 'treble']]);
  });

  it('keeps bar 6 whole on the treble: A3 against E4 and G4', () => {
    expect(staffs([[...beat(0, [57, 67, 67, 57]), ...beat(16, [64, 57, 64, 64])]])).toEqual([
      ['treble', 'treble', 'treble', 'treble', 'treble', 'treble', 'treble', 'treble'],
    ]);
  });

  it('leaves a piece tied on over the bar line on the staff its head stood on', () => {
    const first = [item(48, 62, 'q', 16, { tieStart: true })];
    const second = [item(64, 62, '8', 8, { tieStop: true }), ...beat(72, [48, 50])];
    expect(staffs([first, second])).toEqual([['treble'], ['treble', 'bass', 'bass']]);
  });

  it('gives a bar with no heads to the treble', () => {
    expect(staffs([[item(0, null, 'w', 64)]])).toEqual([['treble']]);
  });
});

describe('partStaves', () => {
  const range = (low: number, high: number) => [{ midi: low }, { midi: high }];

  it('writes a part that stays low on the bass staff alone', () => {
    // Ragnarok's canyon's triangle: B1 to D#4.
    expect(partStaves(range(35, 63))).toEqual(['bass']);
  });

  it('writes a part that stays high on the treble staff alone', () => {
    // Rat race's pulse 1: A#4 to D#6.
    expect(partStaves(range(70, 87))).toEqual(['treble']);
  });

  it('gives a part that spans both registers a grand staff', () => {
    expect(partStaves(range(41, 81))).toEqual(['treble', 'bass']);
  });

  it('lets the middle decide when either staff would do', () => {
    expect(partStaves([{ midi: 57 }, { midi: 62 }, { midi: 63 }])).toEqual(['treble']);
    expect(partStaves([{ midi: 56 }, { midi: 56 }, { midi: 63 }])).toEqual(['bass']);
  });
});

describe('dynamicOf', () => {
  it('reads the APU volume in six even steps', () => {
    expect([0, 2, 3, 5, 6, 7, 8, 10, 11, 13, 14, 15].map(dynamicOf)).toEqual([
      'pp',
      'pp',
      'p',
      'p',
      'mp',
      'mp',
      'mf',
      'mf',
      'f',
      'f',
      'ff',
      'ff',
    ]);
  });
});

describe('dynamicMarks', () => {
  it('marks only where the level changes', () => {
    const marks = dynamicMarks([
      { start: 0, volume: 15 },
      { start: 16, volume: 15 },
      { start: 32, volume: 8 },
    ]);
    expect(marks).toEqual([
      { tick: 0, dynamic: 'ff' },
      { tick: 32, dynamic: 'mf' },
    ]);
  });

  it('keeps the louder of two changes closer than a beat', () => {
    const marks = dynamicMarks([
      { start: 0, volume: 8 },
      { start: 4, volume: 15 },
      { start: 8, volume: 3 },
    ]);
    expect(marks).toEqual([{ tick: 0, dynamic: 'ff' }]);
  });

  it('drops a change that comes straight back to the level before it', () => {
    const marks = dynamicMarks([
      { start: 0, volume: 15 },
      { start: 32, volume: 3 },
      { start: 36, volume: 15 },
    ]);
    expect(marks).toEqual([{ tick: 0, dynamic: 'ff' }]);
  });
});

describe('noiseKey', () => {
  it('puts the periods on the lines the MusicXML export uses, hats as crosses', () => {
    expect(Array.from({ length: 16 }, (_, period) => noiseKey(period))).toEqual([
      'g/5/x',
      'g/5/x',
      'g/5/x',
      'f/5/x',
      'f/5/cx',
      'e/5/cx',
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
    ]);
  });

  it('reads only the low nibble', () => {
    expect(noiseKey(0x8f)).toBe('e/4');
  });
});

describe('barKeys', () => {
  it('changes key from the bar the change falls in', () => {
    // Volkmire's Inferno Race: 2/4 bars, barred from tick 6 (a shift of 26), D major from tick 870.
    const keys = barKeys(44, 0, barGrid(32, 38), 'F', [{ tick: 870, key: 'D' }]);
    expect(keys[26]).toBe('F');
    // The opening bar is 38 ticks, so 870 is (870 - 38) / 32 = 26 bars past it — the 28th.
    expect(keys[27]).toBe('D');
    expect(keys[43]).toBe('D');
  });

  it('leaves every bar in the opening key when nothing changes', () => {
    expect(new Set(barKeys(4, 0, barGrid(), 'G'))).toEqual(new Set(['G']));
  });
});

describe('buildScore', () => {
  it('writes each part on two staves and the drums on one, every bar four beats', () => {
    const score = buildScore(
      [
        {
          id: 'lead',
          notes: [
            { start: 0, ticks: 16, midi: 72 },
            { start: 16, ticks: 16, midi: 48 },
          ],
        },
      ],
      [{ start: 0, ticks: 8, period: 15 }],
      64
    );
    expect(score.staves.map((stave) => `${stave.partId}:${stave.kind}`)).toEqual([
      'lead:treble',
      'lead:bass',
      `${DRUMS_PART}:percussion`,
    ]);
    const [treble, bass, drums] = score.staves;
    // One voice across the grand staff, each head on the stave its pitch belongs to.
    const heads = (treble.voiceBars ?? []).flat().filter((item) => item.midi !== null);
    expect(heads.map((item) => item.staff)).toEqual(['treble', 'bass']);
    expect(bass.follows).toBe(true);
    for (const bars of [treble.voiceBars ?? [], drums.bars]) {
      expect(bars).toHaveLength(score.barCount);
      for (const bar of bars) {
        expect(bar.reduce((sum, item) => sum + item.ticks, 0)).toBe(MEASURE_TICKS);
      }
    }
  });

  it('bars a 2/4 track in half bars, every bar two beats', () => {
    const score = buildScore([{ id: 'lead', notes: [{ start: 0, ticks: 64, midi: 72 }] }], [], 64, {
      measureTicks: 32,
    });
    expect(score.grid.measureTicks).toBe(32);
    expect(score.barCount).toBe(2);
    for (const bar of score.staves[0].bars) {
      expect(bar.reduce((sum, item) => sum + item.ticks, 0)).toBe(32);
    }
  });

  it('writes the pickup inside a longer opening bar when asked', () => {
    // Volkmire's Inferno Race: 2/4 barred from tick 6, so the opening bar is 6 + 32 = 38 ticks.
    const notes = [
      { start: 0, ticks: 10, midi: 66 },
      { start: 10, ticks: 60, midi: 54 },
    ];
    const merged = buildScore([{ id: 'lead', notes }], [], 70, {
      offset: 6,
      measureTicks: 32,
      mergePickup: true,
    });
    expect(merged.shift).toBe(0);
    expect(merged.grid).toEqual({ measureTicks: 32, firstBarTicks: 38 });
    expect(merged.barCount).toBe(2);
    const bars = merged.staves[0].voiceBars ?? merged.staves[0].bars;
    expect(bars[0].reduce((sum, item) => sum + item.ticks, 0)).toBe(38);
    expect(bars[1].reduce((sum, item) => sum + item.ticks, 0)).toBe(32);

    // The ordinary reading of the same track pads a bar of rests in front instead.
    const padded = buildScore([{ id: 'lead', notes }], [], 70, { offset: 6, measureTicks: 32 });
    expect(padded.shift).toBe(26);
    expect(padded.barCount).toBe(3);
  });

  it('writes a drum hit that crosses a bar line as one head, not two', () => {
    const score = buildScore([], [{ start: 48, ticks: 32, period: 7 }], 96);
    const heads = score.staves[0].bars.flat().filter((item) => item.midi !== null);
    expect(heads).toHaveLength(1);
    expect(heads[0].tieStart || heads[0].tieStop).toBe(false);
  });

  it('keeps each part’s dynamics in the score’s own ticks', () => {
    const score = buildScore(
      [{ id: 'lead', notes: [{ start: 0, ticks: 16, midi: 72, volume: 15 }] }],
      [],
      64
    );
    expect(score.dynamics.lead).toEqual([{ tick: score.shift, dynamic: 'ff' }]);
  });

  it('puts drums delayed by a tick back on the beat, sliver and all', () => {
    const score = buildScore(
      [],
      [
        { start: 0, ticks: 1, period: 0 },
        { start: 1, ticks: 64, period: 0 },
        { start: 65, ticks: 16, period: 7 },
        { start: 81, ticks: 16, period: 7 },
        { start: 97, ticks: 32, period: 7 },
      ],
      128
    );
    const items = score.staves[0].bars.flat();
    expect(items.every((item) => item.start % 16 === 0)).toBe(true);
  });

  it('marks a slide on its head once, not again on the piece tied over the bar line', () => {
    const score = buildScore(
      [
        {
          id: 'lead',
          notes: [
            {
              start: 48,
              ticks: 32,
              midi: 72,
              bend: [
                [0, 0],
                [1, 2],
              ],
            },
          ],
        },
      ],
      [],
      128
    );
    const marked = score.staves[0].bars.flat().filter((item) => item.effect);
    expect(marked).toHaveLength(1);
    expect(marked[0].start).toBe(48);
    expect(marked[0].effect).toMatchObject({ kind: 'bend', semitones: 2, ticks: 32 });
  });

  it('writes a low part on one bass staff', () => {
    const score = buildScore(
      [
        {
          id: 'bass',
          notes: [
            { start: 0, ticks: 16, midi: 40 },
            { start: 16, ticks: 16, midi: 63 },
          ],
        },
      ],
      [],
      64
    );
    expect(score.staves.map((stave) => stave.kind)).toEqual(['bass']);
    expect(score.staves[0].bars.flat().filter((item) => item.midi !== null)).toHaveLength(2);
  });
});

describe('the ROM level on a head', () => {
  // Ragnarok's canyon, bar 3: four sixteenths a beat, the driver stepping 4 3 2 1 down each one.
  const score = buildScore(
    [
      {
        id: 'lead',
        notes: [
          { start: 0, ticks: 4, midi: 64, volume: 4 },
          { start: 4, ticks: 4, midi: 64, volume: 3 },
          { start: 8, ticks: 32, midi: 64, volume: 2 },
        ],
      },
    ],
    [{ start: 0, ticks: 8, period: 15, volume: 9 }],
    64
  );
  const heads = (score.staves[0].voiceBars ?? score.staves[0].bars)
    .flat()
    .filter((item) => item.midi !== null);

  it('carries each note own level, in the ROM own numbers', () => {
    expect(heads.map((item) => item.volume)).toEqual([4, 3, 2]);
  });

  it('leaves the piece tied on after a head without one', () => {
    const tied = (score.staves[0].voiceBars ?? []).flat().filter((item) => item.tieStop);
    expect(tied.every((item) => item.volume === undefined)).toBe(true);
  });

  it('carries a drum level too, and says nothing where a channel has no volume', () => {
    const drums = score.staves[score.staves.length - 1].bars.flat();
    expect(drums.find((item) => item.midi !== null)?.volume).toBe(9);
    const quiet = buildScore([{ id: 'tri', notes: [{ start: 0, ticks: 64, midi: 48 }] }], [], 64);
    expect(quiet.staves[0].bars.flat().every((item) => item.volume === undefined)).toBe(true);
  });
});

describe('accentedStarts', () => {
  /** Ragnarok's canyon, bar 25: sixteenths at a steady 4 with 7s between the beats. */
  const bar25 = [9, 9, 7, 7, 4, 7, 4, 7, 4, 2, 7, 7, 4, 7, 4, 9].map((volume, at) => ({
    start: 1536 + at * 4,
    ticks: 4,
    midi: 67,
    volume,
  }));

  it('marks the notes that lean between the beats', () => {
    expect([...accentedStarts(bar25)].map((start) => (start - 1536) / 4)).toEqual([5, 7, 10, 13]);
  });

  it('leaves a rise that lands ON the beat unmarked', () => {
    const onBeat = [4, 4, 4, 9].map((volume, at) => ({
      start: at * 16,
      ticks: 16,
      midi: 67,
      volume,
    }));
    expect(accentedStarts(onBeat).size).toBe(0);
  });

  it('wants the note to hold its height: a rise straight into a louder note is not a lean', () => {
    const rising = [2, 5, 9, 12].map((volume, at) => ({
      start: at * 4,
      ticks: 4,
      midi: 67,
      volume,
    }));
    expect(accentedStarts(rising).size).toBe(0);
  });

  it('says nothing about a voice with no volume of its own', () => {
    expect(accentedStarts([{ start: 4, ticks: 4, midi: 67 }]).size).toBe(0);
  });
});

describe('crossBarRuns', () => {
  const grid = barGrid();
  /** Ragnarok's canyon, bars 25-26: an accented E3 on the bar's last sixteenth, D3 E3 after it. */
  const figure = [
    { start: 1588, ticks: 4, midi: 67, volume: 7 },
    { start: 1592, ticks: 4, midi: 67, volume: 4 },
    { start: 1596, ticks: 4, midi: 52, volume: 9 },
    { start: 1600, ticks: 4, midi: 50, volume: 9 },
    { start: 1604, ticks: 4, midi: 52, volume: 9 },
    { start: 1608, ticks: 4, midi: 66, volume: 7 },
  ];

  it('carries the beam off the bar line and onto the heads that hold the level', () => {
    expect([...crossBarRuns(figure, grid).entries()]).toEqual([
      [1596, 'start'],
      [1600, 'join'],
      [1604, 'join'],
    ]);
  });

  it('leaves a run alone when the level changes across the line', () => {
    const quieter = figure.map((note) => (note.start === 1600 ? { ...note, volume: 4 } : note));
    expect(crossBarRuns(quieter, grid).size).toBe(0);
  });

  it('wants the last head accented, not merely loud', () => {
    const level = figure.map((note) => ({ ...note, volume: 9 }));
    expect(crossBarRuns(level, grid).size).toBe(0);
  });

  it('stops after CROSS_BAR_RUN heads', () => {
    const long = [
      ...figure.slice(0, 5),
      { start: 1608, ticks: 4, midi: 52, volume: 9 },
      { start: 1612, ticks: 4, midi: 52, volume: 9 },
    ];
    expect([...crossBarRuns(long, grid).values()]).toHaveLength(4);
  });
});

describe('accentBeamGroups', () => {
  /** Ragnarok's canyon, bar 25 as the staff has it: the pair at 9, then the run the accents cut. */
  const bar25 = [9, 9, 7, 7, 4, 7, 4, 7, 4, 2, 7, 7, 4, 7, 4].map((volume, at) => ({
    start: 1536 + at * 4,
    ticks: 4,
    midi: 67,
    volume,
    accent: [5, 7, 10, 13].includes(at),
    duration: '16',
    dots: 0,
    tieStart: false,
    tieStop: false,
  }));
  const levels = new Map(bar25.map((item) => [item.start, item.volume]));
  const sizes = (items: readonly { beamGroup?: number }[]) => {
    const runs: number[] = [];
    let last: number | undefined;
    for (const item of items) {
      if (item.beamGroup !== last) runs.push(0);
      last = item.beamGroup;
      runs[runs.length - 1]++;
    }
    return runs;
  };

  it('cuts at every accent, and after the figure peak the bar opens on', () => {
    const [items] = accentBeamGroups([bar25], { from: 1536, to: 1600 }, levels);
    expect(sizes(items)).toEqual([2, 3, 2, 3, 3, 2]);
  });

  it('leaves a voice with no accents beamed by the beat', () => {
    const level = bar25.map((item) => ({ ...item, accent: false, volume: 12 }));
    const flat = new Map(level.map((item) => [item.start, item.volume]));
    const [items] = accentBeamGroups([level], { from: 1536, to: 1600 }, flat);
    expect(items.every((item) => item.beamGroup === undefined)).toBe(true);
  });

  it('leaves the bars before it beamed by the beat', () => {
    const [items] = accentBeamGroups([bar25], { from: 1600, to: 1664 }, levels);
    expect(items.every((item) => item.beamGroup === undefined)).toBe(true);
  });
});

describe('buildScore phases', () => {
  it("records each part's delay taken out, so a page can compare the staff's clock with the piece's", () => {
    // Every note a tick late: the part's own delay, taken out on the staff.
    const late = Array.from({ length: 16 }, (_, i) => ({ start: 1 + i * 8, ticks: 8, midi: 60 }));
    const model = buildScore([{ id: 'late', notes: late }], [], 129);
    expect(model.phases.late).toBe(1);
  });
});

describe('accents only where they were read', () => {
  // Arctic Caverns' echo: every second note far quieter — 8, 3, 8, 3 — two bars of sixteenths.
  const echo = Array.from({ length: 32 }, (_, i) => ({
    start: i * 4,
    ticks: 4,
    midi: 52,
    volume: i % 2 === 0 ? 8 : 3,
  }));
  const accented = (model: ReturnType<typeof buildScore>) =>
    model.staves
      .flatMap((stave) => stave.bars.flat())
      .filter((item) => (item as { accent?: boolean }).accent)
      .map((item) => item.start);

  it('marks none without a passage read by its accents', () => {
    expect(accented(buildScore([{ id: 'p', notes: echo }], [], 128))).toEqual([]);
  });

  it('marks them inside the passage and nowhere else', () => {
    const inside = accented(
      buildScore([{ id: 'p', notes: echo }], [], 128, {
        accentBeams: { from: 64, to: 128 },
      })
    );
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.every((start) => start >= 64)).toBe(true);
  });
});

describe('a strike in front of a note', () => {
  it('is not read as part of its vibrato', () => {
    const wave = Array.from({ length: 40 }, (_, i): [number, number] => [
      0.1 + (i / 40) * 0.9,
      0.7 * Math.sin(i),
    ]);
    const effect = pitchEffect([[0, 6], [0.02, 2], [0.04, -1], [0.06, 0], ...wave], 48);
    expect(effect?.kind).toBe('vibrato');
    expect(effect && 'depth' in effect && effect.depth).toBeLessThan(1);
  });

  it('is not written at all on a note that then holds its pitch', () => {
    expect(
      pitchEffect(
        [
          [0, 7],
          [0.06, 3],
          [0.12, 0],
          [1, 0],
        ],
        32
      )
    ).toBeNull();
    expect(
      pitchEffect(
        [
          [0, -19],
          [0.06, 0],
          [1, 0],
        ],
        32
      )
    ).toBeNull();
  });

  it('is still a slide when the pitch does not come back early', () => {
    expect(
      pitchEffect(
        [
          [0, 0],
          [1, 2],
        ],
        32
      )?.kind
    ).toBe('slide');
  });
});

describe('staccato', () => {
  it('puts the dot on the head of a note played short, and on no piece tied after it', () => {
    const score = buildScore(
      [
        {
          id: 'p',
          notes: [
            { start: 0, ticks: 8, midi: 60, staccato: true },
            { start: 8, ticks: 8, midi: 62 },
          ],
        },
      ],
      [],
      64
    );
    const heads = score.staves[0].bars.flat().filter((item) => item.midi !== null);
    expect(heads.map((item) => !!item.staccato)).toEqual([true, false]);
  });
});

describe('drums at the same moment', () => {
  it('are one chord, and the bar keeps its rhythm', () => {
    const score = buildScore(
      [],
      [
        { start: 0, ticks: 8, period: 1 },
        { start: 0, ticks: 4, period: 15 },
        { start: 8, ticks: 8, period: 7 },
      ],
      64
    );
    const heads = score.staves[0].bars.flat().filter((item) => item.midi !== null);
    expect(heads.map((item) => [item.start, item.midi, item.chord ?? []])).toEqual([
      [0, 1, [15]],
      [8, 7, []],
    ]);
  });
});

describe('notes struck together in a part', () => {
  it('are one head with a chord, read from the highest, as long as the longest', () => {
    const score = buildScore(
      [
        {
          id: 'violin',
          notes: [
            { start: 0, ticks: 16, midi: 63 },
            { start: 0, ticks: 16, midi: 66 },
            { start: 0, ticks: 8, midi: 68 },
            { start: 16, ticks: 16, midi: 70 },
          ],
        },
      ],
      [],
      32
    );
    const heads = score.staves[0].bars.flat().filter((item) => item.midi !== null);
    expect(heads.map((item) => [item.start, item.midi, item.ticks, item.chord ?? []])).toEqual([
      [0, 68, 16, [63, 66]],
      [16, 70, 16, []],
    ]);
  });
});
