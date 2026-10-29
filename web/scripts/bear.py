#!/usr/bin/env python3
"""Render the share-card bear: an original cub, delighted by free pizza.

Emits one SVG per frame, which build-bear.sh turns into the og:video (mp4) and
the og:image poster. Not Oski — Oski is a UC Berkeley trademark — just a bear in
Berkeley Blue and California Gold.

  python3 bear.py <out-dir> [--frames N] [--poster]

--poster writes a single frame at the animation's happiest moment instead.
"""
import math
import sys
from pathlib import Path

W, H = 1200, 630
FPS, SECONDS = 30, 3.0
NAVY, NAVY_SOFT = "#00264c", "#013a6b"
GOLD, GOLD_DEEP = "#fdb515", "#e09a00"
CREAM, WHITE = "#fff3d6", "#ffffff"
POSTER_T = 0.58  # peak celebration: arms overhead, eyes squeezed shut, wordmark settled


def ease_out(t):      return 1 - (1 - t) ** 3
def ease_in_out(t):   return 4 * t**3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2
def clamp01(x):       return max(0.0, min(1.0, x))


def seg(t, a, b):
    """Progress through the window a..b of the timeline, clamped to 0..1."""
    return clamp01((t - a) / (b - a)) if b > a else 0.0


def overshoot(t, amount=0.28):
    """Scale that springs past 1 then settles, for things popping into frame."""
    if t >= 1:
        return 1.0
    return 1 + amount * math.sin(t * math.pi) * (1 - t) ** 0.4 if t > 0 else 0.0


def sparkle(cx, cy, r, rot, fill, op):
    pts = []
    for i in range(8):
        rr = r if i % 2 == 0 else r * 0.34
        a = math.radians(rot + i * 45)
        pts.append(f"{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="{fill}" opacity="{op:.3f}"/>'


def frame(t: float) -> str:
    """One frame. t runs 0..1 over the loop."""
    # --- timeline -------------------------------------------------------
    drop = ease_out(seg(t, 0.10, 0.38))        # pizza falls into the paws
    joy = seg(t, 0.36, 0.72)                   # the celebration
    settle = ease_in_out(seg(t, 0.72, 1.0))    # back to idle, so it loops
    excite = math.sin(joy * math.pi) if joy < 1 else 0.0
    excite = max(excite, 0.0) * (1 - settle)

    bob = math.sin(t * 2 * math.pi) * 5                      # constant gentle breathing
    hop = -34 * abs(math.sin(joy * math.pi * 2)) * (1 - settle)  # two happy hops
    y = bob + hop
    squash = 1 + 0.055 * excite                              # stretch tall when hopping
    tilt = 5.5 * excite * math.sin(joy * math.pi * 3)

    # --- composition ----------------------------------------------------
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    o.append(f"""<defs>
    <radialGradient id="sky" cx="50%" cy="38%" r="78%">
      <stop offset="0" stop-color="{NAVY_SOFT}"/><stop offset="1" stop-color="{NAVY}"/>
    </radialGradient>
    <linearGradient id="fur" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_DEEP}"/>
    </linearGradient>
    <filter id="warm" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="26"/>
    </filter>
  </defs>""")
    o.append(f'<rect width="{W}" height="{H}" fill="url(#sky)"/>')

    # Warm glow behind the bear, breathing with the excitement.
    o.append(f'<ellipse cx="600" cy="{330 + y * 0.3:.1f}" rx="{250 + 34 * excite:.0f}" '
             f'ry="{215 + 30 * excite:.0f}" fill="{GOLD}" opacity="{0.10 + 0.13 * excite:.3f}" filter="url(#warm)"/>')

    # Sparkles, bursting outward at the peak of the celebration.
    burst = seg(t, 0.38, 0.78)
    if burst > 0:
        fade = math.sin(burst * math.pi)
        for i in range(9):
            a = math.radians(-90 + (i - 4) * 27 + 10 * math.sin(i))
            d = 150 + 190 * ease_out(burst) + 14 * i
            o.append(sparkle(600 + d * math.cos(a), 320 + d * math.sin(a) * 0.82,
                             (10 if i % 2 else 15) * fade, burst * 220 + i * 18,
                             WHITE if i % 3 else GOLD, 0.85 * fade))

    o.append(f'<g transform="translate(600 {y - 14:.1f}) rotate({tilt:.2f}) scale(0.93 {squash * 0.93:.3f}) translate(-600 24)">')

    # Shadow, tight when airborne.
    lift = clamp01(-hop / 34)
    o.append(f'<ellipse cx="600" cy="588" rx="{150 - 36 * lift:.0f}" ry="{20 - 5 * lift:.0f}" '
             f'fill="#000" opacity="{0.26 - 0.1 * lift:.3f}"/>')

    # Legs, body, belly.
    for cx in (548, 652):
        o.append(f'<ellipse cx="{cx}" cy="552" rx="40" ry="32" fill="{GOLD_DEEP}"/>')
    o.append('<ellipse cx="600" cy="452" rx="132" ry="112" fill="url(#fur)"/>')
    o.append(f'<ellipse cx="600" cy="474" rx="86" ry="78" fill="{CREAM}" opacity="0.95"/>')

    # Arms. They swing past horizontal so the pose reads as "up", not "out".
    PIVOT_Y, REACH = 406, 98
    paw = {}
    for side in (-1, 1):
        ax = 600 + side * 120
        ang = side * -142 * excite
        rad = math.radians(ang)
        paw[side] = (ax - REACH * math.sin(rad), PIVOT_Y + REACH * math.cos(rad))
        o.append(f'<g transform="rotate({ang:.1f} {ax} {PIVOT_Y})">'
                 f'<rect x="{ax - 27:.0f}" y="380" width="54" height="128" rx="27" fill="{GOLD_DEEP}"/>'
                 f'<circle cx="{ax:.0f}" cy="504" r="30" fill="url(#fur)"/></g>')

    # Head.
    for ex, ey in ((526, 196), (674, 196)):
        o.append(f'<circle cx="{ex}" cy="{ey}" r="44" fill="url(#fur)"/>'
                 f'<circle cx="{ex}" cy="{ey + 4}" r="23" fill="{CREAM}" opacity="0.85"/>')
    o.append('<circle cx="600" cy="278" r="118" fill="url(#fur)"/>')
    o.append(f'<ellipse cx="600" cy="316" rx="60" ry="45" fill="{CREAM}"/>')

    # Eyes: open and shining at rest, squeezed shut with joy at the peak.
    shut = clamp01(excite * 1.5)
    for ex in (562, 638):
        if shut > 0.45:
            o.append(f'<path d="M{ex - 23} 266 Q{ex} 243 {ex + 23} 266" stroke="{NAVY}" '
                     f'stroke-width="9" fill="none" stroke-linecap="round"/>')
        else:
            o.append(f'<ellipse cx="{ex}" cy="262" rx="15" ry="{16 - 9 * shut / 0.45:.1f}" fill="{NAVY}"/>')
            o.append(f'<circle cx="{ex + 5}" cy="256" r="5" fill="{WHITE}" opacity="0.9"/>')
    # Rosy cheeks, brighter when thrilled.
    for cx in (520, 680):
        o.append(f'<ellipse cx="{cx}" cy="300" rx="25" ry="16" fill="#ff8a6b" opacity="{0.3 + 0.4 * excite:.3f}"/>')

    o.append(f'<ellipse cx="600" cy="300" rx="19" ry="13" fill="{NAVY}"/>')
    # Mouth: a smile that opens into a grin.
    grin = 10 + 26 * excite
    o.append(f'<path d="M{600 - grin:.0f} 324 Q600 {336 + 20 * excite:.0f} {600 + grin:.0f} 324" '
             f'stroke="{NAVY}" stroke-width="8" fill="none" stroke-linecap="round"/>')
    if excite > 0.35:
        o.append(f'<ellipse cx="600" cy="{336:.0f}" rx="{20 * excite:.0f}" ry="{13 * excite:.0f}" fill="{NAVY}"/>')
        o.append(f'<ellipse cx="600" cy="{342:.0f}" rx="{11 * excite:.0f}" ry="{7 * excite:.0f}" fill="#ff8a6b"/>')

    # The pizza: falls from above, then rides the right paw. Drawn last within the
    # bear group so the head can never cover it.
    if drop > 0:
        hx, hy = paw[1]
        px = 600 + (hx - 600) * drop
        py = -170 + (hy - 10 + 170) * drop
        pr = -160 * (1 - drop) + 9 * math.sin(t * 7) * excite
        ps = 0.62 + 0.08 * excite
        o.append(f'<g transform="translate({px:.1f} {py:.1f}) rotate({pr:.1f}) scale({ps:.3f})" opacity="{min(1, drop * 3):.2f}">'
                 f'<path d="M0 -92 L74 56 Q0 86 -74 56 Z" fill="{GOLD}" stroke="{GOLD_DEEP}" stroke-width="8" stroke-linejoin="round"/>'
                 f'<path d="M0 -64 L56 44 Q0 68 -56 44 Z" fill="#e8552f"/>'
                 f'<circle cx="-20" cy="16" r="11" fill="#b8321c"/><circle cx="22" cy="8" r="10" fill="#b8321c"/>'
                 f'<circle cx="0" cy="-28" r="9" fill="#b8321c"/></g>')
    o.append("</g>")

    # Wordmark, springing in and holding.
    ws = overshoot(ease_out(seg(t, 0.40, 0.56)))
    if ws > 0:
        o.append(f'<g transform="translate(600 586) scale({ws:.3f}) translate(-600 -586)" opacity="{min(1, ws * 1.6):.2f}">'
                 f'<text x="600" y="586" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" '
                 f'font-size="62" font-weight="700" letter-spacing="2" fill="{WHITE}">FREE FOOD</text></g>')
    o.append("</svg>")
    return "\n".join(o)


if __name__ == "__main__":
    out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    if "--poster" in sys.argv:
        (out / "poster.svg").write_text(frame(POSTER_T))
        print(f"poster at t={POSTER_T} -> {out / 'poster.svg'}")
    else:
        n = int(sys.argv[sys.argv.index("--frames") + 1]) if "--frames" in sys.argv else int(FPS * SECONDS)
        for i in range(n):
            (out / f"f{i:04d}.svg").write_text(frame(i / n))
        print(f"{n} frames -> {out}")
