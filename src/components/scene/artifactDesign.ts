export const ARTIFACT_COLORS = {
  chalk: '#f3f3e9',
  graphite: '#20231e',
  lime: '#d3f36b',
  paper: '#fffef8',
} as const;

export interface FolioDesign {
  number: string;
  paper: string;
  ink: string;
  accent: string;
  motif: 'grid' | 'stripes' | 'arch' | 'mark';
}

export const FOLIO_DESIGNS: readonly FolioDesign[] = [
  {
    number: '06',
    paper: ARTIFACT_COLORS.graphite,
    ink: ARTIFACT_COLORS.chalk,
    accent: ARTIFACT_COLORS.lime,
    motif: 'grid',
  },
  {
    number: '05',
    paper: ARTIFACT_COLORS.chalk,
    ink: ARTIFACT_COLORS.graphite,
    accent: ARTIFACT_COLORS.lime,
    motif: 'stripes',
  },
  {
    number: '04',
    paper: ARTIFACT_COLORS.lime,
    ink: ARTIFACT_COLORS.graphite,
    accent: ARTIFACT_COLORS.paper,
    motif: 'arch',
  },
  {
    number: '03',
    paper: ARTIFACT_COLORS.graphite,
    ink: ARTIFACT_COLORS.chalk,
    accent: ARTIFACT_COLORS.lime,
    motif: 'stripes',
  },
  {
    number: '02',
    paper: ARTIFACT_COLORS.paper,
    ink: ARTIFACT_COLORS.graphite,
    accent: ARTIFACT_COLORS.lime,
    motif: 'grid',
  },
  {
    number: '01',
    paper: ARTIFACT_COLORS.chalk,
    ink: ARTIFACT_COLORS.graphite,
    accent: ARTIFACT_COLORS.lime,
    motif: 'mark',
  },
];

export type MarkPoint = readonly [number, number];

export interface MarkGlyph {
  outline: readonly MarkPoint[];
  holes: readonly (readonly MarkPoint[])[];
}

// One cut-paper letterform supplies both the printed SVG and the raised 3D mark.
export const P100_GLYPHS: readonly MarkGlyph[] = [
  {
    outline: [
      [0, 0],
      [63, 0],
      [77, 14],
      [77, 64],
      [63, 78],
      [24, 78],
      [24, 118],
      [0, 118],
    ],
    holes: [
      [
        [24, 22],
        [52, 22],
        [55, 25],
        [55, 53],
        [52, 56],
        [24, 56],
      ],
    ],
  },
  {
    outline: [
      [96, 19],
      [123, 0],
      [145, 0],
      [145, 118],
      [120, 118],
      [120, 29],
      [96, 43],
    ],
    holes: [],
  },
  {
    outline: [
      [177, 0],
      [231, 0],
      [244, 13],
      [244, 105],
      [231, 118],
      [177, 118],
      [164, 105],
      [164, 13],
    ],
    holes: [
      [
        [190, 23],
        [218, 23],
        [218, 95],
        [190, 95],
      ],
    ],
  },
  {
    outline: [
      [277, 0],
      [331, 0],
      [344, 13],
      [344, 105],
      [331, 118],
      [277, 118],
      [264, 105],
      [264, 13],
    ],
    holes: [
      [
        [290, 23],
        [318, 23],
        [318, 95],
        [290, 95],
      ],
    ],
  },
];

export function polygonPath(points: readonly MarkPoint[]): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + ' Z';
}

export function glyphPath(glyph: MarkGlyph): string {
  return [glyph.outline, ...glyph.holes].map(polygonPath).join(' ');
}
