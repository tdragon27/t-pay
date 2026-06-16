import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/theme';

function TabIcon({ name, focused }: { name: keyof typeof Ionicons.glyphMap; focused: boolean }) {
  return (
    <View style={[styles.iconBubble, focused && styles.iconBubbleActive]}>
      <Ionicons name={name} size={focused ? 22 : 20} color={focused ? '#061018' : Colors.text3} />
    </View>
  );
}

function FloatingTabBackground() {
  return (
    <View style={styles.tabBackgroundClip}>
      {Platform.OS === 'ios' ? (
        <BlurView tint="dark" intensity={92} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,14,24,0.94)' }]} />
      )}
      <LinearGradient
        colors={['rgba(255,255,255,0.115)', 'rgba(25,230,255,0.045)', 'rgba(139,121,255,0.035)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tabTopHighlight} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#8EEBFF',
        tabBarInactiveTintColor: Colors.text3,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIconStyle: styles.tabIcon,
        tabBarBackground: () => <FloatingTabBackground />,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Activity',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'receipt' : 'receipt-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan-tab"
        options={{
          title: 'Split',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'people' : 'people-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="merchant"
        options={{
          title: 'Merchant',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'storefront' : 'storefront-outline'} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'person-circle' : 'person-circle-outline'} focused={focused} />,
        }}
      />

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
    left: 14,
    right: 14,
    bottom: Platform.OS === 'ios' ? 12 : 10,
    height: Platform.OS === 'ios' ? 76 : 68,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 9 : 7,
    paddingHorizontal: 8,
    borderTopWidth: 0,
    borderRadius: 30,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    elevation: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  tabBackgroundClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  tabTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  tabItem: {
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIcon: {
    marginBottom: 0,
  },
  iconBubble: {
    width: 32,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleActive: {
    backgroundColor: '#19E6FF',
    shadowColor: '#00D4FF',
    shadowOpacity: 0.42,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  tabLabel: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '700',
    includeFontPadding: false,
    marginTop: 1,
  },
});