import { useActions, useValues } from 'kea'

import { LemonButton, LemonDivider, LemonSkeleton } from '@posthog/lemon-ui'

import { experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'
import { VariantAnnotationComposer } from './VariantAnnotationComposer'
import { VariantAnnotationItem } from './VariantAnnotationItem'

export function VariantAnnotationsPanel({
    experimentId,
    variantKeys,
    canEdit,
}: {
    experimentId: number
    variantKeys: string[]
    canEdit: boolean
}): JSX.Element {
    const logic = experimentVariantAnnotationsLogic({ experimentId })
    const { annotations, annotationsLoading } = useValues(logic)
    const { loadAnnotations } = useActions(logic)

    return (
        <div
            id="experiment-variant-annotations"
            tabIndex={-1}
            className="border border-primary rounded bg-[var(--color-bg-table)] px-3 py-2.5 flex flex-col gap-2"
            data-attr="experiment-variant-annotations"
        >
            <div className="flex flex-col">
                <span className="metric-cell-header font-bold">Variant annotations</span>
                <span className="text-xs text-secondary">
                    Notes on individual variants. These don't change the experiment's conclusion.
                </span>
            </div>
            {canEdit ? (
                <VariantAnnotationComposer experimentId={experimentId} variantKeys={variantKeys} />
            ) : (
                <p className="m-0 text-xs text-secondary">
                    You need editor access to this experiment to add annotations.
                </p>
            )}
            <LemonDivider className="my-0" />
            {annotations === null ? (
                annotationsLoading ? (
                    <div className="flex flex-col gap-2 py-2">
                        <LemonSkeleton className="h-4 w-1/3" />
                        <LemonSkeleton className="h-10" />
                    </div>
                ) : (
                    <div className="flex flex-col items-start gap-1 py-2 text-sm">
                        <span>Couldn't load annotations.</span>
                        <LemonButton type="secondary" size="xsmall" onClick={loadAnnotations}>
                            Try again
                        </LemonButton>
                    </div>
                )
            ) : annotations.length === 0 ? (
                <p className="m-0 py-2 text-sm text-secondary">
                    No annotations yet. Pick a variant and write a note to record decisions next to the results.
                </p>
            ) : (
                <div className="flex flex-col divide-y divide-primary">
                    {annotations.map((annotation) => (
                        <VariantAnnotationItem
                            key={annotation.id}
                            experimentId={experimentId}
                            annotation={annotation}
                            variantKeys={variantKeys}
                            canEdit={canEdit}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
