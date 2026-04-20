import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import type { User } from '@/types';

interface WelcomeHeaderProps {
  user: User | undefined;
  onLogout: () => void;
}

export function WelcomeHeader({ user, onLogout }: WelcomeHeaderProps) {
  const confirmLogout = () => {
    Alert.alert(
      'Log out and close app',
      'Are you sure you want to log out and close the app?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: () => {
            onLogout();

            if (Platform.OS === 'android') {
              BackHandler.exitApp();
              return;
            }

            router.replace('/');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.greeting}>Welcome, {user?.name}</Text>
          <Text style={styles.roleText}>{user?.role} · {user?.centre.name}</Text>
        </View>
        <TouchableOpacity onPress={confirmLogout} style={styles.logoutBtn}>
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
