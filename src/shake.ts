type MotionEventConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export type ShakeAccess = 'granted' | 'denied' | 'unsupported'

// Fuente de la que estan llegando las lecturas, para el panel de diagnostico.
export type ShakeSource = 'ninguna' | 'accelerometer' | 'devicemotion'

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

// API de sensores genericos. No esta en las definiciones estandar del DOM, asi que se
// declara lo minimo que se usa.
interface AccelerometerLike {
  x: number | null
  y: number | null
  z: number | null
  addEventListener(type: string, handler: () => void): void
  start(): void
  stop(): void
}

type AccelerometerConstructor = new (options?: { frequency?: number }) => AccelerometerLike

function getMotionConstructor() {
  if (typeof window === 'undefined' || typeof window.DeviceMotionEvent === 'undefined') {
    return null
  }

  return window.DeviceMotionEvent as MotionEventConstructor
}

function getAccelerometerConstructor() {
  if (typeof window === 'undefined') {
    return null
  }

  return (window as unknown as { Accelerometer?: AccelerometerConstructor }).Accelerometer ?? null
}

// Gestos que sirven para desbloquear el sensor cuando el navegador exige permiso o no
// entrega eventos hasta que hay actividad. touchmove entra porque un intento de desplazar
// la pantalla suele ser lo primero que se hace al abrir el enlace.
const UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'touchmove', 'keydown'] as const

export function createShakeDetector(options: ShakeOptions) {
  const motionConstructor = getMotionConstructor()
  const accelerometerConstructor = getAccelerometerConstructor()

  let lastSample: Sample | null = null
  let lastSampleAt = 0
  let lastShakeAt = 0
  let isListening = false
  let genericSensor: AccelerometerLike | null = null
  let source: ShakeSource = 'ninguna'

  // Contadores para el panel de diagnostico: separan -no llegan eventos- de
  // -llegan pero sin lectura util- de -llegan bien pero el umbral es alto-.
  let eventCount = 0
  let readingCount = 0
  // Suelo de ruido del dispositivo, aprendido en marcha.
  let noiseFloor = 0
  let effectiveThreshold = options.minDelta
  let hasUserGesture = false

  // Punto unico por el que pasan todas las fuentes, para que el umbral adaptativo y el
  // periodo de gracia se comporten igual venga la lectura de donde venga.
  function processSample(x: number, y: number, z: number, from: ShakeSource) {
    const now = Date.now()

    if (now - lastSampleAt < options.sampleIntervalMs) {
      return
    }

    lastSampleAt = now
    readingCount += 1
    source = from

    const sample: Sample = { x, y, z }

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

  function handleMotion(event: DeviceMotionEvent) {
    eventCount += 1

    // acceleration llega null en varios dispositivos; accelerationIncludingGravity siempre viene.
    const reading = event.accelerationIncludingGravity

    if (!reading || reading.x === null || reading.y === null || reading.z === null) {
      return
    }

    processSample(reading.x, reading.y, reading.z, 'devicemotion')
  }

  function startListening() {
    if (isListening || !motionConstructor) {
      return
    }

    isListening = true
    window.addEventListener('devicemotion', handleMotion)
  }

  function stopListening() {
    if (!isListening) {
      return
    }

    isListening = false
    window.removeEventListener('devicemotion', handleMotion)
  }

  // La API de sensores genericos no exige gesto del usuario, a diferencia de
  // requestPermission. Es la unica via para que agitar funcione nada mas entrar, sin
  // tocar nada, asi que se intenta siempre primero.
  function startGenericSensor() {
    if (!accelerometerConstructor || genericSensor) {
      return
    }

    try {
      const sensor = new accelerometerConstructor({ frequency: 20 })

      sensor.addEventListener('reading', () => {
        eventCount += 1

        if (sensor.x === null || sensor.y === null || sensor.z === null) {
          return
        }

        processSample(sensor.x, sensor.y, sensor.z, 'accelerometer')
      })

      // Si el navegador la deniega por politica de permisos, queda el devicemotion.
      sensor.addEventListener('error', () => {
        genericSensor = null
      })

      sensor.start()
      genericSensor = sensor
    } catch {
      genericSensor = null
    }
  }

  function stop() {
    stopListening()

    if (genericSensor) {
      try {
        genericSensor.stop()
      } catch {
        // Da igual: la pagina se esta yendo.
      }

      genericSensor = null
    }
  }

  async function requestAccess(): Promise<ShakeAccess> {
    if (!motionConstructor && !accelerometerConstructor) {
      return 'unsupported'
    }

    // iOS 13+ exige este permiso, y solo lo concede dentro de un gesto del usuario sobre HTTPS.
    if (typeof motionConstructor?.requestPermission === 'function') {
      try {
        const result = await motionConstructor.requestPermission()

        if (result !== 'granted') {
          return 'denied'
        }
      } catch {
        return 'denied'
      }
    }

    startGenericSensor()
    startListening()
    return 'granted'
  }

  const needsPermission =
    Boolean(motionConstructor) && typeof motionConstructor?.requestPermission === 'function'

  // Se arranca todo lo que no necesita permiso, sin esperar a nadie.
  startGenericSensor()

  if (!needsPermission) {
    startListening()
  }

  // Al primer gesto en cualquier parte del documento se reintenta todo: si el navegador
  // exigia permiso, este es el momento valido para pedirlo, y si solo estaba descartando
  // eventos, el re-enganche los recupera. Cubre ambos casos sin tener que distinguirlos.
  function handleFirstGesture() {
    hasUserGesture = true

    UNLOCK_EVENTS.forEach((eventName) => {
      document.removeEventListener(eventName, handleFirstGesture, true)
    })

    void requestAccess()
  }

  UNLOCK_EVENTS.forEach((eventName) => {
    document.addEventListener(eventName, handleFirstGesture, { capture: true, passive: true })
  })

  return {
    requestAccess,
    stop,
    isSupported: Boolean(motionConstructor || accelerometerConstructor),
    needsPermission,
    isListening: () => isListening || genericSensor !== null,
    getCounters: () => ({
      eventCount,
      readingCount,
      noiseFloor,
      effectiveThreshold,
      hasUserGesture,
      source,
    }),
  }
}
