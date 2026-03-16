import React, { useEffect } from 'react';
import { View, Dimensions } from 'react-native';
import { Text, Card, Title, Paragraph, Appbar, Badge } from 'react-native-paper';
import { PieChart } from 'react-native-chart-kit';
import { useStore } from '../store/useStore';
import { expenseService } from '../services/expense';

const DashboardScreen = ({ navigation }: any) => {
    const expenses = useStore((state) => state.expenses);
    const categories = useStore((state) => state.categories);
    const unsureQueueCount = useStore((state) => state.unsureDataQueue.length);

    useEffect(() => {
        expenseService.fetchAll();
        expenseService.fetchCategories();
    }, []);

    const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0);

    const chartData = categories.map((cat, index) => {
        const amount = expenses
            .filter((e) => e.category === cat.category)
            .reduce((sum, e) => sum + e.amount, 0);

        return {
            name: cat.category,
            population: amount,
            color: `rgba(103, 80, 164, ${1 - index * 0.1})`, // Dynamic shades of primary
            legendFontColor: '#7F7F7F',
            legendFontSize: 12,
        };
    }).filter(d => d.population > 0);

    return (
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
            <Appbar.Header>
                <Appbar.Content title="AutoTrackExpeno" />
                <View>
                    <Appbar.Action 
                        icon="bell-outline" 
                        onPress={() => navigation.navigate('PendingTransactions')} 
                    />
                    {unsureQueueCount > 0 && (
                        <Badge 
                            style={{ position: 'absolute', top: 4, right: 4 }} 
                            size={16}
                        >
                            {unsureQueueCount}
                        </Badge>
                    )}
                </View>
            </Appbar.Header>

            <View style={{ padding: 16 }}>
                <Card style={{ marginBottom: 20 }}>
                    <Card.Content>
                        <Title>Total Spend (Monthly)</Title>
                        <Paragraph style={{ fontSize: 24, fontWeight: 'bold' }}>₹{totalSpend.toFixed(2)}</Paragraph>
                    </Card.Content>
                </Card>

                <Title>Spend by Category</Title>
                {chartData.length > 0 ? (
                    <PieChart
                        data={chartData}
                        width={Dimensions.get('window').width - 32}
                        height={220}
                        chartConfig={{
                            color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                        }}
                        accessor={"population"}
                        backgroundColor={"transparent"}
                        paddingLeft={"15"}
                        absolute
                    />
                ) : (
                    <Text style={{ textAlign: 'center', marginTop: 20 }}>No expenses tracked yet.</Text>
                )}
            </View>
        </View>
    );
};

export default DashboardScreen;
