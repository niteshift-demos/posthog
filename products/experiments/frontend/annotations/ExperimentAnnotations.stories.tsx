import type { Meta, StoryObj } from '@storybook/react'

import { mswDecorator } from '~/mocks/browser'

import { ExperimentAnnotations } from './ExperimentAnnotations'

const annotations = [
    {
        id: 1,
        variant_key: 'test',
        content: 'Shipped this variant after reviewing the results.',
        created_by: { id: 1, first_name: 'Alex', email: 'alex@example.com' },
        created_at: '2026-01-20T12:00:00Z',
        updated_at: '2026-01-20T12:00:00Z',
    },
]

const meta: Meta<typeof ExperimentAnnotations> = {
    title: 'Products/Experiments/Variant annotations',
    component: ExperimentAnnotations,
    parameters: { mockDate: '2026-01-20T12:30:00Z' },
    args: { experimentId: 1, variants: ['control', 'test'], canEdit: true },
    decorators: [mswDecorator({ get: { '/api/projects/:team_id/experiments/:id/annotations/': annotations } })],
}
export default meta

type Story = StoryObj<typeof ExperimentAnnotations>

export const WithAnnotations: Story = {}

export const ReadOnly: Story = { args: { canEdit: false } }

export const Empty: Story = {
    decorators: [mswDecorator({ get: { '/api/projects/:team_id/experiments/:id/annotations/': [] } })],
}
