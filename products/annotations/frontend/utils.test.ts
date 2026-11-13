import { resolveAnnotationDate } from './utils'

describe('annotation date bounds', () => {
    it.each([
        ['2026-10-31', false, '2026-10-31T00:00:00.000Z'],
        ['2026-10-31', true, '2026-10-31T23:59:59.999Z'],
        ['2026-10-31T12:30:00Z', true, '2026-10-31T12:30:00.000Z'],
        ['2026-10-31T12:30:00+02:00', false, '2026-10-31T10:30:00.000Z'],
    ])('resolves %s with endOfDay=%s without losing explicit time bounds', (value, endOfDay, expected) => {
        expect(resolveAnnotationDate(value, endOfDay)).toBe(expected)
    })

    it('rejects invalid dates instead of silently removing the bound', () => {
        expect(() => resolveAnnotationDate('invalid', false)).toThrow('Choose a valid date range')
    })
})
