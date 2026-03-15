import PushNotification from 'react-native-push-notification';
import { Platform } from 'react-native';

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
