"""Build the MTS-012 image-harness glyph inventory and woff2 subset font.

Reads the REAL localization catalogs (single source of truth for fixture
copy) plus the deterministic literals used by the primitives fixture, then
subsets Noto Sans SC (SIL OFL 1.1) with fonttools into a tiny woff2 that
includes every character the harness can ever render.

Usage:  python scripts/font-subset.py  (run from repo root)
Output: tests/mts-012/image-harness/fonts/MisyraTest-Regular.woff2
        tests/mts-012/image-harness/fonts/glyphs.txt
"""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

REPO = Path(__file__).resolve().parents[1]
CATALOG_DIR = REPO / "packages" / "localization" / "src" / "catalogs"
FONTS_DIR = REPO / "tests" / "mts-012" / "image-harness" / "fonts"

# Deterministic literals used by the primitives screenshot fixture.
FIXTURE_LITERALS = '←★…·—–\'\'""•'

SOURCE_FONT = REPO / "scripts" / "assets" / "NotoSansSC-variable.ttf"


def catalog_strings() -> list[str]:
    """Extract every string literal from the en and zh-HK catalogs."""
    strings: list[str] = []
    for filename in ("en.ts", "zh-hk.ts"):
        source = (CATALOG_DIR / filename).read_text(encoding="utf-8")
        for line in source.splitlines():
            line = line.strip()
            if not line.startswith('"'):
                continue
            key, _, value = line.partition(":")
            if not value:
                continue
            raw = value.strip().rstrip(",").strip('"')
            if key.startswith('"') and raw:
                strings.append(raw)
    return strings


def main() -> None:
    chars: set[str] = set()
    for string in catalog_strings() + [FIXTURE_LITERALS]:
        chars.update(string)
    # The full printable ASCII range keeps every latin rendering deterministic.
    chars.update(chr(cp) for cp in range(0x20, 0x7F))
    chars.add("\u00A0")
    glyphs = "".join(sorted(chars))

    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    (FONTS_DIR / "glyphs.txt").write_text(glyphs + "\n", encoding="utf-8")

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "clig"]
    options.name_IDs = [0, 1, 2, 3, 4, 6]
    options.notdef_outline = True
    options.recalc_bounds = True

    font = TTFont(SOURCE_FONT)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=glyphs)
    subsetter.subset(font)

    out = FONTS_DIR / "MisyraTest-Regular.woff2"
    font.save(out)
    print(f"subset font: {out} ({out.stat().st_size} bytes), glyph inventory size {len(glyphs)}")


if __name__ == "__main__":
    main()