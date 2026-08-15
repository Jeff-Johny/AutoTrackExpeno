import React, { useState } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import {
  Text,
  List,
  IconButton,
  Appbar,
  Button,
  Portal,
  Dialog
} from 'react-native-paper';
import { useStore } from '../store/useStore';
import { expenseService } from '../services/expense';
import { patternService } from '../services/patterns';
import { dbService } from '../services/db';
import { smsService } from '../services/sms';
import { useAppTheme } from '../theme/theme';
import { getCategoryColor } from '../utils/categoryColors';
import { formatSignedAmount } from '../utils/format';

const PendingTransactionsScreen = ({ navigation }: any) => {
  const theme = useAppTheme();
  const { unsureDataQueue, removeFromUnsureQueue, categories } = useStore();
  const [selectedItem, setSelectedItem] = useState<{item: any, index: number} | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  const handleCategorize = async (category: string) => {
    if (!selectedItem) return;

    const { item, index } = selectedItem;

    // 1. Add expense
    await expenseService.addExpense({
      amount: item.aiResult.amount,
      category: category,
      description: item.aiResult.description,
      date: new Date().toISOString(),
      isAutoCategorized: true,
      smsSender: item.sender,
      smsText: item.smsText,
      externalSmsId: item.externalSmsId,
    });

    // 2. Learn pattern
    if (item.aiResult?.payee) {
      await patternService.addPattern(item.aiResult.payee, 'category', category);
    }

    // 3. Remove from queue
    removeFromUnsureQueue(index);

    if (item.externalSmsId) {
      await dbService.updateSmsTransactionStatus(item.externalSmsId, 'confirmed');
      await smsService.fetchIgnoredSms();
    }

    setMenuVisible(false);
    setSelectedItem(null);
  };

  const handleIgnore = async (index: number) => {
    const item = unsureDataQueue[index];
    if (item && item.externalSmsId) {
      // Create an ignore rule for the payee
      if (item.aiResult?.payee) {
        await patternService.addPattern(item.aiResult.payee, 'ignore');
      }
      await dbService.updateSmsTransactionStatus(item.externalSmsId, 'user_ignored');
      await smsService.fetchIgnoredSms();
    }
    removeFromUnsureQueue(index);
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const catColor = item.aiResult?.category
      ? getCategoryColor(item.aiResult.category, theme.custom.categoryColors)
      : theme.colors.outline;
    const isCredit = item.aiResult.amount < 0;
    return (
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.catChip, { backgroundColor: catColor + '22' }]}>
              <Text style={{ color: catColor, fontSize: 11, fontWeight: '700' }}>
                {item.aiResult?.category || 'Uncategorized'}
              </Text>
            </View>
            {isCredit && (
              <View style={[styles.catChip, { backgroundColor: theme.custom.goodTint }]}>
                <Text style={{ color: theme.custom.good, fontSize: 11, fontWeight: '700' }}>Refund</Text>
              </View>
            )}
          </View>
          <Text style={{ fontFamily: theme.custom.ledgerFont, fontSize: 16, fontWeight: '700', color: isCredit ? theme.custom.good : theme.colors.onSurface }}>
            {formatSignedAmount(item.aiResult.amount)}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: theme.custom.ledgerFont, fontSize: 11.5, lineHeight: 17,
            color: theme.colors.onSurfaceVariant, backgroundColor: theme.colors.surfaceVariant,
            borderRadius: 8, padding: 8, marginTop: 8,
          }}
          numberOfLines={2}
        >
          {item.smsText}
        </Text>
        <View style={styles.cardActions}>
          <Button
            mode="outlined"
            compact
            onPress={() => {
              setSelectedItem({ item, index });
              setMenuVisible(true);
            }}
          >
            Categorize
          </Button>
          <IconButton
            icon="delete-outline"
            iconColor={theme.colors.onSurfaceVariant}
            onPress={() => handleIgnore(index)}
          />
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Pending SMS" subtitle={`${unsureDataQueue.length} items`} titleStyle={{ color: theme.colors.onSurface }} />
      </Appbar.Header>

      {unsureDataQueue.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconButton icon="check-circle-outline" size={64} iconColor={theme.custom.good} />
          <Text variant="headlineSmall" style={{ color: theme.colors.onBackground }}>All Clear!</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>No pending SMS messages to categorize.</Text>
        </View>
      ) : (
        <FlatList
          data={unsureDataQueue}
          renderItem={renderItem}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={{ padding: 12 }}
        />
      )}

      <Portal>
        <Dialog visible={menuVisible} onDismiss={() => setMenuVisible(false)}>
          <Dialog.Title>Select Category</Dialog.Title>
          <Dialog.Content>
            <ScrollView style={{ maxHeight: 300 }}>
              {categories.map((cat) => {
                const catColor = getCategoryColor(cat.category, theme.custom.categoryColors);
                return (
                  <List.Item
                    key={cat.category}
                    title={cat.category}
                    onPress={() => handleCategorize(cat.category)}
                    left={() => (
                      <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: catColor }} />
                      </View>
                    )}
                  />
                );
              })}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setMenuVisible(false)}>Cancel</Button>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
});

export default PendingTransactionsScreen;
