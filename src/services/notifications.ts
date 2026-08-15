import PushNotification from 'react-native-push-notification';
import { Platform } from 'react-native';

const DAILY_REMINDER_ID = 'daily-reminder';

class NotificationService {
    configure(onNotification: (notification: any) => void) {
        try {
            console.log('[Notification Service] Configuring PushNotification...');
            PushNotification.configure({
                onNotification: function (notification) {
                    console.log("NOTIFICATION:", notification);
                    onNotification(notification);
                },

                onAction: function (notification) {
                    console.log("ACTION:", notification.action);
                    console.log("NOTIFICATION:", notification);
                    onNotification({
                        ...notification,
                        userInteraction: true,
                        isAction: true,
                    });
                },

                requestPermissions: Platform.OS === 'ios',
            });

            if (Platform.OS === 'android') {
                PushNotification.createChannel(
                    {
                        channelId: "expense-tracker-sms",
                        channelName: "SMS Expense Notifications",
                        channelDescription: "Notifications for detected expenses from SMS",
                        playSound: true,
                        importance: 4,
                        vibrate: true,
                    },
                    (created) => console.log(`createChannel returned '${created}'`)
                );
            }
            console.log('[Notification Service] Configuration successful');
        } catch (e) {
            console.error('[Notification Service] Configure failed:', e);
        }
    }

    notify(title: string, message: string, data?: any) {
        PushNotification.localNotification({
            channelId: "expense-tracker-sms",
            title: title,
            message: message,
            userInfo: data,
            playSound: true,
            soundName: "default",
            importance: "high",
            priority: "high",
            actions: ["Confirm", "Ignore"],
            invokeApp: true,
        });
    }

    /**
     * Daily repeating reminder to review pending categorizations, at a
     * user-chosen local time (see SettingsScreen). Uses a fixed id so
     * re-calling this (e.g. on every app start, or when the user changes
     * the time) replaces rather than stacks duplicate alarms.
     *
     * Content is static — there's no headless/background task in this app
     * to compute a live pending count at fire time, so this can't say
     * "you have 3 pending transactions"; it's always the same nudge text.
     * Tapping it opens the app, which already surfaces the first queued
     * item automatically on launch (see App.tsx's setup()).
     */
    scheduleDailyReminder(hour: number, minute: number) {
        try {
            this.cancelDailyReminder();

            const now = new Date();
            const fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
            if (fireDate.getTime() <= now.getTime()) {
                fireDate.setDate(fireDate.getDate() + 1);
            }

            PushNotification.localNotificationSchedule({
                id: DAILY_REMINDER_ID,
                channelId: "expense-tracker-sms",
                title: "Review your expenses",
                message: "Check for any auto-tracked transactions waiting for your approval.",
                date: fireDate,
                repeatType: "day",
                allowWhileIdle: true,
            });
            console.log('[Notification Service] Daily reminder scheduled for', fireDate.toString());
        } catch (e) {
            console.error('[Notification Service] Failed to schedule daily reminder:', e);
            throw e;
        }
    }

    cancelDailyReminder() {
        try {
            PushNotification.cancelLocalNotification(DAILY_REMINDER_ID);
        } catch (e) {
            console.error('[Notification Service] Failed to cancel daily reminder:', e);
        }
    }

    checkInitialNotification(onNotification: (notification: any) => void) {
        PushNotification.popInitialNotification((notification) => {
            if (notification) {
                console.log("INITIAL NOTIFICATION:", notification);
                onNotification({
                    ...notification,
                    userInteraction: true,
                });
            }
        });
    }
}

export const notificationService = new NotificationService();
