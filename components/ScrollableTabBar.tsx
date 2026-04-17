import React, { useRef, useEffect } from 'react';
import { View, TouchableOpacity, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// Reference to allowed tabs (set by _layout.tsx)
declare global {
  var ALLOWED_TABS_REF: { tabs: Set<string> };
}

export function ScrollableTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to active tab
  useEffect(() => {
    if (scrollRef.current && state.index > 3) {
      scrollRef.current.scrollTo({ x: (state.index - 2) * 76, animated: true });
    }
  }, [state.index]);

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 4) }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          // Skip hidden tabs - check if tab is in allowed list
          if (!global.ALLOWED_TABS_REF?.tabs.has(route.name)) {
            return null;
          }

          const label = (options.tabBarLabel ?? options.title ?? route.name) as string;
          const iconName = (options as any).tabBarIconName as keyof typeof Ionicons.glyphMap | undefined;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={[styles.tab, isFocused && styles.activeTab]}
              activeOpacity={0.7}
            >
              {options.tabBarIcon ? (
                options.tabBarIcon({
                  focused: isFocused,
                  color: isFocused ? Colors.orange600 : Colors.gray400,
                  size: 22,
                })
              ) : null}
              <Text
                style={[
                  styles.label,
                  { color: isFocused ? Colors.orange600 : Colors.gray400 },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray200,
    paddingTop: 4,
  },
  scrollContent: {
    paddingHorizontal: 4,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 64,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  activeTab: {
    backgroundColor: Colors.orange50,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
