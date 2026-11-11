import { expectLogic } from 'kea-test-utils'

import { initKeaTests } from '~/test/init'

import { experimentsVariantAnnotationsList } from '../generated/api'
import type { ExperimentVariantAnnotationApi } from '../generated/api.schemas'
import { experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'

jest.mock('../generated/api', () => ({
    experimentsVariantAnnotationsList: jest.fn(),
}))

describe('experimentVariantAnnotationsLogic', () => {
    beforeEach(() => {
        initKeaTests()
        jest.mocked(experimentsVariantAnnotationsList).mockResolvedValue({
            count: 0,
            next: null,
            previous: null,
            results: [],
        })
    })

    it('groups notes by exact variant key, newest first, and updates after notes move or disappear', async () => {
        const logic = experimentVariantAnnotationsLogic({ experimentId: 3 })
        logic.mount()
        expect(logic.values.annotationsByVariant).toEqual({})
        await expectLogic(logic).toFinishAllListeners()

        const note = (id: string, variant_key: string, created_at: string): ExperimentVariantAnnotationApi => ({
            id,
            experiment: 3,
            variant_key,
            created_at,
            updated_at: created_at,
            content: 'Example variant note',
            created_by: null,
        })
        const older = note('older', 'test', '2026-01-01T00:00:00Z')
        const newer = note('newer', 'test', '2026-01-02T00:00:00Z')
        const control = note('control-note', 'control', '2026-01-03T00:00:00Z')
        const annotations = [older, control, newer]
        logic.actions.loadAnnotationsSuccess(annotations)
        expect(logic.values.annotationsByVariant).toEqual({ test: [newer, older], control: [control] })
        expect(annotations).toEqual([older, control, newer])
        expect(logic.values.annotationsByVariant.Test).toBeUndefined()

        const moved = { ...newer, variant_key: 'control' }
        logic.actions.updateAnnotationSuccess([older, control, moved])
        expect(logic.values.annotationsByVariant).toEqual({ test: [older], control: [control, moved] })
        logic.actions.deleteAnnotationSuccess([control, moved])
        expect(logic.values.annotationsByVariant.test).toBeUndefined()
        logic.unmount()
    })
})
