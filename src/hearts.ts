import { gsap } from 'gsap'

interface HeartsOptions {
  burstDurationMs: number
  spawnIntervalMs: number
  frontCount: number
  startOffsetRange: readonly [number, number]
  maxConcurrent: number
  sizeRange: readonly [number, number]
  riseDurationRange: readonly [number, number]
  swayRange: readonly [number, number]
  spinRange: readonly [number, number]
  colors: readonly string[]
}

interface HeartsEmitterOptions {
  reducedMotion: boolean
}

const HEART_VIEWBOX_WIDTH = 32
const HEART_VIEWBOX_HEIGHT = 29
const HEART_PATH =
  'M16 29C16 29 0 18.5 0 9.2C0 3.6 4.2 0 8.8 0C12 0 14.6 1.7 16 4.1C17.4 1.7 20 0 23.2 0C27.8 0 32 3.6 32 9.2C32 18.5 16 29 16 29Z'

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function pickOne<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] as T
}

function buildHeartTemplate() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${HEART_VIEWBOX_WIDTH} ${HEART_VIEWBOX_HEIGHT}`)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.classList.add('heart')

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', HEART_PATH)
  svg.appendChild(path)

  return svg
}

export function createHeartsEmitter(
  layer: HTMLElement,
  config: HeartsOptions,
  { reducedMotion }: HeartsEmitterOptions
) {
  const active = new Set<SVGSVGElement>()
  // Se construye una sola vez: clonar un nodo es mucho mas barato que crearlo por particula.
  const template = buildHeartTemplate()
  let spawnTimerId: number | null = null
  let burstTimerId: number | null = null

  function spawnHeart() {
    if (active.size >= config.maxConcurrent) {
      return
    }

    const heart = template.cloneNode(true) as SVGSVGElement
    const path = heart.firstElementChild as SVGPathElement

    const width = randomBetween(config.sizeRange[0], config.sizeRange[1])
    const height = (width * HEART_VIEWBOX_HEIGHT) / HEART_VIEWBOX_WIDTH

    // Arranca por debajo del borde inferior, con una distancia extra aleatoria para que
    // el frente entre escalonado.
    const startOffset = randomBetween(config.startOffsetRange[0], config.startOffsetRange[1])

    // Alto explicito: iOS Safari no resuelve height: auto en un SVG inline de forma fiable.
    heart.style.width = `${Math.round(width)}px`
    heart.style.height = `${Math.round(height)}px`
    heart.style.bottom = `${-Math.round(height + startOffset) - 20}px`
    heart.style.left = `${randomBetween(2, 92)}%`
    path.setAttribute('fill', pickOne(config.colors))

    layer.appendChild(heart)
    active.add(heart)

    const travel = window.innerHeight + height + startOffset + 120
    const duration = reducedMotion
      ? config.riseDurationRange[1]
      : randomBetween(config.riseDurationRange[0], config.riseDurationRange[1])

    // Sin fade-in: el corazon nace fuera de la pantalla, asi que entra ya opaco por el
    // borde inferior en vez de verse materializar a media altura.
    gsap.set(heart, { opacity: randomBetween(0.78, 1) })

    const rise = gsap.timeline({
      onComplete: () => {
        gsap.killTweensOf(heart)
        active.delete(heart)
        heart.remove()
      },
    })

    rise
      .fromTo(heart, { y: 0 }, { y: -travel, duration, ease: 'none' })
      .to(heart, { opacity: 0, duration: duration * 0.24, ease: 'power1.in' }, duration * 0.76)

    if (!reducedMotion) {
      const direction = Math.random() < 0.5 ? -1 : 1
      const sway = randomBetween(config.swayRange[0], config.swayRange[1])
      const spin = randomBetween(config.spinRange[0], config.spinRange[1])

      gsap.set(heart, { rotation: randomBetween(-18, 18) })

      // Un solo tween lleva vaiven, giro y latido: cada corazon con su propia fase y
      // duracion, de modo que no se perciba sincronia entre ellos.
      gsap.to(heart, {
        x: sway * direction,
        rotation: `+=${spin * direction}`,
        scale: 1.12,
        duration: randomBetween(0.9, 1.8),
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      })
    }
  }

  function clearTimers() {
    if (spawnTimerId !== null) {
      window.clearInterval(spawnTimerId)
      spawnTimerId = null
    }

    if (burstTimerId !== null) {
      window.clearTimeout(burstTimerId)
      burstTimerId = null
    }
  }

  function startBurst() {
    clearTimers()

    // Frente de la oleada: varios corazones de golpe, pero todos por debajo del borde
    // inferior, de modo que en el primer frame la pantalla sigue limpia.
    const frontCount = reducedMotion ? Math.ceil(config.frontCount / 3) : config.frontCount

    for (let index = 0; index < frontCount; index += 1) {
      spawnHeart()
    }

    const interval = reducedMotion ? config.spawnIntervalMs * 3 : config.spawnIntervalMs
    spawnTimerId = window.setInterval(spawnHeart, interval)

    // Al terminar la rafaga solo se deja de emitir: los corazones en vuelo terminan su
    // recorrido y salen por arriba, de modo que la animacion nunca se corta de golpe.
    burstTimerId = window.setTimeout(() => {
      if (spawnTimerId !== null) {
        window.clearInterval(spawnTimerId)
        spawnTimerId = null
      }

      burstTimerId = null
    }, config.burstDurationMs)
  }

  function stop() {
    clearTimers()
    active.forEach((heart) => {
      gsap.killTweensOf(heart)
      heart.remove()
    })
    active.clear()
  }

  return { startBurst, stop }
}
