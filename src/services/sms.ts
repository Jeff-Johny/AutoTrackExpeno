import { PermissionsAndroid, Platform, DeviceEventEmitter, NativeModules } from 'react-native';
import { geminiService } from '../api/gemini';
import { patternService } from './patterns';
import { expenseService } from './expense';
import { notificationService } from './notifications';
import { dbService } from './db';
import { useStore } from '../store/useStore';
import { parseTransactionText } from './transactionParser';
import { guessCategoryFromText } from '../utils/categoryKeywords';


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

interface ClassifiedTransaction {
    status: 'pending' | 'system_ignored';
    amount: number;
    payee: string | null;
    category: string | null;
    description: string;
    isCertain: boolean;
    /** Which tier actually produced `category` — drives the "AI-assisted" badge. */
    source: 'pattern' | 'keyword' | 'ai' | 'manual';
}

/**
 * Categorization priority: learned payee pattern → static keyword
 * dictionary → AI (last resort, only when both come up empty).
 * Amount/payee are extracted deterministically via transactionParser and
 * are never overwritten by the AI fallback — only `category` (and
 * amount/payee if our own regex extraction failed) come from AI. This means
 * an AI outage degrades to "needs manual categorization", never to a
 * silently dropped transaction.
 */
async function classifyTransaction(body: string, sender: string): Promise<ClassifiedTransaction> {
    const result = await classifyTransactionInner(body, sender);

    // Safety net: never surface a "pending" item for the user to confirm
    // when no source (regex, pattern, keyword, or AI) could pin down an
    // amount — that's how things like insurance claim-settled acknowledgements
    // slip through as empty-amount "transactions". A real bank debit SMS
    // always states an amount, so a missing one means this wasn't a spend.
    if (result.status === 'pending' && (!result.amount || result.amount <= 0)) {
        return {
            ...result,
            status: 'system_ignored',
            description: 'System ignored (no amount detected)',
        };
    }
    return result;
}

async function classifyTransactionInner(body: string, sender: string): Promise<ClassifiedTransaction> {
    const parsed = parseTransactionText(body);
    console.log('[SMS Service] Parsed (regex, no AI):', parsed);

    if (!parsed.isSpending) {
        console.log('[SMS Service] Classify: pre-filter says not spending');
        return {
            status: 'system_ignored',
            amount: 0,
            payee: parsed.payee,
            category: null,
            description: 'System ignored (pre-filtered)',
            isCertain: false,
            source: 'manual',
        };
    }

    const pattern = await patternService.checkPattern(body, sender, parsed.payee || undefined);
    if (pattern) {
        console.log('[SMS Service] Classify: learned pattern match:', pattern);
        if (pattern.action === 'ignore') {
            return {
                status: 'system_ignored',
                amount: 0,
                payee: parsed.payee || pattern.pattern,
                category: null,
                description: `Ignored by payee rule: ${parsed.payee || pattern.pattern}`,
                isCertain: true,
                source: 'pattern',
            };
        }
        return {
            status: 'pending',
            amount: parsed.amount || 0,
            payee: parsed.payee || pattern.pattern,
            category: pattern.category || null,
            description: `Pattern-matched: ${pattern.pattern}`,
            isCertain: true,
            source: 'pattern',
        };
    }

    const keywordCategory = guessCategoryFromText(parsed.payee, body);
    if (keywordCategory) {
        console.log('[SMS Service] Classify: keyword dictionary match:', keywordCategory);
        return {
            status: 'pending',
            amount: parsed.amount || 0,
            payee: parsed.payee,
            category: keywordCategory,
            description: 'Keyword-matched category',
            isCertain: false,
            source: 'keyword',
        };
    }

    console.log('[SMS Service] No pattern/keyword match, falling back to AI...');
    const liveCategories = useStore.getState().categories.map(c => c.category);
    const aiResult = await geminiService.categorizeSms(body, liveCategories.length ? liveCategories : undefined);

    // The regex pre-filter (isLikelySpendingText) is a coarse, keyword-based
    // net that can't cover every non-spend template it hasn't seen (e.g. a
    // new insurer's claim-settled wording). DeepSeek is asked to judge
    // isSpending independently with much broader context — trust a definite
    // `false` from it here rather than discarding that signal and only
    // reading category/amount/payee off the response. This is what lets new,
    // unseen non-spend patterns get rejected without a keyword-list update.
    if (aiResult && aiResult.isSpending === false) {
        console.log('[SMS Service] Classify: AI determined this is not a spend:', aiResult);
        return {
            status: 'system_ignored',
            amount: 0,
            payee: parsed.payee || aiResult.payee || null,
            category: null,
            description: `AI: not a spend (${aiResult.description || 'no reason given'})`,
            isCertain: false,
            source: 'ai',
        };
    }

    return {
        status: 'pending',
        amount: parsed.amount || aiResult?.amount || 0,
        payee: parsed.payee || aiResult?.payee || null,
        category: aiResult?.category || null,
        description: aiResult?.description || (aiResult ? 'AI-categorized' : 'Needs manual categorization (AI unavailable)'),
        isCertain: false,
        source: aiResult?.category ? 'ai' : 'manual',
    };
}

function toAiResultShape(classified: ClassifiedTransaction) {
    return {
        isSpending: true,
        amount: classified.amount,
        payee: classified.payee,
        category: classified.category || '',
        description: classified.description,
        isCertain: classified.isCertain,
        usedAI: classified.source === 'ai',
    };
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

                        const existing = await dbService.getSmsTransaction(smsId);
                        if (existing) {
                            console.log('[SMS Service] Sync: Skipping already processed SMS:', smsId);
                            continue;
                        }

                        const classified = await classifyTransaction(body, address);

                        await dbService.saveSmsTransaction({
                            smsId,
                            sender: address,
                            smsText: body,
                            date,
                            amount: classified.amount,
                            payee: classified.payee,
                            category: classified.category,
                            description: classified.description,
                            isSpending: classified.status === 'pending',
                            status: classified.status,
                        });

                        if (classified.status === 'pending') {
                            onUnsure({
                                smsText: body,
                                sender: address,
                                aiResult: toAiResultShape(classified),
                                isSync: true,
                                externalSmsId: smsId,
                                date: date,
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

                    const existing = await dbService.getSmsTransaction(smsId);
                    if (existing) {
                        console.log('[SMS Service] Listener: Skipping already processed SMS:', smsId);
                        return;
                    }

                    const classified = await classifyTransaction(body, originatingAddress);

                    await dbService.saveSmsTransaction({
                        smsId,
                        sender: originatingAddress,
                        smsText: body,
                        date,
                        amount: classified.amount,
                        payee: classified.payee,
                        category: classified.category,
                        description: classified.description,
                        isSpending: classified.status === 'pending',
                        status: classified.status,
                    });

                    if (classified.status === 'pending') {
                        const aiResult = toAiResultShape(classified);
                        onUnsure({
                            smsText: body,
                            sender: originatingAddress,
                            aiResult,
                            externalSmsId: smsId,
                            date: date,
                        });
                        notificationService.notify(
                            "Expense Detected",
                            `Detected Rs ${classified.amount} spending from ${originatingAddress}. Tap to confirm.`,
                            { smsText: body, sender: originatingAddress, aiResult, externalSmsId: smsId }
                        );
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
        const classified = await classifyTransaction(mockSms.body, mockSms.address);
        if (classified.status === 'pending') {
            console.log('[SMS Service] Test Sync found simulated spending SMS!');

            await dbService.saveSmsTransaction({
                smsId,
                sender: mockSms.address,
                smsText: mockSms.body,
                date: Date.now(),
                amount: classified.amount,
                payee: classified.payee,
                category: classified.category,
                description: classified.description,
                isSpending: true,
                status: 'pending'
            });

            onUnsure({
                smsText: mockSms.body,
                sender: mockSms.address,
                aiResult: toAiResultShape(classified),
                isSync: true,
                externalSmsId: smsId,
                date: Date.now()
            });
        }
    }
};
