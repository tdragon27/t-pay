import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { safeBack } from '@/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { deleteContact, exportContactsJson, filterContacts, loadContacts, TPayContact, upsertContact } from '@/services/contactService';
import { shortenAddress } from '@/utils/format';

export default function ContactsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pick?: string; address?: string }>();
  const pickMode = params.pick === '1';
  const [contacts, setContacts] = useState<TPayContact[]>([]);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState(params.address ?? '');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setContacts(await loadContacts());
  }

  useEffect(() => { void refresh(); }, []);

  const visibleContacts = useMemo(() => filterContacts(contacts, query), [contacts, query]);

  async function handleSave() {
    setBusy(true);
    try {
      await upsertContact({ id: editingId, name, address, note });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: editingId ? 'Contact updated' : 'Contact saved' });
      setName('');
      setAddress('');
      setNote('');
      setEditingId(undefined);
      await refresh();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not save contact', text2: error?.message ?? 'Please check the address.' });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(contact: TPayContact) {
    setEditingId(contact.id);
    setName(contact.name);
    setAddress(contact.address);
    setNote(contact.note ?? '');
  }

  function confirmDelete(contact: TPayContact) {
    Alert.alert('Delete contact?', `${contact.name} will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteContact(contact.id); await refresh(); } },
    ]);
  }

  async function exportJson() {
    const json = await exportContactsJson();
    await Clipboard.setStringAsync(json);
    await Share.share({ title: 'T Pay contacts export', message: json });
  }

  function pick(contact: TPayContact) {
    if (!pickMode) return;
    router.replace({ pathname: '/send' as any, params: { address: contact.address } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => safeBack(router)}>
          <Ionicons name="arrow-back" size={22} color={Colors.text1} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Contacts</Text>
          <Text style={styles.subtitle}>Saved addresses for safer T Pay transfers.</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={exportJson}>
          <Ionicons name="download-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>{editingId ? 'Edit Contact' : 'Add Contact'}</Text>
          <Input label="Name" value={name} onChangeText={setName} placeholder="Alice, Supplier, Coffee Shop..." />
          <Input label="Wallet Address" value={address} onChangeText={setAddress} placeholder="0x..." autoCapitalize="none" autoCorrect={false} />
          <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Payroll, merchant, friend..." />
          <View style={styles.formActions}>
            {editingId ? <Button label="Cancel" variant="ghost" onPress={() => { setEditingId(undefined); setName(''); setAddress(''); setNote(''); }} style={{ flex: 1 }} /> : null}
            <Button label={busy ? 'Saving...' : editingId ? 'Update Contact' : 'Save Contact'} onPress={handleSave} loading={busy} style={{ flex: 1 }} />
          </View>
        </Card>

        <Input label="Search Contacts" value={query} onChangeText={setQuery} placeholder="Name or address" />

        {visibleContacts.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="people-outline" size={34} color={Colors.text3} />
            <Text style={styles.emptyTitle}>No contacts yet</Text>
            <Text style={styles.emptyText}>Save frequent payees to avoid copy-paste mistakes and speed up sends.</Text>
          </Card>
        ) : visibleContacts.map((contact) => (
          <TouchableOpacity key={contact.id} activeOpacity={0.78} onPress={() => pick(contact)}>
            <Card style={styles.contactCard}>
              <View style={[styles.avatar, { backgroundColor: `${contact.avatarColor}22`, borderColor: `${contact.avatarColor}66` }]}> 
                <Text style={[styles.avatarText, { color: contact.avatarColor }]}>{contact.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.contactMeta}>
                <Text style={styles.contactName}>{contact.name}</Text>
                <Text style={styles.contactAddress}>{shortenAddress(contact.address, 6)}</Text>
                {contact.note ? <Text style={styles.note}>{contact.note}</Text> : null}
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity style={styles.smallBtn} onPress={() => startEdit(contact)}>
                  <Ionicons name="create-outline" size={17} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => confirmDelete(contact)}>
                  <Ionicons name="trash-outline" size={17} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </Card>
          </TouchableOpacity>
        ))}
        <View style={{ height: 88 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: 12 },
  iconBtn: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
  title: { color: Colors.text1, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: Colors.text2, fontSize: FontSize.sm, marginTop: 2 },
  content: { padding: Spacing.md, gap: Spacing.md },
  formCard: { gap: Spacing.md },
  sectionTitle: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  formActions: { flexDirection: 'row', gap: 10 },
  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyTitle: { color: Colors.text1, fontSize: FontSize.lg, fontWeight: '800' },
  emptyText: { color: Colors.text2, textAlign: 'center', lineHeight: 20 },
  contactCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarText: { fontSize: 20, fontWeight: '800' },
  contactMeta: { flex: 1, gap: 3 },
  contactName: { color: Colors.text1, fontSize: FontSize.md, fontWeight: '800' },
  contactAddress: { color: Colors.text2, fontSize: FontSize.xs, fontFamily: 'SpaceMono-Regular' },
  note: { color: Colors.text3, fontSize: FontSize.xs },
  rowActions: { flexDirection: 'row', gap: 8 },
  smallBtn: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.elevated, borderWidth: 1, borderColor: Colors.border },
});



