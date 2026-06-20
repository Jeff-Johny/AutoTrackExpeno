import { create } from 'zustand';
import { Expense, CategoryBudget, LearnedPattern } from '../utils/constants';

interface AppState {
    expenses: Expense[];
    categories: CategoryBudget[];
    patterns: LearnedPattern[];
    autoTrackedSummary: any[] | null;
    unsureData: any | null;
    unsureDataQueue: any[];
    ignoredSms: any[];
    setExpenses: (expenses: Expense[]) => void;
    addExpense: (expense: Expense) => void;
    updateExpense: (id: string, expense: Partial<Expense>) => void;
    deleteExpense: (id: string) => void;
    setCategories: (categories: CategoryBudget[]) => void;
    addCategory: (category: CategoryBudget) => void;
    deleteCategory: (category: string) => void;
    setPatterns: (patterns: LearnedPattern[]) => void;
    setAutoTrackedSummary: (summary: any[] | null) => void;
    setUnsureData: (data: any | null) => void;
    setUnsureDataQueue: (queue: any[]) => void;
    removeFromUnsureQueue: (index: number) => void;
    setIgnoredSms: (ignoredSms: any[]) => void;
    syncStatus: 'idle' | 'syncing' | 'completed';
    setSyncStatus: (status: 'idle' | 'syncing' | 'completed') => void;
}
export const useStore = create<AppState>((set) => ({
    expenses: [],
    categories: [],
    patterns: [],
    autoTrackedSummary: null,
    unsureData: null,
    unsureDataQueue: [],
    ignoredSms: [],
    setExpenses: (expenses) => set({ expenses }),
    addExpense: (expense) => set((state) => ({ expenses: [expense, ...state.expenses] })),
    updateExpense: (id, updatedExpense) =>
        set((state) => ({
            expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...updatedExpense } : e)),
        })),
    deleteExpense: (id) =>
        set((state) => ({
            expenses: state.expenses.filter((e) => e.id !== id),
        })),
    setCategories: (categories) => set({ categories }),
    addCategory: (category) => set((state) => ({ categories: [...state.categories, category] })),
    deleteCategory: (categoryName) =>
        set((state) => ({
            categories: state.categories.filter((c) => c.category !== categoryName),
        })),
    setPatterns: (patterns) => set({ patterns }),
    setAutoTrackedSummary: (summary) => set({ autoTrackedSummary: summary }),
    setUnsureData: (data) => set((state) => {
        if (data === null) {
            // Dequeue the next item
            const nextData = state.unsureDataQueue.length > 0 ? state.unsureDataQueue[0] : null;
            const newQueue = state.unsureDataQueue.length > 0 ? state.unsureDataQueue.slice(1) : [];
            console.log('[Store] Dequeueing next SMS item. Remaining:', newQueue.length);
            return {
                unsureData: nextData,
                unsureDataQueue: newQueue
            };
        } else {
            console.log('[Store] Received unsureData, Current unsureData exists?', !!state.unsureData, 'Queue Size:', state.unsureDataQueue.length);
            // Enqueue new item
            if (!state.unsureData) {
                // Show immediately if nothing is currently showing
                console.log('[Store] Showing unsureData immediately.');
                return { unsureData: data, unsureDataQueue: state.unsureDataQueue };
            } else {
                // Queue for later
                console.log('[Store] Queueing new unsureData.');
                return { unsureDataQueue: [...state.unsureDataQueue, data] };
            }
        }
    }),
    setUnsureDataQueue: (queue) => set((state) => {
        if (queue.length > 0 && !state.unsureData) {
            return {
                unsureData: queue[0],
                unsureDataQueue: queue.slice(1)
            };
        }
        return { unsureDataQueue: queue };
    }),
    removeFromUnsureQueue: (index) => set((state) => {
        const newQueue = [...state.unsureDataQueue];
        newQueue.splice(index, 1);
        return { unsureDataQueue: newQueue };
    }),
    setIgnoredSms: (ignoredSms) => set({ ignoredSms }),
    deletePattern: (id: string) => set((state) => ({
        patterns: state.patterns.filter((p) => p.id !== id),
    })),
    syncStatus: 'idle',
    setSyncStatus: (status) => set({ syncStatus: status }),
}));
