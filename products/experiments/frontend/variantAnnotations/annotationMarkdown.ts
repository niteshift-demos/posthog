import { JSONContent, RichContentNodeType } from 'lib/components/RichContentEditor/types'

export function annotationMarkdownToDocument(content: string): JSONContent {
    return {
        type: 'doc',
        content: content.split('\n\n').map((paragraph) => ({
            type: 'paragraph',
            content: paragraph
                .split(/((?:^|\s)@member:\d+)/gi)
                .filter(Boolean)
                .flatMap((text): JSONContent[] => {
                    const mention = /^(\s*)@member:(\d+)$/i.exec(text)
                    return mention
                        ? [
                              ...(mention[1] ? [{ type: 'text', text: mention[1] }] : []),
                              { type: RichContentNodeType.Mention, attrs: { id: Number(mention[2]) } },
                          ]
                        : [{ type: 'text', text }]
                }),
        })),
    }
}
