import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import {
    DashboardScreen,
    TransactionsScreen,
    CategoriesScreen,
    SettingsScreen
} from '../screens';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const Tab = createBottomTabNavigator();

const MainNavigator = () => {
    return (
        <NavigationContainer>
            <Tab.Navigator
                screenOptions={({ route }) => ({
                    tabBarIcon: ({ color, size }) => {
                        let iconName = 'view-dashboard';
                        if (route.name === 'Transactions') iconName = 'list-status';
                        else if (route.name === 'Categories') iconName = 'shape-outline';
                        else if (route.name === 'Settings') iconName = 'cog-outline';
                        return <Icon name={iconName} size={size} color={color} />;
                    },
                })}
            >
                <Tab.Screen name="Dashboard" component={DashboardScreen} />
                <Tab.Screen name="Transactions" component={TransactionsScreen} />
                <Tab.Screen name="Categories" component={CategoriesScreen} />
                <Tab.Screen name="Settings" component={SettingsScreen} />
            </Tab.Navigator>
        </NavigationContainer>
    );
};

export default MainNavigator;
