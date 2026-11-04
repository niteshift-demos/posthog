import { Meta, StoryObj } from '@storybook/react'
import { within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'

import { FEATURE_FLAGS } from 'lib/constants'
import { App } from 'scenes/App'
import { urls } from 'scenes/urls'

import { mswDecorator } from '~/mocks/browser'

import annotations from './__mocks__/annotations.json'

const meta: Meta = {
    component: App,
    title: 'Scenes-App/Annotations',
    parameters: {
        layout: 'fullscreen',
        viewMode: 'story',
        mockDate: '2023-01-28', // To stabilize relative dates
        pageUrl: urls.annotations(),
        testOptions: { viewport: { width: 1300, height: 2000 } },
    },
    decorators: [
        mswDecorator({
            get: {
                '/api/projects/:team_id/annotations/': { ...annotations, count: annotations.results.length },
                '/api/projects/:team_id/annotations/summary/': {
                    total: annotations.results.length,
                    scope_counts: {
                        project: annotations.results.filter((annotation) => annotation.scope === 'project').length,
                        organization: annotations.results.filter((annotation) => annotation.scope === 'organization')
                            .length,
                        dashboard: annotations.results.filter((annotation) => annotation.scope === 'dashboard').length,
                        dashboard_item: annotations.results.filter(
                            (annotation) => annotation.scope === 'dashboard_item'
                        ).length,
                        recording: 0,
                    },
                    daily_counts: [],
                },
                '/api/projects/:team_id/dashboards/': { results: [] },
                '/api/projects/:team_id/insights/': { results: [] },
                '/api/projects/:team_id/annotations/:annotationId/': ({ params }) => [
                    200,
                    annotations.results.find((r) => r.id === Number(params['annotationId'])),
                ],
            },
        }),
    ],
}
export default meta

type Story = StoryObj<{}>
// The table renders the emoji next to the content for annotations that have one (see the fixture),
// giving visual-regression coverage of the emoji display.
export const Annotations: Story = {}

export const Timeline: Story = {
    parameters: { pageUrl: `${urls.annotations()}?view=timeline` },
}

const openNewAnnotationModal: Story['play'] = async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByText('New annotation'))
}

export const NewAnnotationModalLemonUIDatePicker: Story = {
    play: openNewAnnotationModal,
}

export const NewAnnotationModalQuillDatePicker: Story = {
    parameters: { featureFlags: [FEATURE_FLAGS.QUILL_DATE_PICKER] },
    play: openNewAnnotationModal,
}
