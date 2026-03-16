import React, { useEffect, useState } from 'react';
import { Provider as PaperProvider, Portal, Modal, Button, Text, Title, TextInput } from 'react-native-paper';
import { View, Dimensions } from 'react-native';
import MainNavigator from './src/navigation/MainNavigator';
import { theme } from './src/theme/theme';
import { dbService } from './src/services/db';
import { smsService } from './src/services/sms';
import { patternService } from './src/services/patterns';
import { expenseService } from './src/services/expense';
import { DEFAULT_CATEGORIES } from './src/utils/constants';
import LoginScreen from './src/screens/LoginScreen';
import { notificationService } from './src/services/notifications';
import { useStore } from './src/store/useStore';

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const unsureData = useStore((state: any) => state.unsureData);
  const setUnsureData = useStore((state: any) => state.setUnsureData);
  const autoTrackedSummary = useStore((state: any) => state.autoTrackedSummary);
  const setAutoTrackedSummary = useStore((state: any) => state.setAutoTrackedSummary);
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    if (unsureData && unsureData.aiResult) {
      setSelectedCategory(unsureData.aiResult.category || '');
    }
  }, [unsureData]);

  useEffect(() => {
    const setup = async () => {
      console.log('[App] Starting app setup...');
      try {
        await dbService.init();
      } catch (e) {
        console.error('[App] Database init failed - stopping setup', e);
        return;
      }
      await patternService.fetchAll();
      await expenseService.fetchAll();
      await expenseService.fetchCategories();

      const handleUnsure = (data: any) => {
        console.log('[App] handleUnsure triggered with data:', data);
        if (data && data.aiResult) {
          setUnsureData(data);
          setSelectedCategory(data.aiResult.category || '');
        }
      };

      // Configure notifications
      notificationService.configure(async (notification) => {
        console.log('[App] Received notification:', notification);
        const data = notification.data || notification.userInfo;

        if (!data || !data.aiResult) {
          console.log('[App] Notification has no AI data');
          return;
        }

        if (notification.isAction) {
          console.log('[App] Notification ACTION triggered:', notification.action);
          if (notification.action === 'Confirm') {
            await expenseService.addExpense({
              amount: data.aiResult.amount,
              category: data.aiResult.category || 'Other',
              description: data.aiResult.description,
              date: new Date().toISOString(),
              isAutoCategorized: true,
              smsSender: data.sender,
            });
            await patternService.addPattern(data.sender, 'category', data.aiResult.category || 'Other');
            console.log('[App] Action: Expense confirmed from notification');
          } else if (notification.action === 'Ignore') {
            await patternService.addPattern(data.sender, 'ignore');
            console.log('[App] Action: Pattern ignored from notification');
          }
        } else if (notification.userInteraction) {
          console.log('[App] Received notification tap:', data);
          handleUnsure(data);
        }
      });

      // Check for notification that opened the app
      notificationService.checkInitialNotification((notification) => {
        console.log('[App] Initial notification detected');
        const data = notification.data || notification.userInfo;
        if (data && data.aiResult) {
          handleUnsure(data);
        }
      });

      console.log('[App] Requesting SMS permissions...');
      const hasPermission = await smsService.requestPermissions();
      console.log('[App] SMS Permissions granted:', hasPermission);

      if (hasPermission) {
        console.log('[App] Starting SMS listener...');
        smsService.startListening(handleUnsure);

        // Sync recent SMS to catch anything missed while app was closed
        setTimeout(() => {
          smsService.syncRecentSms(handleUnsure, (items) => {
            console.log('[App] Received auto-tracked summary with length:', items.length);
            setAutoTrackedSummary(items);
          });
        }, 5000); // Increased delay to allow native OS inbox DB to settle

        console.log('[App] SMS listener started successfully');
      } else {
        console.warn('[App] SMS permissions NOT granted - listener will not work');
      }

      console.log('[App] App setup complete, setting isInitialized to true');
      setIsInitialized(true);
    };
    setup();
  }, []);

  const handleConfirm = async () => {
    console.log('[App] handleConfirm called');
    if (!unsureData) {
      console.warn('[App] No unsureData available');
      return;
    }

    console.log('[App] Adding expense:', selectedCategory, unsureData.aiResult.amount);
    await expenseService.addExpense({
      amount: unsureData.aiResult.amount,
      category: selectedCategory,
      description: unsureData.aiResult.description,
      date: new Date().toISOString(),
      isAutoCategorized: true,
      smsSender: unsureData.sender,
      smsText: unsureData.smsText,
      externalSmsId: unsureData.externalSmsId,
    });

    // Learn this pattern
    console.log('[App] Learning pattern for sender:', unsureData.sender);
    await patternService.addPattern(unsureData.sender, 'category', selectedCategory);

    console.log('[App] Expense confirmed, closing popup');
    setUnsureData(null);
  };

  const handleIgnore = async () => {
    console.log('[App] handleIgnore called');
    if (!unsureData) {
      console.warn('[App] No unsureData available');
      return;
    }
    console.log('[App] Adding ignore pattern for sender:', unsureData.sender);
    await patternService.addPattern(unsureData.sender, 'ignore');
    console.log('[App] Pattern ignored, closing popup');
    setUnsureData(null);
  };

  if (!isInitialized) {
    return null; // Wait for setup to finish
  }

  if (!isLoggedIn) {
    return (
      <PaperProvider theme={theme}>
        <LoginScreen onLogin={() => setIsLoggedIn(true)} />
      </PaperProvider>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <MainNavigator />

      <Portal>
        <Modal
          visible={!!unsureData}
          onDismiss={() => setUnsureData(null)}
          contentContainerStyle={{ padding: 25, backgroundColor: 'white', margin: 20, borderRadius: 10 }}
        >
          <Title>Confirm Expense</Title>
          <Text style={{ marginBottom: 10 }}>{unsureData?.smsText}</Text>
          <Text style={{ fontWeight: 'bold' }}>Detected Amount: ₹{unsureData?.aiResult.amount}</Text>

          <Title style={{ fontSize: 16, marginTop: 10 }}>Select Category</Title>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
            {DEFAULT_CATEGORIES.map(cat => (
              <Button
                key={cat}
                mode={selectedCategory === cat ? 'contained' : 'outlined'}
                onPress={() => setSelectedCategory(cat)}
                style={{ margin: 2 }}
                labelStyle={{ fontSize: 10 }}
              >
                {cat}
              </Button>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <Button onPress={handleIgnore} textColor="grey">Ignore Pattern</Button>
            <Button mode="contained" onPress={handleConfirm}>Confirm Spend</Button>
          </View>
        </Modal>

        <Modal
          visible={!!autoTrackedSummary}
          onDismiss={() => setAutoTrackedSummary(null)}
          contentContainerStyle={{ padding: 25, backgroundColor: 'white', margin: 20, borderRadius: 10, maxHeight: Dimensions.get('window').height * 0.8 }}
        >
          <Title>Auto-Tracked Summary</Title>
          <Text style={{ marginBottom: 15, color: '#666' }}>
            While you were away, {autoTrackedSummary?.length} expenses were automatically categorized based on your learned patterns.
          </Text>
         <View style={{ marginBottom: 20 }}>
            {autoTrackedSummary?.map((item: any, index: number) => (
              <View key={index} style={{ marginBottom: 10, paddingBottom: 10, borderBottomWidth: index === autoTrackedSummary.length - 1 ? 0 : 1, borderBottomColor: '#eee' }}>
                <Text style={{ fontWeight: 'bold' }}>₹{item.aiResult.amount} - {item.categoryAssigned}</Text>
                <Text numberOfLines={1} style={{ color: '#666' }}>{item.smsText}</Text>
              </View>
            ))}
          </View>
          <Button mode="contained" onPress={() => setAutoTrackedSummary(null)}>Dismiss</Button>
        </Modal>
      </Portal>
    </PaperProvider>
  );
};

export default App;
