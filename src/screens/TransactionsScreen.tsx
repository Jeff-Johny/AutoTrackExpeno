import React, { useState } from 'react';
import { View, FlatList, StyleSheet, ScrollView } from 'react-native';
import { List, FAB, Portal, Modal, TextInput, Button, IconButton, Menu, Divider, Text, Title, Badge, Appbar } from 'react-native-paper';
import { useStore } from '../store/useStore';
import { expenseService } from '../services/expense';
import { Expense } from '../utils/constants';

const TransactionsScreen = ({ navigation }: any) => {
    const expenses = useStore((state) => state.expenses);
    const categories = useStore((state) => state.categories);
    const unsureQueueCount = useStore((state) => state.unsureDataQueue.length);
    const [addVisible, setAddVisible] = useState(false);
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [menuVisible, setMenuVisible] = useState(false);

    // SMS source detail popup
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

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

    const renderItem = ({ item }: { item: Expense }) => (
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

    return (
        <View style={styles.container}>
            <Appbar.Header>
                <Appbar.Content title="Transactions" />
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

            <FlatList
                data={expenses}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                ItemSeparatorComponent={() => <Divider />}
            />

            {/* SMS Source Detail Popup */}
            <Portal>
                <Modal
                    visible={!!selectedExpense}
                    onDismiss={() => setSelectedExpense(null)}
                    contentContainerStyle={styles.modalContent}
                >
                    <Title style={styles.modalTitle}>Transaction Source</Title>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Amount</Text>
                        <Text style={styles.detailValue}>₹{selectedExpense?.amount}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Category</Text>
                        <Text style={styles.detailValue}>{selectedExpense?.category}</Text>
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
        marginBottom: 8,
    },
    detailLabel: {
        color: '#888',
        fontSize: 13,
        flex: 1,
    },
    detailValue: {
        fontWeight: '600',
        flex: 2,
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
