const basePath = import.meta.env.BASE_URL

export const appConfig = {
  basePath,
  gifSrc: `${basePath}media/cat-cute.gif`,
  ui: {
    tapIndicator: 'tap me!',
    tapCounterPrefix: 'x',
    previewLabel: 'Preview',
  },
  message: {
    eyebrow: 'Para mi morena hermosa',
    title: 'Eres mi casualidad favorita',
    body: 'Cada día contigo se siente como un regalo que no quiero dejar de abrir. Por ello, te dedico esta tarjetita con mucho amor, con invitación a reclamar la cantidad de besos que diga el contador',
  },
}

export const animationConfig = {
  loopStartFrame: 5,
  loopEndFrame: 11,
  tapResetDelayMs: 180000,
  tapScale: 1.04,
  tapDuration: 0.28,
  glowDuration: 0.7,
  floatDistance: 12,
  floatDuration: 3.4,
}
