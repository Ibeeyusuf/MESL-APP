import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
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

// ─── Constants — must exactly match web ──────────────────────────────────────

const PRACTITIONER_OPTIONS = [
  { label: 'Select practitioner', value: '' },
  { label: 'Ibrahim Wambai',   value: 'Ibrahim Wambai' },
  { label: 'Nasiru Usman',     value: 'Nasiru Usman' },
  { label: 'Adamu Mohammed',   value: 'Adamu Mohammed' },
  { label: 'Murtala Umar',     value: 'Murtala Umar' },
];

// AL options: 11.0–30.0 in 0.5 steps + "Others" — matches web exactly
const AL_OPTIONS = (() => {
  const opts = [{ label: 'Select AL', value: '' }];
  for (let i = 11; i <= 30; i += 0.5) {
    opts.push({ label: i.toFixed(1), value: i.toFixed(1) });
  }
  opts.push({ label: 'Others', value: 'Others' });
  return opts;
})();

// PC IOL Power: 11.0–30.0 in 0.5 steps — matches web exactly
const IOL_POWER_OPTIONS = (() => {
  const opts = [{ label: 'Select Power', value: '' }];
  for (let i = 11; i <= 30; i += 0.5) {
    opts.push({ label: i.toFixed(1), value: i.toFixed(1) });
  }
  return opts;
})();

// Blood Pressure — web dropdown options
const BLOOD_PRESSURE_OPTIONS = [
  { label: 'Select status', value: '' },
  { label: 'Normal',             value: 'Normal' },
  { label: 'High Operable',      value: 'High Operable' },
  { label: 'High Non-Operable',  value: 'High Non-Operable' },
  { label: 'Low',                value: 'Low' },
];

// Blood Sugar — same options as Blood Pressure
const BLOOD_SUGAR_OPTIONS = [
  { label: 'Select status', value: '' },
  { label: 'Normal',             value: 'Normal' },
  { label: 'High Operable',      value: 'High Operable' },
  { label: 'High Non-Operable',  value: 'High Non-Operable' },
  { label: 'Low',                value: 'Low' },
];

// HIV Test — web only has Negative / Positive (no "Not Done")
const HIV_TEST_OPTIONS = [
  { label: 'Select result', value: '' },
  { label: 'Negative', value: 'Negative' },
  { label: 'Positive', value: 'Positive' },
];

// Hepatitis Test — web has Negative / Positive / Not Done
const HEPATITIS_TEST_OPTIONS = [
  { label: 'Select result', value: '' },
  { label: 'Negative', value: 'Negative' },
  { label: 'Positive', value: 'Positive' },
  { label: 'Not Done', value: 'Not Done' },
];

// Ocular B-Scan — web dropdown with specific options
const BSCAN_OPTIONS = [
  { label: 'Select B-Scan finding', value: '' },
  { label: 'Normal',                      value: 'Normal' },
  { label: 'RD',                          value: 'RD' },
  { label: 'PVD',                         value: 'PVD' },
  { label: 'Mild - Moderate VIT Opacity', value: 'Mild - Moderate VIT Opacity' },
  { label: 'Dense VIT Opacity',           value: 'Dense VIT Opacity' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PreSurgeryScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ patientId?: string }>();

  useEffect(() => {
    if (user && user.role !== 'Doctor') router.replace('/(tabs)/');
  }, [user]);

  const [patient,      setPatient]      = useState<Patient | null>(null);
  const [hasSurgeryRec, setHasSurgeryRec] = useState(false);
  const [checkingRec,  setCheckingRec]  = useState(false);

  const [form, setForm] = useState({
    assessmentDate:       getTodayDate(),
    healthPractitioner:   '',
    // Use boolean for ocularBiometry - matches backend expectation
    ocularBiometry:       false,
    alRight:              '',
    alLeft:               '',
    alRightOther:         '',
    alLeftOther:          '',
    pcIolPowerRight:      '',
    pcIolPowerLeft:       '',
    biometryOthersRight:  '',
    biometryOthersLeft:   '',
    bloodPressure:        '',
    bloodSugar:           '',
    hivTest:              '',
    hepatitisTest:        '',
    ocularBScan:          '',
    fitnessForSurgery:    false,
    consentSigned:        false,
    preOpInstructionsGiven: false,
    notes:                '',
  });

  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState('');
  const [history,    setHistory]    = useState<PreSurgeryRecord[]>([]);

  // Pre-load patient from route param
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
      assessmentDate: getTodayDate(), healthPractitioner: '',
      ocularBiometry: false,
      alRight: '', alLeft: '', alRightOther: '', alLeftOther: '',
      pcIolPowerRight: '', pcIolPowerLeft: '',
      biometryOthersRight: '', biometryOthersLeft: '',
      bloodPressure: '', bloodSugar: '', hivTest: '', hepatitisTest: '',
      ocularBScan: '', fitnessForSurgery: false, consentSigned: false,
      preOpInstructionsGiven: false, notes: '',
    });
    setErrors({}); setSuccess('');
  };

  const handleChange = (field: string, value: string | boolean) => {
    // Special handling when switching ocularBiometry to false
    if (field === 'ocularBiometry' && value === false) {
      setForm(prev => ({ 
        ...prev, 
        ocularBiometry: false,
        // Clear all biometry values when set to false
        alRight: '',
        alLeft: '',
        alRightOther: '',
        alLeftOther: '',
        pcIolPowerRight: '',
        pcIolPowerLeft: '',
        biometryOthersRight: '',
        biometryOthersLeft: '',
      }));
      // Clear all biometry-related errors
      setErrors(prev => ({
        ...prev,
        alRight: '',
        alLeft: '',
        pcIolPowerRight: '',
        pcIolPowerLeft: ''
      }));
    } else if (field === 'ocularBiometry' && value === true) {
      setForm(prev => ({ ...prev, ocularBiometry: true }));
    } else {
      setForm(prev => ({ ...prev, [field]: value }));
      if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async () => {
    if (!patient) return;
    const e: Record<string, string> = {};
    if (!form.assessmentDate)      e.assessmentDate      = 'Required';
    if (!form.healthPractitioner)  e.healthPractitioner  = 'Required';
    if (!form.fitnessForSurgery)   e.fitnessForSurgery   = 'Must confirm fitness';
    if (!form.consentSigned)       e.consentSigned       = 'Must confirm consent';
    if (!form.preOpInstructionsGiven) e.preOpInstructionsGiven = 'Must confirm instructions';
    
    // Only validate biometry fields if true
    if (form.ocularBiometry) {
      if (!form.alRight)         e.alRight         = 'Required';
      if (!form.alLeft)          e.alLeft          = 'Required';
      if (!form.pcIolPowerRight) e.pcIolPowerRight = 'Required';
      if (!form.pcIolPowerLeft)  e.pcIolPowerLeft  = 'Required';
    }
    
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      // Build payload matching web exactly
      const payload: any = {
        assessmentDate: new Date(form.assessmentDate).toISOString(),
        healthPractitioner: form.healthPractitioner,
        ocularBiometry: form.ocularBiometry, // Send as boolean!
        bloodPressure: form.bloodPressure || '',
        bloodSugar: form.bloodSugar || '',
        hivTest: form.hivTest || '',
        hepatitisTest: form.hepatitisTest || '',
        ocularBScan: form.ocularBScan || '',
        fitnessForSurgery: form.fitnessForSurgery,
        consentSigned: form.consentSigned,
        preOpInstructionsGiven: form.preOpInstructionsGiven,
        notes: form.notes.trim() || '',
      };

      // Only add biometry fields if ocularBiometry is true
      if (form.ocularBiometry) {
        payload.alRight = form.alRight;
        payload.alLeft = form.alLeft;
        if (form.alRight === 'Others') payload.alRightOther = form.alRightOther.trim();
        if (form.alLeft === 'Others') payload.alLeftOther = form.alLeftOther.trim();
        payload.pcIolPowerRight = form.pcIolPowerRight;
        payload.pcIolPowerLeft = form.pcIolPowerLeft;
        if (form.biometryOthersRight) payload.biometryOthersRight = form.biometryOthersRight.trim();
        if (form.biometryOthersLeft) payload.biometryOthersLeft = form.biometryOthersLeft.trim();
      }
      
      await api.preSurgeries.create(patient.id, payload);
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

        {/* Checking */}
        {patient && checkingRec && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.orange600} />
            <Text style={styles.loadingText}>Checking recommendation...</Text>
          </View>
        )}

        {/* No surgery recommendation — left-border style matching web */}
        {patient && !checkingRec && !hasSurgeryRec && (
          <View style={styles.warningBox}>
            <Ionicons name="stats-chart" size={18} color={Colors.orange500} style={{ flexShrink: 0 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.warningTitle}>Surgery Recommendation Required</Text>
              <Text style={styles.warningText}>
                This patient does not have a surgery recommendation from consultation. Please complete a consultation with surgery recommended before proceeding.
              </Text>
            </View>
          </View>
        )}

        {patient && !checkingRec && hasSurgeryRec && (
          <>
            {/* Success banner — left-border style matching web */}
            {!!success && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.green500} style={{ flexShrink: 0 }} />
                <Text style={styles.successText}>{success}</Text>
              </View>
            )}

            {/* ── Assessment Date + Health Practitioner ── */}
            <View style={styles.card}>
              <Field
                label="Assessment Date *"
                value={form.assessmentDate}
                onChange={v => handleChange('assessmentDate', v)}
                error={errors.assessmentDate}
                placeholder="YYYY-MM-DD"
              />
              <PickerModal
                label="Health Practitioner *"
                value={form.healthPractitioner}
                options={PRACTITIONER_OPTIONS}
                onChange={v => handleChange('healthPractitioner', v)}
                error={errors.healthPractitioner}
              />
            </View>

            {/* ── Ocular Biometry — Yes/No radio buttons matching web ── */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Ionicons name="calculator-outline" size={18} color={Colors.orange600} />
                <Text style={styles.sectionTitle}>Ocular Biometry</Text>
              </View>
              <Text style={styles.fieldLabel}>Was Ocular Biometry performed?</Text>
              <View style={styles.radioRow}>
                <TouchableOpacity style={styles.radioOption} onPress={() => handleChange('ocularBiometry', true)} activeOpacity={0.7}>
                  <View style={[styles.radioCircle, form.ocularBiometry && styles.radioCircleActive]}>
                    {form.ocularBiometry && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.radioLabel}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.radioOption} onPress={() => handleChange('ocularBiometry', false)} activeOpacity={0.7}>
                  <View style={[styles.radioCircle, !form.ocularBiometry && styles.radioCircleActive]}>
                    {!form.ocularBiometry && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.radioLabel}>No</Text>
                </TouchableOpacity>
              </View>

              {/* Biometry fields — shown when true */}
              {form.ocularBiometry && (
                <View style={{ marginTop: 16, gap: 16 }}>
                  {/* Right Eye */}
                  <View style={styles.eyeBox}>
                    <Text style={styles.eyeTitle}>Right Eye (OD)</Text>
                    <PickerModal
                      label="Axial Length (AL) Right Eye (OD) *"
                      value={form.alRight}
                      options={AL_OPTIONS}
                      onChange={v => handleChange('alRight', v)}
                      error={errors.alRight}
                    />
                    {form.alRight === 'Others' && (
                      <Field
                        label="Specify other value"
                        value={form.alRightOther}
                        onChange={v => handleChange('alRightOther', v)}
                        multiline
                        placeholder="Specify other value..."
                      />
                    )}
                    <PickerModal
                      label="PC IOL Power *"
                      value={form.pcIolPowerRight}
                      options={IOL_POWER_OPTIONS}
                      onChange={v => handleChange('pcIolPowerRight', v)}
                      error={errors.pcIolPowerRight}
                    />
                    <Field
                      label="Others"
                      value={form.biometryOthersRight}
                      onChange={v => handleChange('biometryOthersRight', v)}
                      placeholder="Additional notes..."
                    />
                  </View>

                  {/* Left Eye */}
                  <View style={styles.eyeBox}>
                    <Text style={styles.eyeTitle}>Left Eye (OS)</Text>
                    <PickerModal
                      label="Axial Length (AL) Left Eye (OS) *"
                      value={form.alLeft}
                      options={AL_OPTIONS}
                      onChange={v => handleChange('alLeft', v)}
                      error={errors.alLeft}
                    />
                    {form.alLeft === 'Others' && (
                      <Field
                        label="Specify other value"
                        value={form.alLeftOther}
                        onChange={v => handleChange('alLeftOther', v)}
                        multiline
                        placeholder="Specify other value..."
                      />
                    )}
                    <PickerModal
                      label="PC IOL Power *"
                      value={form.pcIolPowerLeft}
                      options={IOL_POWER_OPTIONS}
                      onChange={v => handleChange('pcIolPowerLeft', v)}
                      error={errors.pcIolPowerLeft}
                    />
                    <Field
                      label="Others"
                      value={form.biometryOthersLeft}
                      onChange={v => handleChange('biometryOthersLeft', v)}
                      placeholder="Additional notes..."
                    />
                  </View>
                </View>
              )}
            </View>

            {/* ── Pre-Surgery Checklist ── */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Ionicons name="clipboard-outline" size={18} color={Colors.orange600} />
                <Text style={styles.sectionTitle}>Pre-Surgery Checklist</Text>
              </View>
              <View style={styles.checklistInner}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <PickerModal label="Blood Pressure" value={form.bloodPressure} options={BLOOD_PRESSURE_OPTIONS} onChange={v => handleChange('bloodPressure', v)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PickerModal label="Blood Sugar" value={form.bloodSugar} options={BLOOD_SUGAR_OPTIONS} onChange={v => handleChange('bloodSugar', v)} />
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <PickerModal label="HIV Test" value={form.hivTest} options={HIV_TEST_OPTIONS} onChange={v => handleChange('hivTest', v)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PickerModal label="Hepatitis Test" value={form.hepatitisTest} options={HEPATITIS_TEST_OPTIONS} onChange={v => handleChange('hepatitisTest', v)} />
                  </View>
                </View>
                <PickerModal label="Ocular B-Scan" value={form.ocularBScan} options={BSCAN_OPTIONS} onChange={v => handleChange('ocularBScan', v)} />

                {/* Confirmations — inside checklist section matching web layout */}
                <View style={styles.confirmDivider} />
                <CheckItem label="Patient is fit for surgery *" checked={form.fitnessForSurgery} onToggle={v => handleChange('fitnessForSurgery', v)} error={errors.fitnessForSurgery} />
                <CheckItem label="Informed consent signed *" checked={form.consentSigned} onToggle={v => handleChange('consentSigned', v)} error={errors.consentSigned} />
                <CheckItem label="Pre-operative instructions given *" checked={form.preOpInstructionsGiven} onToggle={v => handleChange('preOpInstructionsGiven', v)} error={errors.preOpInstructionsGiven} />
              </View>
            </View>

            {/* ── Notes ── */}
            <View style={styles.card}>
              <Field
                label="Additional Notes (Optional)"
                value={form.notes}
                onChange={v => handleChange('notes', v)}
                multiline
                placeholder="Any additional observations..."
              />
            </View>

            {/* ── Submit ── */}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.submitText}>Complete Pre-Surgery Assessment</Text>}
            </TouchableOpacity>

            {/* ── History ── */}
            {history.length > 0 && (
              <View style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Pre-Surgery History</Text>
                  <View style={styles.historyBadge}>
                    <Text style={styles.historyBadgeText}>{history.length} Records</Text>
                  </View>
                </View>
                {history.map(r => (
                  <View key={r.id} style={styles.historyRow}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.historyLabel}>Biometry: {r.ocularBiometry}</Text>
                      <Text style={styles.historyDate}>{new Date(r.assessmentDate).toLocaleDateString()}</Text>
                    </View>
                    <Text style={styles.historyMeta}>
                      Fit: {r.fitnessForSurgery ? 'Yes' : 'No'} · Consent: {r.consentSigned ? 'Yes' : 'No'}
                    </Text>
                    {r.healthPractitioner ? (
                      <Text style={styles.historyMeta}>By: {r.healthPractitioner}</Text>
                    ) : null}
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

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, value, onChange, error, multiline, placeholder, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; multiline?: boolean; placeholder?: string; keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      {!!label && <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 6 }}>{label}</Text>}
      <TextInput
        style={[fStyles.input, multiline && fStyles.multiline, error ? { borderColor: Colors.red300 } : null]}
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={Colors.gray400}
        multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'}
        keyboardType={keyboardType ?? 'default'}
      />
      {error ? <Text style={{ fontSize: 11, color: Colors.red500, marginTop: 3 }}>{error}</Text> : null}
    </View>
  );
}

const fStyles = StyleSheet.create({
  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: Colors.gray900,
  },
  multiline: { minHeight: 80 },
});

// ─── CheckItem helper ─────────────────────────────────────────────────────────

function CheckItem({ label, checked, onToggle, error }: {
  label: string; checked: boolean; onToggle: (v: boolean) => void; error?: string;
}) {
  return (
    <TouchableOpacity style={ckStyles.row} onPress={() => onToggle(!checked)} activeOpacity={0.7}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? Colors.orange600 : Colors.gray400} />
      <Text style={[ckStyles.label, error ? { color: Colors.red500 } : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const ckStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  label: { fontSize: 14, color: Colors.gray900, flex: 1 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content:   { padding: 16, paddingBottom: 40 },

  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, marginTop: 12 },
  loadingText: { fontSize: 13, color: Colors.gray500 },

  // Warning — left-border style matching web's border-l-4 border-orange-500
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.orange50,
    borderLeftWidth: 4, borderLeftColor: Colors.orange500,
    padding: 14, marginTop: 12, borderRadius: 4,
  },
  warningTitle: { fontSize: 13, fontWeight: '600', color: Colors.orange800 },
  warningText:  { fontSize: 12, color: Colors.orange700, marginTop: 2, lineHeight: 18 },

  // Success — left-border style matching web
  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.green50,
    borderLeftWidth: 4, borderLeftColor: Colors.green500,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 4, marginTop: 12,
  },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500', flex: 1 },

  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginTop: 12,
  },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle:  { fontSize: 15, fontWeight: '600', color: Colors.gray900 },

  fieldLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 10 },

  // Yes/No radio buttons
  radioRow:    { flexDirection: 'row', gap: 24 },
  radioOption: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radioCircle: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: Colors.gray300,
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleActive: { borderColor: Colors.orange600 },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.orange600 },
  radioLabel: { fontSize: 14, color: Colors.gray700 },

  // Eye boxes — matches web's bg-gray-50 bordered boxes
  eyeBox: {
    backgroundColor: Colors.gray50, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.gray200,
  },
  eyeTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },

  // Checklist inner — matches web's bg-gray-50 p-5 rounded-lg
  checklistInner: {
    backgroundColor: Colors.gray50, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.gray200, marginTop: 4, gap: 10,
  },
  confirmDivider: {
    borderTopWidth: 1, borderTopColor: Colors.gray300, marginTop: 4, marginBottom: 4,
  },

  row: { flexDirection: 'row', gap: 12 },

  submitBtn:  { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },

  // History
  historyCard: {
    backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.gray100, marginTop: 16,
  },
  historyHeader: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  historyTitle:     { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge:     { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },
  historyRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100,
  },
  historyLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray900 },
  historyDate:  { fontSize: 11, color: Colors.gray400 },
  historyMeta:  { fontSize: 11, color: Colors.gray500, marginTop: 2 },
});