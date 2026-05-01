import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollableTabBar } from '@/components/ScrollableTabBar';
import { WelcomeHeader } from '@/components/WelcomeHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MobileRole } from '@/types';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// Global ref to store allowed tabs - doesn't trigger reactivity
let ALLOWED_TABS_REF = { tabs: new Set<string>() };

// Initialize on global object so ScrollableTabBar can access it
if (typeof global !== 'undefined') {
  (global as any).ALLOWED_TABS_REF = ALLOWED_TABS_REF;
}

type TabDef = {
  name: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  roles: MobileRole[];
};

const TAB_DEFS: TabDef[] = [
  { name: 'index',      title: 'Home',     icon: 'home',       roles: ['Admin', 'Doctor', 'Support Staff'] },
  { name: 'patients',  title: 'Patients', icon: 'people',     roles: ['Admin', 'Doctor', 'Surgeon', 'Scrub Nurse', 'Anesthetist', 'Support Staff'] },
  { name: 'va',        title: 'VA',       icon: 'eye',        roles: ['Doctor', 'Support Staff'] },
  { name: 'consult',   title: 'Consult',  icon: 'medkit',     roles: ['Doctor'] },
  { name: 'presurgery',title: 'Pre-Surg', icon: 'clipboard',  roles: ['Doctor'] },
  { name: 'surgery',   title: 'Surgery',  icon: 'cut',        roles: ['Doctor'] },
  { name: 'postop',    title: 'Post-Op',  icon: 'pulse',      roles: ['Doctor'] },
  { name: 'glasses',   title: 'Glasses',  icon: 'glasses',    roles: ['Admin'] },
  { name: 'drugs',     title: 'Drugs',    icon: 'medical',    roles: ['Admin'] },
  { name: 'reports',   title: 'Reports',  icon: 'bar-chart',  roles: ['Admin', 'Doctor', 'Support Staff'] },
  { name: 'register',  title: 'Register', icon: 'person-add', roles: ['Admin'] },
];

// Universal tab bar that filters hidden tabs
function UniversalTabBar(props: BottomTabBarProps) {
  const { state, descriptors, navigation } = props;
  const insets = useSafeAreaInsets();
  
  const visibleRoutes = state.routes.filter(route => ALLOWED_TABS_REF.tabs.has(route.name));

  // If using scrollable (many tabs)
  if (visibleRoutes.length > 5) {
    return <ScrollableTabBar {...props} />;
  }

  // Default tab bar implementation for few tabs
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: Colors.white,
        borderTopWidth: 1,
        borderTopColor: Colors.gray200,
        paddingBottom: Math.max(insets.bottom, 6),
        paddingTop: 4,
      }}
    >
      {visibleRoutes.map((route) => {
        const { options } = descriptors[route.key];
        const isFocused = state.routes[state.index]?.key === route.key;
        const label = (options.tabBarLabel ?? options.title ?? route.name) as string;

        return (
          <TouchableOpacity
            key={route.key}
            onPress={() => {
              navigation.navigate(route.name);
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}
          >
            {options.tabBarIcon ? (
              options.tabBarIcon({
                focused: isFocused,
                color: isFocused ? Colors.primaryLight : Colors.gray400,
                size: 24,
              })
            ) : null}
            <Text style={{ fontSize: 9, marginTop: 4, color: isFocused ? Colors.primaryLight : Colors.gray400 }}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  // Roles with only Patient List — redirect from Home to Patients
  const PATIENT_ONLY_ROLES: MobileRole[] = ['Surgeon', 'Scrub Nurse', 'Anesthetist'];
  const role = user?.role;
  const isPatientOnlyRole = !!role && PATIENT_ONLY_ROLES.includes(role);

  // Update allowed tabs when role changes
  useEffect(() => {
    if (role) {
      ALLOWED_TABS_REF.tabs = new Set(
        TAB_DEFS.filter(tab => tab.roles.includes(role)).map(tab => tab.name)
      );
    }
  }, [role]);

  if (isLoading || !user || !role) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primaryLight} />
      </View>
    );
  }

  // For patient-only roles: start on the patients tab and hide the Home tab
  // using href:null. No navigation call needed from the layout — no loop risk.
  return (
    <Tabs
      initialRouteName={isPatientOnlyRole ? 'patients' : 'index'}
      tabBar={(props) => <UniversalTabBar {...props} />}
      screenOptions={{
        header: () => <WelcomeHeader user={user} onLogout={logout} />,
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: Colors.primaryLight,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      {TAB_DEFS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} size={size} color={color} />,
            // Hide the Home tab for roles that should only see patients
            ...(tab.name === 'index' && isPatientOnlyRole ? { href: null } : {}),
          }}
        />
      ))}
    </Tabs>
  );
}