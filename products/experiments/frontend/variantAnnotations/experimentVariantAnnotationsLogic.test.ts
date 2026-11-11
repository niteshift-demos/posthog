import { expectLogic } from 'kea-test-utils'

import { toPaginatedResponse } from '~/mocks/handlers'
import { useMocks } from '~/mocks/jest'
import type { MockResolverInfo } from '~/mocks/utils'
import { initKeaTests } from '~/test/init'

import type { ExperimentVariantAnnotationApi } from '../generated/api.schemas'
import { experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'

const endpoint = '/api/projects/:projectId/experiments/42/variant_annotations/'
const annotation: ExperimentVariantAnnotationApi = {
    id: 'note-1',
    experiment: 42,
    variant_key: 'removed-variant',
    content: 'Keep the rollout paused.',
    created_by: null,
    created_at: '2025-01-20T10:00:00Z',
    updated_at: '2025-01-20T10:00:00Z',
}
const created: ExperimentVariantAnnotationApi = {
    ...annotation,
    id: 'note-2',
    variant_key: 'test',
    content: 'New note',
}

describe('experimentVariantAnnotationsLogic', () => {
    let logic: ReturnType<typeof experimentVariantAnnotationsLogic>

    beforeEach(() => {
        useMocks({ get: { [endpoint]: toPaginatedResponse([annotation]) } })
        initKeaTests()
        logic = experimentVariantAnnotationsLogic({ experimentId: 42 })
    })

    afterEach(() => logic.unmount())

    async function mountLoaded(): Promise<void> {
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadAnnotationsSuccess'])
    }

    it('prepends a created note without losing the existing list and resets the draft', async () => {
        const post = jest.fn(async ({ request }: MockResolverInfo) => {
            expect(await request.json()).toEqual({ variant_key: 'test', content: 'New note' })
            return [201, created]
        })
        useMocks({ post: { [endpoint]: post } })
        await mountLoaded()
        logic.actions.setDraftVariantKey('test')
        logic.actions.setDraftContent('  New note  ')
        await expectLogic(logic, () => logic.actions.createAnnotation({ variantKey: 'test', content: '  New note  ' }))
            .toDispatchActions(['createAnnotationSuccess', 'resetDraft'])
            .toMatchValues({ annotations: [created, annotation], draftContent: '', pendingAction: null })
        expect(post).toHaveBeenCalledTimes(1)
    })

    it('recovers the full list when creating after the initial load failed', async () => {
        useMocks({ get: { [endpoint]: () => [500, { detail: 'Unavailable' }] } })
        logic.mount()
        await expectLogic(logic).toDispatchActions(['loadAnnotationsFailure']).toMatchValues({ annotations: null })
        const get = jest.fn(() => toPaginatedResponse([created, annotation]))
        useMocks({ get: { [endpoint]: get }, post: { [endpoint]: () => [201, created] } })
        await expectLogic(logic, () => logic.actions.createAnnotation({ variantKey: 'test', content: 'New note' }))
            .toDispatchActions(['createAnnotationSuccess', 'resetDraft'])
            .toMatchValues({ annotations: [created, annotation], pendingAction: null })
        expect(get).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['removed-variant', { content: 'Updated note' }],
        ['test', { content: 'Updated note', variant_key: 'test' }],
    ])('only sends variant_key when changing the variant to %s', async (variantKey, expectedBody) => {
        const patch = jest.fn(async ({ request }: MockResolverInfo) => {
            expect(await request.json()).toEqual(expectedBody)
            return [200, { ...annotation, content: 'Updated note', variant_key: variantKey }]
        })
        useMocks({ patch: { [`${endpoint}:id/`]: patch } })
        await mountLoaded()
        logic.actions.startEditing(annotation)
        await expectLogic(logic, () =>
            logic.actions.updateAnnotation({ id: annotation.id, variantKey, content: '  Updated note  ' })
        )
            .toDispatchActions(['updateAnnotationSuccess', 'cancelEditing'])
            .toMatchValues({
                annotations: [{ ...annotation, content: 'Updated note', variant_key: variantKey }],
                editingAnnotation: null,
                pendingAction: null,
            })
        expect(patch).toHaveBeenCalledTimes(1)
    })

    it.each(['create', 'update', 'delete'] as const)(
        'preserves notes and unsaved text after a failed %s and allows retrying',
        async (operation) => {
            useMocks({
                post: { [endpoint]: () => [500, { detail: 'Unavailable' }] },
                patch: { [`${endpoint}:id/`]: () => [500, { detail: 'Unavailable' }] },
                delete: { [`${endpoint}:id/`]: () => [500, { detail: 'Unavailable' }] },
            })
            await mountLoaded()
            logic.actions.setDraftContent('Unsaved draft')
            logic.actions.startEditing(annotation)
            logic.actions.setEditingAnnotation({ variantKey: 'test', content: 'Updated note' })
            const write = (): void => {
                if (operation === 'create') {
                    logic.actions.createAnnotation({ variantKey: 'test', content: 'Unsaved draft' })
                } else if (operation === 'update') {
                    logic.actions.updateAnnotation({ id: annotation.id, variantKey: 'test', content: 'Updated note' })
                } else {
                    logic.actions.deleteAnnotation(annotation.id)
                }
            }
            write()
            expect(logic.values.pendingAction).toBe(operation)
            await expectLogic(logic)
                .toDispatchActions([`${operation}AnnotationFailure`])
                .toMatchValues({ annotations: [annotation], pendingAction: null, draftContent: 'Unsaved draft' })
            expect(logic.values.editingAnnotation).toEqual({
                id: annotation.id,
                variantKey: 'test',
                content: 'Updated note',
            })
            useMocks({
                post: { [endpoint]: () => [201, created] },
                patch: { [`${endpoint}:id/`]: { ...annotation, content: 'Updated note', variant_key: 'test' } },
                delete: { [`${endpoint}:id/`]: () => [204] },
            })
            write()
            expect(logic.values.pendingAction).toBe(operation)
            await expectLogic(logic)
                .toDispatchActions([`${operation}AnnotationSuccess`])
                .toMatchValues({ pendingAction: null })
            expect(logic.values.annotations).toEqual(
                operation === 'delete'
                    ? []
                    : operation === 'create'
                      ? [created, annotation]
                      : [{ ...annotation, content: 'Updated note', variant_key: 'test' }]
            )
        }
    )

    it.each([
        [null, 'A note', false],
        ['test', '', false],
        ['test', ' \n\t ', false],
        ['control', ' A note ', true],
    ])('canSubmitDraft with variant %s and content %j is %s', async (variantKey, content, expected) => {
        await mountLoaded()
        logic.actions.setDraftVariantKey(variantKey)
        logic.actions.setDraftContent(content)
        expect(logic.values.canSubmitDraft).toBe(expected)
    })
})
