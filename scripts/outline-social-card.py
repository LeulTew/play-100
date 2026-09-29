"""Convert the renderer's shaped SVG text positions to reusable font outlines."""

import json
import re
import sys
from html import escape

try:
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.ttLib import TTFont
except ImportError as cause:
    raise SystemExit('Social SVG generation needs Python fonttools[woff]; see docs/pwa.md.') from cause


def number(value):
    return format(round(value, 6), ".6f").rstrip("0").rstrip(".") or "0"


def outline(payload):
    definitions = {}
    fonts = {}
    groups = []
    for usage in payload["usages"]:
        key = (usage["file"], usage["weight"])
        if key not in fonts:
            font = TTFont(usage["file"])
            location = {"wght": usage["weight"]} if "fvar" in font else None
            fonts[key] = (font, font.getGlyphSet(location=location), len(fonts))
        font, glyphs, index = fonts[key]
        cmap = font.getBestCmap()
        scale = number(usage["size"] / font["head"].unitsPerEm)
        parts = []
        for character in usage["characters"]:
            name = cmap.get(ord(character["value"]))
            if name is None:
                raise ValueError(f"Missing glyph: {character['value']!r}")
            glyph_id = f"sc-{index}-{ord(character['value']):x}"
            if glyph_id not in definitions:
                pen = SVGPathPen(glyphs, ntos=number)
                glyphs[name].draw(pen)
                definitions[glyph_id] = pen.getCommands()
            if definitions[glyph_id]:
                parts.append(
                    f'<use href="#{glyph_id}" transform="translate({number(character["x"])} '
                    f'{number(character["y"])}) scale({scale} -{scale})"/>'
                )
        groups.append(
            f'<g role="img" aria-label="{escape(usage["content"], quote=True)}" '
            f'fill="{escape(usage["fill"], quote=True)}">{"".join(parts)}</g>'
        )
    source = payload["svg"].replace("\r\n", "\n")
    elements = list(re.finditer(r"<text\b[^>]*>[\s\S]*?</text>", source))
    if len(elements) != len(groups):
        raise ValueError("Text and measured glyph groups must match.")
    for element, group in reversed(list(zip(elements, groups))):
        source = source[:element.start()] + group + source[element.end():]
    defs = "<defs>" + "".join(
        f'<path id="{key}" d="{path}"/>' for key, path in definitions.items() if path
    ) + "</defs>"
    source = source.replace(">", ">\n  " + defs, 1)
    for font, _, _ in fonts.values():
        font.close()
    return source


if __name__ == "__main__":
    sys.stdout.buffer.write(outline(json.load(sys.stdin)).encode("utf-8"))
