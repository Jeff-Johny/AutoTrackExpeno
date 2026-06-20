import React, { useEffect, useState } from 'react';
import { Provider as PaperProvider, Portal, Modal, Button, Text, Title, TextInput, ProgressBar, Snackbar } from 'react-native-paper';
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
  const syncStatus = useStore((state: any) => state.syncStatus);
  const setSyncStatus = useStore((state: any) => state.setSyncStatus);
  const categories = useStore((state: any) => state.categories);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [inputAmount, setInputAmount] = useState('');

  useEffect(() => {
    if (unsureData && unsureData.aiResult) {
      // Prefer suggestedCategory from learned pattern, fallback to AI suggestion
      setSelectedCategory(unsureData.suggestedCategory || unsureData.aiResult.category || '');
      setInputAmount(unsureData.aiResult.amount ? unsureData.aiResult.amount.toString() : '');
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

      // Load pending SMS transactions from SQLite on launch
      const pendingSms = await dbService.getPendingSmsTransactions();
      const formattedPending = pendingSms.map((sms: any) => ({
        smsText: sms.sms_text,
        sender: sms.sender,
        externalSmsId: sms.sms_id,
        date: sms.date,
        aiResult: {
          amount: sms.amount,
          category: sms.category,
          description: sms.description,
          payee: sms.payee,
          isSpending: !!sms.is_spending,
          isCertain: false,
        }
      }));
      useStore.getState().setUnsureDataQueue(formattedPending);
      await smsService.fetchIgnoredSms();

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
            if (data.aiResult.payee) {
              await patternService.addPattern(data.aiResult.payee, 'category', data.aiResult.category || 'Other');
            }
            console.log('[App] Action: Expense confirmed from notification');
          } else if (notification.action === 'Ignore') {
            if (data.aiResult.payee) {
              await patternService.addPattern(data.aiResult.payee, 'ignore');
            }
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
        }, 1000); // Reduced delay from 5s to 1s

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

    const finalAmount = parseFloat(inputAmount) || 0;

    if (unsureData.reviewExpenseId) {
      // Reviewing an already-saved expense: update both category and amount
      console.log('[App] Updating expense category and amount:', selectedCategory, finalAmount);
      await expenseService.updateExpense(unsureData.reviewExpenseId, { 
        category: selectedCategory,
        amount: finalAmount
      });
    } else {
      // New SMS or unignore-pattern flow: add a fresh expense
      if (unsureData.unignorePatternId) {
        // Delete the ignore pattern so future transactions from this payee show up again
        console.log('[App] Removing ignore pattern:', unsureData.unignorePatternId);
        await patternService.deletePattern(unsureData.unignorePatternId);
      }

      if (finalAmount > 0) {
        console.log('[App] Adding expense:', selectedCategory, finalAmount);
        await expenseService.addExpense({
          amount: finalAmount,
          category: selectedCategory,
          description: unsureData.aiResult.description || '',
          date: unsureData.date ? new Date(unsureData.date).toISOString() : new Date().toISOString(),
          isAutoCategorized: true,
          smsSender: unsureData.sender,
          smsText: unsureData.smsText,
          externalSmsId: unsureData.externalSmsId,
        });
      }

      if (unsureData.externalSmsId) {
        await dbService.updateSmsTransactionStatus(unsureData.externalSmsId, 'confirmed');
        await smsService.fetchIgnoredSms();
      }

      // Learn this pattern
      const payee = unsureData.aiResult.payee;
      if (payee) {
        console.log('[App] Learning pattern for payee:', payee);
        await patternService.addPattern(payee, 'category', selectedCategory);
      }
    }

    console.log('[App] Confirm done, closing popup');
    setUnsureData(null);
  };

  const handleIgnore = async () => {
    console.log('[App] handleIgnore called');
    if (!unsureData) {
      console.warn('[App] No unsureData available');
      return;
    }
    const payee = unsureData.aiResult.payee;
    if (payee) {
      console.log('[App] Adding ignore pattern for payee:', payee);
      await patternService.addPattern(payee, 'ignore');
    }
    
    if (unsureData.externalSmsId) {
      await dbService.updateSmsTransactionStatus(unsureData.externalSmsId, 'user_ignored');
      await smsService.fetchIgnoredSms();
    }
    
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
      {syncStatus === 'syncing' && (
        <ProgressBar indeterminate color={theme.colors.primary} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, height: 4 }} />
      )}
      <MainNavigator />

      <Portal>
        <Modal
          visible={!!unsureData}
          onDismiss={() => setUnsureData(null)}
          contentContainerStyle={{ padding: 25, backgroundColor: 'white', margin: 20, borderRadius: 10 }}
        >
          <Title>
            {unsureData?.reviewExpenseId
              ? 'Edit Expense'
              : unsureData?.unignorePatternId
              ? 'Unignore & Categorize'
              : 'Confirm Expense'}
          </Title>
          {unsureData?.smsText ? (
            <Text style={{ marginBottom: 10 }}>{unsureData.smsText}</Text>
          ) : null}
          {!unsureData?.reviewExpenseId && (
            <Text style={{ color: 'gray', marginBottom: 5 }}>
              {unsureData?.date ? new Date(unsureData.date).toLocaleString() : 'Date Unknown'}
            </Text>
          )}
          <TextInput
            label="Amount (₹)"
            value={inputAmount}
            onChangeText={setInputAmount}
            keyboardType="numeric"
            mode="outlined"
            style={{ marginBottom: 10, marginTop: 5 }}
          />
          {unsureData?.aiResult?.payee ? (
            <Text style={{ color: '#555', marginBottom: 4 }}>Payee: {unsureData.aiResult.payee}</Text>
          ) : null}

          <Title style={{ fontSize: 16, marginTop: 10 }}>Select Category</Title>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
            {categories.map((cat: any) => (
              <Button
                key={cat.category}
                mode={selectedCategory === cat.category ? 'contained' : 'outlined'}
                onPress={() => setSelectedCategory(cat.category)}
                style={{ margin: 2 }}
                labelStyle={{ fontSize: 10 }}
              >
                {cat.category}
              </Button>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            {!unsureData?.reviewExpenseId && !unsureData?.unignorePatternId && (
              <Button onPress={handleIgnore} textColor="grey">Ignore Pattern</Button>
            )}
            {(unsureData?.reviewExpenseId || unsureData?.unignorePatternId) && (
              <Button onPress={() => setUnsureData(null)} textColor="grey">Cancel</Button>
            )}
            <Button mode="contained" onPress={handleConfirm}>
              {unsureData?.reviewExpenseId ? 'Update' : 'Confirm Spend'}
            </Button>
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

        <Snackbar
          visible={syncStatus === 'syncing'}
          onDismiss={() => {}}
          duration={Infinity}
          style={{ backgroundColor: '#333' }}
        >
          Syncing recent transactions...
        </Snackbar>

        <Snackbar
          visible={syncStatus === 'completed'}
          onDismiss={() => setSyncStatus('idle')}
          duration={3000}
          action={{
            label: 'OK',
            onPress: () => setSyncStatus('idle'),
          }}
        >
          Sync Completed
        </Snackbar>
      </Portal>
    </PaperProvider>
  );
};

export default App;
