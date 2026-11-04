import { useValues } from 'kea'

import { LemonTag, Link } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { dayjs } from 'lib/dayjs'
import { urls } from 'scenes/urls'

import type { InsightShortId } from '~/types'

import { annotationsLogic } from './annotationsLogic'

export function AnnotationTimeline(): JSX.Element {
    const { timelineDays } = useValues(annotationsLogic)

    return (
        <div data-attr="annotations-timeline" className="border rounded bg-surface-primary p-4">
            <div className="text-xs text-secondary mb-4">Newest first · Dates grouped in UTC</div>
            <ol className="list-none m-0 p-0">
                {timelineDays.map(({ date, annotations, count }) => (
                    <li key={date} className="flex flex-col sm:flex-row gap-3 sm:gap-6 pb-6 last:pb-0">
                        <div className="sm:w-36 shrink-0">
                            <h3 className="text-sm font-semibold m-0">
                                {date === 'Undated' ? 'Undated' : dayjs.utc(date).format('MMM D, YYYY')}
                            </h3>
                            <span className="text-xs text-secondary">
                                {count} matching {count === 1 ? 'annotation' : 'annotations'}
                            </span>
                        </div>
                        <ol className="flex-1 min-w-0 list-none m-0 border-l pl-4 space-y-4">
                            {annotations.map((annotation) => (
                                <li key={annotation.id} className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs text-secondary">
                                        <LemonTag type="muted" size="small">
                                            {annotation.scope === 'dashboard_item'
                                                ? 'Insight'
                                                : annotation.scope === 'dashboard'
                                                  ? 'Dashboard'
                                                  : annotation.scope === 'organization'
                                                    ? 'Organization'
                                                    : annotation.scope === 'recording'
                                                      ? 'Recording'
                                                      : 'Project'}
                                        </LemonTag>
                                        {annotation.date_marker && <TZLabel time={annotation.date_marker} />}
                                    </div>
                                    <Link
                                        to={urls.annotation(annotation.id)}
                                        className="font-semibold whitespace-pre-wrap break-words"
                                    >
                                        {annotation.emoji && <span className="mr-1.5">{annotation.emoji}</span>}
                                        {annotation.content || 'Untitled annotation'}
                                    </Link>
                                    <div className="text-sm">
                                        {annotation.scope === 'dashboard' && annotation.dashboard_id ? (
                                            <Link
                                                to={urls.dashboard(annotation.dashboard_id)}
                                                data-attr="annotation-dashboard-link"
                                            >
                                                {annotation.dashboard_name || `Dashboard ${annotation.dashboard_id}`}
                                            </Link>
                                        ) : annotation.scope === 'dashboard_item' && annotation.insight_short_id ? (
                                            <Link
                                                to={urls.insightView(annotation.insight_short_id as InsightShortId)}
                                                data-attr="annotation-insight-link"
                                            >
                                                {annotation.insight_name ||
                                                    annotation.insight_derived_name ||
                                                    'Untitled insight'}
                                            </Link>
                                        ) : (
                                            <span className="text-secondary">
                                                {annotation.scope === 'organization'
                                                    ? 'All charts in this organization'
                                                    : annotation.scope === 'dashboard'
                                                      ? 'No linked dashboard'
                                                      : annotation.scope === 'dashboard_item'
                                                        ? 'No linked insight'
                                                        : annotation.scope === 'recording'
                                                          ? 'No linked recording'
                                                          : 'All charts in this project'}
                                            </span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </li>
                ))}
            </ol>
        </div>
    )
}
