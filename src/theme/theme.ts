import { Platform } from 'react-native';
import { MD3LightTheme, MD3DarkTheme, configureFonts, useTheme as usePaperTheme } from 'react-native-paper';
import { CATEGORY_PALETTE_LIGHT, CATEGORY_PALETTE_DARK } from '../utils/categoryColors';

/**
 * "Ledger Ink" design system — see the redesign proposal validated with the
 * user before this was built out. One consistent color token set (replacing
 * the old per-screen hardcoded hex) plus a light/dark pair, and a `custom`
 * block for tokens MD3 has no built-in role for (status colors, the fixed
 * category palette, the ledger monospace).
 */

const fontConfig = {
    displayLarge: {
        fontFamily: 'System',
        fontSize: 57,
        fontWeight: '400' as const,
        letterSpacing: 0,
        lineHeight: 64,
    },
};

// react-native-calendars and react-native-chart-kit have no theme context of
// their own — screens read `theme.custom.ledgerFont` directly for tabular
// figures. Platform monospace is a reasonable default until a real bundled
// face (e.g. IBM Plex Mono, per the proposal) is added as an asset.
const ledgerFont = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

export const lightTheme = {
    ...MD3LightTheme,
    fonts: configureFonts({ config: fontConfig }),
    colors: {
        ...MD3LightTheme.colors,
        primary: '#4B3FA0',
        onPrimary: '#FFFFFF',
        primaryContainer: '#E4DFF7',
        onPrimaryContainer: '#2E2566',
        secondary: '#D98A1E',
        onSecondary: '#FFFFFF',
        secondaryContainer: '#FBEBCF',
        onSecondaryContainer: '#7A4E10',
        tertiary: '#177A4F',
        background: '#F6F3EC',
        onBackground: '#1C1A16',
        surface: '#FFFFFF',
        onSurface: '#1C1A16',
        surfaceVariant: '#EFEADF',
        onSurfaceVariant: '#6B6558',
        outline: '#B7AF9E',
        outlineVariant: '#DAD3C3',
        error: '#C23B3B',
        onError: '#FFFFFF',
        errorContainer: '#FBE3E2',
        onErrorContainer: '#7A2323',
    },
    custom: {
        ledgerFont,
        accent: '#D98A1E',
        accentTint: '#FBEBCF',
        accentInk: '#8A5A12',
        good: '#177A4F',
        goodTint: '#E1F3E8',
        warning: '#B9770E',
        warningTint: '#FBEBD3',
        critical: '#C23B3B',
        criticalTint: '#FBE3E2',
        categoryColors: CATEGORY_PALETTE_LIGHT,
        // Bottom-sheet backdrop — an ink-tinted scrim rather than flat black,
        // per the "Ledger Ink" redesign proposal's modal spec.
        scrim: 'rgba(20,16,10,0.55)',
    },
};

export const darkTheme = {
    ...MD3DarkTheme,
    fonts: configureFonts({ config: fontConfig }),
    colors: {
        ...MD3DarkTheme.colors,
        primary: '#8B7CF0',
        onPrimary: '#1E1633',
        primaryContainer: '#372C7C',
        onPrimaryContainer: '#E4DFF7',
        secondary: '#F0B24E',
        onSecondary: '#3D2705',
        secondaryContainer: '#4E3510',
        onSecondaryContainer: '#FBEBCF',
        tertiary: '#34C98C',
        background: '#15131C',
        onBackground: '#F3F0E8',
        surface: '#1E1B29',
        onSurface: '#F3F0E8',
        surfaceVariant: '#262233',
        onSurfaceVariant: '#C4BFD6',
        outline: '#4A4560',
        outlineVariant: '#332E47',
        error: '#E97272',
        onError: '#3A1010',
        errorContainer: '#4A2323',
        onErrorContainer: '#F9C9C9',
    },
    custom: {
        ledgerFont,
        accent: '#F0B24E',
        accentTint: 'rgba(240,178,78,0.16)',
        accentInk: '#F0B24E',
        good: '#34C98C',
        goodTint: 'rgba(52,201,140,0.16)',
        warning: '#E0A83E',
        warningTint: 'rgba(224,168,62,0.16)',
        critical: '#E97272',
        criticalTint: 'rgba(233,114,114,0.16)',
        categoryColors: CATEGORY_PALETTE_DARK,
        scrim: 'rgba(0,0,0,0.6)',
    },
};

export type AppTheme = typeof lightTheme;

/** Typed wrapper around Paper's useTheme() so screens get `.custom` for free. */
export const useAppTheme = () => usePaperTheme<AppTheme>();

// Kept for any straggling default-theme import; prefer useAppTheme() in components.
export const theme = lightTheme;
