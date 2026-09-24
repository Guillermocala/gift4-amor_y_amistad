const basePath = import.meta.env.BASE_URL

export const appConfig = {
  basePath,
  gifSrc: `${basePath}media/peach-goma-peach-and-goma-banner-love-you.gif`,
  ui: {
    shakeHint: '¡Agita!',
    shakeHintArmed: '¡Agita!',
    shakeHintTap: '¡Tócame!',
    shakeHintLabel: 'Agita el celular para ver una sorpresa',
    drawerLabel: 'Desliza a la derecha',
    drawerOpenLabel: 'Abrir el mensaje',
    drawerCloseLabel: 'Cerrar el mensaje',
  },
  message: {
    eyebrow: 'Feliz Día de Amor y Amistad',
    title: 'Para Ti, Mi Persona Favorita',
    body: 'Gracias por ser amor y amistad al mismo tiempo: esa morena hermosa que pone en calma mi corazón con cada abrazo, que me retumba con cada beso y aquella amiga que llegó a mi vida para compartirnos cada matiz de nuestros días. Hoy solo quiero recordarte que todo es más bonito contigo cerca. Por este y más días juntos mi amor, te amo.',
  },
}

export const animationConfig = {
  tapScale: 1.04,
  tapDuration: 0.28,
  glowDuration: 0.7,
  floatDistance: 12,
  floatDuration: 3.4,
  drawerDuration: 0.55,
}

export const audioConfig = {
  src: `${basePath}media/morena-instrumental.mp3`,
  // El volumen se calibra en el telefono: su altavoz no se parece al del portatil.
  volume: 0.55,
  fadeInSeconds: 2.5,
}

export const shakeConfig = {
  threshold: 22,
  sampleIntervalMs: 90,
  cooldownMs: 1200,
}

export const heartsConfig = {
  burstDurationMs: 3600,
  spawnIntervalMs: 110,
  // Corazones creados en el instante del disparo, todos por debajo del borde inferior:
  // es el frente de la oleada, nunca aparecen ya dentro de la pantalla.
  frontCount: 8,
  // Distancia extra aleatoria por debajo del borde con la que arranca cada corazon, para
  // que el frente entre escalonado y no como una fila a la misma altura.
  startOffsetRange: [0, 320] as const,
  maxConcurrent: 60,
  // Son corazones SVG sin relleno transparente, asi que estos px son corazon visible:
  // 104 px equivalen a un GIF de ~190 px de lienzo.
  sizeRange: [42, 104] as const,
  riseDurationRange: [4.2, 7] as const,
  swayRange: [10, 34] as const,
  spinRange: [6, 16] as const,
  colors: ['#ff5c8a', '#e03a63', '#ff8fab', '#d81e5b', '#ffb3c6', '#b3164a'] as const,
}
