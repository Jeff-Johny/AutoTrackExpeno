import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import {
    DashboardScreen,
    TransactionsScreen,
    CategoriesScreen,
    SettingsScreen,
    PendingTransactionsScreen
} from '../screens';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TabNavigator = () => (
    <Tab.Navigator
        screenOptions={({ route }) => ({
            tabBarIcon: ({ color, size }) => {
                let iconName = 'view-dashboard';
                if (route.name === 'Transactions') iconName = 'list-status';
                else if (route.name === 'Categories') iconName = 'shape-outline';
                else if (route.name === 'Settings') iconName = 'cog-outline';
                return <Icon name={iconName} size={size} color={color} />;
            },
            headerShown: false
        })}
    >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Transactions" component={TransactionsScreen} />
        <Tab.Screen name="Categories" component={CategoriesScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
);

const MainNavigator = () => {
    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Home" component={TabNavigator} />
                <Stack.Screen name="PendingTransactions" component={PendingTransactionsScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default MainNavigator;
