/**
 * Shared UI tokens — keep in sync with `:root { --ems-table-header-gradient }` in `index.css`.
 * Matches Search Enquiry results (`EnquiryResultsTable`).
 */
export const EMS_TABLE_HEADER_GRADIENT =
    'linear-gradient(180deg, #4d88d6 0%, #3e74c4 45%, #305894 100%)';

/** Centre main-menu strip in `Header.jsx` — deep blue bar (not the same token as quote panel headers). */
export const EMS_HEADER_NAV_GRADIENT =
    'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)';

/**
 * Quote panel headers (To, Quote Details, …): navy blue for formal print/PDF.
 * Enquiry tables keep {@link EMS_TABLE_HEADER_GRADIENT} (brighter UI blue).
 */
export const EMS_QUOTE_PANEL_LABEL_NAV_GRADIENT =
    'linear-gradient(180deg, #3a6a9a 0%, #2f5f8f 48%, #265a82 100%)';

/** To / Quote Details panel header bar (~14% shorter vs original — padding, type, line-height). */
export const EMS_QUOTE_ACCENT_HEADER_HEIGHT_SCALE = 0.855;
export const EMS_QUOTE_ACCENT_HEADER_PADDING = `calc(7px * ${EMS_QUOTE_ACCENT_HEADER_HEIGHT_SCALE}) calc(8px * ${EMS_QUOTE_ACCENT_HEADER_HEIGHT_SCALE})`;
export const EMS_QUOTE_ACCENT_HEADER_FONT_SIZE = `calc(11.2px * 1.2 * ${EMS_QUOTE_ACCENT_HEADER_HEIGHT_SCALE})`;
export const EMS_QUOTE_ACCENT_HEADER_LINE_HEIGHT = 1.1;

/** Quote A4 cover + panel bodies: very light sky under header bars (print/on-screen). */
export const EMS_QUOTE_COVER_META_MID_BG = '#f0f9ff';

/** Clause title bar — medium navy (between panel headers and prior light clause blue). */
export const EMS_QUOTE_CLAUSE_HEADING_BG = '#356391';
export const EMS_QUOTE_CLAUSE_HEADING_TEXT_COLOR = '#ffffff';
export const EMS_QUOTE_CLAUSE_HEADING_BORDER_RADIUS = '6px';
/** Vertical scale for clause heading bar (~14% shorter vs original — padding, type, margins). */
export const EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE = 0.857375;
export const EMS_QUOTE_CLAUSE_HEADING_PADDING_Y = `calc(6px * 1.69 * 0.85 * ${EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE})`;
export const EMS_QUOTE_CLAUSE_HEADING_PADDING_X = 'calc(14px * 1.69)';
export const EMS_QUOTE_CLAUSE_HEADING_MARGIN_TOP = `calc(12px * ${EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE})`;
export const EMS_QUOTE_CLAUSE_HEADING_MARGIN_BOTTOM = `calc(6px * 0.85 * ${EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE})`;
export const EMS_QUOTE_CLAUSE_HEADING_FONT_SIZE = `calc(13px * ${EMS_QUOTE_CLAUSE_HEADING_HEIGHT_SCALE})`;
export const EMS_QUOTE_CLAUSE_HEADING_LINE_HEIGHT = 1.05;

/** Same as EMS_QUOTE_PANEL_LABEL_NAV_GRADIENT — kept for imports; quote rows use one continuous fill. */
export const EMS_QUOTE_PANEL_VALUE_NAV_GRADIENT = EMS_QUOTE_PANEL_LABEL_NAV_GRADIENT;

/** Same as EMS_QUOTE_COVER_META_MID_BG — kept for imports; label and value cells match. */
export const EMS_QUOTE_PANEL_VALUE_META_BG = EMS_QUOTE_COVER_META_MID_BG;

/** Cover header: To column max width (was ~55%; trim 5% from the right). */
export const EMS_QUOTE_HEADER_ADDRESS_COL_MAX_WIDTH = '50%';
/** Cover header: Quote Details column width (was 45%; grow 5% from the left). */
export const EMS_QUOTE_HEADER_QUOTE_COL_WIDTH = '50%';
/** Quote Details rows: fixed label width so extra panel width goes to values only. */
export const EMS_QUOTE_HEADER_QUOTE_LABEL_WIDTH = '132px';

/**
 * Reserved signatory panel height (For + signature gap + name + designation).
 * Keeps page 1 layout stable when a signatory is selected.
 */
export const EMS_QUOTE_COVER_SIGN_OFF_MIN_HEIGHT =
    'calc((12px * 1.69 * 2) + (13px * 1.58 * 2) + (13px * 1.58 * 3.15) + (13px * 1.58) + (4px + 12px * 1.45))';

/** Right-hand quote preview: trim sign-off panel 3% from the bottom (top edge unchanged). */
export const EMS_QUOTE_COVER_SIGN_OFF_PREVIEW_HEIGHT_SCALE = 0.97;
export const EMS_QUOTE_COVER_SIGN_OFF_MIN_HEIGHT_PREVIEW = `calc(${EMS_QUOTE_COVER_SIGN_OFF_MIN_HEIGHT.slice(5, -1)} * ${EMS_QUOTE_COVER_SIGN_OFF_PREVIEW_HEIGHT_SCALE})`;
export const EMS_QUOTE_COVER_SIGN_OFF_FOR_GAP_EM = 3.15;
export const EMS_QUOTE_COVER_SIGN_OFF_BODY_PAD_BOTTOM_PREVIEW = `calc(12px * 1.69 * ${EMS_QUOTE_COVER_SIGN_OFF_PREVIEW_HEIGHT_SCALE})`;

/** Reserved print footer block height (page indicator + rule + company lines). */
export const EMS_QUOTE_PRINT_FOOTER_MIN_HEIGHT = '72px';

/** Horizontal rule above company footer (was 0.5px; reduced 30%). */
export const EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH = '0.35px';

/** PDF/Puppeteer at 1× scale: thinner borders than on-screen 1px tables / 0.35px footer. */
export const EMS_QUOTE_PRINT_FOOTER_RULE_WIDTH_PDF = '0.5px';
export const EMS_QUOTE_PDF_TABLE_BORDER_WIDTH = '0.5px';

/** Clause 4 auto pricing summary table — thin borders, navy header (preview / PDF / generated HTML). */
export const EMS_QUOTE_PRICING_TABLE_BORDER_WIDTH = '0.5px';
export const EMS_QUOTE_PRICING_TABLE_BORDER_COLOR = '#cbd5e1';
export const EMS_QUOTE_PRICING_TABLE_CELL_BORDER = `${EMS_QUOTE_PRICING_TABLE_BORDER_WIDTH} solid ${EMS_QUOTE_PRICING_TABLE_BORDER_COLOR}`;
/** Visible outer frame in on-screen preview (0.5px often disappears in browsers). */
export const EMS_QUOTE_PRICING_TABLE_OUTER_BORDER = `1px solid ${EMS_QUOTE_PRICING_TABLE_BORDER_COLOR}`;
export const EMS_QUOTE_PRICING_TABLE_HEAD_CELL_BORDER = '1px solid #94a3b8';
/** Space between clause heading bar and the auto pricing table in preview. */
export const EMS_QUOTE_PRICING_TABLE_MARGIN_TOP = '12px';
export const EMS_QUOTE_PRICING_TABLE_HEADER_BG = '#1e3a5f';
export const EMS_QUOTE_PRICING_TABLE_HEADER_COLOR = '#ffffff';
export const EMS_QUOTE_PRICING_TABLE_TOTAL_BG = '#f8fafc';

/** Space below company logo row before To / Quote Details (was 20px; reduced 50%). */
export const EMS_QUOTE_LOGO_ROW_MARGIN_BOTTOM = '10px';
