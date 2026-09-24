import './style.css'
import { gsap } from 'gsap'
import { decompressFrames, parseGIF, type ParsedFrame } from 'gifuct-js'
import appTemplate from './app.template.html?raw'
import { animationConfig, appConfig, audioConfig, heartsConfig, shakeConfig } from './config'
import { createShakeDetector } from './shake'
import { createHeartsEmitter } from './hearts'
import { createAmbientAudio } from './ambient-audio'

interface AppState {
  isAnimatingTap: boolean
  isDrawerOpen: boolean
  reducedMotion: boolean
}

interface RenderedGifFrame {
  canvas: HTMLCanvasElement
  delay: number
}

interface GifPlayer {
  frames: RenderedGifFrame[]
  currentFrame: number
  timerId: number | null
  width: number
  height: number
}

const state: AppState = {
  isAnimatingTap: false,
  isDrawerOpen: false,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
}

const player: GifPlayer = {
  frames: [],
  currentFrame: 0,
  timerId: null,
  width: 0,
  height: 0,
}

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('No se encontro el contenedor principal.')
}

const appRoot = app
appRoot.innerHTML = appTemplate

function requireElement<T extends Element>(selector: string) {
  const element = appRoot.querySelector<T>(selector)

  if (!element) {
    throw new Error(`No se encontro el elemento requerido: ${selector}`)
  }

  return element
}

const trigger = requireElement<HTMLButtonElement>('[data-trigger]')
const shell = requireElement<HTMLElement>('[data-shell]')
const characterFrame = requireElement<HTMLElement>('[data-character-frame]')
const characterGlow = requireElement<HTMLElement>('[data-character-glow]')
const canvas = requireElement<HTMLCanvasElement>('[data-gif-canvas]')
const messageEyebrow = requireElement<HTMLElement>('[data-message-eyebrow]')
const messageTitle = requireElement<HTMLElement>('[data-message-title]')
const messageBody = requireElement<HTMLElement>('[data-message-body]')
const scrim = requireElement<HTMLElement>('[data-scrim]')
const drawer = requireElement<HTMLElement>('[data-drawer]')
const drawerToggle = requireElement<HTMLButtonElement>('[data-drawer-toggle]')
const drawerLabel = requireElement<HTMLElement>('[data-drawer-label]')
const panel = requireElement<HTMLElement>('[data-panel]')
const heartsLayer = requireElement<HTMLElement>('[data-hearts-layer]')
const shakeHint = requireElement<HTMLButtonElement>('[data-shake-hint]')
const shakeHintLabel = requireElement<HTMLElement>('[data-shake-hint-label]')
const canvasContext = canvas.getContext('2d')

if (!canvasContext) {
  throw new Error('No fue posible inicializar el canvas del GIF.')
}

const context = canvasContext

messageEyebrow.textContent = appConfig.message.eyebrow
messageTitle.textContent = appConfig.message.title
messageBody.textContent = appConfig.message.body
drawerLabel.textContent = appConfig.ui.drawerLabel
drawerToggle.setAttribute('aria-label', appConfig.ui.drawerOpenLabel)

context.imageSmoothingEnabled = true

const emitter = createHeartsEmitter(heartsLayer, heartsConfig, {
  reducedMotion: state.reducedMotion,
})

const ambientAudio = createAmbientAudio(audioConfig)

// Lecturas crudas del sensor, solo para el panel de ?debug=1.
const diagnostics = { lastDelta: 0, maxDelta: 0, burstCount: 0 }

const shakeDetector = createShakeDetector({
  minDelta: shakeConfig.minDelta,
  noiseFactor: shakeConfig.noiseFactor,
  sampleIntervalMs: shakeConfig.sampleIntervalMs,
  cooldownMs: shakeConfig.cooldownMs,
  onSample: (delta) => {
    diagnostics.lastDelta = delta
    diagnostics.maxDelta = Math.max(diagnostics.maxDelta, delta)
  },
  onShake: () => {
    diagnostics.burstCount += 1
    emitter.startBurst()
  },
})

trigger.addEventListener('click', () => {
  if (!player.frames.length) {
    return
  }

  triggerTapFeedback()
  if (player.timerId === null) {
    scheduleNextFrame()
  }
})

setupDrawer()
setupShake()
setupDebugPanel()

boot().catch(() => {
  characterFrame.classList.add('is-error')
})

function boot() {
  animateShell()
  void ambientAudio.start()
  return loadGif()
}

async function loadGif() {
  const response = await fetch(appConfig.gifSrc)

  if (!response.ok) {
    throw new Error('No se pudo cargar el GIF principal.')
  }

  const arrayBuffer = await response.arrayBuffer()
  const parsedGif = parseGIF(arrayBuffer)
  const decompressedFrames = decompressFrames(parsedGif, true)

  if (!decompressedFrames.length) {
    throw new Error('El GIF no contiene frames reproducibles.')
  }

  player.width = parsedGif.lsd.width
  player.height = parsedGif.lsd.height
  player.frames = buildRenderedFrames(decompressedFrames, player.width, player.height)

  canvas.width = player.width
  canvas.height = player.height
  canvas.style.aspectRatio = `${player.width} / ${player.height}`

  player.currentFrame = 0
  renderFrame(player.currentFrame)
  startGifLoop()
}

function buildRenderedFrames(frames: ParsedFrame[], width: number, height: number) {
  const workingCanvas = document.createElement('canvas')
  workingCanvas.width = width
  workingCanvas.height = height
  const workingContext = workingCanvas.getContext('2d')

  if (!workingContext) {
    throw new Error('No fue posible preparar los frames del GIF.')
  }

  const patchCanvas = document.createElement('canvas')
  const patchContext = patchCanvas.getContext('2d')

  if (!patchContext) {
    throw new Error('No fue posible crear el canvas auxiliar del GIF.')
  }

  const renderedFrames: RenderedGifFrame[] = []

  frames.forEach((frame) => {
    patchCanvas.width = frame.dims.width
    patchCanvas.height = frame.dims.height

    const snapshotBeforeDraw = workingContext.getImageData(0, 0, width, height)
    const patchImageData = patchContext.createImageData(frame.dims.width, frame.dims.height)
    patchImageData.data.set(frame.patch)
    patchContext.putImageData(patchImageData, 0, 0)

    workingContext.drawImage(patchCanvas, frame.dims.left, frame.dims.top)

    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = width
    frameCanvas.height = height
    const frameContext = frameCanvas.getContext('2d')

    if (!frameContext) {
      throw new Error('No fue posible materializar un frame del GIF.')
    }

    frameContext.drawImage(workingCanvas, 0, 0)

    renderedFrames.push({
      canvas: frameCanvas,
      delay: frame.delay > 0 ? frame.delay : 100,
    })

    if (frame.disposalType === 2) {
      workingContext.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height)
    } else if (frame.disposalType === 3) {
      workingContext.putImageData(snapshotBeforeDraw, 0, 0)
    }
  })

  return renderedFrames
}

function startGifLoop() {
  stopTimer()
  renderFrame(player.currentFrame)
  scheduleNextFrame()
}

function scheduleNextFrame() {
  const current = player.frames[player.currentFrame]
  const delay = current?.delay ?? 100

  player.timerId = window.setTimeout(() => {
    advanceFrame()
  }, delay)
}

function advanceFrame() {
  if (!player.frames.length) {
    return
  }

  player.currentFrame = (player.currentFrame + 1) % player.frames.length
  renderFrame(player.currentFrame)
  scheduleNextFrame()
}

function renderFrame(index: number) {
  const frame = player.frames[index]

  if (!frame) {
    return
  }

  context.clearRect(0, 0, player.width, player.height)
  context.drawImage(frame.canvas, 0, 0)
}

function stopTimer() {
  if (player.timerId !== null) {
    window.clearTimeout(player.timerId)
    player.timerId = null
  }
}

function setupShake() {
  // Lo que decide si hay que armar algo es si la plataforma exige permiso, no si hay
  // sensor: en Android hay sensor y no hay permiso, y el detector ya viene escuchando.
  let isArmed = !shakeDetector.needsPermission

  shakeHint.setAttribute('aria-label', appConfig.ui.shakeHintLabel)
  shakeHintLabel.textContent = shakeDetector.isSupported
    ? appConfig.ui.shakeHint
    : appConfig.ui.shakeHintTap

  // Meneo periodico en vez de un latido continuo: la cinta pide que agiten el telefono,
  // asi que ella misma se agita. La rotacion se declara en cada paso porque los 45 grados
  // de base vienen del CSS; si se omitieran, GSAP arrancaria desde 0 y daria un salto.
  // Sin tiempos muertos: la cinta pide agitar el telefono, asi que nunca se queda quieta.
  // Alterna un meneo rapido (el gesto) con un balanceo lento que la mantiene viva sin
  // resultar frenetica. La rotacion se declara en cada paso porque los 45 grados de base
  // vienen del CSS; omitirla haria que GSAP partiese de 0 con un salto visible.
  const pulse = state.reducedMotion
    ? null
    : gsap
        .timeline({ repeat: -1 })
        .set(shakeHint, { rotate: 45, scale: 1 })
        .to(shakeHint, { rotate: 39, scale: 1.07, duration: 0.1, ease: 'sine.out' })
        .to(shakeHint, { rotate: 51, duration: 0.12, ease: 'sine.inOut' })
        .to(shakeHint, { rotate: 41, duration: 0.11, ease: 'sine.inOut' })
        .to(shakeHint, { rotate: 49, duration: 0.11, ease: 'sine.inOut' })
        .to(shakeHint, { rotate: 45, scale: 1, duration: 0.26, ease: 'elastic.out(1, 0.45)' })
        .to(shakeHint, { rotate: 47.5, duration: 0.7, ease: 'sine.inOut' })
        .to(shakeHint, { rotate: 42.5, duration: 0.9, ease: 'sine.inOut' })
        .to(shakeHint, { rotate: 45, duration: 0.7, ease: 'sine.inOut' })

  shakeHint.addEventListener('click', () => {
    if (!shakeDetector.needsPermission || isArmed) {
      // Sin permiso pendiente (o ya armado) el tap dispara la rafaga directamente.
      diagnostics.burstCount += 1
      emitter.startBurst()
      return
    }

    void shakeDetector.requestAccess().then((access) => {
      if (access === 'granted') {
        isArmed = true
        shakeHintLabel.textContent = appConfig.ui.shakeHintArmed
        pulse?.kill()
        gsap.set(shakeHint, { scale: 1, rotate: 45 })
        emitter.startBurst()
        return
      }

      // Permiso negado: la cinta se queda como unico disparador.
      isArmed = true
      shakeHintLabel.textContent = appConfig.ui.shakeHintTap
      emitter.startBurst()
    })
  })
}

// Panel de diagnostico del sensor, solo con ?debug=1 en la URL. Existe porque el agitado
// no se puede probar desde el entorno de desarrollo: hace falta un telefono real.
function setupDebugPanel() {
  if (!new URLSearchParams(window.location.search).has('debug')) {
    return
  }

  const panel = document.createElement('pre')
  panel.style.cssText = [
    'position:fixed',
    'left:8px',
    'bottom:8px',
    'z-index:9',
    'margin:0',
    'padding:10px 12px',
    'max-width:calc(100vw - 16px)',
    'border-radius:12px',
    'background:rgba(42,13,24,0.86)',
    'color:#ffe4ec',
    'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
    'white-space:pre',
    'pointer-events:none',
  ].join(';')
  appRoot.appendChild(panel)

  function describeState(eventCount: number, readingCount: number) {
    if (!shakeDetector.isSupported) {
      return 'SIN DeviceMotionEvent (el navegador no ofrece el sensor)'
    }

    if (!shakeDetector.isListening()) {
      return 'sensor no armado (falta tocar la cinta para dar permiso)'
    }

    if (eventCount === 0) {
      return 'escuchando pero NO llegan eventos del sensor'
    }

    if (readingCount === 0) {
      return 'llegan eventos pero sin lectura utilizable'
    }

    return 'recibiendo lecturas correctamente'
  }

  window.setInterval(() => {
    const { eventCount, readingCount, noiseFloor, effectiveThreshold, hasUserGesture } =
      shakeDetector.getCounters()

    panel.textContent = [
      `estado    ${describeState(eventCount, readingCount)}`,
      `permiso   ${shakeDetector.needsPermission ? 'requerido (iOS)' : 'no requerido'}`,
      `eventos   ${eventCount}   lecturas ${readingCount}`,
      `delta     ${diagnostics.lastDelta.toFixed(1)}   maximo ${diagnostics.maxDelta.toFixed(1)}`,
      `ruido     ${noiseFloor.toFixed(2)}   umbral ${effectiveThreshold.toFixed(1)}`,
      `gesto     ${hasUserGesture ? "si (sensor desbloqueado)" : "todavia no"}`,
      `animacion ${state.reducedMotion ? "REDUCIDA por preferencia del sistema" : "normal"}`,
      `rafagas   ${diagnostics.burstCount}`,
    ].join('\n')
  }, 200)
}

function setupDrawer() {
  let closedX = 0
  let isDragging = false
  let dragEngaged = false
  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let startTranslate = 0

  measureDrawer()
  gsap.set(drawer, { x: closedX })

  function measureDrawer() {
    closedX = panel.getBoundingClientRect().width
  }

  function currentTranslate() {
    return Number(gsap.getProperty(drawer, 'x'))
  }

  function setDrawerOpen(open: boolean) {
    state.isDrawerOpen = open
    const duration = state.reducedMotion ? 0 : animationConfig.drawerDuration

    drawerToggle.setAttribute('aria-expanded', String(open))
    drawerToggle.setAttribute(
      'aria-label',
      open ? appConfig.ui.drawerCloseLabel : appConfig.ui.drawerOpenLabel
    )

    if (open) {
      scrim.hidden = false
      shell.setAttribute('inert', '')
      shell.setAttribute('aria-hidden', 'true')
    } else {
      shell.removeAttribute('inert')
      shell.removeAttribute('aria-hidden')
    }

    gsap
      .timeline({
        onComplete: () => {
          if (!open) {
            scrim.hidden = true
          }
        },
      })
      .to(drawer, { x: open ? 0 : closedX, duration, ease: 'power3.out' }, 0)
      .to(scrim, { opacity: open ? 1 : 0, duration }, 0)
      // El contenido principal se atenua y se encoge: es lo que lo oculta tras el panel.
      .to(shell, { scale: open ? 0.96 : 1, opacity: open ? 0.35 : 1, duration }, 0)
      // Los corazones siguen subiendo por delante del panel, solo atenuados para no
      // estorbar la lectura del mensaje.
      .to(heartsLayer, { opacity: open ? 0.4 : 1, duration }, 0)
  }

  drawerToggle.addEventListener('click', () => {
    if (dragEngaged) {
      return
    }

    setDrawerOpen(!state.isDrawerOpen)
  })

  scrim.addEventListener('click', () => {
    setDrawerOpen(false)
  })

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.isDrawerOpen) {
      setDrawerOpen(false)
    }
  })

  drawer.addEventListener('pointerdown', (event) => {
    if (pointerId !== null) {
      return
    }

    pointerId = event.pointerId
    isDragging = true
    dragEngaged = false
    startX = event.clientX
    startY = event.clientY
    startTranslate = currentTranslate()
  })

  drawer.addEventListener('pointermove', (event) => {
    if (!isDragging || event.pointerId !== pointerId) {
      return
    }

    const deltaX = event.clientX - startX
    const deltaY = event.clientY - startY

    // Solo se toma el gesto como arrastre si es claramente horizontal, para no
    // robarle el scroll vertical al panel.
    if (!dragEngaged) {
      if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY)) {
        return
      }

      dragEngaged = true
      drawer.setPointerCapture(event.pointerId)
    }

    const next = Math.min(closedX, Math.max(0, startTranslate + deltaX))
    const progress = closedX === 0 ? 1 : 1 - next / closedX

    scrim.hidden = false
    gsap.set(drawer, { x: next })
    gsap.set(scrim, { opacity: progress })
    gsap.set(shell, { scale: 1 - 0.04 * progress, opacity: 1 - 0.65 * progress })
    gsap.set(heartsLayer, { opacity: 1 - 0.6 * progress })
  })

  function endDrag(event: PointerEvent) {
    if (!isDragging || event.pointerId !== pointerId) {
      return
    }

    isDragging = false
    pointerId = null

    if (drawer.hasPointerCapture(event.pointerId)) {
      drawer.releasePointerCapture(event.pointerId)
    }

    if (!dragEngaged) {
      return
    }

    const travelled = event.clientX - startX
    const position = currentTranslate()
    const shouldOpen = Math.abs(travelled) > 60 ? travelled < 0 : position < closedX / 2

    setDrawerOpen(shouldOpen)
    // Se libera en el siguiente tick para que el click sintetizado tras el arrastre
    // no vuelva a alternar el panel.
    window.setTimeout(() => {
      dragEngaged = false
    }, 0)
  }

  drawer.addEventListener('pointerup', endDrag)
  drawer.addEventListener('pointercancel', endDrag)

  function remeasure() {
    measureDrawer()
    gsap.set(drawer, { x: state.isDrawerOpen ? 0 : closedX })
  }

  window.addEventListener('resize', remeasure)
  // El primer measure corre antes de que el layout se estabilice en algunos casos
  // (fuentes, barra de Safari), asi que se repite al terminar de cargar.
  window.addEventListener('load', remeasure)
}

function triggerTapFeedback() {
  state.isAnimatingTap = true

  if (state.reducedMotion) {
    gsap
      .timeline({
        onComplete: () => {
          state.isAnimatingTap = false
        },
      })
      .fromTo(
        characterFrame,
        { scale: 1 },
        {
          scale: 1.02,
          duration: 0.01,
          yoyo: true,
          repeat: 1,
        }
      )
    return
  }

  gsap
    .timeline({
      onComplete: () => {
        state.isAnimatingTap = false
      },
    })
    .fromTo(
      characterFrame,
      { scale: 1, rotate: 0 },
      {
        scale: animationConfig.tapScale,
        rotate: -2,
        duration: animationConfig.tapDuration,
        ease: 'power2.out',
      }
    )
    .to(
      characterFrame,
      {
        scale: 1,
        rotate: 0,
        duration: animationConfig.tapDuration + 0.08,
        ease: 'elastic.out(1, 0.55)',
      },
      '>-0.02'
    )
    .fromTo(
      characterGlow,
      { scale: 0.84, opacity: 0.18 },
      {
        scale: 1.35,
        opacity: 0,
        duration: animationConfig.glowDuration,
        ease: 'power2.out',
      },
      0
    )
}

function animateShell() {
  if (state.reducedMotion) {
    return
  }

  gsap.fromTo(
    '.experience-shell',
    { autoAlpha: 0, y: 18 },
    { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power2.out' }
  )

  gsap.to(characterFrame, {
    y: -animationConfig.floatDistance,
    duration: animationConfig.floatDuration,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  })

  gsap.to('.ambient--left', {
    xPercent: 6,
    yPercent: -4,
    duration: 5.4,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  })

  gsap.to('.ambient--right', {
    xPercent: -6,
    yPercent: 4,
    duration: 6,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  })
}

// Safari en iOS no dispara beforeunload de forma fiable.
window.addEventListener('pagehide', () => {
  stopTimer()
  shakeDetector.stop()
  emitter.stop()
  ambientAudio.stop()
})
