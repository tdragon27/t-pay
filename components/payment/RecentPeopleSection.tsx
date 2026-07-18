import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { PressScale } from '@/components/ui/PressScale';
import { Colors, FontFamily, FontSize, Radius } from '@/constants/theme';
import type { UnifiedActivityItem } from '@/services/activityService';
import { loadContacts, type TPayContact } from '@/services/contactService';

function contactInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function orderContacts(contacts: TPayContact[], activityItems: UnifiedActivityItem[]) {
  const byAddress = new Map(contacts.map((contact) => [contact.address.toLowerCase(), contact]));
  const ordered: TPayContact[] = [];
  const seen = new Set<string>();

  for (const item of activityItems) {
    const address = item.counterparty?.toLowerCase();
    const contact = address ? byAddress.get(address) : undefined;
    if (contact && !seen.has(contact.id)) {
      seen.add(contact.id);
      ordered.push(contact);
    }
  }

  const remaining = contacts
    .filter((contact) => !seen.has(contact.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return [...ordered, ...remaining].slice(0, 5);
}

export function RecentPeopleSection({ activityItems }: { activityItems: UnifiedActivityItem[] }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<TPayContact[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void loadContacts()
        .then((next) => {
          if (active) setContacts(next);
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, []),
  );

  const recentContacts = useMemo(
    () => orderContacts(contacts, activityItems),
    [activityItems, contacts],
  );

  const openContacts = () => router.push('/contacts' as any);
  const payContact = (contact: TPayContact) => {
    router.push({ pathname: '/send' as any, params: { address: contact.address } });
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Recent people</Text>
        <PressScale
          style={styles.manageButton}
          onPress={openContacts}
          accessibilityRole="button"
          accessibilityLabel="Manage contacts"
        >
          <View style={styles.manageContent}>
            <Text style={styles.manageText}>Manage</Text>
          </View>
        </PressScale>
      </View>

      {loading ? (
        <View style={styles.skeletonRow} accessibilityLabel="Loading contacts">
          {[0, 1, 2, 3].map((item) => (
            <View key={item} style={styles.skeletonPerson}>
              <View style={styles.skeletonAvatar} />
              <View style={styles.skeletonLabel} />
            </View>
          ))}
        </View>
      ) : recentContacts.length === 0 ? (
        <PressScale
          style={styles.emptyButton}
          onPress={openContacts}
          accessibilityRole="button"
          accessibilityLabel="Add a contact"
        >
          <View style={styles.emptyContent}>
            <View style={styles.emptyIcon}>
              <Ionicons name="person-add-outline" size={18} color={Colors.primary} />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>Save people you pay often</Text>
              <Text style={styles.emptyText}>Add a contact for faster payments.</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={Colors.text3} />
          </View>
        </PressScale>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.peopleRow}
        >
          {recentContacts.map((contact) => (
            <PressScale
              key={contact.id}
              style={styles.personButton}
              onPress={() => payContact(contact)}
              accessibilityRole="button"
              accessibilityLabel={`Pay ${contact.name}`}
            >
              <View style={styles.personContent}>
                <View style={[styles.avatar, { backgroundColor: `${contact.avatarColor}20` }]}>
                  <Text style={[styles.avatarText, { color: contact.avatarColor }]}>
                    {contactInitials(contact.name)}
                  </Text>
                </View>
                <Text style={styles.personName} numberOfLines={1}>{contact.name}</Text>
              </View>
            </PressScale>
          ))}
          <PressScale
            style={styles.addButton}
            onPress={openContacts}
            accessibilityRole="button"
            accessibilityLabel="Add contact"
          >
            <View style={styles.personContent}>
              <View style={styles.addAvatar}>
                <Ionicons name="add" size={21} color={Colors.primary} />
              </View>
              <Text style={styles.personName}>Add</Text>
            </View>
          </PressScale>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  title: {
    color: Colors.text1,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  manageButton: { minWidth: 60, height: 36, borderRadius: Radius.full },
  manageContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  manageText: { color: Colors.primary, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },
  peopleRow: { gap: 8, paddingHorizontal: 1, paddingRight: 10 },
  personButton: { width: 68, height: 80, borderRadius: 17 },
  addButton: { width: 58, height: 80, borderRadius: 17 },
  personContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(225,247,255,0.09)',
  },
  avatarText: { fontFamily: FontFamily.displaySemiBold, fontSize: FontSize.sm },
  addAvatar: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(53,213,244,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53,213,244,0.22)',
  },
  personName: {
    maxWidth: 66,
    color: Colors.text2,
    fontFamily: FontFamily.bodyMedium,
    fontSize: 10.5,
    textAlign: 'center',
  },
  emptyButton: { height: 66, borderRadius: 18 },
  emptyContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    borderRadius: 18,
    backgroundColor: '#0D141D',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(225,247,255,0.09)',
  },
  emptyIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryGlow,
  },
  emptyCopy: { flex: 1, minWidth: 0 },
  emptyTitle: { color: Colors.text1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  emptyText: { color: Colors.text3, fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },
  skeletonRow: { height: 80, flexDirection: 'row', gap: 8 },
  skeletonPerson: { width: 68, alignItems: 'center', justifyContent: 'center', gap: 8 },
  skeletonAvatar: { width: 48, height: 48, borderRadius: 17, backgroundColor: Colors.elevated },
  skeletonLabel: { width: 42, height: 7, borderRadius: 4, backgroundColor: Colors.elevated },
});
