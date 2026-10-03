import { ARTIFACT_COLORS, FOLIO_DESIGNS, P100_GLYPHS, glyphPath, type FolioDesign } from './artifactDesign';

interface ArtifactStillProps {
  fanned: boolean;
  /**
   * A constrained device (useCapabilities) draws the sleeves, prints and numbering without the ground shadow, faint
   * rules and print motifs. On the 2 GB Galaxy A03s, whose WebView rasters on the thread that also draws the app's
   * frames, the whole drawing's first raster held that thread for 1.2-1.8 s (docs/performance.md, "Low-end phones").
   * The markup leaves them out rather than a stylesheet rule hiding them, which costs the app CSS nothing.
   */
  constrained?: boolean;
}

function CoverPrint({ design, detail }: { design: FolioDesign; detail: boolean }) {
  return (
    <g>
      <rect width="220" height="150" fill={design.paper} />
      <path d="M12 0V150" stroke={design.accent} strokeWidth="8" />
      {detail && <path d="M21 32H201M21 132H201" stroke={design.ink} strokeWidth=".65" opacity=".5" />}
      <path d="M22 20h38m6 0h14" stroke={design.ink} strokeWidth="3" />
      <g stroke={design.ink} strokeWidth="3">
        {Array.from({ length: Number(design.number) }, (_, index) => (
          <path key={index} d={`M${201 - index * 6} 16v8`} />
        ))}
      </g>
      {detail && design.motif === 'mark' && (
        <>
          <g transform="translate(23 48) scale(.51)" fill={design.ink} fillRule="evenodd">
            {P100_GLYPHS.map((glyph, index) => (
              <path key={index} d={glyphPath(glyph)} />
            ))}
          </g>
          <rect x="22" y="119" width="179" height="13" fill={design.accent} />
          <path d="M29 125h18m5 0h42m5 0h12" stroke={design.ink} strokeWidth="3" />
        </>
      )}
      {detail && design.motif === 'stripes' && (
        <g fill={design.accent}>
          {[0, 1, 2, 3, 4, 5].map((stripe) => (
            <path key={stripe} d={`M${25 + stripe * 28} 115l29-69h15l-29 69Z`} />
          ))}
          <path d="M24 121H201" stroke={design.ink} strokeWidth="2" />
        </g>
      )}
      {detail && design.motif === 'grid' && (
        <g fill={design.ink}>
          {Array.from({ length: 15 }, (_, cell) => (
            <rect
              key={cell}
              x={27 + (cell % 5) * 35}
              y={46 + Math.floor(cell / 5) * 25}
              width="26"
              height="17"
              fill={cell === 7 ? design.accent : design.ink}
            />
          ))}
        </g>
      )}
      {detail && design.motif === 'arch' && (
        <g fill="none" stroke={design.ink}>
          <path d="M37 119V91a74 51 0 0 1 148 0v28" strokeWidth="16" />
          <path d="M68 119V92a43 28 0 0 1 86 0v27" strokeWidth="11" />
          <path d="M100 119V92h24v27" stroke={design.accent} strokeWidth="12" />
        </g>
      )}
      <path d="M22 141h28m6 0h8" stroke={design.ink} strokeWidth="2" />
      <path d="M182 139h19m-5-3 5 3-5 3" stroke={design.ink} strokeWidth=".8" fill="none" />
    </g>
  );
}

export default function ArtifactStill({ fanned, constrained = false }: ArtifactStillProps) {
  const detail = !constrained;
  return (
    <svg className="artifact-still" viewBox="0 0 600 360" fill="none" aria-hidden="true" focusable="false">
      {detail && (
        <>
          <g stroke={ARTIFACT_COLORS.graphite} opacity=".25">
            <ellipse cx="300" cy="282" rx="240" ry="60" transform="rotate(-7 300 282)" strokeWidth=".8" />
            <ellipse cx="300" cy="282" rx="206" ry="48" transform="rotate(-7 300 282)" strokeWidth=".65" />
            <path d="m49 300 36-4m-20-7 4 18m458-45 36-4m-20-7 4 18M271 224l3 12m40 92 3 13" />
            <path d="m83 322 15-5m30 18 12-7m344-103-9 9m-49-15-5 8" strokeWidth="1.5" />
          </g>
          <ellipse
            cx="310"
            cy="283"
            rx={fanned ? 196 : 157}
            ry="30"
            fill={ARTIFACT_COLORS.graphite}
            opacity=".09"
            transform="rotate(-7 310 283)"
          />
        </>
      )}
      {FOLIO_DESIGNS.map((design, index) => {
        const middle = index - 2.5;
        const stackX = 300 + (index % 2 === 0 ? -9 : 9);
        const stackY = 258 - index * 23;
        const fanX = 300 + middle * 58;
        const fanY = 168 + Math.abs(middle) * 31;
        const angle = fanned ? middle * 8.2 : index % 2 === 0 ? -7 : 4;

        return (
          <g
            key={design.number}
            className="artifact-still-sleeve"
            style={{
              transform: `translate(${fanned ? fanX : stackX}px, ${fanned ? fanY : stackY}px) rotate(${angle}deg) scale(${fanned ? 0.77 : 1})`,
            }}
          >
            <path
              d="m-43 53 202-61.6v9L-43 62Z"
              fill={index % 2 === 0 ? ARTIFACT_COLORS.chalk : ARTIFACT_COLORS.lime}
              stroke={ARTIFACT_COLORS.graphite}
              strokeWidth=".65"
            />
            <path d="m57.4-89.6 102 81v9l-102-81Z" fill={design.ink} />
            {detail && <path d="m-43 57 194-59" stroke={ARTIFACT_COLORS.graphite} strokeWidth=".75" opacity=".38" />}
            <g transform="matrix(.92 -.28 .68 .54 -145 -28)">
              <CoverPrint design={design} detail={detail} />
              {detail && (
                <rect
                  x=".5"
                  y=".5"
                  width="219"
                  height="149"
                  stroke={ARTIFACT_COLORS.graphite}
                  strokeWidth=".7"
                  opacity=".5"
                />
              )}
              <path d="M0 0h8l6 5v145H0Z" fill={ARTIFACT_COLORS.lime} />
              {detail && <path d="m8 0 6 5v145" stroke={ARTIFACT_COLORS.graphite} strokeWidth=".8" opacity=".45" />}
            </g>
          </g>
        );
      })}
    </svg>
  );
}
