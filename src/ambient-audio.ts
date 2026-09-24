import { gsap } from 'gsap'

interface AmbientAudioOptions {
  src: string
  volume: number
  fadeInSeconds: number
}

// Gestos que sirven para desbloquear la reproduccion cuando el navegador rechaza el
// autoarranque. Se escuchan en captura para atraparlos antes que cualquier handler propio.
const UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'keydown'] as const

export function createAmbientAudio({ src, volume, fadeInSeconds }: AmbientAudioOptions) {
  const audio = new Audio(src)
  audio.loop = true
  audio.preload = 'auto'
  audio.volume = 0

  let hasPlayed = false
  let isUnlockPending = false

  function fadeIn() {
    gsap.to(audio, { volume, duration: fadeInSeconds, ease: 'sine.out', overwrite: true })
  }

  async function attemptPlay() {
    try {
      await audio.play()
      hasPlayed = true

      if (audio.volume < volume) {
        fadeIn()
      }

      return true
    } catch {
      // NotAllowedError: el navegador exige un gesto del usuario. Es el camino esperado en
      // iOS, no una condicion de error.
      return false
    }
  }

  function removeUnlockListeners(handler: () => void) {
    UNLOCK_EVENTS.forEach((eventName) => {
      document.removeEventListener(eventName, handler, true)
    })
  }

  function waitForFirstGesture() {
    if (isUnlockPending) {
      return
    }

    isUnlockPending = true

    const handleGesture = () => {
      // Se retiran todas a la vez: el primer gesto que llegue invalida las demas.
      removeUnlockListeners(handleGesture)
      isUnlockPending = false
      void attemptPlay()
    }

    UNLOCK_EVENTS.forEach((eventName) => {
      document.addEventListener(eventName, handleGesture, { capture: true, passive: true })
    })
  }

  async function start() {
    const didPlay = await attemptPlay()

    if (!didPlay) {
      waitForFirstGesture()
    }
  }

  function stop() {
    gsap.killTweensOf(audio)
    audio.pause()
  }

  // Sin esto, una llamada entrante o bloquear la pantalla dejaria la musica muerta el resto
  // de la visita: iOS pausa el audio al pasar a segundo plano y no lo reanuda solo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !hasPlayed || !audio.paused) {
      return
    }

    void attemptPlay()
  })

  return { start, stop }
}
