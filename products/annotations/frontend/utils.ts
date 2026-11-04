import { dayjs } from 'lib/dayjs'
import { dateStringToDayJs } from 'lib/utils/dateFilters'

export function resolveAnnotationDate(value: string, endOfDay: boolean): string {
    const date = value.includes('T') ? dayjs.utc(value) : dateStringToDayJs(value, 'UTC')
    if (!date?.isValid()) {
        throw new Error('Choose a valid date range or clear your filters.')
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && endOfDay ? date.endOf('day').toISOString() : date.toISOString()
}
