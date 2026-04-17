import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import type { User } from '@/types';

interface WelcomeHeaderProps {
  user: User | undefined;
  onLogout: () => void;
}

export function WelcomeHeader({ user, onLogout }: WelcomeHeaderProps) {
  const handleLogout = () => {
    onLogout();
    // Navigation handled by _layout.tsx effect when isAuthenticated becomes false
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.greeting}>Welcome, {user?.name}</Text>
          <Text style={styles.roleText}>{user?.role} · {user?.centre.name}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryLight,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  greeting: {
    fontSize: 16,
    color: Colors.white,
    fontWeight: '700',
  },
  roleText: {
    fontSize: 12,
    color: Colors.gray300,
    fontWeight: '500',
    marginTop: 3,
  },
  logoutBtn: {
    padding: 8,
    marginLeft: 12,
  },
});
