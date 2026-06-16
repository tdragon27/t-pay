import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { STORAGE_KEYS } from '@/constants/STORAGE_KEYS';

export type NotificationCategory = 'payment' | 'invoice' | 'bridge' | 'market' | 'security' | 'streak' | 'system';
export type NotificationPrefs = Record<NotificationCategory, boolean>;

const DEFAULT_PREFS: NotificationPrefs = {
  payment: true,
  invoice: true,
  bridge: true,
  market: true,
  security: true,
  streak: true,
  system: true,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function normalizePrefs(raw: Partial<NotificationPrefs> | null): NotificationPrefs {
  return { ...DEFAULT_PREFS, ...(raw ?? {}) };
}

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_PREFS);
  if (!raw) return DEFAULT_PREFS;
  try {
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveNotificationPrefs(next: Partial<NotificationPrefs>) {
  const merged = normalizePrefs({ ...(await loadNotificationPrefs()), ...next });
  await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_PREFS, JSON.stringify(merged));
  return merged;
}

export async function requestNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return Boolean(requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL);
}

export async function registerForPushNotifications() {
  const granted = await requestNotificationPermission();
  if (!granted) return null;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await AsyncStorage.setItem(STORAGE_KEYS.PUSH_TOKEN, token.data);
    return token.data;
  } catch {
    return null;
  }
}

export async function getStoredPushToken() {
  return AsyncStorage.getItem(STORAGE_KEYS.PUSH_TOKEN);
}

export async function notifyLocal(category: NotificationCategory, title: string, body: string, data?: Record<string, unknown>) {
  const prefs = await loadNotificationPrefs();
  if (!prefs[category]) return null;
  try {
    return Notifications.scheduleNotificationAsync({
      content: { title, body, data: data ?? {}, sound: false },
      trigger: null,
    });
  } catch {
    return null;
  }
}
