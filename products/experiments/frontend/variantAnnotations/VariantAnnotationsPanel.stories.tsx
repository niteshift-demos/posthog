import type { Meta, StoryObj } from '@storybook/react'
import { BindLogic, useMountedLogic } from 'kea'

import { experimentLogic } from 'scenes/experiments/experimentLogic'

import { mswDecorator } from '~/mocks/browser'
import EXPERIMENT from '~/mocks/fixtures/api/experiments/experiment_with_funnel_metric.json'
import { toPaginatedResponse } from '~/mocks/handlers'
import type { Experiment } from '~/types'

import type { ExperimentVariantAnnotationApi } from '../generated/api.schemas'
import { VariantAnnotationsPanel } from './VariantAnnotationsPanel'

const endpoint = `/api/projects/:team_id/experiments/${EXPERIMENT.id}/variant_annotations/`
const annotations: ExperimentVariantAnnotationApi[] = [
    {
        id: 'annotation-test',
        experiment: EXPERIMENT.id,
        variant_key: 'test-1',
        content: 'Keep this variant running until the weekend traffic arrives.\nReview the conversion rate on Monday.',
        created_by: {
            id: 101,
            uuid: 'author-101',
            first_name: 'Alex',
            last_name: 'Example',
            email: 'alex@example.com',
            hedgehog_config: null,
        },
        created_at: '2025-05-21T10:00:00Z',
        updated_at: '2025-05-22T11:00:00Z',
    },
    {
        id: 'annotation-control',
        experiment: EXPERIMENT.id,
        variant_key: 'control',
        content: 'The control keeps the current checkout copy.',
        created_by: null,
        created_at: '2025-05-20T09:00:00Z',
        updated_at: '2025-05-20T09:00:00Z',
    },
]

const meta: Meta<typeof VariantAnnotationsPanel> = {
    title: 'Scenes-App/Experiments/Variant annotations',
    component: VariantAnnotationsPanel,
    args: {
        experimentId: EXPERIMENT.id,
        variantKeys: ['control', 'test-1', 'test-2'],
        canEdit: true,
    },
    parameters: { layout: 'padded', mockDate: '2025-05-23T12:00:00Z', viewMode: 'story' },
    decorators: [
        mswDecorator({
            get: {
                [`/api/projects/:team_id/experiments/${EXPERIMENT.id}/`]: EXPERIMENT,
                '/api/projects/:team_id/experiment_holdouts/': toPaginatedResponse([]),
                '/api/projects/:team_id/experiment_saved_metrics/': toPaginatedResponse([]),
                '/api/environments/:team_id/experiments_config/': {},
            },
        }),
        (Story): JSX.Element => {
            const logic = experimentLogic({ experimentId: EXPERIMENT.id })
            useMountedLogic(logic)
            logic.actions.setExperiment(EXPERIMENT as unknown as Experiment)
            return (
                <BindLogic logic={experimentLogic} props={{ experimentId: EXPERIMENT.id }}>
                    <div className="max-w-160">
                        <Story />
                    </div>
                </BindLogic>
            )
        },
    ],
}
export default meta

type Story = StoryObj<typeof meta>

export const Loading: Story = {
    decorators: [
        mswDecorator({
            get: {
                [endpoint]: () => new Promise<never>(() => {}),
            },
        }),
    ],
}

export const Empty: Story = {
    decorators: [mswDecorator({ get: { [endpoint]: toPaginatedResponse([]) } })],
}

export const Populated: Story = {
    decorators: [mswDecorator({ get: { [endpoint]: toPaginatedResponse(annotations) } })],
}

export const ErrorWithRetry: Story = {
    decorators: [
        (Story, context): JSX.Element => {
            let attempts = 0
            return mswDecorator({
                get: {
                    [endpoint]: () =>
                        ++attempts === 1 ? [500, { detail: 'Unavailable' }] : toPaginatedResponse(annotations),
                },
            })(Story, context)
        },
    ],
}

export const ReadOnly: Story = {
    args: { canEdit: false },
    decorators: [mswDecorator({ get: { [endpoint]: toPaginatedResponse(annotations) } })],
}
