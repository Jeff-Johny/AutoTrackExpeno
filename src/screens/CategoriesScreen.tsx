import React, { useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { List, Title, TextInput, Button, IconButton, Card, Portal, Dialog } from 'react-native-paper';
import { useStore } from '../store/useStore';
import { expenseService } from '../services/expense';

const CategoriesScreen = () => {
    const categories = useStore((state) => state.categories);
    const [newCategory, setNewCategory] = useState('');

    const handleAddCategory = async () => {
        if (newCategory.trim()) {
            await expenseService.addCategory(newCategory.trim());
            setNewCategory('');
        }
    };

    const handleDeleteCategory = async (categoryName: string) => {
        await expenseService.deleteCategory(categoryName);
    };

    return (
        <View style={styles.container}>
            <Card style={styles.inputCard}>
                <Card.Content>
                    <Title>Add New Category</Title>
                    <View style={styles.inputRow}>
                        <TextInput
                            label="Category Name"
                            value={newCategory}
                            onChangeText={setNewCategory}
                            style={styles.input}
                            mode="outlined"
                        />
                        <Button
                            mode="contained"
                            onPress={handleAddCategory}
                            disabled={!newCategory.trim()}
                            style={styles.addButton}
                        >
                            Add
                        </Button>
                    </View>
                </Card.Content>
            </Card>

            <Title style={styles.listTitle}>All Categories</Title>
            <FlatList
                data={categories}
                keyExtractor={(item) => item.category}
                renderItem={({ item }) => (
                    <Card style={styles.categoryCard}>
                        <Card.Content style={styles.categoryContent}>
                            <Title style={styles.categoryName}>{item.category}</Title>
                            <IconButton
                                icon="delete"
                                iconColor="#ff5252"
                                size={24}
                                onPress={() => handleDeleteCategory(item.category)}
                            />
                        </Card.Content>
                    </Card>
                )}
                contentContainerStyle={styles.listContainer}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f5f5f5',
    },
    inputCard: {
        marginBottom: 20,
        elevation: 4,
        borderRadius: 12,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    input: {
        flex: 1,
        marginRight: 8,
        height: 50,
    },
    addButton: {
        height: 50,
        justifyContent: 'center',
    },
    listTitle: {
        marginBottom: 12,
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    listContainer: {
        paddingBottom: 20,
    },
    categoryCard: {
        marginBottom: 8,
        elevation: 2,
        borderRadius: 8,
    },
    categoryContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    categoryName: {
        fontSize: 16,
        color: '#444',
    },
});

export default CategoriesScreen;
