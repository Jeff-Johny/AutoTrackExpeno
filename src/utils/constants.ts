export const DEFAULT_CATEGORIES = [
    'Food & Stationary',
    'Petrol + transport',
    'Household',
    'cloth + cosmetics',
    'Medical',
    'Gift + Natilekku',
    'outing',
    'Car/bike maintenance',
];

export interface Expense {
    id: string;
    amount: number;
    category: string;
    description: string;
    date: string; // ISO string
    isAutoCategorized: boolean;
    smsSender?: string;
    smsText?: string;
}

export interface CategoryBudget {
    category: string;
    maxSpend: number;
}

export interface LearnedPattern {
    id: string;
    pattern: string; // Sender or keyword
    action: 'ignore' | 'category';
    category?: string;
}
