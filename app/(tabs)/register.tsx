import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { PickerModal } from '@/components/PickerModal';
import {
  validateName, validateAge, validatePhone, validateRequired,
  NIGERIAN_STATES, mapApiPatientToUi,
} from '@/utils/helpers';
import type { Patient } from '@/types';

export default function RegisterScreen() {
  const { user } = useAuth();

  // Guard — Admin only
  useEffect(() => {
    if (user && user.role !== 'Admin') router.replace('/(tabs)/');
  }, [user]);

  const [form, setForm] = useState({
    firstName: '', surname: '', age: '', phone: '',
    sex: '', lgaTown: '', state: '', outreachCentreName: user?.centre.name ?? '',
    disabilityType: 'None',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [centreOptions, setCentreOptions] = useState<{ id: string; code: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = (await api.centres.list(false)) as { data?: any[] } | any[];
        const centres = Array.isArray(res) ? res : (res.data ?? []);
        setCentreOptions(centres);
      } catch {}
    })();
  }, []);

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const fn = validateName(form.firstName); if (fn) e.firstName = fn;
    const sn = validateName(form.surname); if (sn) e.surname = sn;
    const ag = validateAge(form.age); if (ag) e.age = ag;
    const ph = validatePhone(form.phone); if (ph) e.phone = ph;
    const sx = validateRequired(form.sex); if (sx) e.sex = sx;
    const lg = validateRequired(form.lgaTown); if (lg) e.lgaTown = lg;
    const st = validateRequired(form.state); if (st) e.state = st;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      // Check duplicates
      const dupeParams = new URLSearchParams({
        firstName: form.firstName.trim(),
        surname: form.surname.trim(),
        phone: form.phone.trim(),
      });
      if (user?.centre.id && user.centre.id !== 'N/A') {
        dupeParams.set('centreId', user.centre.id);
      }
      const dupeRes = (await api.patients.checkDuplicates(dupeParams.toString())) as { data?: any[] };
      if (dupeRes.data?.length) {
        const dup = mapApiPatientToUi(dupeRes.data[0]);
        return Alert.alert(
          'Possible Duplicate',
          `${dup.firstName} ${dup.surname} (${dup.id}) already exists.\n\nSave anyway?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setSubmitting(false) },
            { text: 'Save Anyway', onPress: () => createPatient() },
          ]
        );
      }
      await createPatient();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Registration failed');
      setSubmitting(false);
    }
  };

  const createPatient = async () => {
    try {
      const payload = new FormData();
      payload.append('firstName', form.firstName.trim());
      payload.append('surname', form.surname.trim());
      payload.append('age', String(Number(form.age)));
      payload.append('phone', form.phone.trim());
      payload.append('sex', form.sex);
      payload.append('lgaTown', form.lgaTown.trim());
      payload.append('state', form.state.trim());
      if (form.outreachCentreName.trim()) payload.append('outreachCentreName', form.outreachCentreName.trim());
      payload.append('disabilityType', form.disabilityType || 'None');

      if (photo) {
        const ext = photo.split('.').pop() ?? 'jpg';
        payload.append('photo', {
          uri: photo,
          name: `patient-${Date.now()}.${ext}`,
          type: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
        } as any);
      }

      const created = (await api.patients.create(payload)) as any;
      Alert.alert(
        'Success!',
        `Patient ${created.firstName ?? form.firstName} ${created.surname ?? form.surname} registered.\nCode: ${created.patientCode ?? created.id}`,
        [
          { text: 'Register Another', onPress: resetForm },
          { text: 'View Patients', onPress: () => { resetForm(); router.push('/(tabs)/patients'); } },
        ]
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      firstName: '', surname: '', age: '', phone: '',
      sex: '', lgaTown: '', state: '', outreachCentreName: user?.centre.name ?? '',
      disabilityType: 'None',
    });
    setPhoto(null);
    setErrors({});
  };

  const stateOptions = NIGERIAN_STATES.map(s => ({ label: s, value: s }));
  const sexOptions = [{ label: 'Male', value: 'Male' }, { label: 'Female', value: 'Female' }];
  const disabilityOptions = [
    { label: 'None', value: 'None' }, { label: 'Physical', value: 'Physical' },
    { label: 'Hearing', value: 'Hearing' }, { label: 'Visual', value: 'Visual' },
    { label: 'Mental', value: 'Mental' },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Photo */}
        <View style={styles.photoSection}>
          {photo ? (
            <View>
              <Image source={{ uri: photo }} style={styles.photoPreview} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => setPhoto(null)}>
                <Ionicons name="close" size={16} color={Colors.white} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={36} color={Colors.gray400} />
            </View>
          )}
          <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}>
            <Ionicons name="camera" size={18} color={Colors.orange700} />
            <Text style={styles.photoBtnText}>{photo ? 'Retake Photo' : 'Take Photo'}</Text>
          </TouchableOpacity>
        </View>

        {/* Fields */}
        <View style={styles.card}>
          <Field label="First Name *" value={form.firstName} onChange={v => handleChange('firstName', v)} error={errors.firstName} placeholder="e.g. Amina" />
          <Field label="Surname *" value={form.surname} onChange={v => handleChange('surname', v)} error={errors.surname} placeholder="e.g. Bello" />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Age *" value={form.age} onChange={v => handleChange('age', v)} error={errors.age} placeholder="Years" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <PickerModal label="Sex *" value={form.sex} options={sexOptions} onChange={v => handleChange('sex', v)} error={errors.sex} placeholder="Select" />
            </View>
          </View>

          <Field label="Phone *" value={form.phone} onChange={v => handleChange('phone', v)} error={errors.phone} placeholder="08012345678" keyboardType="phone-pad" />
          <Field label="LGA / Town *" value={form.lgaTown} onChange={v => handleChange('lgaTown', v)} error={errors.lgaTown} placeholder="e.g. Kontagora" />
          <PickerModal label="State *" value={form.state} options={stateOptions} onChange={v => handleChange('state', v)} error={errors.state} placeholder="Select State" />
          <PickerModal
            label="Outreach Centre"
            value={form.outreachCentreName}
            options={[{ label: '-- None --', value: '' }, ...centreOptions.map(c => ({ label: c.name, value: c.name }))]}
            onChange={v => handleChange('outreachCentreName', v)}
            placeholder="Select Centre"
          />
          <PickerModal label="Disability" value={form.disabilityType} options={disabilityOptions} onChange={v => handleChange('disabilityType', v)} placeholder="None" />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Register Patient</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, error, placeholder, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={fStyles.label}>{label}</Text> : null}
      <TextInput
        style={[fStyles.input, error ? fStyles.inputError : null]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray400}
        keyboardType={keyboardType ?? 'default'}
      />
      {error ? <Text style={fStyles.error}>{error}</Text> : null}
    </View>
  );
}

const fStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 6 },
  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: Colors.gray900,
  },
  inputError: { borderColor: Colors.red300, backgroundColor: Colors.red50 },
  error: { fontSize: 11, color: Colors.red500, marginTop: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 40 },
  photoSection: { alignItems: 'center', marginBottom: 16 },
  photoPlaceholder: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: Colors.gray100, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.gray300,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  photoPreview: { width: 110, height: 110, borderRadius: 55, marginBottom: 12, borderWidth: 3, borderColor: Colors.gray100 },
  photoRemove: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: Colors.red500, width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.orange50, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
  },
  photoBtnText: { fontSize: 14, fontWeight: '600', color: Colors.orange700 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginBottom: 16,
  },
  row: { flexDirection: 'row', gap: 12 },
  submitBtn: {
    backgroundColor: Colors.orange600, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
  },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },
});