import React, { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

SplashScreen.preventAutoHideAsync();

function RootLayoutContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Prevents firing the redirect more than once per auth-state transition
  const isNavigating = useRef(false);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inTabsGroup = segments[0] === '(tabs)';

    if (!isAuthenticated && inTabsGroup && !isNavigating.current) {
      // Logged out while inside tabs — send back to login
      isNavigating.current = true;
      router.replace('/');
    } else if (isAuthenticated && !inTabsGroup && !isNavigating.current) {
      // Just authenticated — enter tabs
      isNavigating.current = true;
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  // Reset navigation guard once the route settles so future transitions work
  useEffect(() => {
    isNavigating.current = false;
  }, [segments[0]]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootLayoutContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}