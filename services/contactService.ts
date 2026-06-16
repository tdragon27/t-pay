import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/STORAGE_KEYS';

export interface TPayContact {
  id: string;
  name: string;
  address: `0x${string}`;
  avatarColor: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

const AVATAR_COLORS = ['#00D4FF', '#00E88F', '#8B79FF', '#FFB547', '#FF4D6A', '#6FA8FF', '#2DE2C5'];

function isAddressLike(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function normalizeContactAddress(value: string): `0x${string}` {
  const normalized = value.trim();
  if (!isAddressLike(normalized)) throw new Error('Invalid EVM address.');
  return normalized as `0x${string}`;
}

export function avatarColorFromAddress(address: string) {
  const clean = address.toLowerCase().replace(/^0x/, '');
  const score = clean.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[score % AVATAR_COLORS.length];
}

export async function loadContacts(): Promise<TPayContact[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.CONTACTS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TPayContact[];
    return parsed
      .filter((item) => item?.name && isAddressLike(item.address))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function persistContacts(contacts: TPayContact[]) {
  await AsyncStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
}

export async function upsertContact(input: { id?: string; name: string; address: string; note?: string }): Promise<TPayContact> {
  const name = input.name.trim();
  if (!name) throw new Error('Contact name is required.');
  const address = normalizeContactAddress(input.address);
  const current = await loadContacts();
  const existing = current.find((item) => item.id === input.id || item.address.toLowerCase() === address.toLowerCase());
  const now = Date.now();
  const next: TPayContact = {
    id: existing?.id ?? `contact_${now}_${address.slice(-6)}`,
    name,
    address,
    avatarColor: existing?.avatarColor ?? avatarColorFromAddress(address),
    note: input.note?.trim() || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await persistContacts([next, ...current.filter((item) => item.id !== next.id && item.address.toLowerCase() !== address.toLowerCase())]);
  return next;
}

export async function deleteContact(id: string) {
  const current = await loadContacts();
  await persistContacts(current.filter((item) => item.id !== id));
}

export async function findContactByAddress(address?: string | null): Promise<TPayContact | null> {
  if (!address) return null;
  const contacts = await loadContacts();
  return contacts.find((item) => item.address.toLowerCase() === address.toLowerCase()) ?? null;
}

export function filterContacts(contacts: TPayContact[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return contacts;
  return contacts.filter((item) => item.name.toLowerCase().includes(needle) || item.address.toLowerCase().includes(needle));
}

export async function exportContactsJson() {
  const contacts = await loadContacts();
  return JSON.stringify({ exportedAt: new Date().toISOString(), contacts }, null, 2);
}
