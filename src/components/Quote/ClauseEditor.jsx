import React, { useRef, useMemo } from 'react';
import JoditEditor from 'jodit-react';

// Custom Table Icon
const TableIcon = () => (
    <svg viewBox="0 0 18 18">
        <rect className="ql-fill" height="12" width="12" x="3" y="3" />
        <rect className="ql-fill" height="2" width="12" x="3" y="8" />
        <rect className="ql-fill" height="12" width="2" x="8" y="3" />
    </svg>
);

const ClauseEditor = ({ html, onChange, style }) => {
    const editor = useRef(null);

    const config = useMemo(() => ({
        readonly: false,
        placeholder: 'Start typing...',
        height: style?.height || 400,
        minHeight: 200,
        enableDragAndDropFileToEditor: true,
        /** Skip Word/Excel paste plugin so Jodit does not run applyStyles() (it strips border* from inline CSS). */
        askBeforePasteFromWord: false,
        askBeforePasteHTML: false,
        processPasteFromWord: false,
        uploader: {
            insertImageAsBase64URI: true
        },
        colorPickerDefaultTab: 'color',
        toolbarAdaptive: false,
        buttons: [
            'undo', 'redo', '|',
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'brush', 'font', 'fontsize', 'paragraph', '|',
            'ul', 'ol', '|',
            'image', 'table', 'link', '|',
            'left', 'center', 'right', 'justify', '|',
            'hr', 'eraser', 'fullsize'
        ],
        showCharsCounter: false,
        showWordsCounter: false,
        showXPathInStatusbar: false,
        table: {
            splitBlockOnInsertTable: true,
            useExtraClassesOptions: true,
            selectionCellStyle: 'border: 1px solid #64748b !important;',
        },
    }), [style?.height]);

    return (
        <div style={{ ...style, display: 'flex', flexDirection: 'column' }} className="clause-editor-wrapper">
            <JoditEditor
                ref={editor}
                value={html || ''}
                config={config}
                tabIndex={1} // tabIndex of textarea
                onBlur={newContent => onChange(newContent)}
            />
            <style>
                {`
                .jodit-container {
                     border: 1px solid #e2e8f0 !important;
                     border-radius: 4px;
                }
                .jodit-toolbar__box {
                    background-color: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                }
                .jodit-workplace {
                    overflow-y: auto !important;
                }
                /* Left editor only: tight rhythm (~half cursor between paragraphs). */
                .clause-editor-wrapper .jodit-wysiwyg {
                    line-height: 1.25 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg p,
                .clause-editor-wrapper .jodit-wysiwyg li {
                    margin: 0 !important;
                    line-height: 1.25 !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg p + p {
                    margin-top: 5px !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table,
                .clause-editor-wrapper .jodit-wysiwyg td,
                .clause-editor-wrapper .jodit-wysiwyg th {
                    border: 1px solid #64748b !important;
                    border-collapse: collapse !important;
                }
                .clause-editor-wrapper .jodit-wysiwyg table {
                    border-collapse: collapse !important;
                    border-spacing: 0 !important;
                }
            `}
            </style>
        </div>
    );
};

export default ClauseEditor;
