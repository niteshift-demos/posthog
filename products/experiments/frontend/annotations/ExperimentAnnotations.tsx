import { useActions, useAsyncActions, useValues } from 'kea'

import { IconPencil, IconTrash } from '@posthog/icons'
import {
    LemonBanner,
    LemonButton,
    LemonCard,
    LemonDialog,
    LemonLabel,
    LemonSelect,
    LemonSkeleton,
    LemonTag,
    LemonTextArea,
} from '@posthog/lemon-ui'

import { userHasAccess } from 'lib/utils/accessControlUtils'
import { humanFriendlyDetailedTime } from 'lib/utils/datetime'
import { experimentLogic } from 'scenes/experiments/experimentLogic'
import { teamLogic } from 'scenes/teamLogic'

import { AccessControlLevel, AccessControlResourceType } from '~/types'

import { experimentAnnotationsLogic } from './experimentAnnotationsLogic'

export function ExperimentAnnotations(): JSX.Element {
    const { experiment, variants } = useValues(experimentLogic)
    const { currentProjectId } = useValues(teamLogic)
    const logic = experimentAnnotationsLogic({
        projectId: String(currentProjectId),
        experimentId: Number(experiment.id),
    })
    const {
        annotations,
        annotationsLoading,
        annotationMutationLoading,
        variantKey,
        content,
        editingId,
        annotationError,
        annotationLoadError,
    } = useValues(logic)
    const {
        setVariantKey,
        setContent,
        editAnnotation,
        cancelEditing,
        loadExperimentAnnotations,
        saveExperimentAnnotation,
    } = useActions(logic)
    const { deleteExperimentAnnotation } = useAsyncActions(logic)
    const canEdit = userHasAccess(
        AccessControlResourceType.Experiment,
        AccessControlLevel.Editor,
        experiment.user_access_level
    )

    return (
        <LemonCard hoverEffect={false} className="mt-4" data-attr="experiment-annotations">
            <h3 className="mb-1">Variant annotations</h3>
            <p className="text-secondary mb-4">Add context to the results for a specific variant.</p>
            {annotationError && (
                <LemonBanner type="error" className="mb-4">
                    {annotationError}
                    {annotationLoadError && (
                        <LemonButton size="small" onClick={loadExperimentAnnotations} loading={annotationsLoading}>
                            Retry
                        </LemonButton>
                    )}
                </LemonBanner>
            )}
            {annotationsLoading && annotations === null ? (
                <LemonSkeleton className="h-16 mb-4" />
            ) : annotations !== null ? (
                annotations.length === 0 ? (
                    <p className="text-secondary">No annotations yet.</p>
                ) : (
                    <div className="space-y-4 mb-4">
                        {annotations.map((annotation) => (
                            <div
                                key={annotation.id}
                                className="border-b pb-3 last:border-b-0"
                                data-attr="experiment-annotation"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <LemonTag>{annotation.variant_key}</LemonTag>
                                        <span className="text-secondary text-xs">
                                            {annotation.created_by?.first_name ||
                                                annotation.created_by?.email ||
                                                'Deleted user'}
                                            {' · '}
                                            <time dateTime={annotation.created_at}>
                                                {humanFriendlyDetailedTime(annotation.created_at)}
                                            </time>
                                            {annotation.updated_at !== annotation.created_at && (
                                                <span title={humanFriendlyDetailedTime(annotation.updated_at)}>
                                                    {' '}
                                                    (edited)
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    {canEdit && (
                                        <div className="flex gap-1">
                                            <LemonButton
                                                icon={<IconPencil />}
                                                size="xsmall"
                                                tooltip="Edit annotation"
                                                aria-label="Edit annotation"
                                                disabled={annotationMutationLoading}
                                                onClick={() => editAnnotation(annotation)}
                                            />
                                            <LemonButton
                                                icon={<IconTrash />}
                                                size="xsmall"
                                                status="danger"
                                                tooltip="Delete annotation"
                                                aria-label="Delete annotation"
                                                loading={annotationMutationLoading}
                                                onClick={() =>
                                                    LemonDialog.open({
                                                        title: 'Delete this annotation?',
                                                        description: 'This cannot be undone.',
                                                        shouldAwaitSubmit: true,
                                                        primaryButton: {
                                                            children: 'Delete annotation',
                                                            status: 'danger',
                                                            onClick: () =>
                                                                deleteExperimentAnnotation({ id: annotation.id }),
                                                        },
                                                        secondaryButton: { children: 'Cancel' },
                                                    })
                                                }
                                            />
                                        </div>
                                    )}
                                </div>
                                <p className="whitespace-pre-wrap break-words mb-0 mt-2">{annotation.content}</p>
                            </div>
                        ))}
                    </div>
                )
            ) : null}
            {canEdit && (
                <div className="space-y-3">
                    <div className="space-y-1">
                        <LemonLabel htmlFor="experiment-annotation-variant">Variant</LemonLabel>
                        <LemonSelect
                            id="experiment-annotation-variant"
                            value={variantKey || null}
                            placeholder="Select a variant"
                            options={[
                                ...variants.map((variant) => ({ value: variant.key, label: variant.key })),
                                ...(editingId !== null && !variants.some((variant) => variant.key === variantKey)
                                    ? [{ value: variantKey, label: `${variantKey} (removed)` }]
                                    : []),
                            ]}
                            onChange={(value) => setVariantKey(value || '')}
                            disabled={annotationMutationLoading || editingId !== null}
                        />
                    </div>
                    <div className="space-y-1">
                        <LemonLabel htmlFor="experiment-annotation-note">Note</LemonLabel>
                        <LemonTextArea
                            id="experiment-annotation-note"
                            value={content}
                            onChange={setContent}
                            placeholder="Shipped this variant after reviewing the results"
                            minRows={3}
                            maxLength={10000}
                            disabled={annotationMutationLoading}
                        />
                    </div>
                    <div className="flex gap-2">
                        <LemonButton
                            type="primary"
                            onClick={saveExperimentAnnotation}
                            loading={annotationMutationLoading}
                            disabledReason={
                                !variantKey ? 'Select a variant' : !content.trim() ? 'Write a note' : undefined
                            }
                            data-attr="save-experiment-annotation"
                        >
                            {editingId === null ? 'Add annotation' : 'Save annotation'}
                        </LemonButton>
                        {editingId !== null && (
                            <LemonButton type="secondary" onClick={cancelEditing} disabled={annotationMutationLoading}>
                                Cancel
                            </LemonButton>
                        )}
                    </div>
                </div>
            )}
        </LemonCard>
    )
}
