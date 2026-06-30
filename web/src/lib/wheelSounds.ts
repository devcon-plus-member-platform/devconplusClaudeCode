/**
 * Synthesized sound effects for the raffle wheel — no audio files, no dependency.
 *
 * Every sound is generated on the fly with the Web Audio API and degrades silently
 * on unsupported browsers (the visual confetti still plays). The shared AudioContext
 * is created lazily inside a user gesture (the spin click) so it satisfies browser
 * autoplay policies.
 */

type AudioContextCtor = typeof AudioContext

let ctx: AudioContext | null = null
let muted = false
let tickTimers: number[] = []

/** Total spin duration (ms) — mirrors SPIN_TRANSITION in NameWheel.tsx. */
const SPIN_DURATION_MS = 4500

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    if (!ctx) ctx = new Ctor()
    // Resume if the browser suspended it under its autoplay policy.
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function setMuted(value: boolean): void {
  muted = value
}

/** One short percussive click — the wheel "tick". */
function playTick(): void {
  if (muted) return
  const ac = getCtx()
  if (!ac) return
  try {
    const now = ac.currentTime
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1250, now)
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.03)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
    osc.connect(gain).connect(ac.destination)
    osc.start(now)
    osc.stop(now + 0.06)
  } catch {
    // best-effort — ignore audio failures
  }
}

/**
 * Schedule decelerating ticks across the spin. The gap between clicks widens from
 * ~55ms to ~300ms (quadratic ease-out) so the ticks slow down with the wheel.
 * Clears any previous schedule first.
 */
export function startSpinTicks(): void {
  stopSpinTicks()
  // Unlock/resume the context on this gesture regardless of mute state.
  getCtx()
  if (muted) return
  const start = performance.now()
  const scheduleNext = () => {
    const elapsed = performance.now() - start
    if (elapsed >= SPIN_DURATION_MS) return
    playTick()
    const progress = elapsed / SPIN_DURATION_MS
    const gap = 55 + (300 - 55) * progress * progress
    tickTimers.push(window.setTimeout(scheduleNext, gap))
  }
  scheduleNext()
}

export function stopSpinTicks(): void {
  tickTimers.forEach((id) => window.clearTimeout(id))
  tickTimers = []
}

/** Ascending major arpeggio (C5 · E5 · G5 · C6). */
function playChime(ac: AudioContext, startAt: number): void {
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((freq, i) => {
    const t = startAt + i * 0.085
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    osc.connect(gain).connect(ac.destination)
    osc.start(t)
    osc.stop(t + 0.55)
  })
}

/**
 * Synthesized applause: band-pass-filtered white noise with a multi-bump amplitude
 * envelope — a few discrete claps up front, then a sustained applause swell that fades.
 */
function playApplause(ac: AudioContext, startAt: number): void {
  const duration = 2.0
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * duration), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  const noise = ac.createBufferSource()
  noise.buffer = buffer

  const bandpass = ac.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.setValueAtTime(1600, startAt)
  bandpass.Q.setValueAtTime(0.6, startAt)

  const gain = ac.createGain()
  const g = gain.gain
  g.setValueAtTime(0.0001, startAt)
  // Initial discrete claps.
  g.linearRampToValueAtTime(0.25, startAt + 0.03)
  g.linearRampToValueAtTime(0.08, startAt + 0.09)
  g.linearRampToValueAtTime(0.3, startAt + 0.14)
  g.linearRampToValueAtTime(0.1, startAt + 0.2)
  g.linearRampToValueAtTime(0.28, startAt + 0.26)
  // Settle into a sustained applause swell, then fade out.
  g.linearRampToValueAtTime(0.18, startAt + 0.5)
  g.linearRampToValueAtTime(0.16, startAt + 1.2)
  g.exponentialRampToValueAtTime(0.0001, startAt + duration)

  noise.connect(bandpass).connect(gain).connect(ac.destination)
  noise.start(startAt)
  noise.stop(startAt + duration)
}

/** Celebratory win sound fired at spin-end: ascending chime layered with applause. */
export function playWin(): void {
  if (muted) return
  const ac = getCtx()
  if (!ac) return
  try {
    const now = ac.currentTime
    playChime(ac, now)
    playApplause(ac, now)
  } catch {
    // best-effort — ignore audio failures
  }
}
