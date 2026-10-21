import { describe, expect, it } from 'vitest'
import { addDays, formatDate, isISODate, nightsBetween, todayIST } from './dates'
import { formatINR, formatMonthRange } from './format'

describe('dates', () => {
  it('computes "today" in India Standard Time, not the machine timezone', () => {
    // 20:00 UTC on 17 Oct is 01:30 on 18 Oct in IST (UTC+5:30).
    expect(todayIST(new Date('2026-10-17T20:00:00Z'))).toBe('2026-10-18')
    expect(todayIST(new Date('2026-10-17T18:00:00Z'))).toBe('2026-10-17')
  })

  it('treats check-out as exclusive when counting nights', () => {
    expect(nightsBetween('2026-12-12', '2026-12-14')).toBe(2)
    expect(nightsBetween('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('adds days across month and leap-year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('rejects impossible or badly formatted dates', () => {
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('12/12/2026')).toBe(false)
    expect(isISODate('2026-12-12')).toBe(true)
  })

  it('formats dates for display', () => {
    expect(formatDate('2026-12-12')).toBe('12 Dec 2026')
  })
})

describe('format', () => {
  it('formats paise as rupees with Indian digit grouping', () => {
    expect(formatINR(600000)).toBe('₹6,000')
    expect(formatINR(12345600)).toBe('₹1,23,456')
    expect(formatINR(undefined)).toBe('—')
  })

  it('formats a season as a month range', () => {
    expect(formatMonthRange([10, 11, 12, 1, 2])).toBe('Oct – Feb')
  })
})
