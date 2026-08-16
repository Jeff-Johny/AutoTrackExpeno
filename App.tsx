import React, { useEffect, useState } from 'react';
import { Provider as PaperProvider, Portal, Button, Text, Title, TextInput, ProgressBar, Snackbar, Chip } from 'react-native-paper';
import { View, LogBox, useColorScheme, TouchableOpacity } from 'react-native';
import BottomSheet from './src/components/BottomSheet';

// Suppress React 19 strict Fragment prop warning from react-native-screens internals.
// This is a known incompatibility (react-native-screens <= 4.19) and does NOT affect functionality.
LogBox.ignoreLogs([
  "Invalid prop `index` supplied to `React.Fragment`",
  "Invalid prop `%s` supplied to `React.Fragment`",
]);
import MainNavigator from './src/navigation/MainNavigator';
import { lightTheme, darkTheme } from './src/theme/theme';
import { getCategoryColor } from './src/utils/categoryColors';
import { dbService } from './src/services/db';
import { smsService } from './src/services/sms';
import { patternService } from './src/services/patterns';
import { expenseService } from './src/services/expense';
import { DEFAULT_CATEGORIES } from './src/utils/constants';
import LoginScreen from './src/screens/LoginScreen';
import { notificationService } from './src/services/notifications';
import { useStore } from './src/store/useStore';

const formatFriendlyDate = (dateValue: string | number) => {
  if (!dateValue) return 'Date Unknown';
  
  let parsed = dateValue;
  if (typeof dateValue === 'string' && /^\d+$/.test(dateValue)) {
    parsed = parseInt(dateValue, 10);
  }
  
  const date = new Date(parsed);
  if (isNaN(date.getTime())) return 'Date Unknown';

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.getDate() === today.getDate() &&
                  date.getMonth() === today.getMonth() &&
                  date.getFullYear() === today.getFullYear();
                  
  const isYesterday = date.getDate() === yesterday.getDate() &&
                      date.getMonth() === yesterday.getMonth() &&
                      date.getFullYear() === yesterday.getFullYear();

  try {
    if (isToday) {
      return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (isYesterday) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return 'Date Unknown';
  }
};

const App = () => {
  const scheme = useColorScheme();
  const themePreference = useStore((state) => state.themePreference);
  // 'system' follows the OS; 'light'/'dark' is a manual override that wins
  // regardless of the OS setting (set from Settings, persisted in the DB).
  const isDark = themePreference === 'system' ? scheme === 'dark' : themePreference === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
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
  // Refunds/reversed purchases/settled insurance claims — anything that puts
  // money back — are tracked as a negative amount so they net out of every
  // total automatically. The numeric input always shows a plain positive
  // magnitude (numeric keyboards can't type "-" anyway); this toggle is the
  // sign, seeded from whichever the SMS classifier already detected.
  const [isCredit, setIsCredit] = useState(false);

  useEffect(() => {
    if (unsureData && unsureData.aiResult) {
      setSelectedCategory(unsureData.aiResult.category || '');
      const amount = unsureData.aiResult.amount || 0;
      setInputAmount(amount ? Math.abs(amount).toString() : '');
      setIsCredit(amount < 0);
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

      const savedThemePreference = await dbService.getThemePreference();
      if (savedThemePreference) {
        useStore.getState().setThemePreference(savedThemePreference);
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

      // Re-arm the daily review reminder on every launch. This is a no-op
      // if the user has never enabled it, and cheap to repeat if they have
      // — it's how the alarm gets rebuilt after an app update (Android
      // reboot survival is instead handled natively by the push library's
      // own BOOT_COMPLETED receiver).
      try {
        const reminderSettings = await dbService.getReminderSettings();
        if (reminderSettings?.enabled) {
          notificationService.scheduleDailyReminder(reminderSettings.hour, reminderSettings.minute);
        }
      } catch (e) {
        console.error('[App] Failed to re-arm daily reminder:', e);
      }

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

    const magnitude = parseFloat(inputAmount) || 0;
    const finalAmount = isCredit ? -Math.abs(magnitude) : Math.abs(magnitude);

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

      if (finalAmount !== 0) {
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

  const handleCancel = async () => {
    console.log('[App] handleCancel called');
    if (!unsureData) {
      console.warn('[App] No unsureData available');
      return;
    }

    // Skip this one transaction only — unlike an ignore pattern, this does
    // NOT teach the app to block future messages from this payee. That
    // heavier action is still available per-item from Pending Transactions.
    if (unsureData.externalSmsId) {
      await dbService.updateSmsTransactionStatus(unsureData.externalSmsId, 'user_ignored');
      await smsService.fetchIgnoredSms();
    }

    console.log('[App] Cancelled, closing popup');
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
      <MainNavigator isDark={isDark} theme={theme} />

      <Portal>
        <BottomSheet visible={!!unsureData} onDismiss={() => setUnsureData(null)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Title style={{ color: theme.colors.onSurface }}>
              {unsureData?.reviewExpenseId
                ? isCredit ? 'Edit Refund' : 'Edit Expense'
                : unsureData?.unignorePatternId
                ? 'Unignore & Categorize'
                : isCredit ? 'Confirm Refund' : 'Confirm Expense'}
            </Title>
            {unsureData?.aiResult?.usedAI ? (
              <Chip
                icon="creation"
                compact
                style={{ backgroundColor: theme.custom.accentTint }}
                textStyle={{ color: theme.custom.accentInk, fontSize: 11 }}
              >
                AI-assisted
              </Chip>
            ) : null}
          </View>
          {unsureData?.smsText ? (
            <Text
              style={{
                marginBottom: 10, marginTop: 6, padding: 10, borderRadius: 10,
                backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurfaceVariant,
                fontFamily: theme.custom.ledgerFont, fontSize: 12, lineHeight: 18,
              }}
            >
              {unsureData.smsText}
            </Text>
          ) : null}
          {(!unsureData?.reviewExpenseId || unsureData?.aiResult?.payee) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {!unsureData?.reviewExpenseId && (
                <Chip
                  icon="calendar"
                  style={{ backgroundColor: theme.colors.surfaceVariant }}
                  textStyle={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold' }}
                >
                  {formatFriendlyDate(unsureData?.date)}
                </Chip>
              )}
              {unsureData?.aiResult?.payee ? (
                <Chip
                  icon="store"
                  style={{ backgroundColor: theme.colors.surfaceVariant }}
                  textStyle={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold' }}
                >
                  {unsureData.aiResult.payee}
                </Chip>
              ) : null}
            </View>
          )}
          <TextInput
            label={isCredit ? 'Amount refunded (₹)' : 'Amount (₹)'}
            value={inputAmount}
            onChangeText={setInputAmount}
            keyboardType="numeric"
            mode="outlined"
            textColor={isCredit ? theme.custom.good : theme.colors.onSurface}
            outlineColor={isCredit ? theme.custom.good : undefined}
            activeOutlineColor={isCredit ? theme.custom.good : theme.colors.primary}
            style={{ marginBottom: 6, marginTop: 5, fontFamily: theme.custom.ledgerFont, fontSize: 20 }}
          />
          <TouchableOpacity onPress={() => setIsCredit(!isCredit)} style={{ marginBottom: 10, alignSelf: 'flex-start' }}>
            <Chip
              icon={isCredit ? 'cash-refund' : 'cash-minus'}
              compact
              style={{
                backgroundColor: isCredit ? theme.custom.goodTint : theme.colors.surfaceVariant,
                borderWidth: isCredit ? 1.4 : 0,
                borderColor: theme.custom.good,
              }}
              textStyle={{ color: isCredit ? theme.custom.good : theme.colors.onSurfaceVariant, fontWeight: isCredit ? '700' : '500', fontSize: 11.5 }}
            >
              This is money coming back (refund / credit)
            </Chip>
          </TouchableOpacity>
          <Title style={{ fontSize: 16, marginTop: 10, color: theme.colors.onSurface }}>Select Category</Title>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, marginTop: 6 }}>
            {categories.map((cat: any) => {
              const catColor = getCategoryColor(cat.category, theme.custom.categoryColors);
              const isSelected = selectedCategory === cat.category;
              return (
                <Chip
                  key={cat.category}
                  onPress={() => setSelectedCategory(cat.category)}
                  style={{
                    backgroundColor: isSelected ? catColor + '26' : theme.colors.surfaceVariant,
                    borderWidth: isSelected ? 1.4 : 0,
                    borderColor: catColor,
                  }}
                  textStyle={{ color: isSelected ? catColor : theme.colors.onSurfaceVariant, fontWeight: isSelected ? '700' : '500', fontSize: 11 }}
                  avatar={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor }} />}
                  compact
                >
                  {cat.category}
                </Chip>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <Button
              onPress={unsureData?.reviewExpenseId || unsureData?.unignorePatternId ? () => setUnsureData(null) : handleCancel}
              textColor={theme.colors.onSurfaceVariant}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleConfirm}
              buttonColor={isCredit ? theme.custom.good : theme.colors.primary}
            >
              {unsureData?.reviewExpenseId ? 'Update' : isCredit ? 'Confirm Refund' : 'Confirm Spend'}
            </Button>
          </View>
        </BottomSheet>

        <BottomSheet visible={!!autoTrackedSummary} onDismiss={() => setAutoTrackedSummary(null)}>
          <Title style={{ color: theme.colors.onSurface }}>Auto-Tracked Summary</Title>
          <Text style={{ marginBottom: 15, color: theme.colors.onSurfaceVariant }}>
            While you were away, {autoTrackedSummary?.length} expenses were automatically categorized based on your learned patterns.
          </Text>
         <View style={{ marginBottom: 20 }}>
            {autoTrackedSummary?.map((item: any, index: number) => {
              const catColor = getCategoryColor(item.categoryAssigned, theme.custom.categoryColors);
              return (
                <View
                  key={index}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    marginBottom: 10, paddingBottom: 10,
                    borderBottomWidth: index === autoTrackedSummary.length - 1 ? 0 : 1,
                    borderBottomColor: theme.colors.surfaceVariant,
                  }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: theme.custom.ledgerFont, fontWeight: 'bold', color: theme.colors.onSurface }}>
                      ₹{item.aiResult.amount} · {item.categoryAssigned}
                    </Text>
                    <Text numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>{item.smsText}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          <Button mode="contained" onPress={() => setAutoTrackedSummary(null)}>Dismiss</Button>
        </BottomSheet>

        <Snackbar
          visible={syncStatus === 'syncing'}
          onDismiss={() => {}}
          duration={Infinity}
          style={{ backgroundColor: theme.colors.inverseSurface }}
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
