import { useActions, useValues } from 'kea'

import { LemonRichContentEditor } from 'lib/lemon-ui/LemonRichContent/LemonRichContentEditor'

import { annotationMarkdownToDocument } from './annotationMarkdown'
import { MAX_ANNOTATION_LENGTH, experimentVariantAnnotationsLogic } from './experimentVariantAnnotationsLogic'

export function VariantAnnotationEditor({
    experimentId,
    editing = false,
    onSubmit,
}: {
    experimentId: number
    editing?: boolean
    onSubmit: () => void
}): JSX.Element {
    const logic = experimentVariantAnnotationsLogic({ experimentId })
    const { draftContent, editingAnnotation, pendingAction } = useValues(logic)
    const { setAnnotationEditor, annotationEditorUpdated } = useActions(logic)
    const content = editing ? (editingAnnotation?.content ?? '') : draftContent

    return (
        <div data-attr="experiment-variant-annotation-content">
            <LemonRichContentEditor
                initialContent={annotationMarkdownToDocument(content)}
                placeholder="Write a note. Use Markdown for formatting and @ to mention a teammate."
                onCreate={(editor) => setAnnotationEditor(editor, editing)}
                onUpdate={() => annotationEditorUpdated(editing)}
                onPressCmdEnter={onSubmit}
                disabled={!!pendingAction}
                minRows={2}
            />
            <div className={content.length > MAX_ANNOTATION_LENGTH ? 'text-xs text-danger' : 'text-xs text-secondary'}>
                {content.length.toLocaleString()} / {MAX_ANNOTATION_LENGTH.toLocaleString()} characters, including
                formatting and mentions
            </div>
        </div>
    )
}
