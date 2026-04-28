import './style.css'
import { gsap } from 'gsap'
import { decompressFrames, parseGIF, type ParsedFrame } from 'gifuct-js'
import appTemplate from './app.template.html?raw'
import { animationConfig, appConfig } from './config'

interface AppState {
  isAnimatingTap: boolean
  isScrubbing: boolean
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
  isScrubbing: false,
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
const characterFrame = requireElement<HTMLElement>('[data-character-frame]')
const characterGlow = requireElement<HTMLElement>('[data-character-glow]')
const messageCard = requireElement<HTMLElement>('.message-card')
const canvas = requireElement<HTMLCanvasElement>('[data-gif-canvas]')
const messageEyebrow = requireElement<HTMLElement>('[data-message-eyebrow]')
const messageTitle = requireElement<HTMLElement>('[data-message-title]')
const messageBody = requireElement<HTMLElement>('[data-message-body]')
const previewLabel = appRoot.querySelector<HTMLElement>('[data-preview-label]')
const reviewSlider = appRoot.querySelector<HTMLInputElement>('[data-review-slider]')
const reviewStats = appRoot.querySelector<HTMLElement>('[data-review-stats]')
const canvasContext = canvas.getContext('2d')

if (!canvasContext) {
  throw new Error('No fue posible inicializar el canvas del GIF.')
}

const context = canvasContext

messageEyebrow.textContent = appConfig.message.eyebrow
messageTitle.textContent = appConfig.message.title
messageBody.textContent = appConfig.message.body
if (previewLabel) {
  previewLabel.textContent = appConfig.ui.previewLabel
}

context.imageSmoothingEnabled = true

trigger.addEventListener('click', () => {
  if (!player.frames.length) {
    return
  }

  state.isScrubbing = false
  triggerTapFeedback()
  if (player.timerId === null) {
    scheduleNextFrame()
  }
})

reviewSlider?.addEventListener('pointerdown', () => {
  state.isScrubbing = true
  stopTimer()
})

reviewSlider?.addEventListener('input', () => {
  if (!player.frames.length || !reviewSlider) {
    return
  }

  state.isScrubbing = true
  stopTimer()
  player.currentFrame = Number(reviewSlider.value)
  renderFrame(player.currentFrame)
})

reviewSlider?.addEventListener('change', () => {
  state.isScrubbing = true
})

boot().catch(() => {
  characterFrame.classList.add('is-error')
})

function boot() {
  animateShell()
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
  if (reviewSlider) {
    reviewSlider.max = String(Math.max(0, player.frames.length - 1))
    reviewSlider.value = '0'
  }

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
  state.isScrubbing = false
  renderFrame(player.currentFrame)
  scheduleNextFrame()
}

function scheduleNextFrame() {
  if (state.isScrubbing) {
    return
  }

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
  if (reviewSlider) {
    reviewSlider.value = String(index)
  }
  if (reviewStats) {
    reviewStats.textContent = buildReviewStats(index)
  }
}

function buildReviewStats(index: number) {
  const elapsedMs = player.frames
    .slice(0, index + 1)
    .reduce((total, frame) => total + frame.delay, 0)

  return `Frame ${index + 1} - ${elapsedMs} ms`
}

function stopTimer() {
  if (player.timerId !== null) {
    window.clearTimeout(player.timerId)
    player.timerId = null
  }
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
        [characterFrame, messageCard],
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
    .fromTo(
      messageCard,
      { scale: 1, y: 0 },
      {
        scale: 1.02,
        y: -4,
        duration: animationConfig.tapDuration,
        ease: 'power2.out',
      },
      0
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
    .to(
      messageCard,
      {
        scale: 1,
        y: 0,
        duration: animationConfig.tapDuration + 0.08,
        ease: 'elastic.out(1, 0.55)',
      },
      '<'
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

window.addEventListener('beforeunload', () => {
  stopTimer()
})
