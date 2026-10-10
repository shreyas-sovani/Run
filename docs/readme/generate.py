#!/usr/bin/env python3
"""Builds the animated banner used by the README (banner.svg).

Run from the repo root after `pnpm install` in app/ (the brand fonts are embedded from app/node_modules):
    python3 docs/readme/generate.py
SVGs shown as images can't load web fonts, so the faces are embedded as data URIs; animation is plain CSS.
"""
import base64
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
FONTS = ROOT / "app" / "node_modules"

PAPER, GUILLOCHE, INK, INK2, INK3 = "#E4ECE6", "#C5D5CB", "#172033", "#3F4A5C", "#566170"
SEAL, RUMOR, RUN, TRAPPED, SLIP, EDGE = "#5B3FD6", "#B86E00", "#C8341C", "#7D8A90", "#F2F6F3", "#B7C7BC"


def font_face(family: str, rel: str) -> str:
    data = base64.b64encode((FONTS / rel).read_bytes()).decode()
    return f"@font-face{{font-family:'{family}';src:url(data:font/woff2;base64,{data}) format('woff2');font-weight:100 900;}}"


FACES = font_face("RunDisplay", "@fontsource-variable/big-shoulders-display/files/big-shoulders-display-latin-wght-normal.woff2") + font_face(
    "RunMono", "@fontsource-variable/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-wght-normal.woff2"
)
DISPLAY = "font-family:RunDisplay,Impact,'Arial Narrow',sans-serif"
MONO = "font-family:RunMono,ui-monospace,Menlo,Consolas,monospace"
BODY = "font-family:system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

INK_FILTER = """<filter id="ink" x="-6%" y="-8%" width="112%" height="116%">
  <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="11" result="warp"/>
  <feDisplacementMap in="SourceGraphic" in2="warp" scale="5" xChannelSelector="R" yChannelSelector="G"/>
</filter>"""


def waves(x0: float, y0: float, w: float, n: int, amp: float, step: float) -> str:
    paths = []
    for k in range(n):
        y = y0 + k * step
        d = f"M{x0},{y:.1f} " + " ".join(
            f"L{x0 + i * w / 60:.1f},{y + amp * math.sin(i / 60 * math.pi * 4 + k * 0.5):.1f}" for i in range(61)
        )
        paths.append(f'<path d="{d}" fill="none" stroke="{GUILLOCHE}" stroke-width="1"/>')
    return "".join(paths)


def pct(t: float, total: float) -> str:
    return f"{max(0.0, min(100.0, t / total * 100)):.2f}%"


# ── Banner ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def banner() -> str:
    W, H, T = 1280, 400, 10.0  # T: loop length in seconds
    rnd = random.Random(7)
    # Card on the right that holds the network, the block strip and the stamp.
    cx0, cy0, cw, ch = 676, 36, 560, 328
    nx0, ny0, nw, nh = cx0 + 34, cy0 + 26, cw - 68, 200

    # Nodes: a few whales (big, central, early) and many small depositors.
    nodes = []
    for i in range(78):
        whale = i < 9
        r = rnd.uniform(7.5, 11.5) if whale else rnd.uniform(2.6, 4.6)
        a = rnd.uniform(0, math.tau)
        rad = (rnd.uniform(0.0, 0.55) if whale else rnd.uniform(0.15, 1.0)) ** 0.8
        x = nx0 + nw / 2 + math.cos(a) * rad * nw * 0.48
        y = ny0 + nh / 2 + math.sin(a) * rad * nh * 0.48
        nodes.append({"x": x, "y": y, "r": r, "whale": whale})
    # Edges: each node links to its two nearest earlier nodes (hubs end up with many links).
    edges = []
    for i in range(1, len(nodes)):
        near = sorted(range(i), key=lambda j: (nodes[i]["x"] - nodes[j]["x"]) ** 2 + (nodes[i]["y"] - nodes[j]["y"]) ** 2)[:2]
        edges += [(i, j) for j in near]
    adj = {i: set() for i in range(len(nodes))}
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    # Rumor spreads by hops from the biggest whale; whales panic and withdraw first.
    hops = {0: 0}
    queue = [0]
    while queue:
        u = queue.pop(0)
        for v in adj[u]:
            if v not in hops:
                hops[v] = hops[u] + 1
                queue.append(v)

    t_start, t_fail, t_reset = 0.6, 5.0, 9.3
    css = [f"svg{{{BODY}}}", ".d{" + DISPLAY + "}", ".m{" + MONO + "}"]
    circles, crosses = [], []
    for i, n in enumerate(nodes):
        h = hops.get(i, 6)
        heard = t_start + h * 0.55 + rnd.uniform(0, 0.25)
        withdraws = n["whale"] or rnd.random() < 0.35
        panic = heard + (0.35 if n["whale"] else 0.7)
        gone = panic + 0.45
        calm = f"fill:{INK};fill-opacity:.85;stroke:{RUMOR};stroke-opacity:0;stroke-width:0"
        heard_s = f"fill:{INK};fill-opacity:0;stroke:{RUMOR};stroke-opacity:1;stroke-width:2"
        panic_s = f"fill:{RUN};fill-opacity:1;stroke:{RUN};stroke-opacity:0;stroke-width:0"
        gone_s = f"fill:{RUN};fill-opacity:0;stroke:{INK3};stroke-opacity:.75;stroke-width:1.3"
        trap_s = f"fill:{TRAPPED};fill-opacity:.25;stroke:{TRAPPED};stroke-opacity:0;stroke-width:0"
        frames = [(0, calm)]

        def add(t: float, style: str) -> None:
            if t < t_fail or style in (gone_s, trap_s):
                frames.append((t, frames[-1][1]))
                frames.append((t + 0.12, style))

        if heard < t_fail:
            add(heard, heard_s)
            if panic < t_fail:
                add(panic, panic_s)
                if withdraws and gone < t_fail:
                    add(gone, gone_s)
        trapped = frames[-1][1] != gone_s
        if trapped:
            frames.append((t_fail, frames[-1][1]))
            frames.append((t_fail + 0.12, trap_s))
        frames.append((t_reset, frames[-1][1]))
        frames.append((T, calm))
        css.append(f"@keyframes n{i}{{" + "".join(f"{pct(t, T)}{{{s}}}" for t, s in frames) + "}")
        css.append(f".n{i}{{animation:n{i} {T}s linear infinite}}")
        circles.append(f'<circle class="n{i}" cx="{n["x"]:.1f}" cy="{n["y"]:.1f}" r="{n["r"]:.1f}" style="{calm}"/>')
        if trapped:
            k = max(2.2, n["r"] * 0.75)
            x, y = n["x"], n["y"]
            crosses.append(
                f'<path class="x" d="M{x - k:.1f},{y - k:.1f}L{x + k:.1f},{y + k:.1f}M{x + k:.1f},{y - k:.1f}L{x - k:.1f},{y + k:.1f}"/>'
            )
    css.append(
        f"@keyframes xs{{0%,{pct(t_fail, T)}{{opacity:0}}{pct(t_fail + 0.12, T)},{pct(t_reset, T)}{{opacity:1}}100%{{opacity:0}}}}"
        f".x{{stroke:{TRAPPED};stroke-width:1.6;stroke-linecap:round;opacity:0;animation:xs {T}s linear infinite}}"
    )

    # Fourteen Monad blocks seal one after another while the run plays.
    blocks = []
    bx0, by = cx0 + 34, cy0 + ch - 62
    for k in range(14):
        t = t_start + 0.15 + k * (t_fail - t_start - 0.15) / 14
        css.append(
            f"@keyframes b{k}{{0%,{pct(t, T)}{{fill:{SLIP};stroke:{EDGE}}}{pct(t + 0.1, T)},{pct(t_reset, T)}{{fill:{SEAL};stroke:{SEAL}}}100%{{fill:{SLIP};stroke:{EDGE}}}}}"
            f".b{k}{{animation:b{k} {T}s linear infinite}}"
        )
        blocks.append(f'<rect class="b{k}" x="{bx0 + k * 25:.1f}" y="{by}" width="19" height="19" rx="2" stroke-width="1.5" fill="{SLIP}" stroke="{EDGE}"/>')
    css.append(
        f"@keyframes cap{{0%,{pct(t_fail, T)}{{opacity:0}}{pct(t_fail + 0.2, T)},{pct(t_reset, T)}{{opacity:1}}100%{{opacity:0}}}}"
        f".cap{{opacity:0;animation:cap {T}s linear infinite}}"
    )

    # The stamp slams when the contract's verdict lands: scale 2.2 → 1, rotate −14° → −7°, then holds.
    sx, sy = cx0 + cw / 2 + 40, cy0 + 128
    css.append(
        "@keyframes stamp{"
        f"0%,{pct(t_fail, T)}{{opacity:0;transform:rotate(-14deg) scale(2.2)}}"
        f"{pct(t_fail + 0.16, T)}{{opacity:1;transform:rotate(-7deg) scale(1)}}"
        f"{pct(t_fail + 0.24, T)}{{opacity:1;transform:rotate(-7deg) scale(.97)}}"
        f"{pct(t_fail + 0.34, T)},{pct(t_reset - 0.2, T)}{{opacity:1;transform:rotate(-7deg) scale(1)}}"
        f"{pct(t_reset + 0.2, T)},100%{{opacity:0;transform:rotate(-7deg) scale(1)}}}}"
        f".stamp{{transform-box:fill-box;transform-origin:center;opacity:0;animation:stamp {T}s cubic-bezier(.5,0,.9,.4) infinite;mix-blend-mode:multiply}}"
    )
    stamp = f"""<g class="stamp" filter="url(#ink)">
  <rect x="{sx - 190}" y="{sy - 62}" width="380" height="124" rx="4" fill="none" stroke="{SEAL}" stroke-width="7"/>
  <rect x="{sx - 177}" y="{sy - 49}" width="354" height="98" rx="2" fill="none" stroke="{SEAL}" stroke-width="2.5"/>
  <text x="{sx}" y="{sy + 18}" text-anchor="middle" class="d" font-size="74" font-weight="900" fill="{SEAL}" letter-spacing="1">BANK FAILED</text>
  <text x="{sx}" y="{sy + 41}" text-anchor="middle" class="m" font-size="15" font-weight="700" fill="{SEAL}">in 4.2 s · 14 Monad blocks</text>
</g>"""

    edge_d = "".join(f"M{nodes[a]['x']:.1f},{nodes[a]['y']:.1f}L{nodes[b]['x']:.1f},{nodes[b]['y']:.1f}" for a, b in edges)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="t">
<title id="t">RUN!: a rumor spreads through 500 depositors, 14 Monad blocks seal the run, and the contract stamps the bank failed.</title>
<style>{FACES}{''.join(css)}</style>
<defs>{INK_FILTER}</defs>
<rect width="{W}" height="{H}" rx="18" fill="{PAPER}"/>
<g opacity=".9">{waves(0, 14, 640, 7, 7, 6)}{waves(640, 372, 640, 4, 5, 6)}</g>
<text x="64" y="176" class="d" font-size="164" font-weight="900" fill="{SEAL}" letter-spacing="1">RUN!</text>
<text x="66" y="236" class="d" font-size="44" font-weight="800" fill="{INK}">Start one rumor.</text>
<text x="66" y="282" class="d" font-size="44" font-weight="800" fill="{INK2}">Watch a real bank fail in seconds.</text>
<text x="67" y="330" class="m" font-size="14" fill="{INK3}">Monad testnet · 500 depositors · real AUSD · every tick sealed</text>
<rect x="{cx0}" y="{cy0}" width="{cw}" height="{ch}" rx="4" fill="{SLIP}" stroke="{EDGE}"/>
<path d="{edge_d}" stroke="{INK}" stroke-opacity=".1" stroke-width="1" fill="none"/>
{''.join(circles)}{''.join(crosses)}
<text x="{bx0}" y="{by - 10}" class="m" font-size="13" fill="{INK3}">Monad blocks, 400 ms each</text>
{''.join(blocks)}
<text x="{bx0 + 14 * 25 + 8}" y="{by + 15}" class="m cap" font-size="14" font-weight="700" fill="{SEAL}">sealed ✓</text>
{stamp}
</svg>"""


if __name__ == "__main__":
    (OUT / "banner.svg").write_text(banner())
    print("wrote", OUT / "banner.svg")
