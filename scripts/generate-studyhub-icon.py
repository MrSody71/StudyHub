"""
Generates StudyHub icon: open book with bookmark.
Colours: dark navy #1e1b4b → purple #7c3aed gradient.

Outputs:
  build/icon.ico        — multi-size ICO (256, 128, 64, 48, 32, 16)
  web/public/icon.png   — 512×512 PNG for web favicon / PWA
"""
from PIL import Image, ImageDraw, ImageFilter
import os, sys

ROOT = os.path.join(os.path.dirname(__file__), '..')

def lerp(a, b, t):
    return int(a + (b - a) * t)

def lerp_color(c1, c2, t):
    return (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255)

def create_icon(size: int) -> Image.Image:
    s = size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))

    # ── 1. Gradient background (dark navy → purple, top-to-bottom) ──────────
    bg = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    c_top = (30, 27, 75)      # #1e1b4b
    c_bot = (109, 40, 217)    # #6d28d9
    for y in range(s):
        t = y / max(s - 1, 1)
        bg_draw.line([(0, y), (s - 1, y)], fill=lerp_color(c_top, c_bot, t))

    # Slightly lighten centre (radial glow)
    cx_bg, cy_bg = s // 2, s // 2
    glow = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    max_r = s * 0.55
    steps = 24
    for i in range(steps, 0, -1):
        r = int(max_r * i / steps)
        alpha = int(28 * (1 - i / steps))
        glow_draw.ellipse(
            [cx_bg - r, cy_bg - r, cx_bg + r, cy_bg + r],
            fill=(180, 140, 255, alpha)
        )
    bg = Image.alpha_composite(bg, glow)

    # Rounded square mask
    radius = max(4, int(s * 0.175))
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=255)
    img.paste(bg, (0, 0), mask)
    draw = ImageDraw.Draw(img)

    # ── 2. Book geometry ─────────────────────────────────────────────────────
    bx1 = int(s * 0.130)   # left edge
    bx2 = int(s * 0.870)   # right edge
    by1 = int(s * 0.215)   # top of pages
    by2 = int(s * 0.760)   # bottom of pages
    cx  = s // 2            # spine x

    bw, bh = bx2 - bx1, by2 - by1
    tilt = max(1, int(bh * 0.048))  # outer-edge lift for "open" look

    # ── 3. Drop shadow under book ─────────────────────────────────────────
    sh_off = max(1, int(s * 0.014))
    sh_blur_r = max(2, int(s * 0.025))
    shadow_layer = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(shadow_layer)
    sh_draw.polygon([
        (bx1 + sh_off, by1 + tilt + sh_off),
        (bx2 + sh_off, by1 + tilt + sh_off),
        (bx2 + sh_off, by2 - tilt + sh_off),
        (bx1 + sh_off, by2 - tilt + sh_off),
    ], fill=(0, 0, 0, 70))
    # Cheap blur: expand shadow a bit
    for _ in range(sh_blur_r):
        shadow_layer = shadow_layer.filter(ImageFilter.SMOOTH)
    img = Image.alpha_composite(img, shadow_layer)
    draw = ImageDraw.Draw(img)

    # ── 4. Pages ─────────────────────────────────────────────────────────
    page_l_fill  = (230, 238, 255)   # #e6eeff – left page
    page_r_fill  = (215, 225, 252)   # #d7e1fc – right page (slightly darker)

    # Left page
    draw.polygon([
        (bx1, by1 + tilt),
        (cx,  by1),
        (cx,  by2),
        (bx1, by2 - tilt),
    ], fill=page_l_fill)

    # Right page
    draw.polygon([
        (cx,  by1),
        (bx2, by1 + tilt),
        (bx2, by2 - tilt),
        (cx,  by2),
    ], fill=page_r_fill)

    # ── 5. Page-fold highlight (inner gutter shading) ────────────────────
    gutter_w = max(1, int(bw * 0.022))
    gutter_steps = max(1, gutter_w)
    for i in range(gutter_steps):
        t = i / gutter_steps
        alpha = int(40 * (1 - t))
        shade = (160, 170, 210, alpha)
        draw.line([(cx - i, by1), (cx - i, by2)], fill=shade)
        draw.line([(cx + i, by1), (cx + i, by2)], fill=shade)

    # ── 6. Text lines on pages ────────────────────────────────────────────
    line_c = (165, 178, 220)
    n_lines  = 5
    lw = max(1, s // 220)
    y_start  = int(by1 + bh * 0.20)
    y_end    = int(by1 + bh * 0.82)
    x_pad    = int(bw * 0.065)

    # Last line is shorter (paragraph indent look)
    short_lines = {n_lines - 1}

    for i in range(n_lines):
        t    = i / max(n_lines - 1, 1)
        ly   = int(y_start + (y_end - y_start) * t)
        tilt_at = int(tilt * (1 - (ly - by1) / bh))
        short = i in short_lines

        # Interpolate left-page left edge
        lx_outer_left = int(bx1 + tilt_at * 0.6)
        draw.line(
            [(lx_outer_left + x_pad, ly),
             (cx - x_pad - (int(bw * 0.07) if short else 0), ly)],
            fill=line_c, width=lw
        )
        draw.line(
            [(cx + x_pad, ly),
             (bx2 - x_pad - int(tilt_at * 0.6) - (int(bw * 0.09) if short else 0), ly)],
            fill=line_c, width=lw
        )

    # ── 7. Spine ─────────────────────────────────────────────────────────
    spine_c = (140, 152, 200)
    spine_w = max(1, s // 170)
    draw.line([(cx, by1 - 1), (cx, by2 + 1)], fill=spine_c, width=spine_w)

    # ── 8. Bottom cover edge ─────────────────────────────────────────────
    cover_h = max(2, int(bh * 0.072))
    cover_l = (38, 32, 95)
    cover_r = (52, 44, 118)
    draw.polygon([
        (bx1, by2 - tilt), (cx, by2),
        (cx,  by2 + cover_h), (bx1, by2 - tilt + cover_h)
    ], fill=cover_l)
    draw.polygon([
        (cx,  by2), (bx2, by2 - tilt),
        (bx2, by2 - tilt + cover_h), (cx, by2 + cover_h)
    ], fill=cover_r)

    # Bottom cover spine highlight
    draw.line([(cx, by2), (cx, by2 + cover_h)], fill=(80, 70, 155), width=spine_w)

    # ── 9. Bookmark (right page, sticks above book top) ──────────────────
    bm_w     = max(2, int(bw * 0.092))
    bm_total = int(bh * 0.44)
    bm_above = int(bm_total * 0.32)   # part sticking above by1
    bm_x     = int(bx2 - bm_w * 2.6)
    bm_top   = by1 - bm_above
    bm_bot   = by1 + (bm_total - bm_above)
    notch    = max(2, int(bm_w * 0.48))

    # Bookmark shadow
    bm_sh = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(bm_sh).polygon([
        (bm_x + 2, bm_top + 2), (bm_x + bm_w + 2, bm_top + 2),
        (bm_x + bm_w + 2, bm_bot + 2), (bm_x + bm_w // 2 + 2, bm_bot - notch + 2),
        (bm_x + 2, bm_bot + 2),
    ], fill=(0, 0, 0, 50))
    img = Image.alpha_composite(img, bm_sh)
    draw = ImageDraw.Draw(img)

    # Bookmark body – gradient from indigo #818cf8 to violet #a78bfa
    bm_c1 = (129, 140, 248)   # #818cf8
    bm_c2 = (167, 139, 250)   # #a78bfa
    bm_height = bm_bot - bm_top
    for y in range(bm_top, bm_bot + 1):
        t = (y - bm_top) / max(bm_height, 1)
        col = lerp_color(bm_c1, bm_c2, t)
        if y >= bm_bot - notch:
            # V-notch area: draw triangle
            progress = (y - (bm_bot - notch)) / max(notch, 1)
            half_w = int(bm_w / 2 * (1 - progress))
            mid_x  = bm_x + bm_w // 2
            draw.line([(mid_x - half_w, y), (mid_x + half_w, y)], fill=col)
        else:
            draw.line([(bm_x, y), (bm_x + bm_w, y)], fill=col)

    # Bookmark sheen (left vertical highlight)
    sheen_x = bm_x + max(1, bm_w // 3)
    sheen_c = (220, 226, 254, 160)
    sheen_w = max(1, bm_w // 10)
    draw.line(
        [(sheen_x, bm_top + max(1, bm_w // 4)),
         (sheen_x, bm_bot - notch - max(1, bm_w // 4))],
        fill=sheen_c[:3], width=sheen_w
    )

    return img


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    build_dir  = os.path.join(ROOT, 'build')
    web_public = os.path.join(ROOT, 'web', 'public')
    os.makedirs(build_dir,  exist_ok=True)
    os.makedirs(web_public, exist_ok=True)

    # Generate at 512 — all other sizes are downscaled from this
    print('Rendering icon at 512×512…')
    base = create_icon(512)

    # ── PNG 512×512 for web ──────────────────────────────────────────────
    png_path = os.path.join(web_public, 'icon.png')
    base.save(png_path, 'PNG')
    print(f'✓ web/public/icon.png  (512×512)')

    # ── ICO for Electron / Windows ───────────────────────────────────────
    ico_sizes  = [256, 128, 64, 48, 32, 16]
    ico_images = []
    for sz in ico_sizes:
        ico_images.append(base.resize((sz, sz), Image.LANCZOS))

    ico_path = os.path.join(build_dir, 'icon.ico')
    ico_images[0].save(
        ico_path,
        format='ICO',
        sizes=[(sz, sz) for sz in ico_sizes],
        append_images=ico_images[1:],
    )
    print(f'✓ build/icon.ico       ({", ".join(str(s) for s in ico_sizes)})')
    print()
    print('Done. Replace web/index.html favicon link with /icon.png to use the new icon.')


if __name__ == '__main__':
    main()
