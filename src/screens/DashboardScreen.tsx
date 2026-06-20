import React, { useEffect, useState } from 'react';
import { View, Dimensions, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Card, Title, Paragraph, Appbar, Badge, List, Divider } from 'react-native-paper';
import { PieChart } from 'react-native-chart-kit';
import { Calendar } from 'react-native-calendars';
import { useStore } from '../store/useStore';
import { expenseService } from '../services/expense';

const DashboardScreen = ({ navigation }: any) => {
    const expenses = useStore((state) => state.expenses);
    const categories = useStore((state) => state.categories);
    const unsureQueueCount = useStore((state) => state.unsureDataQueue.length);
    const setUnsureData = useStore((state: any) => state.setUnsureData);

    // Default to today in YYYY-MM-DD
    const [selectedDate, setSelectedDate] = useState<string>(
        new Date().toISOString().split('T')[0]
    );

    useEffect(() => {
        expenseService.fetchAll();
        expenseService.fetchCategories();
    }, []);

    const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Calculate highlighted dates based on expenses
    const markedDates = expenses.reduce((acc: any, expense) => {
        if (!expense.date) return acc;
        // The date might be an ISO string like "2023-10-17T09:30:00Z"
        const dateKey = expense.date.split('T')[0];
        acc[dateKey] = { marked: true, dotColor: '#d32f2f' }; // Red dot
        return acc;
    }, {});

    // Always keep the currently selected day highlighted visually
    markedDates[selectedDate] = {
        ...markedDates[selectedDate],
        selected: true,
        selectedColor: '#6750A4', // Primary theme color
    };

    // Filter to only expenses that occurred on the selected date
    const selectedDayExpenses = expenses.filter(
        (e) => e.date && e.date.split('T')[0] === selectedDate
    );
    
    const selectedDayTotal = selectedDayExpenses.reduce((sum, e) => sum + e.amount, 0);

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

            <ScrollView>
                <View style={{ padding: 16 }}>
                    <Card style={{ marginBottom: 20 }}>
                        <Card.Content style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <View>
                                <Title>Lifetime Spend</Title>
                                <Paragraph style={{ fontSize: 24, fontWeight: 'bold' }}>₹{totalSpend.toFixed(2)}</Paragraph>
                            </View>
                        </Card.Content>
                    </Card>

                    <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
                        <Calendar
                            current={selectedDate}
                            onDayPress={(day: any) => setSelectedDate(day.dateString)}
                            markedDates={markedDates}
                            theme={{
                                selectedDayBackgroundColor: '#6750A4',
                                todayTextColor: '#6750A4',
                                arrowColor: '#6750A4',
                                dotColor: '#d32f2f',
                                selectedDotColor: '#ffffff'
                            }}
                        />
                    </Card>

                    <Title style={{ marginTop: 8, marginBottom: 8 }}>
                        Spent on {selectedDate}: ₹{selectedDayTotal.toFixed(2)}
                    </Title>
                    
                    {selectedDayExpenses.length > 0 ? (
                        <Card style={{ marginBottom: 20 }}>
                            {selectedDayExpenses.map((expense, i) => (
                                <React.Fragment key={expense.id || i}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setUnsureData({
                                                reviewExpenseId: expense.id,
                                                smsText: expense.smsText || '',
                                                sender: expense.smsSender || '',
                                                aiResult: {
                                                    amount: expense.amount,
                                                    category: expense.category,
                                                    description: expense.description,
                                                    payee: null,
                                                    isSpending: true,
                                                    isCertain: true,
                                                },
                                            });
                                        }}
                                    >
                                        <List.Item
                                            title={`₹${expense.amount.toFixed(2)} - ${expense.category}`}
                                            description={expense.description || expense.smsText || 'Manual Entry'}
                                            left={props => <List.Icon {...props} icon="currency-inr" />}
                                            right={props => <List.Icon {...props} icon="chevron-right" />}
                                        />
                                    </TouchableOpacity>
                                    {i < selectedDayExpenses.length - 1 && <Divider />}
                                </React.Fragment>
                            ))}
                        </Card>
                    ) : (
                        <Text style={{ textAlign: 'center', marginBottom: 20, color: 'gray' }}>No spending recorded on this day.</Text>
                    )}

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
            </ScrollView>
        </View>
    );
};

export default DashboardScreen;
