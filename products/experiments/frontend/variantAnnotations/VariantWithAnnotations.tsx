import { useValues } from 'kea'

import { IconComment } from '@posthog/icons'
import { LemonButton, LemonDropdown } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { VariantTag } from 'scenes/experiments/ExperimentView/VariantTag'

import { experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'

export function VariantWithAnnotations({
    experimentId,
    variantKey,
}: {
    experimentId: number
    variantKey: string
}): JSX.Element {
    const { annotationsByVariant } = useValues(experimentVariantAnnotationsLogic({ experimentId }))
    const notes = annotationsByVariant[variantKey]

    if (!notes?.length) {
        return <VariantTag variantKey={variantKey} />
    }

    return (
        <div className="flex items-center gap-1">
            <VariantTag variantKey={variantKey} />
            <LemonDropdown
                placement="bottom-start"
                overlay={
                    <div className="w-80 max-w-full whitespace-normal">
                        <div className="font-semibold mb-2">Latest annotations for {variantKey}</div>
                        <div className="max-h-80 overflow-y-auto divide-y divide-primary">
                            {notes.slice(0, 3).map((note) => (
                                <div key={note.id} className="py-2">
                                    <div className="text-xs text-secondary flex flex-wrap gap-1">
                                        <span>
                                            {note.created_by?.first_name || note.created_by?.email || 'Deleted user'}
                                        </span>
                                        <span>·</span>
                                        <TZLabel time={note.created_at} />
                                    </div>
                                    <p className="m-0 mt-1 text-sm whitespace-pre-wrap break-words">{note.content}</p>
                                </div>
                            ))}
                        </div>
                        <LemonButton
                            type="secondary"
                            size="xsmall"
                            fullWidth
                            onClick={() => {
                                const panel = document.getElementById('experiment-variant-annotations')
                                panel?.scrollIntoView({ block: 'nearest' })
                                panel?.focus({ preventScroll: true })
                            }}
                            data-attr="experiment-variant-annotations-view-panel"
                        >
                            View all annotations
                        </LemonButton>
                    </div>
                }
            >
                <LemonButton
                    size="xsmall"
                    icon={<IconComment />}
                    aria-label={`${notes.length} ${notes.length === 1 ? 'annotation' : 'annotations'} for ${variantKey}`}
                    data-attr="experiment-variant-annotations-indicator"
                >
                    {notes.length}
                </LemonButton>
            </LemonDropdown>
        </div>
    )
}
