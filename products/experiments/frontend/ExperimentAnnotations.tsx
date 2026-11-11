import { useActions, useValues } from 'kea'

import { IconComment, IconPencil, IconTrash } from '@posthog/icons'
import {
    LemonBanner,
    LemonButton,
    LemonCard,
    LemonDialog,
    LemonLabel,
    LemonModal,
    LemonSelect,
    LemonSkeleton,
    LemonTag,
    LemonTextArea,
    ProfilePicture,
} from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { userHasAccess } from 'lib/utils/accessControlUtils'
import { experimentLogic } from 'scenes/experiments/experimentLogic'

import { AccessControlLevel, AccessControlResourceType } from '~/types'

import { experimentAnnotationsLogic } from './experimentAnnotationsLogic'

export function ExperimentAnnotations(): JSX.Element {
    const { experiment, variants } = useValues(experimentLogic)
    const logic = experimentAnnotationsLogic({ experimentId: experiment.id as number })
    const {
        annotations,
        annotationsLoading,
        annotationsError,
        annotationMutationLoading,
        mutationError,
        editorOpen,
        editingAnnotationId,
        variantKey,
        content,
    } = useValues(logic)
    const {
        startAnnotation,
        editAnnotation,
        closeEditor,
        setVariantKey,
        setContent,
        saveAnnotation,
        deleteAnnotation,
        loadAnnotations,
    } = useActions(logic)
    const canEdit = userHasAccess(
        AccessControlResourceType.Experiment,
        AccessControlLevel.Editor,
        experiment.user_access_level
    )

    return (
        <LemonCard hoverEffect={false} className="mt-4" data-attr="experiment-annotations">
            <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="mb-0">Variant annotations</h3>
                {canEdit && (
                    <LemonButton
                        type="secondary"
                        size="small"
                        icon={<IconComment />}
                        onClick={() => startAnnotation(variants[0]?.key ?? '')}
                        disabledReason={variants.length === 0 ? 'Add a variant to annotate.' : undefined}
                        data-attr="experiment-add-annotation"
                    >
                        Add annotation
                    </LemonButton>
                )}
            </div>
            <p className="text-secondary mb-4">Keep notes about individual variants alongside the results.</p>
            {annotationsError ? (
                <LemonBanner type="error" action={{ children: 'Retry', onClick: loadAnnotations }}>
                    Could not load annotations. Try again.
                </LemonBanner>
            ) : annotationsLoading ? (
                <LemonSkeleton className="h-16" />
            ) : annotations.length === 0 ? (
                <p className="text-secondary mb-0">No annotations yet. Add a note to a variant to share context.</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {annotations.map((annotation) => (
                        <div key={annotation.id} className="border-t pt-4" data-attr="experiment-annotation">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center flex-wrap gap-2 text-secondary text-sm">
                                    <LemonTag>{annotation.variant_key}</LemonTag>
                                    {annotation.created_by ? (
                                        <ProfilePicture
                                            user={{
                                                first_name: annotation.created_by.first_name,
                                                last_name: annotation.created_by.last_name,
                                                email: annotation.created_by.email,
                                            }}
                                            size="sm"
                                            showName
                                        />
                                    ) : (
                                        <span>Deleted user</span>
                                    )}
                                    <TZLabel time={annotation.created_at} />
                                    {new Date(annotation.updated_at).getTime() -
                                        new Date(annotation.created_at).getTime() >
                                        1000 && (
                                        <span>
                                            Edited <TZLabel time={annotation.updated_at} />
                                        </span>
                                    )}
                                </div>
                                {canEdit && (
                                    <div className="flex gap-1">
                                        <LemonButton
                                            size="small"
                                            icon={<IconPencil />}
                                            tooltip="Edit annotation"
                                            onClick={() => editAnnotation(annotation)}
                                            disabledReason={
                                                annotationMutationLoading ? 'Saving annotation…' : undefined
                                            }
                                            data-attr="experiment-edit-annotation"
                                        />
                                        <LemonButton
                                            size="small"
                                            status="danger"
                                            icon={<IconTrash />}
                                            tooltip="Delete annotation"
                                            loading={annotationMutationLoading}
                                            onClick={() =>
                                                LemonDialog.open({
                                                    title: 'Delete annotation?',
                                                    content: 'This annotation will be permanently deleted.',
                                                    primaryButton: {
                                                        children: 'Delete',
                                                        status: 'danger',
                                                        onClick: () => deleteAnnotation(annotation.id),
                                                    },
                                                    secondaryButton: { children: 'Cancel' },
                                                })
                                            }
                                            data-attr="experiment-delete-annotation"
                                        />
                                    </div>
                                )}
                            </div>
                            <p className="whitespace-pre-wrap break-words mt-2 mb-0">{annotation.content}</p>
                        </div>
                    ))}
                </div>
            )}
            {mutationError && !editorOpen && (
                <LemonBanner type="error" className="mt-4">
                    Could not delete the annotation. Try again.
                </LemonBanner>
            )}
            <LemonModal
                isOpen={editorOpen}
                onClose={() => {
                    if (!annotationMutationLoading) {
                        closeEditor()
                    }
                }}
                title={editingAnnotationId === null ? 'Add variant annotation' : 'Edit variant annotation'}
                footer={
                    <div className="flex justify-end gap-2">
                        <LemonButton
                            type="secondary"
                            onClick={closeEditor}
                            disabledReason={annotationMutationLoading ? 'Saving annotation…' : undefined}
                        >
                            Cancel
                        </LemonButton>
                        <LemonButton
                            type="primary"
                            onClick={saveAnnotation}
                            loading={annotationMutationLoading}
                            disabledReason={
                                !variantKey ? 'Select a variant.' : !content.trim() ? 'Write a note.' : undefined
                            }
                            data-attr="experiment-save-annotation"
                        >
                            {editingAnnotationId === null ? 'Add annotation' : 'Save changes'}
                        </LemonButton>
                    </div>
                }
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <LemonLabel htmlFor="experiment-annotation-variant">Variant</LemonLabel>
                        <LemonSelect
                            id="experiment-annotation-variant"
                            value={variantKey}
                            onChange={setVariantKey}
                            options={variants.map(({ key }) => ({ value: key, label: key }))}
                            fullWidth
                            disabled={annotationMutationLoading}
                        />
                    </div>
                    <div>
                        <LemonLabel htmlFor="experiment-annotation-content">Note</LemonLabel>
                        <LemonTextArea
                            id="experiment-annotation-content"
                            value={content}
                            onChange={setContent}
                            placeholder="What would you like to note about this variant?"
                            minRows={4}
                            maxLength={8192}
                            disabled={annotationMutationLoading}
                            data-attr="experiment-annotation-content"
                        />
                    </div>
                    {mutationError && <LemonBanner type="error">Could not save the annotation. Try again.</LemonBanner>}
                </div>
            </LemonModal>
        </LemonCard>
    )
}
