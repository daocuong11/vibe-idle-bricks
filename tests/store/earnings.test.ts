import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Decimal from 'break_infinity.js'
import {
  calculateIncomePerSecond,
  calculateOfflineEarnings,
  getMeasuredIncomePerSecond,
  recordIncome,
  resetIncomeTracking,
  MAX_OFFLINE_SECONDS,
} from '../../src/store/earnings'
import type { BallData } from '../../src/types'

const createBall = (type: BallData['type']): BallData => ({
  id: 'ball-1',
  type,
  x: 0,
  y: 0,
  dx: 1,
  dy: 0,
})

describe('live income tracking', () => {
  beforeEach(() => {
    resetIncomeTracking()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns zero until a positive gameplay credit is recorded', () => {
    expect(getMeasuredIncomePerSecond().eq(0)).toBe(true)

    recordIncome(new Decimal(0))
    recordIncome(new Decimal(-5))
    expect(getMeasuredIncomePerSecond().eq(0)).toBe(true)
  })

  it('averages actual credits over a rolling 60-second window', () => {
    recordIncome(new Decimal(6))
    vi.advanceTimersByTime(30_000)
    recordIncome(new Decimal(60))

    expect(getMeasuredIncomePerSecond().toNumber()).toBeCloseTo(1.1, 10)
  })

  it('drops credits older than 60 seconds', () => {
    recordIncome(new Decimal(6))
    vi.advanceTimersByTime(30_000)
    recordIncome(new Decimal(60))
    vi.advanceTimersByTime(30_001)

    expect(getMeasuredIncomePerSecond().eq(1)).toBe(true)
    vi.advanceTimersByTime(30_000)
    expect(getMeasuredIncomePerSecond().eq(0)).toBe(true)
  })

  it('clears previous-run credits on reset', () => {
    recordIncome(new Decimal(60))
    expect(getMeasuredIncomePerSecond().eq(1)).toBe(true)

    resetIncomeTracking()
    expect(getMeasuredIncomePerSecond().eq(0)).toBe(true)
  })
})

describe('calculateOfflineEarnings', () => {
  it('clamps negative offline time to zero earnings', () => {
    const result = calculateOfflineEarnings(new Decimal(1), -120)

    expect(result.coins.eq(0)).toBe(true)
    expect(result.message).toBeNull()
  })

  it('pays 50% of the supplied live rate exactly once', () => {
    const result = calculateOfflineEarnings(new Decimal('3.5'), 3600)

    expect(result.coins.eq(6300)).toBe(true)
  })

  it('should stop earning after the offline cap', () => {
    const liveRate = new Decimal(1)
    const atCap = calculateOfflineEarnings(liveRate, MAX_OFFLINE_SECONDS)
    const afterCap = calculateOfflineEarnings(liveRate, MAX_OFFLINE_SECONDS * 10)

    expect(afterCap.coins.eq(atCap.coins)).toBe(true)
    expect(afterCap.message).toContain('24h (max)')
  })

  it('should state the credited duration in the welcome-back message', () => {
    const result = calculateOfflineEarnings(new Decimal(1), 2 * 3600 + 5 * 60)

    expect(result.message).toContain('over 2h 5m')
  })

  it('should format short and whole-hour absences', () => {
    expect(calculateOfflineEarnings(new Decimal(1), 90).message).toContain('over 1m')
    expect(calculateOfflineEarnings(new Decimal(1), 3 * 3600).message).toContain('over 3h')
  })

  it('should pin the tier 1 calibrated live rate to half-rate offline income', () => {
    // basic ball: 3 hits per brick, value 1, live 0.1/s, offline 50% -> 0.05/s
    const liveRate = calculateIncomePerSecond([createBall('basic')], 1, 1, 1, 0, 1).mul(0.1)
    const result = calculateOfflineEarnings(liveRate, 3600)
    expect(result.coins.toNumber()).toBe(180)
  })

  it('should format large offline earnings in the welcome-back message', () => {
    const result = calculateOfflineEarnings(new Decimal('1e20'), 3600)

    expect(result.coins.gt(0)).toBe(true)
    expect(result.message).toContain('Welcome back!')
    expect(result.message).toContain('e')
  })
})

describe('calculateIncomePerSecond', () => {
  it('returns nominal income for a basic ball at tier 1', () => {
    expect(calculateIncomePerSecond([createBall('basic')], 1, 1, 1, 0, 1).toNumber()).toBe(1)
  })

  it('scales with coin and prestige multipliers', () => {
    const base = calculateIncomePerSecond([createBall('basic')], 1, 1, 1, 0, 1)
    const boosted = calculateIncomePerSecond([createBall('basic')], 1, 1, 2, 1, 1)

    expect(boosted.div(base).toNumber()).toBeCloseTo(2.5, 10)
  })

  it('caps extra damage at the hits a brick actually needs', () => {
    const enough = calculateIncomePerSecond([createBall('basic')], 1, 100, 1, 0, 20)
    const overkill = calculateIncomePerSecond([createBall('basic')], 1, 1000, 1, 0, 20)

    expect(overkill.eq(enough)).toBe(true)
  })

  it('counts prestige damage while bricks take multiple hits', () => {
    const balls = [createBall('basic')]
    const base = calculateIncomePerSecond(balls, 1, 1, 1, 0, 1)
    // prestige 2: damage 1.5625 -> 2 hits instead of 3 (1.5x rate), coins 1.5625x
    const prestiged = calculateIncomePerSecond(balls, 1, 1.5625, 1, 2, 1)
    expect(prestiged.div(base).toNumber()).toBeCloseTo(1.5 * 1.5625, 10)
  })

  it('should stop paying damage once a ball one-shots a brick', () => {
    const balls = [createBall('basic')]
    const tier20 = 20
    const level19 = calculateIncomePerSecond(balls, 1, 1.25 ** 19, 1, 19, tier20)
    const level20 = calculateIncomePerSecond(balls, 1, 1.25 ** 20, 1, 20, tier20)
    expect(level20.div(level19).toNumber()).toBeCloseTo(1.25, 2)
  })

  it('handles Decimal multipliers beyond Number.MAX_VALUE at high tiers without NaN', () => {
    const income = calculateIncomePerSecond(
      [createBall('basic')],
      1,
      new Decimal('1e400'),
      new Decimal('1e400'),
      100,
      5000,
    )
    expect(income.toString()).not.toBe('NaN')
    expect(income.gt('1e400')).toBe(true)
  })

  it('should follow the value/health yield at higher tiers', () => {
    const tier1 = calculateIncomePerSecond([createBall('basic')], 1, 1, 1, 0, 1)
    const tier20 = calculateIncomePerSecond([createBall('basic')], 1, 1, 1, 0, 20)
    // tier 20: health 17.25 -> 18 hits, value 120 -> 120/6 of tier 1
    expect(tier20.div(tier1).toNumber()).toBeCloseTo(120 / 6)
  })
})
