import React, { useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Title, TextInput, Button, IconButton, Card, Appbar, Text, Portal, Dialog, FAB } from 'react-native-paper';
import { useStore } from '../store/useStore';
import { expenseService } from '../services/expense';
import { useAppTheme } from '../theme/theme';
import { getCategoryColor } from '../utils/categoryColors';
import { CategoryBudget } from '../utils/constants';

const CategoriesScreen = () => {
    const theme = useAppTheme();
    const categories = useStore((state) => state.categories);
    const expenses = useStore((state) => state.expenses);
    const [addVisible, setAddVisible] = useState(false);
    const [newCategory, setNewCategory] = useState('');
    const [newCategoryLimit, setNewCategoryLimit] = useState('');
    const [budgetEditItem, setBudgetEditItem] = useState<CategoryBudget | null>(null);
    const [budgetInput, setBudgetInput] = useState('');

    const openAddCategory = () => {
        setNewCategory('');
        setNewCategoryLimit('');
        setAddVisible(true);
    };

    const handleAddCategory = async () => {
        const name = newCategory.trim();
        if (!name) return;
        await expenseService.addCategory(name);
        const limit = parseFloat(newCategoryLimit);
        if (!isNaN(limit) && limit > 0) {
            await expenseService.updateCategoryBudget(name, limit);
        }
        setAddVisible(false);
        setNewCategory('');
        setNewCategoryLimit('');
    };

    const handleDeleteCategory = async (categoryName: string) => {
        await expenseService.deleteCategory(categoryName);
    };

    const openBudgetEditor = (item: CategoryBudget) => {
        setBudgetEditItem(item);
        setBudgetInput(item.maxSpend > 0 ? item.maxSpend.toString() : '');
    };

    const saveBudget = async () => {
        if (!budgetEditItem) return;
        const value = parseFloat(budgetInput);
        await expenseService.updateCategoryBudget(budgetEditItem.category, isNaN(value) ? 0 : value);
        setBudgetEditItem(null);
        setBudgetInput('');
    };

    const removeBudget = async () => {
        if (!budgetEditItem) return;
        await expenseService.updateCategoryBudget(budgetEditItem.category, 0);
        setBudgetEditItem(null);
        setBudgetInput('');
    };

    // This-month spend per category, for the budget bars below — same
    // month-scoping logic as DashboardScreen's chartData.
    const now = new Date();
    const spendThisMonth = (categoryName: string) =>
        expenses
            .filter((e) => {
                if (e.category !== categoryName || !e.date) return false;
                const d = new Date(e.date);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            })
            .reduce((sum, e) => sum + e.amount, 0);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
                <Appbar.Content title="Categories" titleStyle={{ color: theme.colors.onSurface }} />
            </Appbar.Header>

            <View style={styles.inner}>
            <Title style={[styles.listTitle, { color: theme.colors.onBackground }]}>All Categories</Title>
            <FlatList
                data={categories}
                keyExtractor={(item) => item.category}
                renderItem={({ item }) => {
                    const catColor = getCategoryColor(item.category, theme.custom.categoryColors);
                    const spent = spendThisMonth(item.category);
                    const hasBudget = item.maxSpend > 0;
                    const pct = hasBudget ? (spent / item.maxSpend) * 100 : 0;
                    const status = pct > 100 ? 'critical' : pct > 90 ? 'warning' : 'good';
                    const statusColor = theme.custom[status];

                    return (
                        <Card style={styles.categoryCard}>
                            <Card.Content style={styles.categoryContent}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: catColor, marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Title style={[styles.categoryName, { color: theme.colors.onSurface }]}>{item.category}</Title>
                                        {hasBudget ? (
                                            <TouchableOpacity onPress={() => openBudgetEditor(item)}>
                                                <View style={styles.budgetRow}>
                                                    <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>
                                                        {pct > 100
                                                            ? <Text style={{ color: statusColor, fontWeight: '700' }}>over by ₹{(spent - item.maxSpend).toFixed(0)}</Text>
                                                            : `₹${item.maxSpend.toFixed(0)} monthly limit`}
                                                    </Text>
                                                    <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>{Math.max(0, Math.min(pct, 999)).toFixed(0)}%</Text>
                                                </View>
                                                <View style={[styles.budgetBar, { backgroundColor: theme.colors.surfaceVariant }]}>
                                                    <View style={{ height: '100%', borderRadius: 99, width: `${Math.max(0, Math.min(pct, 100))}%`, backgroundColor: statusColor }} />
                                                </View>
                                            </TouchableOpacity>
                                        ) : (
                                            <TouchableOpacity onPress={() => openBudgetEditor(item)}>
                                                <Text style={{ fontSize: 11, color: theme.colors.primary, marginTop: 2 }}>Set monthly limit</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                                <IconButton
                                    icon="delete"
                                    iconColor={theme.custom.critical}
                                    size={24}
                                    onPress={() => handleDeleteCategory(item.category)}
                                />
                            </Card.Content>
                        </Card>
                    );
                }}
                contentContainerStyle={styles.listContainer}
            />
            </View>

            <FAB
                style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                icon="plus"
                color={theme.colors.onPrimary}
                onPress={openAddCategory}
            />

            <Portal>
                <Dialog visible={addVisible} onDismiss={() => setAddVisible(false)}>
                    <Dialog.Title>Add Category</Dialog.Title>
                    <Dialog.Content>
                        <TextInput
                            label="Category Name"
                            value={newCategory}
                            onChangeText={setNewCategory}
                            mode="outlined"
                            style={{ marginBottom: 12 }}
                            autoFocus
                        />
                        <TextInput
                            label="Monthly limit (₹) — optional"
                            value={newCategoryLimit}
                            onChangeText={setNewCategoryLimit}
                            keyboardType="numeric"
                            mode="outlined"
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setAddVisible(false)}>Cancel</Button>
                        <Button onPress={handleAddCategory} disabled={!newCategory.trim()}>Add</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            <Portal>
                <Dialog visible={!!budgetEditItem} onDismiss={() => setBudgetEditItem(null)}>
                    <Dialog.Title>{budgetEditItem?.category}</Dialog.Title>
                    <Dialog.Content>
                        <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12, fontSize: 13 }}>
                            Set a monthly spend limit — the Dashboard shows how much of it you've used so far this month.
                        </Text>
                        <TextInput
                            label="Monthly limit (₹)"
                            value={budgetInput}
                            onChangeText={setBudgetInput}
                            keyboardType="numeric"
                            mode="outlined"
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        {budgetEditItem && budgetEditItem.maxSpend > 0 && (
                            <Button onPress={removeBudget} textColor={theme.custom.critical}>Remove limit</Button>
                        )}
                        <Button onPress={() => setBudgetEditItem(null)}>Cancel</Button>
                        <Button onPress={saveBudget}>Save</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    inner: {
        flex: 1,
        padding: 16,
    },
    listTitle: {
        marginBottom: 12,
        fontSize: 20,
        fontWeight: 'bold',
    },
    listContainer: {
        paddingBottom: 20,
    },
    categoryCard: {
        marginBottom: 8,
        elevation: 2,
        borderRadius: 8,
    },
    categoryContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    categoryName: {
        fontSize: 16,
    },
    budgetRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 2,
        marginRight: 8,
    },
    budgetBar: {
        height: 4,
        borderRadius: 99,
        overflow: 'hidden',
        marginTop: 4,
        marginRight: 8,
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});

export default CategoriesScreen;
