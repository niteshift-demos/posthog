import type { Meta, StoryObj } from '@storybook/react'

import { mswDecorator } from '~/mocks/browser'

import { VariantWithAnnotations } from './VariantWithAnnotations'

const meta: Meta<typeof VariantWithAnnotations> = {
    title: 'Experiments/VariantWithAnnotations',
    component: VariantWithAnnotations,
    args: { experimentId: 3, variantKey: 'test' },
    decorators: [
        mswDecorator({
            get: {
                '/api/projects/:team_id/experiments/3/variant_annotations/': {
                    count: 1,
                    next: null,
                    previous: null,
                    results: [
                        {
                            id: 'example-note',
                            experiment: 3,
                            variant_key: 'test',
                            content: 'Compare signup rates before choosing a variant.',
                            created_by: null,
                            created_at: '2026-01-01T12:00:00Z',
                            updated_at: '2026-01-01T12:00:00Z',
                        },
                    ],
                },
            },
        }),
    ],
}
export default meta

type Story = StoryObj<typeof VariantWithAnnotations>

export const WithNotes: Story = {}
export const WithoutNotes: Story = { args: { variantKey: 'control' } }
