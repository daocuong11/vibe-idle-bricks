import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLifecyclePersistence } from '../../src/hooks/useLifecyclePersistence'
import Decimal from 'break_infinity.js'
import { useGameStore } from '../../src/store/gameStore'
import { recordIncome, resetIncomeTracking } from '../../src/store/earnings'

let visibilityState: DocumentVisibilityState = 'visible'

const setVisibility = (state: DocumentVisibilityState) => {
  visibilityState = state
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useLifecyclePersistence', () => {
  beforeEach(() => {
    resetIncomeTracking()
    visibilityState = 'visible'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('saves and records the time when the page becomes hidden', () => {
    const save = vi.spyOn(useGameStore.getState(), 'save').mockReturnValue(true)
    renderHook(() => useLifecyclePersistence())

    setVisibility('hidden')

    expect(save).toHaveBeenCalledOnce()
  })

  it('does nothing when the page becomes visible without a hidden timestamp', () => {
    const save = vi.spyOn(useGameStore.getState(), 'save').mockReturnValue(true)
    const applyIdleEarnings = vi.spyOn(useGameStore.getState(), 'applyIdleEarnings')
    renderHook(() => useLifecyclePersistence())

    setVisibility('visible')

    expect(applyIdleEarnings).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('does not grant idle earnings for an absence shorter than one minute', () => {
    const save = vi.spyOn(useGameStore.getState(), 'save').mockReturnValue(true)
    const applyIdleEarnings = vi.spyOn(useGameStore.getState(), 'applyIdleEarnings')
    renderHook(() => useLifecyclePersistence())

    setVisibility('hidden')
    vi.advanceTimersByTime(59_999)
    setVisibility('visible')

    expect(applyIdleEarnings).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledOnce()
  })

  it('grants the hidden duration through one store action and saves on return', () => {
    const save = vi.spyOn(useGameStore.getState(), 'save').mockReturnValue(true)
    const applyIdleEarnings = vi.spyOn(useGameStore.getState(), 'applyIdleEarnings')
    renderHook(() => useLifecyclePersistence())

    setVisibility('hidden')
    vi.advanceTimersByTime(60_000)
    setVisibility('visible')

    expect(applyIdleEarnings).toHaveBeenCalledOnce()
    expect(applyIdleEarnings).toHaveBeenCalledWith(60, expect.anything())
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('grants five background minutes once across repeated visible events', () => {
    const save = vi.spyOn(useGameStore.getState(), 'save').mockReturnValue(true)
    const applyIdleEarnings = vi.spyOn(useGameStore.getState(), 'applyIdleEarnings')
    renderHook(() => useLifecyclePersistence())

    setVisibility('hidden')
    vi.advanceTimersByTime(5 * 60_000)
    setVisibility('visible')
    setVisibility('visible')

    expect(applyIdleEarnings).toHaveBeenCalledOnce()
    expect(applyIdleEarnings).toHaveBeenCalledWith(300, expect.anything())
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('captures the measured rate at hide time before the tracker is pruned', () => {
    const save = vi.spyOn(useGameStore.getState(), 'save').mockReturnValue(true)
    const applyIdleEarnings = vi.spyOn(useGameStore.getState(), 'applyIdleEarnings')
    renderHook(() => useLifecyclePersistence())

    recordIncome(new Decimal(60))
    setVisibility('hidden')
    vi.advanceTimersByTime(5 * 60_000)
    setVisibility('visible')

    expect(save).toHaveBeenCalledTimes(2)
    expect(applyIdleEarnings).toHaveBeenCalledOnce()
    const [seconds, rate] = applyIdleEarnings.mock.calls[0] as [number, Decimal]
    expect(seconds).toBe(300)
    expect(rate.toNumber()).toBeCloseTo(1, 10)
  })

  it('saves on pagehide without granting idle earnings', () => {
    const save = vi.spyOn(useGameStore.getState(), 'save').mockReturnValue(true)
    const applyIdleEarnings = vi.spyOn(useGameStore.getState(), 'applyIdleEarnings')
    renderHook(() => useLifecyclePersistence())

    window.dispatchEvent(new Event('pagehide'))

    expect(save).toHaveBeenCalledOnce()
    expect(applyIdleEarnings).not.toHaveBeenCalled()
  })

  it('removes its listeners on unmount', () => {
    const save = vi.spyOn(useGameStore.getState(), 'save').mockReturnValue(true)
    const { unmount } = renderHook(() => useLifecyclePersistence())

    unmount()
    setVisibility('hidden')
    window.dispatchEvent(new Event('pagehide'))

    expect(save).not.toHaveBeenCalled()
  })
})
