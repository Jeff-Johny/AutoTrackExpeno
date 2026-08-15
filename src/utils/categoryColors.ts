import { DEFAULT_CATEGORIES } from './constants';

/**
 * Fixed 8-slot categorical palette (the "Ledger Ink" redesign) — validated
 * colorblind-safe and contrast-checked against both surface colors with the
 * dataviz skill's palette validator (adjacent-pair CVD ΔE and normal-vision
 * floor both pass in light and dark; see the redesign proposal). Order is
 * the CVD-safety mechanism, not cosmetic — don't reorder without
 * re-validating.
 */
export const CATEGORY_PALETTE_LIGHT = [
    '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
    '#e87ba4', '#008300', '#4a3aa7', '#e34948',
];
export const CATEGORY_PALETTE_DARK = [
    '#3987e5', '#d95926', '#199e70', '#c98500',
    '#d55181', '#008300', '#9085e9', '#e66767',
];

/** Stable string hash so a custom (non-default) category always lands on the same slot. */
function hashIndex(name: string, mod: number): number {
    let h = 0;
    for (let i = 0; i < name.length; i++) {
        h = (h * 31 + name.charCodeAt(i)) >>> 0;
    }
    return h % mod;
}

/**
 * Resolve a category name to a color from the given palette (pass
 * `theme.custom.categoryColors` so it's already the right light/dark set).
 * The 8 default categories get a fixed, predictable slot; any user-added
 * category not in DEFAULT_CATEGORIES falls back to a stable hash so it's
 * still consistent across renders without needing a DB migration.
 */
export function getCategoryColor(category: string, palette: string[] = CATEGORY_PALETTE_LIGHT): string {
    const fixedIndex = DEFAULT_CATEGORIES.indexOf(category);
    const index = fixedIndex >= 0 ? fixedIndex : hashIndex(category, palette.length);
    return palette[index] ?? palette[0];
}
