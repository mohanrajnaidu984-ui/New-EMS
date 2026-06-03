/**
 * Clause editor font family list — aligned with quote preview / PDF (Segoe UI).
 */

import { QUOTE_PREVIEW_FONT_STACK } from './quotePrintDocumentHtml';

export const EMS_CLAUSE_EDITOR_FONT_STACK = QUOTE_PREVIEW_FONT_STACK;

/** Jodit font dropdown: stack key → display label. */
export const EMS_CLAUSE_EDITOR_FONT_LIST = {
    [EMS_CLAUSE_EDITOR_FONT_STACK]: 'Segoe UI',
    'Arial, Helvetica, sans-serif': 'Arial',
    "'Courier New', Courier, monospace": 'Courier New',
    'Georgia, Palatino, serif': 'Georgia',
    "'Lucida Sans Unicode', 'Lucida Grande', sans-serif": 'Lucida Sans Unicode',
    'Tahoma, Geneva, sans-serif': 'Tahoma',
    "'Times New Roman', Times, serif": 'Times New Roman',
    "'Trebuchet MS', Helvetica, sans-serif": 'Trebuchet MS',
    'Helvetica, sans-serif': 'Helvetica',
    'Impact, Charcoal, sans-serif': 'Impact',
    'Verdana, Geneva, sans-serif': 'Verdana',
};
