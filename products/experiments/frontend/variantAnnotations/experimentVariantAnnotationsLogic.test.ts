import { expectLogic } from 'kea-test-utils'

import { initKeaTests } from '~/test/init'

import { experimentsVariantAnnotationsList } from '../generated/api'
import type { ExperimentVariantAnnotationApi } from '../generated/api.schemas'
import { experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'

jest.mock('../generated/api', () => ({
    experimentsVariantAnnotationsList: jest.fn(),
}))

const annotations: ExperimentVariantAnnotationApi[] = ['control', 'red', 'red'].map((variantKey, index) => ({
    id: `annotation-${index}`,
    experiment: 2,
    variant_key: variantKey,
    content: `Example note ${index}`,
    created_by: null,
    created_at: '2026-01-01T12:00:00Z',
    updated_at: '2026-01-01T12:00:00Z',
}))

describe('experimentVariantAnnotationsLogic', () => {
    let logic: ReturnType<typeof experimentVariantAnnotationsLogic.build>

    beforeEach(async () => {
        initKeaTests()
        jest.mocked(experimentsVariantAnnotationsList).mockResolvedValue({
            results: annotations,
            count: annotations.length,
            next: null,
            previous: null,
        })
        logic = experimentVariantAnnotationsLogic({ experimentId: 2, variantKeys: ['control', 'red', 'blue'] })
        logic.mount()
        await expectLogic(logic).toFinishAllListeners()
    })

    afterEach(() => logic.unmount())

    it.each([
        [null, ['annotation-0', 'annotation-1', 'annotation-2']],
        ['red', ['annotation-1', 'annotation-2']],
        ['blue', []],
    ])('filters by %s without changing counts for other variants', (variantKey, expectedIds) => {
        logic.actions.setVariantFilter(variantKey)

        expect(logic.values.filteredAnnotations?.map(({ id }) => id)).toEqual(expectedIds)
        expect(logic.values.variantFilterOptions).toEqual([
            { value: null, label: 'All (3)' },
            { value: 'control', label: 'control (1)' },
            { value: 'red', label: 'red (2)' },
            { value: 'blue', label: 'blue (0)' },
        ])
    })

    it('preselects the filtered variant and keeps the draft text when switching filters', () => {
        logic.actions.setDraftContent('Keep this draft')
        logic.actions.setVariantFilter('red')
        expect(logic.values.draftVariantKey).toBe('red')
        logic.actions.resetDraft()
        expect(logic.values.draftVariantKey).toBe('red')
        logic.actions.setDraftContent('Another draft')
        logic.actions.setVariantFilter('blue')
        expect(logic.values.draftVariantKey).toBe('blue')
        expect(logic.values.draftContent).toBe('Another draft')
        logic.actions.setVariantFilter(null)
        expect(logic.values.filteredAnnotations).toEqual(annotations)
    })

    it('updates counts and the filtered empty state when annotations change', () => {
        logic.actions.setVariantFilter('red')
        logic.actions.loadAnnotationsSuccess(annotations.filter(({ variant_key }) => variant_key !== 'red'))
        expect(logic.values.filteredAnnotations).toEqual([])
        expect(logic.values.annotationCounts).toEqual({ control: 1 })
        expect(logic.values.variantFilterOptions[0]).toEqual({ value: null, label: 'All (1)' })
    })
})
