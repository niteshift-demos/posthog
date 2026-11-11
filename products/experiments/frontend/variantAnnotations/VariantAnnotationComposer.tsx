import { useActions, useValues } from 'kea'

import { LemonButton, LemonSelect, LemonTextArea } from '@posthog/lemon-ui'

import { MAX_ANNOTATION_LENGTH, experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'

export function VariantAnnotationComposer({
    experimentId,
    variantKeys,
}: {
    experimentId: number
    variantKeys: string[]
}): JSX.Element {
    const logic = experimentVariantAnnotationsLogic({ experimentId })
    const { draftVariantKey, draftContent, canSubmitDraft, pendingAction } = useValues(logic)
    const { setDraftVariantKey, setDraftContent, createAnnotation } = useActions(logic)

    const submit = (): void => {
        if (canSubmitDraft && draftVariantKey && !pendingAction) {
            createAnnotation({ variantKey: draftVariantKey, content: draftContent })
        }
    }

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
            <LemonTextArea
                placeholder="Add a note about this variant, for example why you shipped it"
                value={draftContent}
                onChange={setDraftContent}
                onPressCmdEnter={submit}
                minRows={2}
                maxLength={MAX_ANNOTATION_LENGTH}
                data-attr="experiment-variant-annotation-content"
            />
            <div className="flex justify-end">
                <LemonButton
                    type="primary"
                    size="small"
                    onClick={submit}
                    loading={pendingAction === 'create'}
                    disabledReason={
                        pendingAction && pendingAction !== 'create'
                            ? 'Wait for the current change to save'
                            : !draftVariantKey
                              ? 'Select a variant first'
                              : !draftContent.trim()
                                ? 'Write a note first'
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
