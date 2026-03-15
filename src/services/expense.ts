import { dbService } from './db';
import { Expense, CategoryBudget, LearnedPattern } from '../utils/constants';
import { useStore } from '../store/useStore';
import { notificationService } from './notifications';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { ALERT_TYPE, Toast } from 'react-native-alert-notification';

export const expenseService = {
    async fetchAll() {
        const db = dbService.getDb();
        const result = db.execute('SELECT * FROM expenses ORDER BY date DESC');
        const expenses: Expense[] = [];
        const rows = result.rows?._array;
        if (rows) {
            for (let i = 0; i < rows.length; i++) {
                const item = rows[i];
                expenses.push({
                    ...item,
                    isAutoCategorized: !!item.isAutoCategorized
                });
            }
        }
        useStore.getState().setExpenses(expenses);
    },

    async addExpense(expense: Omit<Expense, 'id'>) {
        const db = dbService.getDb();
        const id = uuidv4();
        const newExpense = { ...expense, id };
        db.execute(
            'INSERT INTO expenses (id, amount, category, description, date, isAutoCategorized, smsSender, smsText) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, newExpense.amount, newExpense.category, newExpense.description, newExpense.date, newExpense.isAutoCategorized ? 1 : 0, newExpense.smsSender || '', newExpense.smsText || '']
        );
        useStore.getState().addExpense(newExpense);

        // Check budget overshoot
        const store = useStore.getState();
        const categoryBudget = store.categories.find(c => c.category === expense.category);
        if (categoryBudget && categoryBudget.maxSpend > 0) {
            const totalInCategory = store.expenses
                .filter(e => e.category === expense.category)
                .reduce((sum, e) => sum + e.amount, 0) + expense.amount;

            if (totalInCategory > categoryBudget.maxSpend) {
                notificationService.notify(
                    'Budget Alert!',
                    `You have exceeded your budget for ${expense.category}. Total: ₹${totalInCategory}`
                );
            }
        }

        return newExpense;
    },

    async updateExpense(id: string, updates: Partial<Expense>) {
        const db = dbService.getDb();
        const current = useStore.getState().expenses.find(e => e.id === id);
        if (!current) return;
        const updated = { ...current, ...updates };
        db.execute(
            'UPDATE expenses SET amount = ?, category = ?, description = ?, date = ?, isAutoCategorized = ?, smsSender = ?, smsText = ? WHERE id = ?',
            [updated.amount, updated.category, updated.description, updated.date, updated.isAutoCategorized ? 1 : 0, updated.smsSender || '', updated.smsText || '', id]
        );
        useStore.getState().updateExpense(id, updates);
    },

    async deleteExpense(id: string) {
        const db = dbService.getDb();
        db.execute('DELETE FROM expenses WHERE id = ?', [id]);
        useStore.getState().deleteExpense(id);
    },

    async fetchCategories() {
        const db = dbService.getDb();
        const result = db.execute('SELECT * FROM categories');
        const categories: CategoryBudget[] = result.rows?._array || [];
        useStore.getState().setCategories(categories);
    },

    async updateCategoryBudget(category: string, maxSpend: number) {
        const db = dbService.getDb();
        db.execute('UPDATE categories SET maxSpend = ? WHERE category = ?', [maxSpend, category]);
        await this.fetchCategories();
    },
    async addCategory(categoryName: string) {
        const db = dbService.getDb();
        db.execute('INSERT OR IGNORE INTO categories (category, maxSpend) VALUES (?, ?)', [categoryName, 0]);
        useStore.getState().addCategory({ category: categoryName, maxSpend: 0 });
    },
    async deleteCategory(categoryName: string) {
        const db = dbService.getDb();
        db.execute('DELETE FROM categories WHERE category = ?', [categoryName]);
        useStore.getState().deleteCategory(categoryName);
    }
};
