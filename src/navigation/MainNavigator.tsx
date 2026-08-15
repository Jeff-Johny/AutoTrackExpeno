import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import {
    DashboardScreen,
    TransactionsScreen,
    CategoriesScreen,
    SettingsScreen,
    PendingTransactionsScreen
} from '../screens';
import type { AppTheme } from '../theme/theme';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TabNavigator = ({ theme }: { theme: AppTheme }) => (
    <Tab.Navigator
        screenOptions={({ route }) => ({
            tabBarIcon: ({ color, size }) => {
                let iconName = 'view-dashboard';
                if (route.name === 'Transactions') iconName = 'list-status';
                else if (route.name === 'Categories') iconName = 'shape-outline';
                else if (route.name === 'Settings') iconName = 'cog-outline';
                return <Icon name={iconName} size={size} color={color} />;
            },
            headerShown: false,
            // The bottom tab bar doesn't read react-native-paper's theme (it's
            // a react-navigation component) — it only reacts to the
            // NavigationContainer's own `theme` prop for background color,
            // so active/inactive tint need to come from our theme explicitly
            // here too, or it stays stuck on react-navigation's light default.
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
            tabBarStyle: {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.outlineVariant,
            },
        })}
    >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Transactions" component={TransactionsScreen} />
        <Tab.Screen name="Categories" component={CategoriesScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
);

const MainNavigator = ({ isDark, theme }: { isDark: boolean; theme: AppTheme }) => {
    const base = isDark ? DarkTheme : DefaultTheme;
    const navTheme = {
        ...base,
        dark: isDark,
        colors: {
            ...base.colors,
            primary: theme.colors.primary,
            background: theme.colors.background,
            card: theme.colors.surface,
            text: theme.colors.onSurface,
            border: theme.colors.outlineVariant,
            notification: theme.custom.critical,
        },
    };

    return (
        <NavigationContainer theme={navTheme}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Home">
                    {() => <TabNavigator theme={theme} />}
                </Stack.Screen>
                <Stack.Screen name="PendingTransactions" component={PendingTransactionsScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default MainNavigator;
