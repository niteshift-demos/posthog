import { describe, expect, it, vi } from 'vitest'

import { GENERATED_TOOLS } from '@/tools/generated/experiments'
import type { Context } from '@/tools/types'

const noteId = '00000000-0000-4000-8000-000000000001'

describe('experiment variant annotation tools', () => {
    it.each([
        {
            name: 'experiment-variant-annotations-list',
            input: { experiment_id: '3', limit: 10, offset: 10 },
            method: 'GET',
            suffix: '',
            query: { limit: 10, offset: 10 },
            body: undefined,
        },
        {
            name: 'experiment-variant-annotation-create',
            input: { experiment_id: '3', variant_key: 'test', content: 'Review the test variant.' },
            method: 'POST',
            suffix: '',
            query: undefined,
            body: { variant_key: 'test', content: 'Review the test variant.' },
        },
        {
            name: 'experiment-variant-annotation-update',
            input: { experiment_id: '3', id: noteId, content: 'Reviewed.' },
            method: 'PATCH',
            suffix: `${noteId}/`,
            query: undefined,
            body: { content: 'Reviewed.' },
        },
        {
            name: 'experiment-variant-annotation-delete',
            input: { experiment_id: '3', id: noteId },
            method: 'DELETE',
            suffix: `${noteId}/`,
            query: undefined,
            body: undefined,
        },
    ])('$name sends the parsed input to the parent experiment in the active project', async (testCase) => {
        const request = vi.fn().mockResolvedValue({ results: [] })
        const context = {
            stateManager: { getProjectId: vi.fn().mockResolvedValue(7) },
            api: { request },
        } as unknown as Context
        const tool = GENERATED_TOOLS[testCase.name]!()
        const params = tool.schema.parse(testCase.input)

        await tool.handler(context, params)

        expect(request).toHaveBeenCalledExactlyOnceWith({
            method: testCase.method,
            path: `/api/projects/7/experiments/3/variant_annotations/${testCase.suffix}`,
            ...(testCase.body ? { body: testCase.body } : {}),
            ...(testCase.query ? { query: testCase.query } : {}),
        })
    })

    it.each([
        { label: 'missing content', body: { variant_key: 'test' } },
        { label: 'missing variant', body: { content: 'A note without a variant.' } },
        { label: 'empty content', body: { variant_key: 'test', content: '' } },
        { label: 'oversized content', body: { variant_key: 'test', content: 'x'.repeat(5001) } },
    ])('rejects $label on create', ({ body }) => {
        const tool = GENERATED_TOOLS['experiment-variant-annotation-create']!()
        expect(tool.schema.safeParse({ experiment_id: 3, ...body }).success).toBe(false)
    })
})
