import React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import { Colors, FontFamily } from '@/constants/theme';

function TabIcon({
  name,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
}) {
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.iconBubble, focused && styles.iconBubbleActive]}>
        <Ionicons
          name={name}
          size={focused ? 21 : 20}
          color={focused ? Colors.primary : Colors.text3}
        />
      </View>
      {focused ? <View style={styles.activeDot} /> : null}
    </View>
  );
}

function TabBackground() {
  return (
    <View style={styles.background}>
      {Platform.OS === 'ios' ? (
        <BlurView tint="dark" intensity={58} style={StyleSheet.absoluteFill} />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(13,17,24,0.97)' },
          ]}
        />
      )}
      <View style={styles.backgroundTint} />
      <View style={styles.backgroundHighlight} />
    </View>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const webTabWidth = Math.min(Math.max(width - 24, 0), 536);
  const webTabOffset = Math.max(12, (width - webTabWidth) / 2);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarStyle: [
          styles.tabBar,
          Platform.OS === 'web'
            ? { width: webTabWidth, left: webTabOffset, right: undefined }
            : undefined,
        ],
        tabBarItemStyle: styles.tabItem,
        tabBarShowLabel: true,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.text3,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIconStyle: styles.tabIcon,
        tabBarBackground: () => <TabBackground />,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Hoạt động',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'time' : 'time-outline'}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="merchant"
        options={{
          title: 'Business',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'storefront' : 'storefront-outline'}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'person-circle' : 'person-circle-outline'}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen name="scan-tab" options={{ href: null }} />
      <Tabs.Screen name="pay-hub" options={{ href: null }} />
      <Tabs.Screen name="earn" options={{ href: null }} />
      <Tabs.Screen name="markets" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="portfolio_v2" options={{ href: null }} />
      <Tabs.Screen name="recurring" options={{ href: null }} />
      <Tabs.Screen name="invoices" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: Platform.OS === 'ios' ? 8 : 7,
    height: Platform.OS === 'ios' ? 66 : 64,
    paddingTop: 5,
    paddingBottom: Platform.OS === 'ios' ? 7 : 5,
    paddingHorizontal: 6,
    borderTopWidth: 0,
    borderRadius: 24,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    elevation: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(225,247,255,0.12)',
  },
  backgroundTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,15,22,0.64)',
  },
  backgroundHighlight: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tabItem: {
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIcon: { marginBottom: 0 },
  iconWrap: {
    width: 36,
    height: 31,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  iconBubble: {
    width: 39,
    height: 29,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleActive: {
    backgroundColor: 'rgba(176,239,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(179,241,255,0.24)',
    shadowColor: Colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  activeDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 1,
  },
  tabLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 10.5,
    lineHeight: 13,
    includeFontPadding: false,
    marginTop: 1,
  },
});
