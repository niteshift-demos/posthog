import { useActions, useValues } from 'kea'

import { IconSearch } from '@posthog/icons'
import {
    LemonBanner,
    LemonButton,
    LemonInput,
    LemonInputSelect,
    LemonLabel,
    LemonSegmentedButton,
    LemonSelect,
    LemonSkeleton,
    LemonTable,
    LemonTag,
    Link,
} from '@posthog/lemon-ui'
import type { LemonTableColumns } from '@posthog/lemon-ui'

import { DateFilter } from 'lib/components/DateFilter/DateFilter'
import { EmptyMessage } from 'lib/components/EmptyMessage/EmptyMessage'
import { Shortcut } from 'lib/components/Shortcuts/Shortcut'
import { keyBinds } from 'lib/components/Shortcuts/shortcuts'
import { TZLabel } from 'lib/components/TZLabel'
import { AnnotationModal } from 'scenes/annotations/AnnotationModal'
import { annotationModalLogic } from 'scenes/annotations/annotationModalLogic'
import { Scene, SceneExport } from 'scenes/sceneTypes'
import { urls } from 'scenes/urls'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { SceneTitleSection } from '~/layout/scenes/components/SceneTitleSection'
import { ProductKey } from '~/queries/schema/schema-general'
import type { InsightShortId } from '~/types'

import { ANNOTATIONS_PAGE_SIZE, annotationsLogic } from './annotationsLogic'
import { AnnotationTimeline } from './AnnotationTimeline'
import type { AnnotationApi, AnnotationScopeEnumApi } from './generated/api.schemas'

export const scene: SceneExport = {
    component: Annotations,
    logic: annotationsLogic,
    productKey: ProductKey.ANNOTATIONS,
}

const scopeNames: Record<AnnotationScopeEnumApi, string> = {
    project: 'Project',
    organization: 'Organization',
    dashboard: 'Dashboard',
    dashboard_item: 'Insight',
    recording: 'Recording',
}

export function Annotations(): JSX.Element {
    const {
        filters,
        view,
        page,
        explorerData,
        explorerDataLoading,
        explorerError,
        hasFilters,
        dashboardOptions,
        dashboardOptionsLoading,
        insightOptions,
        insightOptionsLoading,
    } = useValues(annotationsLogic)
    const {
        setFilters,
        setDates,
        setView,
        setPage,
        clearFilters,
        loadExplorer,
        loadDashboardOptions,
        loadInsightOptions,
    } = useActions(annotationsLogic)
    const { openModalToCreateAnnotation } = useActions(annotationModalLogic)

    const columns: LemonTableColumns<AnnotationApi> = [
        {
            title: 'Annotation',
            key: 'annotation',
            width: '40%',
            render: (_, annotation) => (
                <Link to={urls.annotation(annotation.id)} className="font-semibold line-clamp-2 break-words">
                    {annotation.emoji && <span className="mr-1.5">{annotation.emoji}</span>}
                    {annotation.content || 'Untitled annotation'}
                </Link>
            ),
        },
        {
            title: 'Date',
            key: 'date_marker',
            render: (_, annotation) =>
                annotation.date_marker ? (
                    <TZLabel time={annotation.date_marker} />
                ) : (
                    <span className="text-secondary">Undated</span>
                ),
        },
        {
            title: 'Scope',
            key: 'scope',
            render: (_, annotation) => <LemonTag type="muted">{scopeNames[annotation.scope || 'project']}</LemonTag>,
        },
        {
            title: 'Related resource',
            key: 'resource',
            render: (_, annotation) =>
                annotation.scope === 'dashboard' && annotation.dashboard_id ? (
                    <Link to={urls.dashboard(annotation.dashboard_id)} data-attr="annotation-dashboard-link">
                        {annotation.dashboard_name || `Dashboard ${annotation.dashboard_id}`}
                    </Link>
                ) : annotation.scope === 'dashboard_item' && annotation.insight_short_id ? (
                    <Link
                        to={urls.insightView(annotation.insight_short_id as InsightShortId)}
                        data-attr="annotation-insight-link"
                    >
                        {annotation.insight_name || annotation.insight_derived_name || 'Untitled insight'}
                    </Link>
                ) : (
                    <span className="text-secondary">
                        {annotation.scope === 'organization'
                            ? 'All organization charts'
                            : annotation.scope === 'dashboard'
                              ? 'No linked dashboard'
                              : annotation.scope === 'dashboard_item'
                                ? 'No linked insight'
                                : annotation.scope === 'recording'
                                  ? 'No linked recording'
                                  : 'All project charts'}
                    </span>
                ),
        },
    ]

    return (
        <SceneContent>
            <SceneTitleSection
                name="Annotation explorer"
                description="Find releases, incidents, and experiments, then open their related charts."
                resourceType={{ type: 'annotation' }}
                actions={
                    <Shortcut
                        name="NewAnnotation"
                        keybind={[keyBinds.new]}
                        intent="New annotation"
                        interaction="click"
                        scope={Scene.Annotations}
                    >
                        <LemonButton
                            type="primary"
                            size="small"
                            data-attr="create-annotation"
                            onClick={() => openModalToCreateAnnotation()}
                        >
                            New annotation
                        </LemonButton>
                    </Shortcut>
                }
            />
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-60">
                    <LemonLabel htmlFor="annotation-search" className="mb-1">
                        Search
                    </LemonLabel>
                    <LemonInput
                        id="annotation-search"
                        type="search"
                        prefix={<IconSearch />}
                        placeholder="Search annotations"
                        value={filters.search}
                        onChange={(search) => setFilters({ search })}
                        data-attr="annotations-search"
                        fullWidth
                    />
                </div>
                <div>
                    <LemonLabel className="mb-1">Date range (UTC)</LemonLabel>
                    <DateFilter
                        dateFrom={filters.dateFrom || 'all'}
                        dateTo={filters.dateTo}
                        onChange={setDates}
                        dateOptions={[
                            { key: 'All time', values: ['all'] },
                            { key: 'Last 7 days', values: ['-7d'] },
                            { key: 'Last 30 days', values: ['-30d'] },
                            { key: 'Last 90 days', values: ['-90d'] },
                        ]}
                        showRollingRangePicker={false}
                    />
                </div>
                <div>
                    <LemonLabel className="mb-1">Scope</LemonLabel>
                    <LemonSelect
                        aria-label="Scope"
                        value={filters.scope}
                        onChange={(scope) => setFilters({ scope })}
                        options={[
                            { value: null, label: 'All scopes' },
                            ...Object.entries(scopeNames)
                                .filter(([value]) => value !== 'recording')
                                .map(([value, label]) => ({ value: value as AnnotationScopeEnumApi, label })),
                        ]}
                        data-attr="annotations-scope"
                    />
                </div>
                <div className="w-60">
                    <LemonLabel htmlFor="annotation-dashboard" className="mb-1">
                        Dashboard
                    </LemonLabel>
                    <LemonInputSelect
                        mode="single"
                        id="annotation-dashboard"
                        value={filters.dashboardId ? [String(filters.dashboardId)] : []}
                        options={[{ key: '', label: 'Any dashboard' }, ...dashboardOptions]}
                        loading={dashboardOptionsLoading}
                        onInputChange={loadDashboardOptions}
                        onChange={(ids) => setFilters({ dashboardId: ids[0] ? Number(ids[0]) : null })}
                        placeholder="Any dashboard"
                        disableFiltering
                        allowCustomValues={false}
                        data-attr="annotations-dashboard-filter"
                        fullWidth
                    />
                </div>
                <div className="w-60">
                    <LemonLabel htmlFor="annotation-insight" className="mb-1">
                        Insight
                    </LemonLabel>
                    <LemonInputSelect
                        mode="single"
                        id="annotation-insight"
                        value={filters.insightId ? [String(filters.insightId)] : []}
                        options={[{ key: '', label: 'Any insight' }, ...insightOptions]}
                        loading={insightOptionsLoading}
                        onInputChange={loadInsightOptions}
                        onChange={(ids) => setFilters({ insightId: ids[0] ? Number(ids[0]) : null })}
                        placeholder="Any insight"
                        disableFiltering
                        allowCustomValues={false}
                        data-attr="annotations-insight-filter"
                        fullWidth
                    />
                </div>
                {hasFilters && (
                    <LemonButton
                        type="tertiary"
                        size="small"
                        onClick={clearFilters}
                        data-attr="annotations-clear-filters"
                    >
                        Clear filters
                    </LemonButton>
                )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
                <div aria-live="polite" className="flex flex-wrap items-center gap-2">
                    {explorerDataLoading || !explorerData ? (
                        <span className="text-secondary">
                            {explorerError ? 'Counts unavailable' : 'Loading annotations…'}
                        </span>
                    ) : explorerError ? (
                        <span className="text-secondary">Counts unavailable</span>
                    ) : (
                        <>
                            <strong>
                                {explorerData.summary.total} matching{' '}
                                {explorerData.summary.total === 1 ? 'annotation' : 'annotations'}
                            </strong>
                            {(['project', 'dashboard', 'dashboard_item', 'organization'] as const).map((scope) => (
                                <LemonTag key={scope} type="muted">
                                    {scopeNames[scope]} {explorerData.summary.scope_counts[scope]}
                                </LemonTag>
                            ))}
                        </>
                    )}
                </div>
                <LemonSegmentedButton
                    value={view}
                    onChange={setView}
                    size="small"
                    options={[
                        { value: 'table', label: 'Table', 'data-attr': 'annotations-table-view' },
                        { value: 'timeline', label: 'Timeline', 'data-attr': 'annotations-timeline-view' },
                    ]}
                />
            </div>
            <div data-attr="annotations-content" aria-busy={explorerDataLoading}>
                {explorerDataLoading || (!explorerData && !explorerError) ? (
                    <div className="space-y-3 border rounded p-4" role="status" aria-label="Loading annotations">
                        <LemonSkeleton className="h-8" />
                        <LemonSkeleton className="h-12" />
                        <LemonSkeleton className="h-12" />
                        <LemonSkeleton className="h-12" />
                    </div>
                ) : explorerError ? (
                    <LemonBanner type="error" action={{ children: 'Retry', onClick: () => loadExplorer() }}>
                        Couldn't load annotations. Check your filters and try again.
                    </LemonBanner>
                ) : explorerData && explorerData.page.results.length === 0 ? (
                    <EmptyMessage
                        title={hasFilters ? 'No matching annotations' : 'No annotations yet'}
                        description={
                            hasFilters
                                ? 'Try a different search or clear your filters to see all annotations.'
                                : 'Add a note about a release, incident, or experiment to find it here later.'
                        }
                        buttonText={hasFilters ? 'Clear filters' : 'New annotation'}
                        buttonOnClick={hasFilters ? clearFilters : () => openModalToCreateAnnotation()}
                        buttonDataAttr="annotations-empty-action"
                    />
                ) : view === 'timeline' ? (
                    <AnnotationTimeline />
                ) : (
                    <LemonTable
                        data-attr="annotations-table"
                        rowKey="id"
                        dataSource={explorerData?.page.results || []}
                        columns={columns}
                    />
                )}
                {explorerData && !explorerError && explorerData.page.count > ANNOTATIONS_PAGE_SIZE && (
                    <div className="flex items-center justify-between gap-3 mt-3">
                        <span className="text-secondary text-sm">
                            Page {page} of {Math.ceil(explorerData.page.count / ANNOTATIONS_PAGE_SIZE)}
                        </span>
                        <div className="flex gap-2">
                            <LemonButton
                                type="secondary"
                                size="small"
                                onClick={() => setPage(page - 1)}
                                disabledReason={
                                    page <= 1
                                        ? 'You are on the first page'
                                        : explorerDataLoading
                                          ? 'Loading annotations'
                                          : undefined
                                }
                                data-attr="annotations-previous-page"
                            >
                                Previous
                            </LemonButton>
                            <LemonButton
                                type="secondary"
                                size="small"
                                onClick={() => setPage(page + 1)}
                                disabledReason={
                                    !explorerData.page.next
                                        ? 'You are on the last page'
                                        : explorerDataLoading
                                          ? 'Loading annotations'
                                          : undefined
                                }
                                data-attr="annotations-next-page"
                            >
                                Next
                            </LemonButton>
                        </div>
                    </div>
                )}
            </div>
            <AnnotationModal />
        </SceneContent>
    )
}
