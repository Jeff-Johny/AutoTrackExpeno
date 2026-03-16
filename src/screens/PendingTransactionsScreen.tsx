import React, { useState } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { 
  Text, 
  List, 
  IconButton, 
  Divider, 
  Appbar, 
  Button,
  Portal,
  Dialog
} from 'react-native-paper';
import { useStore } from '../store/useStore';
import { expenseService } from '../services/expense';
import { patternService } from '../services/patterns';

const PendingTransactionsScreen = ({ navigation }: any) => {
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
    await patternService.addPattern(item.sender, 'category', category);

    // 3. Remove from queue
    removeFromUnsureQueue(index);
    
    setMenuVisible(false);
    setSelectedItem(null);
  };

  const handleIgnore = (index: number) => {
    removeFromUnsureQueue(index);
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => (
    <List.Item
      title={`Rs ${item.aiResult.amount}`}
      description={item.smsText}
      left={(props) => <List.Icon {...props} icon="message-alert" />}
      right={(props) => (
        <View style={styles.itemActions}>
          <Button 
            mode="outlined" 
            compact
            onPress={() => {
              setSelectedItem({ item, index });
              setMenuVisible(true);
            }}
            style={styles.actionButton}
          >
            Categorize
          </Button>
          <IconButton 
            icon="delete-outline" 
            onPress={() => handleIgnore(index)} 
          />
        </View>
      )}
      descriptionNumberOfLines={2}
    />
  );

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Pending SMS" subtitle={`${unsureDataQueue.length} items`} />
      </Appbar.Header>

      {unsureDataQueue.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconButton icon="check-circle-outline" size={64} iconColor="#4CAF50" />
          <Text variant="headlineSmall">All Clear!</Text>
          <Text variant="bodyMedium">No pending SMS messages to categorize.</Text>
        </View>
      ) : (
        <FlatList
          data={unsureDataQueue}
          renderItem={renderItem}
          keyExtractor={(_, index) => index.toString()}
          ItemSeparatorComponent={Divider}
        />
      )}

      <Portal>
        <Dialog visible={menuVisible} onDismiss={() => setMenuVisible(false)}>
          <Dialog.Title>Select Category</Dialog.Title>
          <Dialog.Content>
            <ScrollView style={{ maxHeight: 300 }}>
              {categories.map((cat) => (
                <List.Item
                  key={cat.category}
                  title={cat.category}
                  onPress={() => handleCategorize(cat.category)}
                  left={(props) => <List.Icon {...props} icon="tag" />}
                />
              ))}
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
    backgroundColor: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    marginRight: 0,
  }
});

export default PendingTransactionsScreen;
