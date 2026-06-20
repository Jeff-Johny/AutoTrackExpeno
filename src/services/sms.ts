import { PermissionsAndroid, Platform, DeviceEventEmitter, NativeModules } from 'react-native';
import { geminiService } from '../api/gemini';
import { patternService } from './patterns';
import { expenseService } from './expense';
import { notificationService } from './notifications';
import { dbService } from './db';
import { useStore } from '../store/useStore';


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

export function checkPreFilter(body: string): boolean {
    const text = body.toLowerCase();
    
    // OTP or security notifications are always ignored
    const isOtp = ['otp', 'verification code', 'login code', 'security code', 'verify your'].some(kw => text.includes(kw));
    if (isOtp) return false;

    // Explicit debit keywords indicate spending (even if they also have 'received' e.g. "Received by Amazon")
    const hasDebitKeyword = ['debited', 'spent', 'paid', 'deducted', 'sent to', 'payment of', 'payment to', 'withdrawn'].some(kw => text.includes(kw));
    if (hasDebitKeyword) return true;

    // Credit keywords (without debit keywords) are ignored
    const hasCreditKeyword = ['credited', 'received from', 'refund', 'cashback', 'added to your', 'received rs'].some(kw => text.includes(kw));
    if (hasCreditKeyword) return false;

    // Fallback: general payment markers
    const hasGeneralKeyword = ['vpa', 'upi', 'transaction', 'payment'].some(kw => text.includes(kw));
    return hasGeneralKeyword;
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

    async fetchIgnoredSms() {
        try {
            const ignored = await dbService.getIgnoredSmsTransactions();
            const formatted = ignored.map((sms: any) => ({
                id: sms.sms_id,
                smsText: sms.sms_text,
                sender: sms.sender,
                date: sms.date ? new Date(sms.date).toISOString() : new Date().toISOString(),
                amount: sms.amount,
                payee: sms.payee,
                category: sms.category,
                description: sms.description,
                status: sms.status
            }));
            useStore.getState().setIgnoredSms(formatted);
            console.log('[SMS Service] Fetched', formatted.length, 'ignored transactions from DB');
        } catch (e) {
            console.error('[SMS Service] fetchIgnoredSms failed:', e);
        }
    },

    async syncRecentSms(onUnsure: (data: any) => void, onAutoTracked?: (items: any[]) => void) {
        if (Platform.OS !== 'android') return;
        
        if (!SmsAndroid) {
            console.log('[SMS Service] SmsAndroid not loaded, cannot sync recent SMS');
            return;
        }

        console.log('[SMS Service] Syncing recent SMS...');
        useStore.getState().setSyncStatus('syncing');
        
        // Look back 48 hours fallback, but use dbService.getLastSyncTimestamp if available
        const fallbackWindow = 48 * 60 * 60 * 1000;
        const lastSync = await dbService.getLastSyncTimestamp();
        
        let minDate = Date.now() - fallbackWindow;
        if (lastSync) {
            // Start from 1ms after the last processed message to avoid duplicates
            minDate = lastSync + 1;
            console.log('[SMS Service] Sync: Resuming from last sync timestamp:', new Date(minDate).toISOString());
        } else {
            console.log('[SMS Service] Sync: No previous sync found, using 48h fallback window');
        }

        const filter = {
            box: 'inbox',
            minDate: minDate,
        };

        SmsAndroid.list(
            JSON.stringify(filter),
            (fail: any) => {
                console.log('[SMS Service] Failed to list SMS for sync:', fail);
                useStore.getState().setSyncStatus('idle');
            },
            async (count: number, smsList: string) => {
                console.log('[SMS Service] Found', count, 'recent SMS messages');
                try {
                    const messages = JSON.parse(smsList);
                    
                    // Process messages one by one chronologically (oldest first)
                    const sortedMessages = messages.sort((a: any, b: any) => a.date - b.date);

                    console.log('[SMS Service] Sync: Processing', sortedMessages.length, 'total messages sequentially...');

                    for (const msg of sortedMessages) {
                        const { body, address, _id, date } = msg;
                        const smsId = _id ? _id.toString() : `tx_${date}_${address}_${body.length}`;

                        // 1. Check if already exists in db
                        const existing = await dbService.getSmsTransaction(smsId);
                        if (existing) {
                            console.log('[SMS Service] Sync: Skipping already processed SMS:', smsId);
                            continue;
                        }

                        // 2. Check learned patterns
                        const pattern = await patternService.checkPattern(body, address);
                        if (pattern) {
                            if (pattern.action === 'ignore') {
                                console.log('[SMS Service] Sync: Pattern IGNORE match for', address);
                                await dbService.saveSmsTransaction({
                                    smsId,
                                    sender: address,
                                    smsText: body,
                                    date,
                                    amount: 0,
                                    payee: pattern.pattern,
                                    category: null,
                                    description: `Ignored by pattern: ${pattern.pattern}`,
                                    isSpending: false,
                                    status: 'system_ignored'
                                });
                                continue;
                            }
                            
                            console.log('[SMS Service] Sync: Pattern category match for', address);
                            const aiResult = await geminiService.categorizeSms(body);
                            if (aiResult && aiResult.isSpending) {
                                await dbService.saveSmsTransaction({
                                    smsId,
                                    sender: address,
                                    smsText: body,
                                    date,
                                    amount: aiResult.amount,
                                    payee: aiResult.payee || pattern.pattern,
                                    category: pattern.category || aiResult.category,
                                    description: aiResult.description || `Pattern-matched: ${pattern.pattern}`,
                                    isSpending: true,
                                    status: 'pending'
                                });
                                onUnsure({
                                    smsText: body,
                                    sender: address,
                                    aiResult,
                                    isSync: true,
                                    suggestedCategory: pattern.category,
                                    externalSmsId: smsId,
                                    date: date
                                });
                            } else {
                                await dbService.saveSmsTransaction({
                                    smsId,
                                    sender: address,
                                    smsText: body,
                                    date,
                                    amount: 0,
                                    payee: pattern.pattern,
                                    category: null,
                                    description: `Pattern matched category but AI says not spending`,
                                    isSpending: false,
                                    status: 'system_ignored'
                                });
                            }
                            continue;
                        }

                        // 3. Pre-filter
                        const passesPreFilter = checkPreFilter(body);
                        if (!passesPreFilter) {
                            console.log('[SMS Service] Sync: Pre-filter ignored SMS:', body);
                            await dbService.saveSmsTransaction({
                                smsId,
                                sender: address,
                                smsText: body,
                                date,
                                amount: 0,
                                payee: null,
                                category: null,
                                description: 'System ignored (pre-filtered)',
                                isSpending: false,
                                status: 'system_ignored'
                            });
                            continue;
                        }

                        // 4. Run AI
                        console.log('[SMS Service] Sync: Calling AI for', address);
                        const aiResult = await geminiService.categorizeSms(body);

                        if (aiResult && aiResult.isSpending) {
                            console.log('[SMS Service] Sync: AI identified spending!');
                            await dbService.saveSmsTransaction({
                                smsId,
                                sender: address,
                                smsText: body,
                                date,
                                amount: aiResult.amount,
                                payee: aiResult.payee,
                                category: aiResult.category,
                                description: aiResult.description,
                                isSpending: true,
                                status: 'pending'
                            });
                            onUnsure({
                                smsText: body,
                                sender: address,
                                aiResult,
                                isSync: true,
                                externalSmsId: smsId,
                                date: date
                            });
                        } else {
                            console.log('[SMS Service] Sync: AI determined non-spending SMS');
                            await dbService.saveSmsTransaction({
                                smsId,
                                sender: address,
                                smsText: body,
                                date,
                                amount: aiResult ? aiResult.amount : 0,
                                payee: aiResult ? aiResult.payee : null,
                                category: aiResult ? aiResult.category : null,
                                description: aiResult ? aiResult.description : 'AI determined not spending',
                                isSpending: false,
                                status: 'system_ignored'
                            });
                        }
                    }

                    // Refresh ignored SMS list in store
                    await this.fetchIgnoredSms();

                    // Update the last sync timestamp with the newest message found
                    if (messages && messages.length > 0) {
                        const newestDate = Math.max(...messages.map((m: any) => m.date));
                        await dbService.setLastSyncTimestamp(newestDate);
                        console.log('[SMS Service] Sync: Updated lastSyncTimestamp to', new Date(newestDate).toISOString());
                    } else if (!lastSync) {
                        await dbService.setLastSyncTimestamp(Date.now());
                    }

                    useStore.getState().setSyncStatus('completed');
                    setTimeout(() => useStore.getState().setSyncStatus('idle'), 3000);
                } catch (e) {
                    console.error('[SMS Service] Error processing synced SMS:', e);
                    useStore.getState().setSyncStatus('idle');
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
                    const date = message.timestamp || Date.now();
                    const smsId = message.timestamp?.toString() || `listen_${date}_${originatingAddress}_${body.length}`;

                    console.log('\n========================================');
                    console.log('[SMS Service] ✉️ SMS RECEIVED!');
                    console.log('[SMS Service] From:', originatingAddress);
                    console.log('[SMS Service] Body:', body);
                    console.log('========================================\n');

                    // 1. Check if already exists in db
                    const existing = await dbService.getSmsTransaction(smsId);
                    if (existing) {
                        console.log('[SMS Service] Listener: Skipping already processed SMS:', smsId);
                        return;
                    }

                    // 2. Check learned patterns
                    console.log('[SMS Service] Step 1: Checking learned patterns...');
                    const pattern = await patternService.checkPattern(body, originatingAddress);
                    console.log('[SMS Service] Pattern Match Result:', pattern);

                    if (pattern) {
                        if (pattern.action === 'ignore') {
                            console.log('[SMS Service] ❌ Pattern action is IGNORE - saving to DB');
                            await dbService.saveSmsTransaction({
                                smsId,
                                sender: originatingAddress,
                                smsText: body,
                                date,
                                amount: 0,
                                payee: pattern.pattern,
                                category: null,
                                description: `Ignored by pattern: ${pattern.pattern}`,
                                isSpending: false,
                                status: 'system_ignored'
                            });
                            await this.fetchIgnoredSms();
                            return;
                        }

                        console.log('[SMS Service] ✅ Pattern found! Category:', pattern.category);
                        const aiResult = await geminiService.categorizeSms(body);
                        if (aiResult && aiResult.isSpending) {
                            await dbService.saveSmsTransaction({
                                smsId,
                                sender: originatingAddress,
                                smsText: body,
                                date,
                                amount: aiResult.amount,
                                payee: aiResult.payee || pattern.pattern,
                                category: pattern.category || aiResult.category,
                                description: aiResult.description || `Pattern-matched: ${pattern.pattern}`,
                                isSpending: true,
                                status: 'pending'
                            });
                            onUnsure({
                                smsText: body,
                                sender: originatingAddress,
                                aiResult,
                                suggestedCategory: pattern.category,
                                externalSmsId: smsId,
                                date: date,
                            });
                            notificationService.notify(
                                "Expense Detected",
                                `Detected Rs ${aiResult.amount} spending from ${originatingAddress}. Tap to confirm.`,
                                { smsText: body, sender: originatingAddress, aiResult, externalSmsId: smsId }
                            );
                        } else {
                            await dbService.saveSmsTransaction({
                                smsId,
                                sender: originatingAddress,
                                smsText: body,
                                date,
                                amount: 0,
                                payee: pattern.pattern,
                                category: null,
                                description: `Pattern matched category but AI says not spending`,
                                isSpending: false,
                                status: 'system_ignored'
                            });
                        }
                        await this.fetchIgnoredSms();
                        return;
                    }

                    // 3. Pre-filter
                    const passesPreFilter = checkPreFilter(body);
                    if (!passesPreFilter) {
                        console.log('[SMS Service] Listener: Pre-filter ignored SMS:', body);
                        await dbService.saveSmsTransaction({
                            smsId,
                            sender: originatingAddress,
                            smsText: body,
                            date,
                            amount: 0,
                            payee: null,
                            category: null,
                            description: 'System ignored (pre-filtered)',
                            isSpending: false,
                            status: 'system_ignored'
                        });
                        await this.fetchIgnoredSms();
                        return;
                    }

                    // 4. Run AI
                    console.log('[SMS Service] No pattern found - calling Gemini AI directly...');
                    const aiResult = await geminiService.categorizeSms(body);
                    console.log('[SMS Service] AI Result:', JSON.stringify(aiResult, null, 2));

                    if (aiResult && aiResult.isSpending) {
                        await dbService.saveSmsTransaction({
                            smsId,
                            sender: originatingAddress,
                            smsText: body,
                            date,
                            amount: aiResult.amount,
                            payee: aiResult.payee,
                            category: aiResult.category,
                            description: aiResult.description,
                            isSpending: true,
                            status: 'pending'
                        });
                        onUnsure({
                            smsText: body,
                            sender: originatingAddress,
                            aiResult,
                            externalSmsId: smsId,
                            date: date
                        });
                        notificationService.notify(
                            "Expense Detected",
                            `Detected Rs ${aiResult.amount} spending from ${originatingAddress}. Tap to confirm.`,
                            { smsText: body, sender: originatingAddress, aiResult, externalSmsId: smsId }
                        );
                    } else {
                        await dbService.saveSmsTransaction({
                            smsId,
                            sender: originatingAddress,
                            smsText: body,
                            date,
                            amount: aiResult ? aiResult.amount : 0,
                            payee: aiResult ? aiResult.payee : null,
                            category: aiResult ? aiResult.category : null,
                            description: aiResult ? aiResult.description : 'AI determined not spending',
                            isSpending: false,
                            status: 'system_ignored'
                        });
                    }
                    await this.fetchIgnoredSms();
                } catch (processingErr) {
                    console.error('[SMS Service] Error processing incoming SMS:', processingErr);
                }
            });
            console.log('[SMS Service] Listener attached successfully:', !!subscription);
        } catch (err) {
            console.error('[SMS Service] Error attaching SMS listener:', err);
        }
    },

    async testRecentSmsSync(onUnsure: (data: any) => void) {
        console.log('[SMS Service] 🧪 SIMULATING SMS SYNC...');
        const mockSms = {
            body: "Your account XX1234 has been debited by Rs 750.00 for Amazon on 2026-02-09. Not a pattern match yet.",
            address: "BANK-TEST",
        };

        const smsId = 'test_' + Date.now();
        const aiResult = await geminiService.categorizeSms(mockSms.body);
        if (aiResult && aiResult.isSpending) {
            console.log('[SMS Service] Test Sync found simulated spending SMS!');
            
            await dbService.saveSmsTransaction({
                smsId,
                sender: mockSms.address,
                smsText: mockSms.body,
                date: Date.now(),
                amount: aiResult.amount,
                payee: aiResult.payee,
                category: aiResult.category,
                description: aiResult.description,
                isSpending: true,
                status: 'pending'
            });

            onUnsure({
                smsText: mockSms.body,
                sender: mockSms.address,
                aiResult,
                isSync: true,
                externalSmsId: smsId,
                date: Date.now()
            });
        }
    }
};
