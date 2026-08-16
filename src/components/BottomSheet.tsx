import React from 'react';
import { Modal, Pressable, View, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useAppTheme } from '../theme/theme';

interface BottomSheetProps {
    visible: boolean;
    onDismiss: () => void;
    children: React.ReactNode;
    /** Fraction of screen height the sheet may grow to before its content scrolls. */
    maxHeightRatio?: number;
}

/**
 * Anchored-to-bottom modal with rounded top corners, a scrim backdrop, and a
 * slide-up entrance — the "Ledger Ink" popup shape (see the redesign
 * proposal artifact) in place of a centered floating card. Built on RN's own
 * Modal rather than Paper's (which only centers), so no new dependency.
 */
const BottomSheet = ({ visible, onDismiss, children, maxHeightRatio = 0.85 }: BottomSheetProps) => {
    const theme = useAppTheme();

    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onDismiss}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable
                    style={[StyleSheet.absoluteFill, { backgroundColor: theme.custom.scrim }]}
                    onPress={onDismiss}
                    accessibilityLabel="Dismiss"
                />
                <View
                    style={{
                        marginTop: 'auto',
                        backgroundColor: theme.colors.surface,
                        borderTopLeftRadius: 22,
                        borderTopRightRadius: 22,
                        maxHeight: Dimensions.get('window').height * maxHeightRatio,
                        paddingTop: 10,
                        paddingBottom: 20,
                    }}
                >
                    <View
                        style={{
                            width: 36, height: 4, borderRadius: 2,
                            backgroundColor: theme.colors.outlineVariant,
                            alignSelf: 'center', marginBottom: 12,
                        }}
                    />
                    <ScrollView contentContainerStyle={{ paddingHorizontal: 18 }} keyboardShouldPersistTaps="handled">
                        {children}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

export default BottomSheet;
