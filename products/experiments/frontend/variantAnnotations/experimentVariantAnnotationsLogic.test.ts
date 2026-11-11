import { expectLogic } from 'kea-test-utils'

import { resumeKeaLoadersErrors, silenceKeaLoadersErrors } from '~/initKea'
import { initKeaTests } from '~/test/init'

import {
    experimentsVariantAnnotationsCreate,
    experimentsVariantAnnotationsDestroy,
    experimentsVariantAnnotationsList,
    experimentsVariantAnnotationsPartialUpdate,
} from '../generated/api'
import type {
    ExperimentVariantAnnotationApi,
    PaginatedExperimentVariantAnnotationListApi,
} from '../generated/api.schemas'
import { experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'

jest.mock('../generated/api', () => ({
    experimentsVariantAnnotationsList: jest.fn(),
    experimentsVariantAnnotationsCreate: jest.fn(),
    experimentsVariantAnnotationsPartialUpdate: jest.fn(),
    experimentsVariantAnnotationsDestroy: jest.fn(),
}))

const list = jest.mocked(experimentsVariantAnnotationsList)
const note = (id: string, content = id): ExperimentVariantAnnotationApi => ({
    id,
    content,
    experiment: 3,
    variant_key: 'test',
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
})
const page = (ids: string[], next: string | null = null): PaginatedExperimentVariantAnnotationListApi => ({
    count: 25,
    next,
    previous: null,
    results: ids.map((id) => note(id)),
})
const next = '/api/projects/1/experiments/3/variant_annotations/?cursor=older&limit=20'

describe('experimentVariantAnnotationsLogic pagination', () => {
    let logic: ReturnType<typeof experimentVariantAnnotationsLogic.build>

    beforeEach(() => {
        jest.resetAllMocks()
        initKeaTests()
        silenceKeaLoadersErrors()
        list.mockResolvedValueOnce(page(['3', '2'], next))
        logic = experimentVariantAnnotationsLogic({ experimentId: 3 })
        logic.mount()
    })

    afterEach(() => {
        logic.unmount()
        resumeKeaLoadersErrors()
    })

    it('appends older notes once while preserving local creates, edits and deletes', async () => {
        await expectLogic(logic).toFinishAllListeners()
        expect(list).toHaveBeenLastCalledWith(expect.any(String), 3, { limit: 20 })

        jest.mocked(experimentsVariantAnnotationsCreate).mockResolvedValue(note('4'))
        await expectLogic(logic, () =>
            logic.actions.createAnnotation({ variantKey: 'test', content: '4' })
        ).toFinishAllListeners()
        jest.mocked(experimentsVariantAnnotationsPartialUpdate).mockResolvedValue(note('2', 'Edited'))
        await expectLogic(logic, () =>
            logic.actions.updateAnnotation({ id: '2', variantKey: 'test', content: 'Edited' })
        ).toFinishAllListeners()
        jest.mocked(experimentsVariantAnnotationsDestroy).mockResolvedValue(undefined)
        await expectLogic(logic, () => logic.actions.deleteAnnotation('3')).toFinishAllListeners()

        list.mockResolvedValueOnce(page(['2', '1']))
        await expectLogic(logic, () => {
            logic.actions.loadMoreAnnotations()
            logic.actions.loadMoreAnnotations()
        }).toFinishAllListeners()

        expect(list).toHaveBeenCalledTimes(2)
        expect(list).toHaveBeenLastCalledWith(expect.any(String), 3, { limit: 20, cursor: 'older' })
        expect(logic.values.annotations).toEqual([note('4'), note('2', 'Edited'), note('1')])
        expect(logic.values.nextUrl).toBeNull()
        expect(logic.values.annotationsLoading).toBe(false)
    })

    it('preserves the list and cursor after a page error and retries that page', async () => {
        await expectLogic(logic).toFinishAllListeners()
        list.mockRejectedValueOnce(new Error('Network unavailable'))
        await expectLogic(logic, () => logic.actions.loadMoreAnnotations()).toFinishAllListeners()
        expect(logic.values.annotations).toEqual([note('3'), note('2')])
        expect(logic.values.nextUrl).toBe(next)
        expect(logic.values.loadMoreError).toBe(true)
        expect(logic.values.pendingAction).toBeNull()

        list.mockResolvedValueOnce(page(['1']))
        await expectLogic(logic, () => logic.actions.loadMoreAnnotations()).toFinishAllListeners()
        expect(logic.values.annotations).toEqual([note('3'), note('2'), note('1')])
        expect(logic.values.loadMoreError).toBe(false)
        expect(logic.values.nextUrl).toBeNull()
    })
})
