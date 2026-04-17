import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Switch,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { PatientSelector } from '@/components/PatientSelector';
import { PickerModal } from '@/components/PickerModal';
import { api } from '@/services/api';
import {
  mapApiPreSurgeryToUi, mapApiConsultationToUi, mapApiPatientToUi, getTodayDate,
} from '@/utils/helpers';
import type { Patient, PreSurgeryRecord } from '@/types';

const TEST_OPTIONS = [
  { label: 'Select result', value: '' },
  { label: 'Not Done', value: 'Not Done' },
  { label: 'Negative', value: 'Negative' },
  { label: 'Positive', value: 'Positive' },
];

const IOL_POWER_OPTIONS = (() => {
  const opts = [{ label: 'Select Power', value: '' }];
  for (let i = 11; i <= 30; i += 0.5) {
    opts.push({ label: `${i.toFixed(1)} D`, value: i.toFixed(1) });
  }
  return opts;
})();

export default function PreSurgeryScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ patientId?: string }>();

  // Guard — Doctor only
  useEffect(() => {
    if (user && user.role !== 'Doctor') router.replace('/(tabs)/');
  }, [user]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [hasSurgeryRec, setHasSurgeryRec] = useState(false);
  const [checkingRec, setCheckingRec] = useState(false);
  const [biometryDone, setBiometryDone] = useState(false);
  const [form, setForm] = useState({
    assessmentDate: getTodayDate(),
    alRight: '', alLeft: '',
    pcIolPowerRight: '', pcIolPowerLeft: '',
    biometryOthersRight: '', biometryOthersLeft: '',
    bloodPressure: '', bloodSugar: '',
    hivTest: '', hepatitisTest: '',
    ocularBScan: '',
    fitnessForSurgery: false,
    consentSigned: false,
    preOpInstructionsGiven: false,
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [history, setHistory] = useState<PreSurgeryRecord[]>([]);

  useEffect(() => {
    if (params.patientId && !patient) {
      (async () => {
        try {
          const res = await api.patients.getById(params.patientId!);
          setPatient(mapApiPatientToUi(res));
        } catch {}
      })();
    }
  }, [params.patientId]);

  useEffect(() => {
    if (!patient) { setHistory([]); setHasSurgeryRec(false); return; }
    (async () => {
      setCheckingRec(true);
      try {
        const cRes = (await api.consultations.list(patient.id)) as { data?: any[] };
        setHasSurgeryRec((cRes.data ?? []).map(mapApiConsultationToUi).some(c => c.surgeryRecommended));
      } catch { setHasSurgeryRec(false); }
      try {
        const pRes = (await api.preSurgeries.list(patient.id)) as { data?: any[] };
        setHistory((pRes.data ?? []).map(mapApiPreSurgeryToUi));
      } catch { setHistory([]); }
      setCheckingRec(false);
      resetForm();
    })();
  }, [patient?.id]);

  const resetForm = () => {
    setForm({
      assessmentDate: getTodayDate(), alRight: '', alLeft: '',
      pcIolPowerRight: '', pcIolPowerLeft: '', biometryOthersRight: '', biometryOthersLeft: '',
      bloodPressure: '', bloodSugar: '', hivTest: '', hepatitisTest: '',
      ocularBScan: '', fitnessForSurgery: false, consentSigned: false, preOpInstructionsGiven: false, notes: '',
    });
    setBiometryDone(false); setErrors({}); setSuccess('');
  };

  const handleChange = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async () => {
    if (!patient) return;
    const e: Record<string, string> = {};
    if (!form.assessmentDate) e.assessmentDate = 'Required';
    if (!form.fitnessForSurgery) e.fitnessForSurgery = 'Must confirm fitness';
    if (!form.consentSigned) e.consentSigned = 'Must confirm consent';
    if (!form.preOpInstructionsGiven) e.preOpInstructionsGiven = 'Must confirm instructions';
    if (biometryDone) {
      if (!form.alRight) e.alRight = 'Required';
      if (!form.alLeft) e.alLeft = 'Required';
      if (!form.pcIolPowerRight) e.pcIolPowerRight = 'Required';
      if (!form.pcIolPowerLeft) e.pcIolPowerLeft = 'Required';
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      await api.preSurgeries.create(patient.id, {
        assessmentDate: new Date(form.assessmentDate).toISOString(),
        ocularBiometry: biometryDone ? 'Yes' : 'No',
        alRight: biometryDone ? form.alRight : undefined,
        alLeft: biometryDone ? form.alLeft : undefined,
        pcIolPowerRight: biometryDone ? form.pcIolPowerRight : undefined,
        pcIolPowerLeft: biometryDone ? form.pcIolPowerLeft : undefined,
        biometryOthersRight: biometryDone ? form.biometryOthersRight || undefined : undefined,
        biometryOthersLeft: biometryDone ? form.biometryOthersLeft || undefined : undefined,
        bloodPressure: form.bloodPressure || undefined,
        bloodSugar: form.bloodSugar || undefined,
        hivTest: form.hivTest || undefined,
        hepatitisTest: form.hepatitisTest || undefined,
        ocularBScan: form.ocularBScan || undefined,
        fitnessForSurgery: form.fitnessForSurgery,
        consentSigned: form.consentSigned,
        preOpInstructionsGiven: form.preOpInstructionsGiven,
        notes: form.notes.trim() || undefined,
      });
      const pRes = (await api.preSurgeries.list(patient.id)) as { data?: any[] };
      setHistory((pRes.data ?? []).map(mapApiPreSurgeryToUi));
      setSuccess(`Pre-surgery assessment saved for ${patient.firstName}`);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally { setSubmitting(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PatientSelector selectedPatient={patient} onSelectPatient={setPatient} />

        {patient && checkingRec && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.orange600} />
            <Text style={styles.loadingText}>Checking recommendation...</Text>
          </View>
        )}

        {patient && !checkingRec && !hasSurgeryRec && (
          <View style={styles.warningBox}>
            <Ionicons name="alert-circle" size={20} color={Colors.orange700} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.warningTitle}>Surgery Recommendation Required</Text>
              <Text style={styles.warningText}>Complete a consultation with surgery recommended first.</Text>
            </View>
          </View>
        )}

        {patient && !checkingRec && hasSurgeryRec && (
          <>
            {success ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.green700} />
                <Text style={styles.successText}>{success}</Text>
              </View>
            ) : null}

            {/* Assessment Date */}
            <View style={styles.card}>
              <Field label="Assessment Date *" value={form.assessmentDate} onChange={v => handleChange('assessmentDate', v)} error={errors.assessmentDate} placeholder="YYYY-MM-DD" />
            </View>

            {/* Ocular Biometry */}
            <View style={styles.biometryToggle}>
              <View style={{ flex: 1 }}>
                <Text style={styles.biometryTitle}>Ocular Biometry Performed?</Text>
              </View>
              <Switch
                value={biometryDone}
                onValueChange={setBiometryDone}
                trackColor={{ false: Colors.gray300, true: Colors.orange200 }}
                thumbColor={biometryDone ? Colors.orange600 : Colors.gray100}
              />
            </View>

            {biometryDone && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Right Eye (OD)</Text>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}><Field label="Axial Length (mm) *" value={form.alRight} onChange={v => handleChange('alRight', v)} error={errors.alRight} keyboardType="numeric" placeholder="23.50" /></View>
                  <View style={{ flex: 1 }}>
                    <PickerModal label="PC IOL Power *" value={form.pcIolPowerRight} options={IOL_POWER_OPTIONS} onChange={v => handleChange('pcIolPowerRight', v)} error={errors.pcIolPowerRight} />
                  </View>
                </View>
                <Field label="Others (OD)" value={form.biometryOthersRight} onChange={v => handleChange('biometryOthersRight', v)} placeholder="Additional notes..." />

                <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Left Eye (OS)</Text>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}><Field label="Axial Length (mm) *" value={form.alLeft} onChange={v => handleChange('alLeft', v)} error={errors.alLeft} keyboardType="numeric" placeholder="23.30" /></View>
                  <View style={{ flex: 1 }}>
                    <PickerModal label="PC IOL Power *" value={form.pcIolPowerLeft} options={IOL_POWER_OPTIONS} onChange={v => handleChange('pcIolPowerLeft', v)} error={errors.pcIolPowerLeft} />
                  </View>
                </View>
                <Field label="Others (OS)" value={form.biometryOthersLeft} onChange={v => handleChange('biometryOthersLeft', v)} placeholder="Additional notes..." />
              </View>
            )}

            {/* Pre-Surgery Checklist */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Pre-Surgery Checklist</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}><Field label="Blood Pressure" value={form.bloodPressure} onChange={v => handleChange('bloodPressure', v)} placeholder="120/80" /></View>
                <View style={{ flex: 1 }}><Field label="Blood Sugar" value={form.bloodSugar} onChange={v => handleChange('bloodSugar', v)} placeholder="100 mg/dL" /></View>
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <PickerModal label="HIV Test" value={form.hivTest} options={TEST_OPTIONS} onChange={v => handleChange('hivTest', v)} />
                </View>
                <View style={{ flex: 1 }}>
                  <PickerModal label="Hepatitis Test" value={form.hepatitisTest} options={TEST_OPTIONS} onChange={v => handleChange('hepatitisTest', v)} />
                </View>
              </View>
              <View style={{ height: 8 }} />
              <Field label="Ocular B-Scan" value={form.ocularBScan} onChange={v => handleChange('ocularBScan', v)} multiline placeholder="B-Scan findings (if performed)..." />
            </View>

            {/* Fitness Checkboxes */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Confirmations</Text>
              <CheckItem label="Patient is fit for surgery *" checked={form.fitnessForSurgery} onToggle={v => handleChange('fitnessForSurgery', v)} error={errors.fitnessForSurgery} />
              <CheckItem label="Informed consent signed *" checked={form.consentSigned} onToggle={v => handleChange('consentSigned', v)} error={errors.consentSigned} />
              <CheckItem label="Pre-operative instructions given *" checked={form.preOpInstructionsGiven} onToggle={v => handleChange('preOpInstructionsGiven', v)} error={errors.preOpInstructionsGiven} />
            </View>

            {/* Notes */}
            <View style={styles.card}>
              <Field label="Additional Notes (Optional)" value={form.notes} onChange={v => handleChange('notes', v)} multiline placeholder="Any additional observations..." />
            </View>

            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Complete Pre-Surgery Assessment</Text>}
            </TouchableOpacity>

            {/* History */}
            {history.length > 0 && (
              <View style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Pre-Surgery History ({history.length})</Text>
                </View>
                {history.slice(0, 5).map(r => (
                  <View key={r.id} style={styles.historyRow}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.historyDiag}>Biometry: {r.ocularBiometry}</Text>
                      <Text style={styles.historyDate}>{new Date(r.assessmentDate).toLocaleDateString()}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: Colors.gray500, marginTop: 2 }}>
                      Fit: {r.fitnessForSurgery ? 'Yes' : 'No'} · Consent: {r.consentSigned ? 'Yes' : 'No'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, error, multiline, placeholder, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; multiline?: boolean; placeholder?: string; keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 6 }}>{label}</Text>
      <TextInput
        style={[fStyles.input, multiline && fStyles.multiline, error ? { borderColor: Colors.red300 } : null]}
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.gray400}
        multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} keyboardType={keyboardType ?? 'default'}
      />
      {error ? <Text style={{ fontSize: 11, color: Colors.red500, marginTop: 3 }}>{error}</Text> : null}
    </View>
  );
}

function CheckItem({ label, checked, onToggle, error }: { label: string; checked: boolean; onToggle: (v: boolean) => void; error?: string }) {
  return (
    <TouchableOpacity style={ckStyles.row} onPress={() => onToggle(!checked)} activeOpacity={0.7}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? Colors.orange600 : Colors.gray400} />
      <Text style={[ckStyles.label, error ? { color: Colors.red500 } : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const ckStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  label: { fontSize: 14, color: Colors.gray900, flex: 1 },
});

const fStyles = StyleSheet.create({
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.gray900 },
  multiline: { minHeight: 80 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 40 },
  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, marginTop: 12 },
  loadingText: { fontSize: 13, color: Colors.gray500 },
  warningBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.orange50, borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: Colors.orange200 },
  warningTitle: { fontSize: 13, fontWeight: '700', color: Colors.orange800 },
  warningText: { fontSize: 12, color: Colors.orange700, marginTop: 2 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.green50, padding: 14, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.green100 },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500' },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  biometryToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.orange50, borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: Colors.orange100 },
  biometryTitle: { fontSize: 14, fontWeight: '600', color: Colors.orange900 },
  submitBtn: { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  historyCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100, marginTop: 16 },
  historyHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100 },
  historyDiag: { fontSize: 13, fontWeight: '500', color: Colors.gray900, flex: 1 },
  historyDate: { fontSize: 11, color: Colors.gray400 },
});