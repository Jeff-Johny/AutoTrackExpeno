import { dbService } from './db';
import { LearnedPattern } from '../utils/constants';
import { useStore } from '../store/useStore';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export const patternService = {
    async fetchAll() {
        const db = dbService.getDb();
        const result = db.execute('SELECT * FROM learned_patterns');
        const patterns: LearnedPattern[] = result.rows?._array || [];
        useStore.getState().setPatterns(patterns);
    },

    async addPattern(pattern: string, action: 'ignore' | 'category', category?: string) {
        const db = dbService.getDb();
        const id = uuidv4();
        db.execute(
            'INSERT INTO learned_patterns (id, pattern, action, category) VALUES (?, ?, ?, ?)',
            [id, pattern, action, category || '']
        );
        await this.fetchAll();
    },

    async deletePattern(id: string) {
        const db = dbService.getDb();
        db.execute('DELETE FROM learned_patterns WHERE id = ?', [id]);
        useStore.getState().deletePattern(id);
    },

    async checkPattern(smsText: string, sender: string) {
        const patterns = useStore.getState().patterns;
        // Check for keyword (payee/merchant) matches in text (excluding empty pattern strings)
        const match = patterns.find(p => p.pattern && smsText.toLowerCase().includes(p.pattern.toLowerCase()));
        return match;
    }
};
