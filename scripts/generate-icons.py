"""Genera los iconos PNG y la imagen de Open Graph sin dependencias externas.

No hay rasterizador SVG en el entorno (ni cairosvg, ni PIL, ni ImageMagick), asi que
el corazon y el degradado se dibujan por geometria y se codifican en PNG a mano con
zlib y struct, que son de la biblioteca estandar.
"""

import math
import os
import struct
import zlib

OUT = os.getcwd()  # se ejecuta desde la raiz del proyecto

# Paleta del sitio (src/style.css)
BG_TOP = (0xFF, 0xF5, 0xF7)
BG_MID = (0xFF, 0xC6, 0xD4)
BG_BOTTOM = (0xE0, 0x3A, 0x63)
HEART = (0xD8, 0x1E, 0x5B)
HEART_DARK = (0x7A, 0x0F, 0x33)
HEART_LIGHT = (0xFF, 0x8F, 0xAB)
GLOSS = (0xFF, 0xD6, 0xE1)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(t):
    """Degradado de tres paradas, igual que el linearGradient del favicon."""
    t = min(1.0, max(0.0, t))
    if t < 0.52:
        return lerp(BG_TOP, BG_MID, t / 0.52)
    return lerp(BG_MID, BG_BOTTOM, (t - 0.52) / 0.48)


def heart_value(x, y):
    """Funcion implicita del corazon: <= 0 dentro de la figura.

    Es la curva (x^2 + y^2 - 1)^3 - x^2 * y^3 = 0, con y invertida porque en la
    imagen el eje crece hacia abajo.
    """
    yy = -y
    return (x * x + yy * yy - 1.0) ** 3 - x * x * yy * yy * yy


def write_png(path, width, height, pixels):
    """pixels: lista de filas, cada una con width tuplas (r, g, b, a)."""
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filtro None
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8 bits, RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as handle:
        handle.write(png)
    return len(png)


def rounded_corner_alpha(x, y, size, radius):
    """1 dentro de la caja redondeada, 0 fuera, con borde suavizado."""
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    distance = math.hypot(x - cx, y - cy)
    if distance <= radius - 0.75:
        return 1.0
    if distance >= radius + 0.75:
        return 0.0
    return (radius + 0.75 - distance) / 1.5


def make_icon(size):
    """Corazon recortado sobre transparencia, sin caja ni fondo.

    El suavizado de bordes lo aporta el canal alfa: el supermuestreo 2x2 cuenta
    cuantas muestras caen dentro de la figura, y esa fraccion es la opacidad.
    """
    # Sin caja de fondo el corazon puede ocupar casi todo el lienzo.
    scale = size / 2.45
    cx, cy = size / 2.0, size * 0.52
    rows = []
    for py in range(size):
        row = []
        for px in range(size):
            acc = [0.0, 0.0, 0.0]
            inside = 0
            for sy in (0.25, 0.75):
                for sx in (0.25, 0.75):
                    x, y = px + sx, py + sy
                    hx, hy = (x - cx) / scale, (y - cy) / scale
                    if heart_value(hx, hy) > 0:
                        continue
                    inside += 1
                    # Sin contorno: la funcion implicita del corazon no es una
                    # distancia, asi que una banda de epsilon fijo da un grosor
                    # de trazo descontrolado y se ve como un borron.
                    highlight = max(0.0, 1.0 - math.hypot(hx + 0.3, hy + 0.34) * 1.35)
                    colour = lerp(HEART, GLOSS, min(0.42, highlight))
                    for i in range(3):
                        acc[i] += colour[i]
            if inside == 0:
                row.append((0, 0, 0, 0))
                continue
            rgb = tuple(round(component / inside) for component in acc)
            row.append(rgb + (round(255 * inside / 4.0),))
        rows.append(row)
    return rows


def make_og_image(width=1200, height=630):
    """Imagen de vista previa: lluvia de corazones sobre el degradado rosa."""
    # Posiciones deterministas para que la imagen no cambie entre ejecuciones.
    hearts = []
    seed = 20260924
    for index in range(26):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        hx = (seed % 1000) / 1000.0
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        hy = (seed % 1000) / 1000.0
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        size = 26 + (seed % 1000) / 1000.0 * 58
        hearts.append((hx * width, hy * height, size, index % 3))

    palette = (HEART, HEART_LIGHT, (0xFF, 0x5C, 0x8A))
    rows = []
    for py in range(height):
        row = []
        for px in range(width):
            # Supermuestreo 2x2, igual que en los iconos: suavizar con una banda de
            # epsilon sobre la funcion implicita dejaba un halo borroso, porque el
            # valor no es proporcional a la distancia al borde.
            acc = [0.0, 0.0, 0.0]
            for sy in (0.25, 0.75):
                for sx in (0.25, 0.75):
                    x, y = px + sx, py + sy
                    colour = gradient(y / float(height) * 0.82 + x / float(width) * 0.18)
                    for cx, cy, size, tone in hearts:
                        # La curva llega a ~1.3 veces el radio en los lobulos
                        # superiores: con un descarte de +-size se recortaban en plano.
                        if abs(x - cx) > size * 1.45 or abs(y - cy) > size * 1.45:
                            continue
                        if heart_value((x - cx) / size, (y - cy) / size) <= 0:
                            colour = lerp(colour, palette[tone], 0.86)
                    for i in range(3):
                        acc[i] += colour[i]
            row.append(tuple(round(component / 4.0) for component in acc) + (255,))
        rows.append(row)
    return rows


def main():
    public = os.path.abspath(os.path.join(OUT, "public"))
    if not os.path.isdir(public):
        raise SystemExit("no se encontro la carpeta public en %s" % public)

    for size, name in ((32, "favicon-32.png"), (180, "apple-touch-icon.png"),
                       (192, "icon-192.png"), (512, "icon-512.png")):
        path = os.path.join(public, name)
        written = write_png(path, size, size, make_icon(size))
        print("%-22s %4dx%-4d %7d bytes" % (name, size, size, written))

    path = os.path.join(public, "og-image.png")
    written = write_png(path, 1200, 630, make_og_image())
    print("%-22s %4dx%-4d %7d bytes" % ("og-image.png", 1200, 630, written))


if __name__ == "__main__":
    main()
