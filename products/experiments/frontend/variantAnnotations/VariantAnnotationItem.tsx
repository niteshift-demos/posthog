import { useActions, useValues } from 'kea'

import { IconEllipsis, IconPencil, IconTrash } from '@posthog/icons'
import { LemonButton, LemonDialog, LemonMenu, LemonSelect, ProfilePicture } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { LemonMarkdown } from 'lib/lemon-ui/LemonMarkdown'
import { VariantTag } from 'scenes/experiments/ExperimentView/VariantTag'

import type { UserBasicType } from '~/types'

import type { ExperimentVariantAnnotationApi } from '../generated/api.schemas'
import { MAX_ANNOTATION_LENGTH, experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'
import { VariantAnnotationEditor } from './VariantAnnotationEditor'

export function VariantAnnotationItem({
    experimentId,
    annotation,
    variantKeys,
    canEdit,
}: {
    experimentId: number
    annotation: ExperimentVariantAnnotationApi
    variantKeys: string[]
    canEdit: boolean
}): JSX.Element {
    const logic = experimentVariantAnnotationsLogic({ experimentId })
    const { editingAnnotation, pendingAction, currentUserId } = useValues(logic)
    const { startEditing, setEditingAnnotation, cancelEditing, submitEditingAnnotation, deleteAnnotation } =
        useActions(logic)

    const isEditing = editingAnnotation?.id === annotation.id
    const canChange = canEdit && !!annotation.created_by && annotation.created_by.id === currentUserId
    const wasEdited = new Date(annotation.updated_at).getTime() - new Date(annotation.created_at).getTime() > 1000

    if (isEditing && editingAnnotation) {
        return (
            <div className="flex flex-col gap-2 py-2" data-attr="experiment-variant-annotation-editing">
                <LemonSelect
                    size="small"
                    value={editingAnnotation.variantKey}
                    onChange={(variantKey) => setEditingAnnotation({ variantKey })}
                    options={variantKeys.map((key) => ({ value: key, label: key }))}
                    fullWidth
                />
                <VariantAnnotationEditor experimentId={experimentId} editing onSubmit={submitEditingAnnotation} />
                <div className="flex justify-end gap-2">
                    <LemonButton type="secondary" size="small" onClick={cancelEditing}>
                        Cancel
                    </LemonButton>
                    <LemonButton
                        type="primary"
                        size="small"
                        onClick={submitEditingAnnotation}
                        loading={pendingAction === 'update'}
                        disabledReason={
                            pendingAction && pendingAction !== 'update'
                                ? 'Wait for the current change to save'
                                : !editingAnnotation.content.trim()
                                  ? 'Write a note first'
                                  : editingAnnotation.content.length > MAX_ANNOTATION_LENGTH
                                    ? 'Keep the note within 5,000 characters'
                                    : undefined
                        }
                        data-attr="experiment-variant-annotation-save"
                    >
                        Save
                    </LemonButton>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-1 py-2" data-attr="experiment-variant-annotation">
            <div className="flex items-center justify-between gap-2">
                <VariantTag variantKey={annotation.variant_key} />
                {canChange && (
                    <LemonMenu
                        items={[
                            {
                                label: 'Edit',
                                icon: <IconPencil />,
                                onClick: () => startEditing(annotation),
                                'data-attr': 'experiment-variant-annotation-edit',
                            },
                            {
                                label: 'Delete',
                                icon: <IconTrash />,
                                status: 'danger',
                                'data-attr': 'experiment-variant-annotation-delete',
                                onClick: () =>
                                    LemonDialog.open({
                                        title: 'Delete this annotation?',
                                        description: 'The note will be removed for everyone on this experiment.',
                                        primaryButton: {
                                            children: 'Delete',
                                            status: 'danger',
                                            onClick: () => deleteAnnotation(annotation.id),
                                        },
                                        secondaryButton: { children: 'Cancel' },
                                    }),
                            },
                        ]}
                    >
                        <LemonButton
                            size="xsmall"
                            icon={<IconEllipsis />}
                            disabledReason={pendingAction ? 'Wait for the current change to save' : undefined}
                            aria-label="Annotation actions"
                            data-attr="experiment-variant-annotation-menu"
                        />
                    </LemonMenu>
                )}
            </div>
            <LemonMarkdown className="text-sm break-words" lowKeyHeadings disableImages>
                {annotation.content}
            </LemonMarkdown>
            <div className="flex items-center gap-1 text-xs text-secondary">
                {annotation.created_by ? (
                    <ProfilePicture user={annotation.created_by as UserBasicType} showName size="xs" />
                ) : (
                    <span>Deleted user</span>
                )}
                <span>·</span>
                <TZLabel time={annotation.created_at} />
                {wasEdited && <span className="italic">(edited)</span>}
            </div>
        </div>
    )
}
