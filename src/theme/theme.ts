import { MD3LightTheme, configureFonts } from 'react-native-paper';

const fontConfig = {
    displayLarge: {
        fontFamily: 'System',
        fontSize: 57,
        fontWeight: '400' as const,
        letterSpacing: 0,
        lineHeight: 64,
    },
    // Add other font configurations if needed
};

export const theme = {
    ...MD3LightTheme,
    fonts: configureFonts({ config: fontConfig }),
    colors: {
        ...MD3LightTheme.colors,
        primary: '#6750A4',
        secondary: '#625b71',
        tertiary: '#7d5260',
        background: '#ffffff',
        surface: '#f3edf7',
        error: '#b3261e',
        onPrimary: '#ffffff',
        onSecondary: '#ffffff',
        onSurface: '#1c1b1f',
        outline: '#79747e',
    },
};
