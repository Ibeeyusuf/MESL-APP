import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { api, type LoginPayload } from '@/services/api';
import type { MobileRole } from '@/types';

type LoginCentre = { id: string; code: string; name: string };
type DropdownOption = { label: string; value: string };

export default function LoginScreen() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<MobileRole>('Doctor');
  const [centreId, setCentreId] = useState('');
  const [catchmentAreas, setCatchmentAreas] = useState<LoginCentre[]>([]);
  // FIX: load role options from the API instead of hardcoding MOBILE_ROLES
  const [roleOptions, setRoleOptions] = useState<DropdownOption[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<'role' | 'centre' | null>(null);

  // If already authenticated, redirect to tabs
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load login options on mount — use API's signInAs list for roles
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const options = await api.auth.loginOptions();
        if (!mounted) return;

        // FIX: use signInAs from the API response, just like the web version does
        if (options.signInAs?.length) {
          const filteredRoles = (options.signInAs as string[]).filter(
            (roleName) => roleName.trim().toLowerCase() !== 'super admin'
          );

          if (filteredRoles.length) {
            const opts = filteredRoles.map((r) => ({ label: r, value: r }));
            setRoleOptions(opts);
            setRole(filteredRoles[0] as MobileRole);
          } else {
            setError('No mobile login roles available. Please contact support.');
          }
        } else {
          setError('No role options available. Please contact support.');
        }

        if (options.catchmentAreas?.length) {
          setCatchmentAreas(options.catchmentAreas);
          setCentreId(options.catchmentAreas[0].id);
        } else {
          setError('No catchment areas available. Please contact support.');
        }
      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : 'Unable to load login options';
          setError(`Failed to load login options: ${errorMsg}`);
          console.error('Login options error:', err);
        }
      } finally {
        if (mounted) setIsInitializing(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const centreOptions = useMemo(
    () => catchmentAreas.map((centre) => ({ label: centre.name, value: centre.id })),
    [catchmentAreas]
  );

  const selectedCentreLabel = useMemo(
    () => catchmentAreas.find((centre) => centre.id === centreId)?.name ?? 'Select Catchment Area',
    [catchmentAreas, centreId]
  );

  const onSubmit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter email and password.');
      return;
    }
    if (!centreId) {
      setError('Please select a catchment area.');
      return;
    }
    if (!role) {
      setError('Please select a role.');
      return;
    }

    setIsSubmitting(true);
    try {
      const loginPayload: LoginPayload = {
        email: email.trim(),
        password,
        signInAs: role,
        centreId,
      };
      await login(loginPayload);
      router.replace('/(tabs)');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(errorMsg);
      console.error('Login error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primaryLight} />
        <Text style={styles.loadingText}>Loading MESL Outreach...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Logo Section */}
        <View style={styles.logoWrap}>
          <View style={styles.logoBox}>
            <Image
              source={require('../assets/images/MESL-logo.jpeg')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>MESL Outreach</Text>
          <Text style={styles.subtitle}>Eye Care Outreach Management System</Text>
        </View>

        {/* Login Form Card */}
        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Email address</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color="#9ca3af" style={styles.inputIcon} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="staff@mesl.org"
              placeholderTextColor="#9ca3af"
              editable={!isSubmitting}
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color="#9ca3af" style={styles.inputIcon} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry={!showPassword}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              editable={!isSubmitting}
            />
            <Pressable onPress={() => setShowPassword((prev) => !prev)} style={styles.passwordToggle} hitSlop={10} disabled={isSubmitting}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#6b7280"
              />
            </Pressable>
          </View>

          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.label}>Sign in as</Text>
              <DropdownField
                value={role}
                placeholder="Select role"
                onPress={() => setActiveDropdown('role')}
              />
            </View>

            <View style={styles.col}>
              <Text style={styles.label}>Catchment Area</Text>
              <DropdownField
                value={selectedCentreLabel}
                placeholder="Select catchment area"
                onPress={() => setActiveDropdown('centre')}
              />
            </View>
          </View>

          <Pressable style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]} onPress={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitText}>Sign in</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.footer}>Copyright 2026 MESL. All rights reserved.</Text>
        <Text style={styles.footer}>MESL Outreach v2.0.0</Text>
      </ScrollView>

      {/* Role picker uses roleOptions loaded from API */}
      <SelectionModal
        title="Sign in as"
        visible={activeDropdown === 'role'}
        options={roleOptions}
        selectedValue={role}
        onSelect={(value) => {
          setRole(value as MobileRole);
          setActiveDropdown(null);
        }}
        onClose={() => setActiveDropdown(null)}
      />

      <SelectionModal
        title="Catchment Area"
        visible={activeDropdown === 'centre'}
        options={centreOptions}
        selectedValue={centreId}
        onSelect={(value) => {
          setCentreId(value);
          setActiveDropdown(null);
        }}
        onClose={() => setActiveDropdown(null)}
      />
    </SafeAreaView>
  );
}

function DropdownField({
  value,
  placeholder,
  onPress,
}: {
  value: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.dropdownField}>
      <Text style={[styles.dropdownText, !value && styles.dropdownPlaceholder]}>{value || placeholder}</Text>
      <Ionicons name="chevron-down" size={18} color="#6b7280" />
    </Pressable>
  );
}

function SelectionModal({
  title,
  visible,
  options,
  selectedValue,
  onSelect,
  onClose,
}: {
  title: string;
  visible: boolean;
  options: DropdownOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color="#6b7280" />
            </Pressable>
          </View>

          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onSelect(option.value)}
                  style={[styles.optionRow, selected && styles.optionRowSelected]}>
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                  {selected ? <Ionicons name="checkmark" size={18} color={Colors.primaryLight} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.primaryLight,
    fontSize: 15,
    fontWeight: '500',
  },
  safe: { flex: 1, backgroundColor: '#f3f4f6' },
  container: { padding: 16, paddingTop: 50, paddingBottom: 32, marginTop: 40 },
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  logoBox: {
    height: 64,
    width: 140,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
  title: { fontSize: 36, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, fontSize: 16, color: '#4b5563' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 16,
    gap: 8,
  },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 8, padding: 10, marginBottom: 6 },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginTop: 6 },
  inputWrap: {
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    marginTop: 6,
    marginBottom: 6,
    justifyContent: 'center',
  },
  inputIcon: { position: 'absolute', left: 12 },
  input: { paddingLeft: 38, paddingRight: 42, fontSize: 14, color: '#111827' },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    height: 46,
    justifyContent: 'center',
  },
  twoCol: { gap: 10 },
  col: { marginTop: 2 },
  dropdownField: {
    height: 46,
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: { fontSize: 14, color: '#111827', flex: 1, paddingRight: 12 },
  dropdownPlaceholder: { color: '#9ca3af' },
  submitBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { textAlign: 'center', marginTop: 14, color: '#6b7280', fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  modalCard: {
    maxHeight: '70%',
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  modalList: { maxHeight: 320 },
  optionRow: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionRowSelected: { backgroundColor: '#fff7ed' },
  optionText: { fontSize: 14, color: '#374151', fontWeight: '500', flex: 1, paddingRight: 12 },
  optionTextSelected: { color: Colors.primaryLight, fontWeight: '600' },
});
