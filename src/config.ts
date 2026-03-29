const basePath = import.meta.env.BASE_URL

export const appConfig = {
  basePath,
  gifSrc: `${basePath}media/cat-cute.gif`,
  ui: {
    tapIndicator: 'tap me!',
    previewLabel: 'Preview',
  },
  message: {
    eyebrow: 'Para mi morena hermosa',
    title: 'Un mensaje que acompana al personaje',
    body: 'Este espacio queda listo para escribir una dedicatoria corta, un texto romantico o cualquier detalle personal que quieras mostrar junto al gatito.',
  },
}

export const animationConfig = {
  loopStartFrame: 5,
  loopEndFrame: 11,
  tapScale: 1.04,
  tapDuration: 0.28,
  glowDuration: 0.7,
  floatDistance: 12,
  floatDuration: 3.4,
}
