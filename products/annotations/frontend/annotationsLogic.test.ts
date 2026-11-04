import { router } from 'kea-router'
import { expectLogic } from 'kea-test-utils'

import { urls } from 'scenes/urls'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { annotationsLogic } from './annotationsLogic'

const summary = {
    total: 1,
    scope_counts: { project: 0, organization: 0, dashboard: 1, dashboard_item: 0, recording: 0 },
    daily_counts: [{ date: '2026-10-31', count: 1 }],
}
const annotation = {
    id: 1,
    content: 'Release: new checkout',
    scope: 'dashboard',
    dashboard_id: 7,
    date_marker: '2026-10-31T12:00:00Z',
}

describe('annotation explorer', () => {
    let logic: ReturnType<typeof annotationsLogic.build>
    let listQueries: URLSearchParams[]
    let summaryQueries: URLSearchParams[]
    let failSummary: boolean

    beforeEach(() => {
        listQueries = []
        summaryQueries = []
        failSummary = false
        useMocks({
            get: {
                '/api/projects/:team_id/annotations/summary/': ({ request }) => {
                    summaryQueries.push(new URL(request.url).searchParams)
                    return failSummary ? [500, { detail: 'Unavailable' }] : [200, summary]
                },
                '/api/projects/:team_id/annotations/': ({ request }) => {
                    const query = new URL(request.url).searchParams
                    listQueries.push(query)
                    return [
                        200,
                        {
                            count: 1,
                            next: null,
                            previous: null,
                            results: Number(query.get('offset')) > 0 ? [] : [annotation],
                        },
                    ]
                },
                '/api/projects/:team_id/dashboards/': { results: [] },
                '/api/projects/:team_id/insights/': { results: [] },
            },
        })
        initKeaTests()
        router.actions.push(urls.annotations())
        logic = annotationsLogic()
        logic.mount()
    })

    it('restores shared filters and sends matching parameters to list and summary', async () => {
        logic.unmount()
        router.actions.push(urls.annotations(), {
            search: 'Release',
            scope: 'dashboard',
            dashboard_id: '7',
            view: 'timeline',
            date_from: '2026-10-01',
            date_to: '2026-10-31',
        })
        logic.mount()
        await expectLogic(logic).toFinishAllListeners()
        expect(logic.values.view).toBe('timeline')
        expect(logic.values.filters).toMatchObject({ search: 'Release', scope: 'dashboard', dashboardId: 7 })
        const listQuery = listQueries.at(-1)!
        const summaryQuery = summaryQueries.at(-1)!
        expect(listQuery.get('limit')).toBe('20')
        expect(listQuery.get('offset')).toBe('0')
        for (const key of ['search', 'scope', 'dashboard_id', 'date_from', 'date_to', 'hidden_in_user_interface']) {
            expect(listQuery.get(key)).toBe(summaryQuery.get(key))
        }
        expect(summaryQuery.get('hidden_in_user_interface')).toBe('false')
        expect(summaryQuery.get('date_to')).toBe('2026-10-31T23:59:59.999Z')
        expect(logic.values.explorerData?.summary.total).toBe(logic.values.explorerData?.page.count)
    })

    it('restores removed URL parameters and resets pagination when filters change', async () => {
        router.actions.push(urls.annotations(), {
            search: 'Release',
            scope: 'dashboard',
            dashboard_id: '7',
            page: '2',
            view: 'timeline',
        })
        const previousLocation = router.values.currentLocation
        router.actions.push(urls.annotations(), { search: 'Incident' })
        const nextLocation = router.values.currentLocation
        router.actions.locationChanged({ ...previousLocation, method: 'POP', url: urls.annotations() })
        expect(logic.values.filters).toMatchObject({ search: 'Release', dashboardId: 7 })
        expect(logic.values.view).toBe('timeline')
        router.actions.locationChanged({ ...nextLocation, method: 'POP', url: urls.annotations() })
        expect(logic.values.filters).toEqual({
            search: 'Incident',
            scope: null,
            dashboardId: null,
            insightId: null,
            dateFrom: null,
            dateTo: null,
        })
        expect(logic.values.view).toBe('table')
        expect(logic.values.page).toBe(1)
        logic.actions.setPage(2)
        logic.actions.setFilters({ search: 'Release' })
        expect(logic.values.page).toBe(1)
        expect(router.values.searchParams.search).toBe('Release')
        expect(router.values.searchParams.page).toBeUndefined()
        await expectLogic(logic).toFinishAllListeners()
    })

    it('recovers from an out-of-range shared page and failed requests', async () => {
        router.actions.push(urls.annotations(), { page: '99' })
        await expectLogic(logic).toFinishAllListeners()
        expect(logic.values.page).toBe(1)
        expect(logic.values.explorerData?.page.results).toHaveLength(1)
        failSummary = true
        logic.actions.loadExplorer()
        await expectLogic(logic).toFinishAllListeners()
        expect(logic.values.explorerError).not.toBeNull()
        failSummary = false
        logic.actions.loadExplorer()
        await expectLogic(logic).toFinishAllListeners()
        expect(logic.values.explorerError).toBeNull()
    })

    it('keeps an invalid shared date recoverable by clearing filters', async () => {
        router.actions.push(urls.annotations(), { date_from: 'invalid' })
        await expectLogic(logic).toFinishAllListeners()
        expect(logic.values.explorerError).not.toBeNull()
        expect(logic.values.hasFilters).toBe(true)
        logic.actions.clearFilters()
        await expectLogic(logic).toFinishAllListeners()
        expect(logic.values.explorerError).toBeNull()
        expect(logic.values.hasFilters).toBe(false)
    })
})
