import React from 'react';
import { View, Alert } from 'react-native';
import { List, Divider, Title, Button } from 'react-native-paper';
import { useStore } from '../store/useStore';
import { excelService } from '../services/excel';
import { smsService } from '../services/sms';

const SettingsScreen = () => {
    const expenses = useStore(state => state.expenses);

    const handleExport = async () => {
        try {
            const path = await excelService.exportExpenses(expenses);
            Alert.alert('Export Success', `File saved to: ${path}`);
        } catch (error) {
            Alert.alert('Export Failed', 'An error occurred during export.');
        }
    };
    return (
        <View style={{ flex: 1, padding: 16 }}>
            <Title>Account</Title>
            <List.Item
                title="Backup to Google Drive"
                description="Daily backups are enabled"
                left={props => <List.Icon {...props} icon="google-drive" />}
                onPress={() => { }}
            />
            <Divider />
            <List.Item
                title="AI Categorization"
                description="Gemini API is active"
                left={props => <List.Icon {...props} icon="robot" />}
            />
            <Divider />
            <Button mode="outlined" style={{ marginTop: 20 }} onPress={handleExport}>
                Export to Excel
            </Button>

            <Divider style={{ marginVertical: 20 }} />
            <Title style={{ fontSize: 18 }}>Debug Tools</Title>
            <Button
                mode="contained-tonal"
                style={{ marginTop: 10 }}
                onPress={async () => {
                    const setUnsureData = useStore.getState().setUnsureData;
                    await smsService.testRecentSmsSync(setUnsureData);
                }}
            >
                Simulate Sync Popup
            </Button>
        </View>
    );
};

export default SettingsScreen;
