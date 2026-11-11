import { generateText } from '@tiptap/core'

import { DEFAULT_EXTENSIONS, serializationOptions } from 'lib/lemon-ui/LemonRichContent/LemonRichContentEditor'

import { annotationMarkdownToDocument } from './annotationMarkdown'

describe('annotation Markdown editing', () => {
    it.each([
        '**Decision**\n- Ship control\n- [Results](https://example.com)',
        'Review @member:42 with @member:7\n\nKeep *emphasis* and `code`.',
        '',
    ])('preserves formatting and mention ids when reopening a note: %s', (content) => {
        expect(generateText(annotationMarkdownToDocument(content), DEFAULT_EXTENSIONS, serializationOptions)).toEqual(
            content
        )
    })
})
