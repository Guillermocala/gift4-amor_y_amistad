const basePath = import.meta.env.BASE_URL

export const appConfig = {
  basePath,
  gifSrc: `${basePath}media/peach-cat-goma-congrats.gif`,
  ui: {
    previewLabel: 'Preview',
  },
  message: {
    eyebrow: '',
    title: '¡Feliz Día, Mi Diseñadora Hermosa!',
    body: 'El mundo se vuelve más bonito gracias a tu esfuerzo, a tu estilo y a los colores que dejas en cada lienzo. Ese toque de "malejita" hace que lo cotidiano tenga más vida, más intención y más magia.',
  },
}

export const animationConfig = {
  tapScale: 1.04,
  tapDuration: 0.28,
  glowDuration: 0.7,
  floatDistance: 12,
  floatDuration: 3.4,
}
