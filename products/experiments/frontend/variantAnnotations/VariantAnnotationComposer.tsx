import { useActions, useValues } from 'kea'

import { LemonButton, LemonSelect } from '@posthog/lemon-ui'

import { MAX_ANNOTATION_LENGTH, experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'
import { VariantAnnotationEditor } from './VariantAnnotationEditor'

export function VariantAnnotationComposer({
    experimentId,
    variantKeys,
}: {
    experimentId: number
    variantKeys: string[]
}): JSX.Element {
    const logic = experimentVariantAnnotationsLogic({ experimentId })
    const { draftVariantKey, draftContent, pendingAction } = useValues(logic)
    const { setDraftVariantKey, submitDraft } = useActions(logic)

    return (
        <div className="flex flex-col gap-2">
            <LemonSelect
                size="small"
                placeholder="Select a variant"
                value={draftVariantKey}
                onChange={setDraftVariantKey}
                options={variantKeys.map((key) => ({ value: key, label: key }))}
                data-attr="experiment-variant-annotation-variant-select"
                fullWidth
            />
            <VariantAnnotationEditor experimentId={experimentId} onSubmit={submitDraft} />
            <div className="flex justify-end">
                <LemonButton
                    type="primary"
                    size="small"
                    onClick={submitDraft}
                    loading={pendingAction === 'create'}
                    disabledReason={
                        pendingAction && pendingAction !== 'create'
                            ? 'Wait for the current change to save'
                            : !draftVariantKey
                              ? 'Select a variant first'
                              : !draftContent.trim()
                                ? 'Write a note first'
                                : draftContent.length > MAX_ANNOTATION_LENGTH
                                  ? 'Keep the note within 5,000 characters'
                                  : undefined
                    }
                    data-attr="experiment-variant-annotation-add"
                >
                    Add annotation
                </LemonButton>
            </div>
        </div>
    )
}
