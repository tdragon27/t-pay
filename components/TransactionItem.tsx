// components/TransactionItem.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CachedTransaction } from '@/utils/storage';
import { shortenAddress, timeAgo } from '@/utils/format';
import { Colors, Radius, FontSize } from '@/constants/theme';
import { safeOpenTx } from '@/utils/safeOpenUrl';

interface Props {
  tx: CachedTransaction;
  myAddress: string;
}

export function TransactionItem({ tx, myAddress: _myAddress }: Props) {
  const isSend = tx.type === 'send';
  const isBridge = tx.type === 'bridge';

  const openExplorer = () => {
    void safeOpenTx(tx.hash);
  };

  const iconName = isBridge
    ? 'swap-horizontal-outline'
    : isSend
    ? 'arrow-up-outline'
    : 'arrow-down-outline';

  const iconColor = isBridge
    ? Colors.warning
    : isSend
    ? Colors.error
    : Colors.success;

  const iconBg = isBridge
    ? Colors.warningBg
    : isSend
    ? Colors.errorBg
    : Colors.successBg;

  const amountColor = isSend ? Colors.error : Colors.success;
  const amountSign = isSend ? '-' : '+';

  const counterparty = isSend ? tx.to : tx.from;

  return (
    <TouchableOpacity style={styles.container} onPress={openExplorer} activeOpacity={0.7}>
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={18} color={iconColor} />
      </View>

      {/* Details */}
      <View style={styles.details}>
        <Text style={styles.title}>
          {isBridge ? 'Bridge' : isSend ? 'Sent' : 'Received'}
        </Text>
        <Text style={styles.address}>{shortenAddress(counterparty, 4)}</Text>
      </View>

      {/* Amount + time */}
      <View style={styles.right}>
        <Text style={[styles.amount, { color: amountColor }]}>
          {amountSign}${tx.value}
        </Text>
        <Text style={styles.time}>
          {tx.timestamp ? timeAgo(tx.timestamp) : 'Pending'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: FontSize.md,
    color: Colors.text1,
    fontWeight: '500',
  },
  address: {
    fontSize: FontSize.xs,
    color: Colors.text2,
    fontFamily: 'SpaceMono-Regular',
  },
  right: {
    alignItems: 'flex-end',
    gap: 3,
  },
  amount: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  time: {
    fontSize: FontSize.xs,
    color: Colors.text3,
  },
});


