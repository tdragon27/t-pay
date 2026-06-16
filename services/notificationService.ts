import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { notifyLocal, type NotificationCategory } from '@/services/pushNotificationService';

export type TPayNotificationType = 'invoice' | 'payment' | 'bridge' | 'security' | 'system';

export interface TPayNotification {
  id: string;
  type: TPayNotificationType;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  route?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
}

const STORAGE_KEY = 'tpay_notifications_v1';
let idCounter = 0;
const MAX_NOTIFICATIONS = 80;

function makeId(type: TPayNotificationType) {
  idCounter += 1;
  return `${type}_${Date.now()}_${idCounter}`;
}

function categoryFromType(type: TPayNotificationType): NotificationCategory {
  if (type === 'payment') return 'payment';
  if (type === 'invoice') return 'invoice';
  if (type === 'bridge') return 'bridge';
  if (type === 'security') return 'security';
  return 'system';
}

async function readRaw(): Promise<TPayNotification[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as TPayNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRaw(items: TPayNotification[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_NOTIFICATIONS)));
}

export async function getNotifications() {
  return readRaw();
}

export async function getUnreadNotificationCount() {
  const items = await readRaw();
  return items.filter((item) => !item.read).length;
}

export async function recordNotification(input: Omit<TPayNotification, 'id' | 'createdAt' | 'read'> & { silent?: boolean }) {
  const next: TPayNotification = {
    id: makeId(input.type),
    type: input.type,
    title: input.title,
    message: input.message,
    route: input.route,
    data: input.data,
    createdAt: Date.now(),
    read: false,
  };

  const current = await readRaw();
  await writeRaw([next, ...current]);

  if (!input.silent) {
    Toast.show({ type: input.type === 'security' ? 'info' : 'success', text1: input.title, text2: input.message });
    void notifyLocal(categoryFromType(input.type), input.title, input.message, input.data as Record<string, unknown> | undefined);
  }

  return next;
}

export async function markNotificationRead(id: string) {
  const items = await readRaw();
  const next = items.map((item) => (item.id === id ? { ...item, read: true } : item));
  await writeRaw(next);
  return next;
}

export async function markAllNotificationsRead() {
  const items = await readRaw();
  const next = items.map((item) => ({ ...item, read: true }));
  await writeRaw(next);
  return next;
}

export async function clearNotifications() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function notifyInvoiceCreated(invoiceId: string, label: string, amount: string) {
  return recordNotification({
    type: 'invoice',
    title: 'Invoice ready',
    message: `${label} - ${amount}`,
    route: `/pay?invoiceId=${encodeURIComponent(invoiceId)}`,
    data: { invoiceId },
  });
}

export async function notifyInvoicePaid(invoiceId: string, txHash?: string) {
  return recordNotification({
    type: 'payment',
    title: 'Invoice paid',
    message: txHash ? `Settlement tx ${txHash.slice(0, 10)}...` : 'Payment was marked as paid.',
    route: `/pay?invoiceId=${encodeURIComponent(invoiceId)}`,
    data: { invoiceId, txHash },
  });
}

export async function notifyBridgeSubmitted(txHash: string, invoiceId?: string) {
  return recordNotification({
    type: 'bridge',
    title: 'Bridge submitted',
    message: `Track tx ${txHash.slice(0, 10)}... then return to pay.`,
    route: invoiceId ? `/pay?invoiceId=${encodeURIComponent(invoiceId)}` : '/bridge',
    data: { txHash, invoiceId },
  });
}

export async function notifySecurityEvent(title: string, message: string) {
  return recordNotification({
    type: 'security',
    title,
    message,
    route: '/security-backup',
  });
}


