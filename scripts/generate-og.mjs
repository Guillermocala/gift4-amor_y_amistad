// Genera public/og-image.png: la tarjeta que se ve al compartir el enlace.
//
// El PNG resultante se commitea, asi que ni el despliegue ni la build dependen de este
// script. Las fuentes se descargan al vuelo a una carpeta ignorada por git en lugar de
// commitearlas.
//
//   node scripts/generate-og.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fontsDir = path.join(root, '.cache', 'fonts')

const FONTS = [
  {
    file: 'DancingScript-Bold.ttf',
    url: 'https://fonts.gstatic.com/s/dancingscript/v29/If2cXTr6YS-zF4S-kcSWSVi_sxjsohD9F50Ruu7B1i0HTQ.ttf',
  },
  {
    file: 'Quicksand-Bold.ttf',
    url: 'https://fonts.gstatic.com/s/quicksand/v37/6xK-dSZaM9iE8KbpRA_LJ3z8mH9BOJvgkBgv18E.ttf',
  },
]

const WIDTH = 1200
const HEIGHT = 630

async function ensureFonts() {
  await mkdir(fontsDir, { recursive: true })

  for (const font of FONTS) {
    const target = path.join(fontsDir, font.file)

    if (existsSync(target)) {
      continue
    }

    const response = await fetch(font.url)

    if (!response.ok) {
      throw new Error(`No se pudo descargar ${font.file}: HTTP ${response.status}`)
    }

    await writeFile(target, Buffer.from(await response.arrayBuffer()))
    console.log(`descargada  ${font.file}`)
  }

  return FONTS.map((font) => path.join(fontsDir, font.file))
}

// Corazon centrado en (0,0) con radio 1, para reutilizarlo a cualquier escala.
const HEART_PATH =
  'M0 0.92C0 0.92 -1.08 0.18 -1.08 -0.6C-1.08 -1.05 -0.73 -1.38 -0.32 -1.38C-0.13 -1.38 0 -1.28 0 -1.12C0 -1.28 0.13 -1.38 0.32 -1.38C0.73 -1.38 1.08 -1.05 1.08 -0.6C1.08 0.18 0 0.92 0 0.92Z'

function decorativeHearts() {
  // Posiciones fijas: la imagen no debe cambiar entre ejecuciones.
  const hearts = [
    [90, 120, 54, 0.5],
    [1105, 96, 46, 0.42],
    [200, 470, 40, 0.38],
    [1010, 500, 58, 0.46],
    [330, 90, 30, 0.32],
    [880, 150, 26, 0.3],
    [620, 66, 22, 0.26],
    [150, 300, 22, 0.28],
    [1060, 300, 26, 0.3],
    [430, 545, 26, 0.3],
    [760, 560, 34, 0.34],
    [560, 500, 20, 0.24],
  ]

  return hearts
    .map(
      ([x, y, size, opacity]) =>
        `<g transform="translate(${x} ${y}) scale(${size})">` +
        `<path d="${HEART_PATH}" fill="#ffffff" opacity="${opacity}" /></g>`
    )
    .join('')
}

function buildSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#fff5f7" />
      <stop offset="0.52" stop-color="#ffc6d4" />
      <stop offset="1" stop-color="#e03a63" />
    </linearGradient>
    <radialGradient id="heart" cx="0.38" cy="0.3" r="0.75">
      <stop offset="0" stop-color="#ff6f9b" />
      <stop offset="0.55" stop-color="#d81e5b" />
      <stop offset="1" stop-color="#b3164a" />
    </radialGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  ${decorativeHearts()}

  <g transform="translate(276 300) scale(120)">
    <path d="${HEART_PATH}" fill="url(#heart)" />
  </g>

  <text x="470" y="286" font-family="Dancing Script" font-weight="700" font-size="92"
        fill="#7a0f33">Feliz Día de</text>
  <text x="470" y="386" font-family="Dancing Script" font-weight="700" font-size="92"
        fill="#7a0f33">Amor y Amistad</text>
  <text x="474" y="452" font-family="Quicksand" font-weight="700" font-size="30"
        letter-spacing="3" fill="#8e2f4c">AGITA EL TELÉFONO Y MIRA LO QUE PASA</text>
</svg>`
}

async function main() {
  const fontFiles = await ensureFonts()

  const resvg = new Resvg(buildSvg(), {
    fitTo: { mode: 'width', value: WIDTH },
    font: {
      fontFiles,
      // Sin esto intentaria cargar las fuentes del sistema y podria resolver otra
      // familia distinta a la del sitio.
      loadSystemFonts: false,
      defaultFontFamily: 'Quicksand',
    },
  })

  const png = resvg.render().asPng()
  const target = path.join(root, 'public', 'og-image.png')
  await writeFile(target, png)

  // readFile solo para informar del tamano final.
  const written = await readFile(target)
  console.log(`og-image.png  ${WIDTH}x${HEIGHT}  ${written.length} bytes`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
