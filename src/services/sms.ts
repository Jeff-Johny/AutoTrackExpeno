import { PermissionsAndroid, Platform, DeviceEventEmitter, NativeModules } from 'react-native';
import { geminiService } from '../api/gemini';
import { patternService } from './patterns';
import { expenseService } from './expense';
import { notificationService } from './notifications';

// Use require to avoid potential ESM interop issues and allow for fallback
let SmsListener: any;
let SmsAndroid: any;

try {
    SmsListener = require('react-native-android-sms-listener').default;
    console.log('[SMS Service] SmsListener loaded:', !!SmsListener);
} catch (e) {
    console.error('[SMS Service] Failed to load react-native-android-sms-listener:', e);
}

// SmsAndroid removed to fix runtime error previously, adding back the correct import now
try {
    SmsAndroid = require('react-native-get-sms-android');
    console.log('[SMS Service] SmsAndroid loaded:', !!SmsAndroid);
} catch (e) {
    console.warn('[SMS Service] Failed to load react-native-get-sms-android:', e);
}

export const smsService = {
    async requestPermissions() {
        if (Platform.OS !== 'android') {
            console.log('[SMS Service] Not on Android, skipping permissions');
            return false;
        }

        try {
            const permissions = [
                PermissionsAndroid.PERMISSIONS.READ_SMS,
                PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
            ];

            if (Platform.OS === 'android' && Platform.Version >= 33) {
                // @ts-ignore - POST_NOTIFICATIONS might not be in the types if they are old
                permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
            }

            console.log('[SMS Service] Requesting permissions:', permissions);
            const granted = await PermissionsAndroid.requestMultiple(permissions);

            const hasReadSMS = granted[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED;
            const hasReceiveSMS = granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED;
            const hasNotify = (Platform.Version as number) >= 33
                ? granted['android.permission.POST_NOTIFICATIONS'] === PermissionsAndroid.RESULTS.GRANTED
                : true;

            console.log('[SMS Service] READ_SMS permission:', hasReadSMS);
            console.log('[SMS Service] RECEIVE_SMS permission:', hasReceiveSMS);
            console.log('[SMS Service] POST_NOTIFICATIONS permission:', hasNotify);

            return hasReadSMS && hasReceiveSMS && hasNotify;
        } catch (err) {
            console.error('[SMS Service] Permission request error:', err);
            return false;
        }
    },

    async syncRecentSms(onUnsure: (data: any) => void, onAutoTracked?: (items: any[]) => void) {
        if (Platform.OS !== 'android') return;
        
        if (!SmsAndroid) {
            console.log('[SMS Service] SmsAndroid not loaded, cannot sync recent SMS');
            return;
        }

        console.log('[SMS Service] Syncing recent SMS...');
        
        // Look back 1 hour to catch missed SMS
        const oneHourAgo = Date.now() - (60 * 60 * 1000);

        const filter = {
            box: 'inbox',
            minDate: oneHourAgo,
            read: 0, // Unread only ideally, though many apps mark as read automatically
        };

        SmsAndroid.list(
            JSON.stringify(filter),
            (fail: any) => {
                console.log('[SMS Service] Failed to sync SMS:', fail);
            },
            async (count: number, smsList: string) => {
                console.log('[SMS Service] Found', count, 'recent SMS messages');
                try {
                    const messages = JSON.parse(smsList);
                    
                    // Process messages one by one chronologically (oldest first)
                    const sortedMessages = messages.sort((a: any, b: any) => a.date - b.date);

                    const autoTrackedList: any[] = [];

                    for (const msg of sortedMessages) {
                        const { body, address } = msg;

                        // Check if already processed
                        const pattern = await patternService.checkPattern(body, address);
                        if (pattern) {
                            if (pattern.action === 'ignore') {
                                console.log('[SMS Service] Sync: Pattern action is IGNORE - skipping', address);
                                continue;
                            }
                            
                            // Proceed as pattern match
                            console.log('[SMS Service] Sync: Pattern match found for', address, 'categorizing as', pattern.category);
                            const aiResult = await geminiService.categorizeSms(body);
                            
                            if (aiResult && aiResult.isSpending) {
                                console.log('[SMS Service] Sync: Adding auto-tracked expense for', pattern.category);
                                await expenseService.addExpense({
                                    amount: aiResult.amount,
                                    category: pattern.category!,
                                    description: aiResult.description,
                                    date: new Date().toISOString(),
                                    isAutoCategorized: true,
                                    smsSender: address,
                                    smsText: body,
                                });
                                
                                autoTrackedList.push({
                                    smsText: body,
                                    sender: address,
                                    aiResult,
                                    categoryAssigned: pattern.category
                                });
                            }
                            continue;
                        }

                        console.log('[SMS Service] Sync: Calling AI for', address);
                        const aiResult = await geminiService.categorizeSms(body);

                        if (aiResult && aiResult.isSpending) {
                            console.log('[SMS Service] Sync: Found spending in background!');
                            onUnsure({
                                smsText: body,
                                sender: address,
                                aiResult,
                                isSync: true
                            });
                        }
                    }

                    // Post summary callback if items were auto-tracked
                    if (autoTrackedList.length > 0 && onAutoTracked) {
                        console.log('[SMS Service] Sync: Emitting auto-tracked summary:', autoTrackedList.length, 'items');
                        onAutoTracked(autoTrackedList);
                    }
                } catch (e) {
                    console.error('[SMS Service] Error processing synced SMS:', e);
                }
            }
        );
    },

    startListening(onUnsure: (data: any) => void) {
        if (Platform.OS !== 'android') {
            console.log('[SMS Service] Not on Android, cannot start listener');
            return;
        }

        console.log('========================================');
        console.log('[SMS Service] SMS Listener Started');
        console.log('[SMS Service] Waiting for incoming SMS...');
        console.log('========================================');

        if (!SmsListener) {
            console.warn('[SMS Service] SmsListener is not loaded. Cannot start listener.');
            return;
        }

        console.log('[SMS Service] Attempting to add listener to SmsListener object...');
        try {
            if (!SmsListener) {
                throw new Error("SmsListener object is null/undefined!");
            }
            const subscription = SmsListener.addListener(async (message: any) => {
                try {
                    const { body, originatingAddress } = message;
                    console.log('\n========================================');
                    console.log('[SMS Service] ✉️ SMS RECEIVED!');
                    console.log('[SMS Service] From:', originatingAddress);
                    console.log('[SMS Service] Body:', body);
                    console.log('========================================\n');

                    // 1. Check learned patterns
                    console.log('[SMS Service] Step 1: Checking learned patterns...');
                    const pattern = await patternService.checkPattern(body, originatingAddress);
                    console.log('[SMS Service] Pattern Match Result:', pattern);

                    if (pattern) {
                        if (pattern.action === 'ignore') {
                            console.log('[SMS Service] ❌ Pattern action is IGNORE - stopping processing');
                            return;
                        }

                        // Auto categorize based on pattern
                        console.log('[SMS Service] ✅ Pattern found! Category:', pattern.category);
                        console.log('[SMS Service] Step 2: Categorizing with AI...');
                        const aiResult = await geminiService.categorizeSms(body);
                        console.log('[SMS Service] AI Result (Pattern path):', JSON.stringify(aiResult, null, 2));
                        if (aiResult && aiResult.isSpending) {
                            console.log('[SMS Service] 💰 Spending detected! Adding expense automatically...');
                            console.log('[SMS Service] Amount:', aiResult.amount, 'Category:', pattern.category);
                            await expenseService.addExpense({
                                amount: aiResult.amount,
                                category: pattern.category!,
                                description: aiResult.description,
                                date: new Date().toISOString(),
                                isAutoCategorized: true,
                                smsSender: originatingAddress,
                                smsText: body,
                            });
                            console.log('[SMS Service] ✅ Expense added successfully!');
                        } else {
                            console.log('[SMS Service] ℹ️ AI determined this is not a spending SMS');
                        }
                        return;
                    }

                    // 2. No pattern, call Gemini
                    console.log('[SMS Service] No pattern found - calling Gemini AI directly...');
                    const aiResult = await geminiService.categorizeSms(body);
                    console.log('[SMS Service] AI Result (No pattern path):', JSON.stringify(aiResult, null, 2));

                    if (aiResult && aiResult.isSpending) {
                        console.log('[SMS Service] 🔔 Spending SMS without pattern - triggering popup!');
                        onUnsure({
                            smsText: body,
                            sender: originatingAddress,
                            aiResult
                        });
                        notificationService.notify(
                            "Expense Detected",
                            `Detected Rs ${aiResult.amount} spending from ${originatingAddress}. Tap to confirm.`,
                            { smsText: body, sender: originatingAddress, aiResult }
                        );
                        console.log('[SMS Service] ✅ Popup should be displayed and notification sent now');
                    } else {
                        console.log('[SMS Service] ℹ️ AI determined this is NOT a spending SMS or result is null');
                    }
                } catch (processingErr) {
                    console.error('[SMS Service] Error processing incoming SMS:', processingErr);
                }
            });
            console.log('[SMS Service] Listener attached successfully:', !!subscription);
        } catch (err) {
            console.error('[SMS Service] Error attaching SMS listener:', err);
            // Fallback: Manually try DeviceEventEmitter if the wrapper fails
            try {
                console.log('[SMS Service] Attempting fallback to DeviceEventEmitter...');
                DeviceEventEmitter.addListener('com.centaurwarchief.smslistener:smsReceived', (message: any) => {
                    console.log('[SMS Service] Fallback Listener received message:', message);
                    // We can't reuse logic easily without refactoring, but for now just log it
                });
            } catch (fallbackErr) {
                console.error('[SMS Service] Fallback listener failed:', fallbackErr);
            }
        }
    },

    async testRecentSmsSync(onUnsure: (data: any) => void) {
        console.log('[SMS Service] 🧪 SIMULATING SMS SYNC...');
        const mockSms = {
            body: "Your account XX1234 has been debited by Rs 750.00 for Amazon on 2026-02-09. Not a pattern match yet.",
            address: "BANK-TEST",
        };

        // Check if already processed (exists in patterns)
        const pattern = await patternService.checkPattern(mockSms.body, mockSms.address);
        if (pattern) {
            console.log('[SMS Service] Test Sync: mock message already handled by pattern. Please clear patterns or use different text.');
            return;
        }

        const aiResult = await geminiService.categorizeSms(mockSms.body);
        if (aiResult && aiResult.isSpending) {
            console.log('[SMS Service] Test Sync found simulated spending SMS!');
            onUnsure({
                smsText: mockSms.body,
                sender: mockSms.address,
                aiResult,
                isSync: true
            });
        }
    }
};
