import React, { useEffect, useState } from 'react';
import { View, Dimensions, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Card, Title, Paragraph, Appbar, Badge, List, Divider } from 'react-native-paper';
import { PieChart } from 'react-native-chart-kit';
import { Calendar } from 'react-native-calendars';
import { useStore } from '../store/useStore';
import { expenseService } from '../services/expense';
import { useAppTheme } from '../theme/theme';
import { getCategoryColor } from '../utils/categoryColors';

const DashboardScreen = ({ navigation }: any) => {
    const theme = useAppTheme();
    const expenses = useStore((state) => state.expenses);
    const categories = useStore((state) => state.categories);
    const unsureQueueCount = useStore((state) => state.unsureDataQueue.length);
    const setUnsureData = useStore((state: any) => state.setUnsureData);

    // Default to today in YYYY-MM-DD
    const [selectedDate, setSelectedDate] = useState<string>(
        new Date().toISOString().split('T')[0]
    );
    const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

    useEffect(() => {
        expenseService.fetchAll();
        expenseService.fetchCategories();
    }, []);

    // Calculate monthly spend for selected month
    const selectedMonthNum = selectedMonth.getMonth();
    const selectedYear = selectedMonth.getFullYear();

    const monthlySpend = expenses.reduce((sum, e) => {
        if (!e.date) return sum;
        const expenseDate = new Date(e.date);
        if (expenseDate.getMonth() === selectedMonthNum && expenseDate.getFullYear() === selectedYear) {
            return sum + e.amount;
        }
        return sum;
    }, 0);

    const monthName = selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Format date as YYYY-MM-DD without timezone conversion
    const formatDateLocal = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const calendarCurrentDate = formatDateLocal(new Date(selectedYear, selectedMonthNum, 1));

    const handlePrevMonth = () => {
        const newMonth = new Date(selectedMonth);
        newMonth.setMonth(newMonth.getMonth() - 1);
        setSelectedMonth(newMonth);
        const firstDay = new Date(newMonth.getFullYear(), newMonth.getMonth(), 1);
        setSelectedDate(formatDateLocal(firstDay));
    };

    const handleNextMonth = () => {
        const newMonth = new Date(selectedMonth);
        newMonth.setMonth(newMonth.getMonth() + 1);
        setSelectedMonth(newMonth);
        const firstDay = new Date(newMonth.getFullYear(), newMonth.getMonth(), 1);
        setSelectedDate(formatDateLocal(firstDay));
    };

    // Calculate highlighted dates based on expenses in the selected month
    const markedDates = expenses.reduce((acc: any, expense) => {
        if (!expense.date) return acc;
        const expenseDate = new Date(expense.date);
        if (expenseDate.getMonth() === selectedMonthNum && expenseDate.getFullYear() === selectedYear) {
            const dateKey = expense.date.split('T')[0];
            acc[dateKey] = { marked: true, dotColor: theme.colors.primary };
        }
        return acc;
    }, {});

    // Always keep the currently selected day highlighted visually
    markedDates[selectedDate] = {
        ...markedDates[selectedDate],
        selected: true,
        selectedColor: theme.colors.primary,
    };

    // Filter to only expenses that occurred on the selected date
    const selectedDayExpenses = expenses.filter(
        (e) => e.date && e.date.split('T')[0] === selectedDate
    );
    
    const selectedDayTotal = selectedDayExpenses.reduce((sum, e) => sum + e.amount, 0);

    const chartData = categories.map((cat) => {
        const amount = expenses
            .filter((e) => {
                if (e.category !== cat.category) return false;
                if (!e.date) return false;
                const expenseDate = new Date(e.date);
                return expenseDate.getMonth() === selectedMonthNum && expenseDate.getFullYear() === selectedYear;
            })
            .reduce((sum, e) => sum + e.amount, 0);

        return {
            name: cat.category,
            // PieChart is rendered with `absolute`, which prints this value
            // as-is in the legend — round it so it reads "₹4,820" rather
            // than a raw floating-point sum like "4820.499999999996".
            population: Math.round(amount),
            color: getCategoryColor(cat.category, theme.custom.categoryColors),
            legendFontColor: theme.colors.onSurfaceVariant,
            legendFontSize: 12,
        };
    }).filter(d => d.population > 0);

    // Monthly budget usage — only categories with a limit set (maxSpend > 0,
    // configured from the Categories screen), sorted so the ones closest to
    // (or over) their limit surface first.
    const budgetData = categories
        .filter((cat) => cat.maxSpend > 0)
        .map((cat) => {
            const spent = expenses
                .filter((e) => {
                    if (e.category !== cat.category || !e.date) return false;
                    const expenseDate = new Date(e.date);
                    return expenseDate.getMonth() === selectedMonthNum && expenseDate.getFullYear() === selectedYear;
                })
                .reduce((sum, e) => sum + e.amount, 0);
            const pct = (spent / cat.maxSpend) * 100;
            const status: 'good' | 'warning' | 'critical' = pct > 100 ? 'critical' : pct > 90 ? 'warning' : 'good';
            return {
                category: cat.category,
                spent,
                maxSpend: cat.maxSpend,
                pct,
                status,
                color: getCategoryColor(cat.category, theme.custom.categoryColors),
            };
        })
        .sort((a, b) => b.pct - a.pct);

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
                <Appbar.Content title="TapTrack" titleStyle={{ color: theme.colors.onSurface }} />
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
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <TouchableOpacity onPress={handlePrevMonth}>
                            <Text style={{ fontSize: 18, color: theme.colors.primary }}>← Prev</Text>
                        </TouchableOpacity>
                        <Card style={{ flex: 1, marginHorizontal: 12 }}>
                            <Card.Content style={{ alignItems: 'center' }}>
                                <Title style={{ color: theme.colors.onSurfaceVariant }}>{monthName}</Title>
                                <Paragraph style={{ fontSize: 28, fontWeight: 'bold', fontFamily: theme.custom.ledgerFont, color: theme.colors.onSurface }}>
                                    ₹{monthlySpend.toFixed(2)}
                                </Paragraph>
                            </Card.Content>
                        </Card>
                        <TouchableOpacity onPress={handleNextMonth}>
                            <Text style={{ fontSize: 18, color: theme.colors.primary }}>Next →</Text>
                        </TouchableOpacity>
                    </View>

                    <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
                        <Calendar
                            key={`calendar-${selectedYear}-${selectedMonthNum}-${theme.dark}`}
                            current={calendarCurrentDate}
                            onDayPress={(day: any) => setSelectedDate(day.dateString)}
                            markedDates={markedDates}
                            enableSwipeMonths={false}
                            hideArrows={true}
                            // The month/year title is already shown above in the
                            // summary card (`monthName`) — render nothing for the
                            // calendar's own header instead of just recoloring it,
                            // so no title row (and no reserved space for one) shows
                            // above the day grid.
                            renderHeader={() => null}
                            theme={{
                                calendarBackground: theme.colors.surface,
                                dayTextColor: theme.colors.onSurface,
                                textDisabledColor: theme.colors.outlineVariant,
                                selectedDayBackgroundColor: theme.colors.primary,
                                selectedDayTextColor: theme.colors.onPrimary,
                                todayTextColor: theme.colors.primary,
                                arrowColor: 'transparent',
                                // 'transparent' isn't reliably honored here (same
                                // issue we hit with monthTextColor) — give the
                                // Sun/Mon/... weekday row a real theme-aware color
                                // instead of a color value that silently falls back
                                // and stays dark/unreadable in dark mode.
                                textSectionTitleColor: theme.colors.onSurfaceVariant,
                                dotColor: theme.colors.primary,
                                selectedDotColor: theme.colors.onPrimary,
                            }}
                        />
                    </Card>

                    <Title style={{ marginTop: 8, marginBottom: 8, color: theme.colors.onBackground }}>
                        Spent on {selectedDate}: <Text style={{ fontFamily: theme.custom.ledgerFont }}>₹{selectedDayTotal.toFixed(2)}</Text>
                    </Title>

                    {selectedDayExpenses.length > 0 ? (
                        <Card style={{ marginBottom: 20 }}>
                            <Card.Content style={{ paddingVertical: 4 }}>
                                {selectedDayExpenses.map((expense, i) => {
                                    const catColor = getCategoryColor(expense.category, theme.custom.categoryColors);
                                    return (
                                        <React.Fragment key={expense.id || i}>
                                            <TouchableOpacity
                                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
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
                                                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: catColor, marginRight: 12 }} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.onSurface }}>{expense.category}</Text>
                                                    <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                                                        {expense.description || expense.smsText || 'Manual Entry'}
                                                    </Text>
                                                </View>
                                                <Text style={{ fontFamily: theme.custom.ledgerFont, fontWeight: '600', fontSize: 13, color: theme.colors.onSurface, marginRight: 6 }}>
                                                    ₹{expense.amount.toFixed(2)}
                                                </Text>
                                                <List.Icon icon="chevron-right" color={theme.colors.outline} style={{ margin: 0 }} />
                                            </TouchableOpacity>
                                            {i < selectedDayExpenses.length - 1 && <Divider />}
                                        </React.Fragment>
                                    );
                                })}
                            </Card.Content>
                        </Card>
                    ) : (
                        <Text style={{ textAlign: 'center', marginBottom: 20, color: theme.colors.onSurfaceVariant }}>No spending recorded on this day.</Text>
                    )}

                    {budgetData.length > 0 && (
                        <>
                            <Title style={{ color: theme.colors.onBackground, marginBottom: 8 }}>Monthly Budgets</Title>
                            <Card style={{ marginBottom: 20 }}>
                                <Card.Content>
                                    {budgetData.map((b, i) => {
                                        const statusColor = theme.custom[b.status];
                                        return (
                                            <View key={b.category} style={{ marginTop: i === 0 ? 0 : 14 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: b.color, marginRight: 8 }} />
                                                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: theme.colors.onSurface }} numberOfLines={1}>
                                                        {b.category}
                                                    </Text>
                                                    <Text style={{ fontFamily: theme.custom.ledgerFont, fontSize: 12, color: theme.colors.onSurfaceVariant }}>
                                                        ₹{b.spent.toFixed(0)} / ₹{b.maxSpend.toFixed(0)}
                                                    </Text>
                                                    <Text style={{ fontFamily: theme.custom.ledgerFont, fontSize: 12, fontWeight: '700', color: statusColor, marginLeft: 8, minWidth: 36, textAlign: 'right' }}>
                                                        {Math.min(b.pct, 999).toFixed(0)}%
                                                    </Text>
                                                </View>
                                                <View style={{ height: 6, borderRadius: 99, backgroundColor: theme.colors.surfaceVariant, overflow: 'hidden' }}>
                                                    <View style={{ height: '100%', borderRadius: 99, width: `${Math.min(b.pct, 100)}%`, backgroundColor: statusColor }} />
                                                </View>
                                                {b.pct > 100 && (
                                                    <Text style={{ fontSize: 10.5, color: statusColor, marginTop: 3 }}>
                                                        Over by ₹{(b.spent - b.maxSpend).toFixed(0)}
                                                    </Text>
                                                )}
                                            </View>
                                        );
                                    })}
                                </Card.Content>
                            </Card>
                        </>
                    )}

                <Title style={{ color: theme.colors.onBackground }}>Spend by Category</Title>
                {chartData.length > 0 ? (
                    <PieChart
                        data={chartData}
                        width={Dimensions.get('window').width - 32}
                        height={220}
                        chartConfig={{
                            color: (opacity = 1) => theme.dark ? `rgba(243, 240, 232, ${opacity})` : `rgba(28, 26, 22, ${opacity})`,
                        }}
                        accessor={"population"}
                        backgroundColor={"transparent"}
                        paddingLeft={"15"}
                        absolute
                    />
                ) : (
                    <Text style={{ textAlign: 'center', marginTop: 20, color: theme.colors.onSurfaceVariant }}>No expenses tracked yet.</Text>
                )}
            </View>
            </ScrollView>
        </View>
    );
};

export default DashboardScreen;
