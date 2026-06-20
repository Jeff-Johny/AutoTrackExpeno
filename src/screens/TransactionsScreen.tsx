import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, ScrollView } from 'react-native';
import { List, FAB, Portal, Modal, TextInput, Button, IconButton, Menu, Divider, Text, Title, Badge, Appbar, SegmentedButtons } from 'react-native-paper';
import { useStore } from '../store/useStore';
import { expenseService } from '../services/expense';
import { patternService } from '../services/patterns';
import { smsService } from '../services/sms';
import { Expense } from '../utils/constants';

const TransactionsScreen = ({ navigation }: any) => {
    const expenses = useStore((state) => state.expenses);
    const categories = useStore((state) => state.categories);
    const patterns = useStore((state) => state.patterns);
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
    const [menuVisible, setMenuVisible] = useState(false);

    // SMS source detail popup & Editing
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [editMenuVisible, setEditMenuVisible] = useState(false);

    const openMenu = () => setMenuVisible(true);
    const closeMenu = () => setMenuVisible(false);

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

    const handleUpdateCategory = async (newCategory: string) => {
        if (selectedExpense) {
            await expenseService.updateExpense(selectedExpense.id, { category: newCategory });
            setSelectedExpense({ ...selectedExpense, category: newCategory });
            setEditMenuVisible(false);
            setIsEditingCategory(false);
        }
    };

    const ignoredPatterns = patterns.filter(p => p.action === 'ignore');

    const renderTransactionItem = ({ item }: { item: Expense }) => (
        <List.Item
            title={`Rs ${item.amount}`}
            description={`${item.category} • ${formatDate(item.date)}`}
            left={(props) => (
                <List.Icon
                    {...props}
                    icon={item.smsSender ? "message-text-outline" : "plus-circle-outline"}
                />
            )}
            onPress={() => {
                setSelectedExpense(item);
                setIsEditingCategory(false);
            }}
            right={(props) => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <IconButton
                        icon="delete-outline"
                        size={20}
                        onPress={() => expenseService.deleteExpense(item.id)}
                    />
                    <List.Icon {...props} icon="chevron-right" />
                </View>
            )}
        />
    );

    const renderPatternItem = ({ item }: { item: any }) => (
      <List.Item
          title={item.pattern}
          description="Tap to unignore and categorize"
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
              >
                Remove
              </Button>
          )}
      />
    );

    return (
        <View style={styles.container}>
            <Appbar.Header>
                <Appbar.Content title="Activity" />
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
                  ListEmptyComponent={<Text style={styles.emptyText}>No transactions found.</Text>}
              />
            ) : (
              <ScrollView style={{ flex: 1 }}>
                <List.Subheader style={{ fontWeight: 'bold', color: '#6750A4' }}>Ignored Payee Rules</List.Subheader>
                {ignoredPatterns.length > 0 ? (
                  ignoredPatterns.map((item) => (
                    <React.Fragment key={item.id}>
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
                      <Divider />
                    </React.Fragment>
                  ))
                ) : (
                  <Text style={styles.emptySubText}>No ignored payee rules defined.</Text>
                )}

                <List.Subheader style={{ fontWeight: 'bold', color: '#6750A4', marginTop: 15 }}>Ignored Transactions (SMS)</List.Subheader>
                {ignoredSms.length > 0 ? (
                  ignoredSms.map((item) => (
                    <React.Fragment key={item.id}>
                      <List.Item
                        title={item.amount > 0 ? `₹${item.amount} (${item.payee || item.sender})` : `${item.sender}`}
                        description={`${item.smsText}\n${formatDate(item.date)}`}
                        descriptionNumberOfLines={3}
                        left={(props) => <List.Icon {...props} icon="message-text-outline" />}
                        onPress={() => {
                          setUnsureData({
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
                            isUnignoringSms: true
                          });
                        }}
                        right={() => (
                          <Button
                            mode="outlined"
                            onPress={() => {
                              setUnsureData({
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
                                isUnignoringSms: true
                              });
                            }}
                            compact
                            style={{ alignSelf: 'center', marginRight: 10 }}
                          >
                            Categorize
                          </Button>
                        )}
                      />
                      <Divider />
                    </React.Fragment>
                  ))
                ) : (
                  <Text style={styles.emptySubText}>No ignored messages found.</Text>
                )}
              </ScrollView>
            )}

            {/* SMS Source Detail Popup */}
            <Portal>
                <Modal
                    visible={!!selectedExpense}
                    onDismiss={() => {
                      setSelectedExpense(null);
                      setEditMenuVisible(false);
                    }}
                    contentContainerStyle={styles.modalContent}
                >
                    <Title style={styles.modalTitle}>Transaction Details</Title>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Amount</Text>
                        <Text style={styles.detailValue}>₹{selectedExpense?.amount}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Category</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={[styles.detailValue, { marginRight: 8 }]}>{selectedExpense?.category}</Text>
                          <Menu
                            visible={editMenuVisible}
                            onDismiss={() => setEditMenuVisible(false)}
                            anchor={
                              <IconButton 
                                icon="pencil-outline" 
                                size={16} 
                                onPress={() => setEditMenuVisible(true)} 
                              />
                            }
                          >
                            <ScrollView style={{ maxHeight: 200 }}>
                              {categories.map((cat) => (
                                <Menu.Item
                                  key={cat.category}
                                  onPress={() => handleUpdateCategory(cat.category)}
                                  title={cat.category}
                                />
                              ))}
                            </ScrollView>
                          </Menu>
                        </View>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Date</Text>
                        <Text style={styles.detailValue}>{selectedExpense ? formatDate(selectedExpense.date) : ''}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Sender</Text>
                        <Text style={styles.detailValue}>{selectedExpense?.smsSender || '(manual entry)'}</Text>
                    </View>

                    {selectedExpense?.smsText ? (
                        <View style={styles.smsBox}>
                            <Text style={styles.smsLabel}>Original SMS</Text>
                            <ScrollView style={{ maxHeight: 100 }}>
                                <Text style={styles.smsText}>{selectedExpense.smsText}</Text>
                            </ScrollView>
                        </View>
                    ) : (
                        <View style={styles.smsBox}>
                            <Text style={styles.smsLabel}>Original SMS</Text>
                            <Text style={[styles.smsText, { color: '#999', fontStyle: 'italic' }]}>
                                No SMS text recorded (manually added or older entry)
                            </Text>
                        </View>
                    )}

                    <Button
                        mode="contained"
                        onPress={() => setSelectedExpense(null)}
                        style={{ marginTop: 16 }}
                    >
                        Close
                    </Button>
                </Modal>
            </Portal>

            {/* Add Manual Expense Modal */}
            <Portal>
                <Modal visible={addVisible} onDismiss={() => setAddVisible(false)} contentContainerStyle={styles.modalContent}>
                    <TextInput
                        label="Amount"
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="numeric"
                        mode="outlined"
                        style={styles.input}
                    />

                    <View style={styles.dropdownContainer}>
                        <Menu
                            visible={menuVisible}
                            onDismiss={closeMenu}
                            anchor={
                                <Button
                                    mode="outlined"
                                    onPress={openMenu}
                                    style={styles.dropdownButton}
                                    contentStyle={styles.dropdownContent}
                                >
                                    {category || 'Select Category'}
                                </Button>
                            }
                        >
                            <ScrollView style={{ maxHeight: 200 }}>
                              {categories.map((cat) => (
                                  <Menu.Item
                                      key={cat.category}
                                      onPress={() => {
                                          setCategory(cat.category);
                                          closeMenu();
                                      }}
                                      title={cat.category}
                                  />
                              ))}
                            </ScrollView>
                        </Menu>
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
    modalTitle: {
        marginBottom: 16,
        fontSize: 18,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        minHeight: 40,
    },
    detailLabel: {
        color: '#888',
        fontSize: 13,
        flex: 1,
    },
    detailValue: {
        fontWeight: '600',
        textAlign: 'right',
    },
    smsBox: {
        backgroundColor: '#f5f5f5',
        borderRadius: 6,
        padding: 12,
        marginTop: 12,
    },
    smsLabel: {
        fontSize: 12,
        color: '#888',
        marginBottom: 6,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    smsText: {
        fontSize: 13,
        lineHeight: 20,
        color: '#333',
    },
    input: {
        marginBottom: 10,
    },
    dropdownContainer: {
        marginBottom: 10,
    },
    dropdownButton: {
        width: '100%',
        height: 50,
        justifyContent: 'center',
    },
    dropdownContent: {
        height: 50,
        flexDirection: 'row-reverse',
        justifyContent: 'center',
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
