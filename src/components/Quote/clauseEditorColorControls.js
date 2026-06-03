/**
 * Separate toolbar buttons for text color and background color (Word-style).
 */

import { ColorPickerWidget } from 'jodit/esm/modules/widget/color-picker/color-picker.js';
import { Dom } from 'jodit/esm/core/dom/dom.js';
import { css } from 'jodit/esm/core/helpers/utils/css.js';

function readCurrentColor(editor, mode) {
    const prop = mode === 'forecolor' ? 'color' : 'background-color';
    const current = editor?.s?.current?.();
    if (!current || !editor?.editor) return '';
    let found = '';
    Dom.up(
        current,
        (node) => {
            if (!Dom.isHTMLElement(node)) return;
            const val = css(node, prop, true);
            if (val) {
                found = val.toString();
                return true;
            }
        },
        editor.editor
    );
    if (found) return found;
    const box = Dom.closest(current, Dom.isElement, editor.editor) || editor.editor;
    const val = css(box, prop, true);
    return val ? val.toString() : '';
}

function createEmsColorControl(name, command, tooltip, options = {}) {
    const { icon, template } = options;
    return {
        name,
        ...(icon ? { icon } : {}),
        ...(template ? { template } : {}),
        tooltip,
        isVisible: (editor) => !editor?.o?.disablePlugins?.includes?.('color'),
        popup: (editor, _current, close) => {
            if (!editor?.c) return false;
            return ColorPickerWidget(
                editor,
                (value) => {
                    editor.execCommand(command, false, value);
                    if (typeof editor.synchronizeValues === 'function') {
                        editor.synchronizeValues();
                    }
                    close();
                },
                readCurrentColor(editor, command)
            );
        },
    };
}

/** “A” with underline — text (font) color. */
export const EMS_FORECOLOR_CONTROL = createEmsColorControl(
    'emsForeColor',
    'forecolor',
    'Text color',
    {
        template: () =>
            '<span class="ems-toolbar-forecolor-icon" aria-hidden="true">A</span>',
    }
);

/** Paint bucket — background / cell fill (table logic handled in clauseEditorTable). */
export const EMS_BACKGROUND_CONTROL = createEmsColorControl(
    'emsBackground',
    'background',
    'Background color',
    { icon: 'brush' }
);

/** Hide Jodit’s combined fill+text color control when using separate buttons. */
export const EMS_BRUSH_CONTROL_HIDDEN = {
    name: 'brush',
    isVisible: () => false,
};
