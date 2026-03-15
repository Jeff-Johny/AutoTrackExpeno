import React, { useState } from 'react';
import { View } from 'react-native';
import { TextInput, Button, Title, Card, Text } from 'react-native-paper';

const LoginScreen = ({ onLogin }: { onLogin: () => void }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    const handleLogin = () => {
        if (pin === '1234') { // Simple default pin for demonstration
            onLogin();
        } else {
            setError('Invalid PIN. Use 1234.');
        }
    };

    return (
        <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f3edf7' }}>
            <Card style={{ padding: 20 }}>
                <Title style={{ textAlign: 'center', marginBottom: 20 }}>AutoTrackExpeno Login</Title>
                <TextInput
                    label="Enter 4-digit PIN"
                    value={pin}
                    onChangeText={setPin}
                    secureTextEntry
                    keyboardType="numeric"
                    maxLength={4}
                />
                {error ? <Text style={{ color: 'red', marginTop: 10 }}>{error}</Text> : null}
                <Button mode="contained" onPress={handleLogin} style={{ marginTop: 20 }}>
                    Login
                </Button>
            </Card>
        </View>
    );
};

export default LoginScreen;
