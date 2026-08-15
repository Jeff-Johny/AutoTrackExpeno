import React, { useState, useEffect } from 'react';
import { View, FlatList, SectionList, StyleSheet, Alert } from 'react-native';
import { List, FAB, Portal, Modal, TextInput, Button, IconButton, Chip, Divider, Text, Badge, Appbar, SegmentedButtons } from 'react-native-paper';
import { useStore } from '../store/useStore';
import { expenseService } from '../services/expense';
import { patternService } from '../services/patterns';
import { smsService } from '../services/sms';
import { Expense } from '../utils/constants';
import { useAppTheme } from '../theme/theme';
import { getCategoryColor } from '../utils/categoryColors';
import { formatSignedAmount } from '../utils/format';

const TransactionsScreen = ({ navigation }: any) => {
    const theme = useAppTheme();
    const expenses = useStore((state) => state.expenses);
    const categories = useStore((state) => state.categories);
    const ignoredSms = useStore((state) => state.ignoredSms);
    const unsureQueueCount = useStore((state) => state.unsureDataQueue.length);
    const setUnsureData = useStore((state: any) => state.setUnsureData);

    useEffect(() => {
        smsService.fetchIgnoredSms();
    }, []);
    
    const [view, setView] = useState('transactions');
    const [addVisible, setAddVisible] = useState(false);
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');

    const addManual = async () => {
        if (!amount || !category) return;

        await expenseService.addExpense({
            amount: parseFloat(amount),
            description: '',
            category,
            date: new Date().toISOString(),
            isAutoCategorized: false,
        });
        setAddVisible(false);
        setAmount('');
        setCategory('');
    };

    const formatDate = (iso: string) => {
        try {
            const d = new Date(iso);
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return iso;
        }
    };

    const confirmDeleteExpense = (item: Expense) => {
        Alert.alert(
            'Delete transaction?',
            `Remove ${formatSignedAmount(item.amount)} · ${item.category} from your records. This can't be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => expenseService.deleteExpense(item.id) },
            ]
        );
    };

    const renderTransactionItem = ({ item }: { item: Expense }) => {
        const catColor = getCategoryColor(item.category, theme.custom.categoryColors);
        const isCredit = item.amount < 0;
        return (
            <List.Item
                title={() => (
                    <Text style={{ fontFamily: theme.custom.ledgerFont, fontWeight: '600', fontSize: 14, color: isCredit ? theme.custom.good : theme.colors.onSurface }}>
                        {formatSignedAmount(item.amount)}{isCredit ? '  ·  Refund' : ''}
                    </Text>
                )}
                description={`${item.category} • ${formatDate(item.date)}`}
                left={() => (
                    <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: catColor }} />
                    </View>
                )}
                onPress={() => {
                    // Same global edit modal the Dashboard's day list opens
                    // (App.tsx) — was a separate, differently-laid-out modal
                    // here before; this keeps the edit experience identical
                    // regardless of which screen you tap a transaction from.
                    setUnsureData({
                        reviewExpenseId: item.id,
                        smsText: item.smsText || '',
                        sender: item.smsSender || '',
                        aiResult: {
                            amount: item.amount,
                            category: item.category,
                            description: item.description,
                            payee: null,
                            isSpending: true,
                            isCertain: true,
                        },
                    });
                }}
                right={(props) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <IconButton
                            icon="delete-outline"
                            size={20}
                            onPress={() => confirmDeleteExpense(item)}
                        />
                        <List.Icon {...props} icon="chevron-right" />
                    </View>
                )}
            />
        );
    };

    const renderPatternRow = (item: any) => (
      <List.Item
          title={item.pattern}
          description="Future SMS from this payee will be ignored"
          left={(props) => <List.Icon {...props} icon="eye-off-outline" />}
          onPress={() => {
            setUnsureData({
              unignorePatternId: item.id,
              smsText: '',
              sender: '',
              aiResult: {
                amount: 0,
                category: '',
                description: `Unignored: ${item.pattern}`,
                payee: item.pattern,
                isSpending: true,
                isCertain: false,
              },
            });
          }}
          right={() => (
              <Button
                mode="outlined"
                onPress={() => patternService.deletePattern(item.id)}
                compact
                style={{ alignSelf: 'center', marginRight: 10 }}
              >
                Remove Rule
              </Button>
          )}
      />
    );

    const renderIgnoredSmsRow = (item: any) => {
      const unignoreData = {
        smsText: item.smsText,
        sender: item.sender,
        externalSmsId: item.id,
        date: item.date,
        aiResult: {
          amount: item.amount || 0,
          category: item.category || '',
          description: item.description || '',
          payee: item.payee || '',
          isSpending: true,
          isCertain: false,
        },
        isUnignoringSms: true,
      };
      return (
        <List.Item
          title={() => (
            <Text style={{ fontSize: 14, color: theme.colors.onSurface }}>
              {item.amount ? (
                <><Text style={{ fontFamily: theme.custom.ledgerFont, fontWeight: '600', color: item.amount < 0 ? theme.custom.good : theme.colors.onSurface }}>{formatSignedAmount(item.amount)}</Text> ({item.payee || item.sender})</>
              ) : item.sender}
            </Text>
          )}
          description={`${item.smsText}\n${formatDate(item.date)}`}
          descriptionNumberOfLines={3}
          left={(props) => <List.Icon {...props} icon="message-text-outline" />}
          onPress={() => setUnsureData(unignoreData)}
          right={() => (
            <Button
              mode="outlined"
              onPress={() => setUnsureData(unignoreData)}
              compact
              style={{ alignSelf: 'center', marginRight: 10 }}
            >
              Categorize
            </Button>
          )}
        />
      );
    };

    // "Ignored Payee Rules" hidden for now (per-payee ignore rules exist and
    // still work — created from the confirm modal's Ignore action — just not
    // shown/manageable here yet; renderPatternRow is kept below so this is a
    // one-line re-add, not a rebuild, once that UI is designed properly).
    const ignoredSections = [
      { key: 'sms', title: 'Ignored Transactions (SMS)', emptyText: 'No ignored messages found.', data: ignoredSms },
    ];

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
                <Appbar.Content title="Activity" titleStyle={{ color: theme.colors.onSurface }} />
                <View>
                    <Appbar.Action 
                        icon="bell-outline" 
                        onPress={() => navigation.navigate('PendingTransactions')} 
                    />
                    {unsureQueueCount > 0 && (
                        <Badge 
                            style={{ position: 'absolute', top: 4, right: 4 }} 
                            size={16}
                        >
                            {unsureQueueCount}
                        </Badge>
                    )}
                </View>
            </Appbar.Header>

            <View style={{ padding: 10 }}>
              <SegmentedButtons
                value={view}
                onValueChange={setView}
                buttons={[
                  { value: 'transactions', label: 'Transactions' },
                  { value: 'ignored', label: 'Ignored' },
                ]}
              />
            </View>

            {view === 'transactions' ? (
              <FlatList
                  data={expenses}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTransactionItem}
                  ItemSeparatorComponent={() => <Divider />}
                  ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>No transactions found.</Text>}
              />
            ) : (
              // Virtualized (SectionList), not a ScrollView+map — "ignored"
              // covers every pre-filtered OTP/promo SMS ever seen and can
              // grow into the hundreds, which was rendering every row's
              // full view tree up front and making this tab slow to open.
              <SectionList
                sections={ignoredSections}
                keyExtractor={(item, index) => item.id ?? index.toString()}
                renderSectionHeader={({ section }) => (
                  <List.Subheader style={{ fontWeight: 'bold', color: theme.colors.primary, backgroundColor: theme.colors.background }}>
                    {section.title}
                  </List.Subheader>
                )}
                renderItem={({ item, section }) => (
                  section.key === 'patterns' ? renderPatternRow(item) : renderIgnoredSmsRow(item)
                )}
                renderSectionFooter={({ section }) =>
                  section.data.length === 0 ? (
                    <Text style={[styles.emptySubText, { color: theme.colors.onSurfaceVariant }]}>{section.emptyText}</Text>
                  ) : null
                }
                ItemSeparatorComponent={() => <Divider />}
                stickySectionHeadersEnabled={false}
              />
            )}

            {/* Add Manual Expense Modal */}
            <Portal>
                <Modal visible={addVisible} onDismiss={() => setAddVisible(false)} contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                    <TextInput
                        label="Amount"
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="numeric"
                        mode="outlined"
                        style={[styles.input, { fontFamily: theme.custom.ledgerFont }]}
                    />

                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>Category</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                        {categories.map((cat) => {
                            const catColor = getCategoryColor(cat.category, theme.custom.categoryColors);
                            const isSelected = category === cat.category;
                            return (
                                <Chip
                                    key={cat.category}
                                    onPress={() => setCategory(cat.category)}
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

                    <Button
                        mode="contained"
                        onPress={addManual}
                        style={styles.addButton}
                        disabled={!amount || !category}
                    >
                        Add Expense
                    </Button>
                </Modal>
            </Portal>

            <FAB
                style={styles.fab}
                icon="plus"
                onPress={() => setAddVisible(true)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    listItem: {
        paddingVertical: 4,
    },
    emptyText: {
      textAlign: 'center',
      marginTop: 40,
      color: '#888',
    },
    emptySubText: {
      textAlign: 'center',
      marginVertical: 15,
      color: '#999',
      fontSize: 13,
      fontStyle: 'italic',
    },
    modalContent: {
        padding: 20,
        backgroundColor: 'white',
        margin: 20,
        borderRadius: 8,
    },
    input: {
        marginBottom: 10,
    },
    addButton: {
        marginTop: 10,
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});

export default TransactionsScreen;
