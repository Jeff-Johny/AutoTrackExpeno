import XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import { Expense } from '../utils/constants';

export const excelService = {
    async exportExpenses(expenses: Expense[]) {
        try {
            const data = expenses.map(e => ({
                Date: e.date,
                Amount: e.amount,
                Category: e.category,
                Description: e.description,
                Auto: e.isAutoCategorized ? 'Yes' : 'No',
                Sender: e.smsSender || ''
            }));

            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Expenses");

            const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            const path = `${RNFS.DownloadDirectoryPath}/expenses_${new Date().getTime()}.xlsx`;

            await RNFS.writeFile(path, wbout, 'base64');
            return path;
        } catch (error) {
            console.error('Excel Export Error:', error);
            throw error;
        }
    }
};
