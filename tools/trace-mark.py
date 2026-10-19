"""Traces the Aim mark from the approved artwork into clean vector paths.

  python3 tools/trace-mark.py <image> <left,top,right,bottom> <out.svg>

Crops the mark from the image, upscales it, sorts each pixel into forest green, coral or background
by its nearest color, and traces the green and coral shapes with potrace (the potracer package).
The output is icons/mark-traced.svg, which tools/build-mark.mjs turns into every icon. The road is a
gap in the green, so it shows whatever is behind the mark.
"""
import sys
import numpy as np
from PIL import Image
import potrace

GREEN, CORAL = (25, 61, 49), (253, 87, 73)
SCALE = 8


def trace(mask):
    bm = potrace.Bitmap(~mask)  # potracer traces the False pixels
    paths = bm.trace(turdsize=200, alphamax=1.0, opticurve=True, opttolerance=0.2)
    out = []
    for curve in paths:
        f = lambda p: f"{p.x / SCALE:.2f} {p.y / SCALE:.2f}"
        d = f"M{f(curve.start_point)}"
        for seg in curve.segments:
            if seg.is_corner:
                d += f"L{f(seg.c)}L{f(seg.end_point)}"
            else:
                d += f"C{f(seg.c1)} {f(seg.c2)} {f(seg.end_point)}"
        out.append(d + "Z")
    return "".join(out)


def main(src, box, dst):
    l, t, r, b = map(int, box.split(","))
    im = Image.open(src).convert("RGB").crop((l, t, r, b))
    im = im.resize((im.width * SCALE, im.height * SCALE), Image.LANCZOS)
    px = np.asarray(im).astype(np.int32)
    # The background is whatever is lightest in the crop (white, cream or parchment).
    bg = np.median(px.reshape(-1, 3)[px.reshape(-1, 3).sum(1) > 600], axis=0)
    dist = lambda c: ((px - np.array(c)) ** 2).sum(-1)
    near = np.argmin(np.stack([dist(GREEN), dist(CORAL), dist(bg)]), axis=0)
    green, coral = trace(near == 0), trace(near == 1)
    w, h = r - l, b - t
    with open(dst, "w") as fh:
        fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">'
                 f'<path d="{green}" fill="#193d31" fill-rule="evenodd"/>'
                 f'<path d="{coral}" fill="#ff5446" fill-rule="evenodd"/></svg>\n')


if __name__ == "__main__":
    main(*sys.argv[1:4])
