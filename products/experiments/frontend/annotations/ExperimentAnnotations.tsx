import { useActions, useValues } from 'kea'

import { IconPencil, IconTrash } from '@posthog/icons'
import {
    LemonBanner,
    LemonButton,
    LemonCard,
    LemonLabel,
    LemonModal,
    LemonSelect,
    LemonSkeleton,
    LemonTag,
} from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { LemonTextArea } from 'lib/lemon-ui/LemonTextArea/LemonTextArea'

import { experimentAnnotationsLogic } from './experimentAnnotationsLogic'

export interface ExperimentAnnotationsProps {
    experimentId: number
    variants: string[]
    canEdit: boolean
}

export function ExperimentAnnotations({ experimentId, variants, canEdit }: ExperimentAnnotationsProps): JSX.Element {
    const logic = experimentAnnotationsLogic({ experimentId })
    const {
        annotations,
        annotationsLoading,
        annotationsError,
        variantKey,
        content,
        editingAnnotationId,
        pendingDeleteId,
        savedAnnotationLoading,
        deletedAnnotationIdLoading,
        mutationLoading,
    } = useValues(logic)
    const {
        loadExperimentAnnotations,
        setVariantKey,
        setContent,
        editAnnotation,
        cancelEditing,
        saveExperimentAnnotation,
        requestDelete,
        deleteExperimentAnnotation,
    } = useActions(logic)

    return (
        <LemonCard hoverEffect={false} className="mt-4" data-attr="experiment-annotations">
            <h2 className="text-base mb-1">Variant annotations</h2>
            <p className="text-secondary mb-4">
                Add context to your results. Annotations are separate from the experiment conclusion.
            </p>
            {annotationsLoading || (annotations === null && !annotationsError) ? (
                <LemonSkeleton className="h-16" />
            ) : annotationsError ? (
                <LemonBanner type="error" action={{ children: 'Retry', onClick: loadExperimentAnnotations }}>
                    Couldn't load annotations. Try again.
                </LemonBanner>
            ) : (
                <div className="space-y-4">
                    {annotations?.length === 0 && <p className="text-secondary mb-0">No annotations yet.</p>}
                    {annotations?.map((annotation) => (
                        <div key={annotation.id} className="border-b pb-4" data-attr="experiment-annotation">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <LemonTag>{annotation.variant_key}</LemonTag>
                                    <span className="font-semibold">
                                        {annotation.created_by?.first_name ||
                                            annotation.created_by?.email ||
                                            'Deleted user'}
                                    </span>
                                    <span className="text-secondary text-xs">
                                        <TZLabel time={annotation.created_at} timestampStyle="absolute" />
                                        {annotation.updated_at !== annotation.created_at && (
                                            <>
                                                {' '}
                                                · Edited <TZLabel time={annotation.updated_at} />
                                            </>
                                        )}
                                    </span>
                                </div>
                                {canEdit && (
                                    <div className="flex gap-1">
                                        <LemonButton
                                            size="xsmall"
                                            icon={<IconPencil />}
                                            tooltip="Edit annotation"
                                            aria-label="Edit annotation"
                                            data-attr="experiment-annotation-edit"
                                            disabled={mutationLoading}
                                            onClick={() => editAnnotation(annotation)}
                                        />
                                        <LemonButton
                                            size="xsmall"
                                            icon={<IconTrash />}
                                            status="danger"
                                            tooltip="Delete annotation"
                                            aria-label="Delete annotation"
                                            data-attr="experiment-annotation-delete"
                                            disabled={mutationLoading}
                                            onClick={() => requestDelete(annotation.id)}
                                        />
                                    </div>
                                )}
                            </div>
                            <p className="whitespace-pre-wrap break-words mb-0 mt-2">{annotation.content}</p>
                        </div>
                    ))}
                </div>
            )}
            {canEdit && annotations !== null && !annotationsError && !annotationsLoading && (
                <div className="mt-4 space-y-3">
                    <h3 className="text-sm mb-0">
                        {editingAnnotationId === null ? 'Add annotation' : 'Edit annotation'}
                    </h3>
                    <div className="space-y-1">
                        <LemonLabel htmlFor={`annotation-variant-${experimentId}`}>Variant</LemonLabel>
                        <LemonSelect
                            id={`annotation-variant-${experimentId}`}
                            value={variantKey || null}
                            placeholder="Select a variant"
                            options={variants.map((key) => ({ value: key, label: key }))}
                            onChange={(key) => setVariantKey(key ?? '')}
                            disabled={mutationLoading}
                            data-attr="experiment-annotation-variant"
                        />
                    </div>
                    <div className="space-y-1">
                        <LemonLabel htmlFor={`annotation-content-${experimentId}`}>Note</LemonLabel>
                        <LemonTextArea
                            id={`annotation-content-${experimentId}`}
                            value={content}
                            onChange={setContent}
                            placeholder="Add context about this variant"
                            minRows={3}
                            maxLength={8192}
                            disabled={mutationLoading}
                            data-attr="experiment-annotation-content"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        {editingAnnotationId !== null && (
                            <LemonButton type="secondary" onClick={cancelEditing} disabled={mutationLoading}>
                                Cancel
                            </LemonButton>
                        )}
                        <LemonButton
                            type="primary"
                            onClick={saveExperimentAnnotation}
                            loading={savedAnnotationLoading}
                            disabledReason={
                                deletedAnnotationIdLoading
                                    ? 'An annotation is being deleted'
                                    : !variants.includes(variantKey)
                                      ? 'Select a variant'
                                      : !content.trim()
                                        ? 'Write a note'
                                        : undefined
                            }
                            data-attr="experiment-annotation-save"
                        >
                            {editingAnnotationId === null ? 'Add annotation' : 'Save annotation'}
                        </LemonButton>
                    </div>
                </div>
            )}
            <LemonModal
                isOpen={pendingDeleteId !== null}
                onClose={() => {
                    if (!mutationLoading) {
                        requestDelete(null)
                    }
                }}
                title="Delete annotation?"
                footer={
                    <div className="flex justify-end gap-2">
                        <LemonButton type="secondary" disabled={mutationLoading} onClick={() => requestDelete(null)}>
                            Cancel
                        </LemonButton>
                        <LemonButton
                            type="primary"
                            status="danger"
                            loading={deletedAnnotationIdLoading}
                            disabled={savedAnnotationLoading}
                            onClick={deleteExperimentAnnotation}
                            data-attr="experiment-annotation-confirm-delete"
                        >
                            Delete annotation
                        </LemonButton>
                    </div>
                }
            >
                This annotation will be permanently deleted.
            </LemonModal>
        </LemonCard>
    )
}
