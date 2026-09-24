type MotionEventConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export type ShakeAccess = 'granted' | 'denied' | 'unsupported'

interface ShakeOptions {
  minDelta: number
  noiseFactor: number
  sampleIntervalMs: number
  cooldownMs: number
  onShake: () => void
  onSample?: (delta: number) => void
}

interface Sample {
  x: number
  y: number
  z: number
}

function getMotionConstructor() {
  if (typeof window === 'undefined' || typeof window.DeviceMotionEvent === 'undefined') {
    return null
  }

  return window.DeviceMotionEvent as MotionEventConstructor
}

// Chrome en Android no entrega eventos devicemotion hasta que ha habido actividad del
// usuario en la pagina. Estos son los gestos que valen como tal; touchmove entra porque
// un intento de desplazar la pantalla suele ser lo primero que se hace al abrir el enlace.
const UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'touchmove', 'keydown'] as const

export function createShakeDetector(options: ShakeOptions) {
  const motionConstructor = getMotionConstructor()
  let lastSample: Sample | null = null
  let lastSampleAt = 0
  let lastShakeAt = 0
  let isListening = false
  // Contadores para el panel de diagnostico: separan -no llegan eventos- de
  // -llegan pero sin lectura util- de -llegan bien pero el umbral es alto-.
  let eventCount = 0
  let readingCount = 0
  // Suelo de ruido del dispositivo, aprendido en marcha.
  let noiseFloor = 0
  let effectiveThreshold = options.minDelta
  let hasUserGesture = false

  function handleMotion(event: DeviceMotionEvent) {
    eventCount += 1

    // acceleration llega null en varios dispositivos; accelerationIncludingGravity siempre viene.
    const reading = event.accelerationIncludingGravity

    if (!reading || reading.x === null || reading.y === null || reading.z === null) {
      return
    }

    readingCount += 1

    const now = Date.now()

    if (now - lastSampleAt < options.sampleIntervalMs) {
      return
    }

    lastSampleAt = now
    const sample: Sample = { x: reading.x, y: reading.y, z: reading.z }

    if (!lastSample) {
      lastSample = sample
      return
    }

    const delta =
      Math.abs(sample.x - lastSample.x) +
      Math.abs(sample.y - lastSample.y) +
      Math.abs(sample.z - lastSample.z)

    lastSample = sample

    const isQuiet = delta < effectiveThreshold

    // El suelo solo aprende de muestras tranquilas. Si aprendiera de todas, durante un
    // agitado sostenido subiria persiguiendo a la senal y el umbral dejaria de dispararse.
    if (isQuiet) {
      noiseFloor = noiseFloor * 0.95 + delta * 0.05
      effectiveThreshold = Math.max(options.minDelta, noiseFloor * options.noiseFactor)
    }

    options.onSample?.(delta)

    if (!isQuiet && now - lastShakeAt > options.cooldownMs) {
      lastShakeAt = now
      options.onShake()
    }
  }

  function startListening() {
    if (isListening || !motionConstructor) {
      return
    }

    isListening = true
    window.addEventListener('devicemotion', handleMotion)
  }

  function stop() {
    if (!isListening) {
      return
    }

    isListening = false
    window.removeEventListener('devicemotion', handleMotion)
  }

  async function requestAccess(): Promise<ShakeAccess> {
    if (!motionConstructor) {
      return 'unsupported'
    }

    // iOS 13+ exige este permiso, y solo lo concede dentro de un gesto del usuario sobre HTTPS.
    if (typeof motionConstructor.requestPermission === 'function') {
      try {
        const result = await motionConstructor.requestPermission()

        if (result !== 'granted') {
          return 'denied'
        }
      } catch {
        return 'denied'
      }
    }

    startListening()
    return 'granted'
  }

  // Red de seguridad: al primer gesto en cualquier parte del documento se vuelve a
  // enganchar el listener. No sustituye al enganche inicial, lo respalda, porque el
  // navegador puede haber estado descartando los eventos hasta ese momento.
  function rearmOnFirstGesture() {
    const handleGesture = () => {
      hasUserGesture = true

      UNLOCK_EVENTS.forEach((eventName) => {
        document.removeEventListener(eventName, handleGesture, true)
      })

      stop()
      startListening()
    }

    UNLOCK_EVENTS.forEach((eventName) => {
      document.addEventListener(eventName, handleGesture, { capture: true, passive: true })
    })
  }

  // Solo iOS expone requestPermission. En el resto de plataformas no hay permiso que pedir,
  // asi que el sensor se engancha ya: esperar un toque dejaba el agitado muerto en Android,
  // porque nada le dice a nadie que primero hay que tocar la cinta.
  const needsPermission =
    Boolean(motionConstructor) && typeof motionConstructor?.requestPermission === 'function'

  if (motionConstructor && !needsPermission) {
    startListening()
    rearmOnFirstGesture()
  }

  return {
    requestAccess,
    stop,
    isSupported: Boolean(motionConstructor),
    needsPermission,
    isListening: () => isListening,
    getCounters: () => ({
      eventCount,
      readingCount,
      noiseFloor,
      effectiveThreshold,
      hasUserGesture,
    }),
  }
}
