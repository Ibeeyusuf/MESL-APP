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
  mapApiSurgeryToUi, mapApiUserToStaff, mapApiPatientToUi,
  mapApiConsultationToUi, inferProcedureType, getTodayDate,
} from '@/utils/helpers';
import type { Patient, SurgeryRecord, StaffMember } from '@/types';

const SURGERY_TYPES = [
  'SICS (Small Incision Cataract Surgery)',
  'Phacoemulsification',
  'ECCE (Extracapsular Cataract Extraction)',
  'ICCE (Intracapsular Cataract Extraction)',
  'Trabeculectomy',
  'Pterygium Excision',
  'Lid Surgery',
  'DCR (Dacryocystorhinostomy)',
  'Evisceration/Enucleation',
  'Other',
];

const IOL_TYPES = [
  'PMMA (Polymethyl Methacrylate)',
  'Foldable Acrylic',
  'Foldable Hydrophilic',
  'Foldable Hydrophobic',
  'AC IOL (Anterior Chamber)',
  'Scleral Fixated IOL',
  'None/Not Applicable',
];

const EYE_OPTIONS = [
  { label: 'Select eye', value: '' },
  { label: 'Right Eye (OD)', value: 'Right' },
  { label: 'Left Eye (OS)', value: 'Left' },
  { label: 'Both Eyes (OU)', value: 'Both' },
];

const ANESTHESIA_OPTIONS = [
  { label: 'Select anesthesia', value: '' },
  { label: 'Local', value: 'Local' },
  { label: 'General', value: 'General' },
  { label: 'Topical', value: 'Topical' },
];

export default function SurgeryScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ patientId?: string }>();

  // Guard — Doctor only
  useEffect(() => {
    if (user && user.role !== 'Doctor') router.replace('/(tabs)/');
  }, [user]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [hasSurgeryRec, setHasSurgeryRec] = useState(false);
  const [checkingRec, setCheckingRec] = useState(false);
  const [form, setForm] = useState({
    surgeryDate: getTodayDate(),
    surgeryType: '',
    iolType: '',
    eyeOperated: '',
    anesthesiaType: '',
    durationMinutes: '',
    iolPowerRight: '',
    iolPowerLeft: '',
    hasComplications: false,
    complicationDetails: '',
    notes: '',
    surgeonId: '',
    scrubNurseId: '',
    anesthetistId: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [history, setHistory] = useState<SurgeryRecord[]>([]);
  const [surgeons, setSurgeons] = useState<StaffMember[]>([]);
  const [nurses, setNurses] = useState<StaffMember[]>([]);
  const [anesthetists, setAnesthetists] = useState<StaffMember[]>([]);

  // Load patient from deep link
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

  // Load staff
  useEffect(() => {
    (async () => {
      try {
        const res = (await api.users.list('includeInactive=false&page=1&limit=100')) as { data?: any[] };
        const staff = (res.data ?? []).map(mapApiUserToStaff);
        setSurgeons(staff.filter(s => s.role === 'Surgeon'));
        setNurses(staff.filter(s => s.role === 'Scrub Nurse'));
        setAnesthetists(staff.filter(s => s.role === 'Anesthetist'));
      } catch {}
    })();
  }, []);

  // Check surgery recommendation + load history
  useEffect(() => {
    if (!patient) { setHistory([]); setHasSurgeryRec(false); return; }
    (async () => {
      setCheckingRec(true);
      try {
        const cRes = (await api.consultations.list(patient.id)) as { data?: any[] };
        const consults = (cRes.data ?? []).map(mapApiConsultationToUi);
        setHasSurgeryRec(consults.some(c => c.surgeryRecommended));
      } catch { setHasSurgeryRec(false); }
      try {
        const sRes = (await api.surgeries.list(patient.id)) as { data?: any[] };
        setHistory((sRes.data ?? []).map(mapApiSurgeryToUi));
      } catch { setHistory([]); }
      setCheckingRec(false);
      resetForm();
    })();
  }, [patient?.id]);

  const resetForm = () => {
    setForm({
      surgeryDate: getTodayDate(), surgeryType: '', iolType: '',
      eyeOperated: '', anesthesiaType: '', durationMinutes: '',
      iolPowerRight: '', iolPowerLeft: '', hasComplications: false,
      complicationDetails: '', notes: '', surgeonId: '', scrubNurseId: '', anesthetistId: '',
    });
    setErrors({}); setSuccess('');
  };

  const handleChange = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const showIolType = () => {
    const st = form.surgeryType.toLowerCase();
    return st.includes('cataract') || st.includes('sics') || st.includes('phaco') || st.includes('iol');
  };

  const handleSubmit = async () => {
    if (!patient) return;
    const e: Record<string, string> = {};
    if (!form.surgeryDate) e.surgeryDate = 'Required';
    if (!form.surgeryType) e.surgeryType = 'Required';
    if (!form.eyeOperated) e.eyeOperated = 'Required';
    if (!form.anesthesiaType) e.anesthesiaType = 'Required';
    if (!form.durationMinutes || Number(form.durationMinutes) <= 0) e.durationMinutes = 'Required';
    if (!form.surgeonId) e.surgeonId = 'Required';
    if (!form.scrubNurseId) e.scrubNurseId = 'Required';
    if (!form.anesthetistId) e.anesthetistId = 'Required';
    if (form.hasComplications && !form.complicationDetails.trim()) e.complicationDetails = 'Please describe';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      const inferred = inferProcedureType(form.surgeryType);
      await api.surgeries.create(patient.id, {
        surgeryDate: new Date(form.surgeryDate).toISOString(),
        procedureType: inferred,
        surgeryType: form.surgeryType.trim(),
        iolType: form.iolType || undefined,
        eyeOperated: form.eyeOperated,
        anesthesiaType: form.anesthesiaType,
        durationMinutes: Number(form.durationMinutes),
        iolPowerRight: form.iolPowerRight || undefined,
        iolPowerLeft: form.iolPowerLeft || undefined,
        hasComplications: form.hasComplications,
        complicationDetails: form.hasComplications ? form.complicationDetails.trim() : undefined,
        notes: form.notes.trim() || undefined,
        surgeonId: form.surgeonId,
        scrubNurseId: form.scrubNurseId,
        anesthetistId: form.anesthetistId,
      });
      const sRes = (await api.surgeries.list(patient.id)) as { data?: any[] };
      setHistory((sRes.data ?? []).map(mapApiSurgeryToUi));
      setSuccess(`Surgery recorded for ${patient.firstName}`);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally { setSubmitting(false); }
  };

  const staffOptions = (list: StaffMember[]) =>
    [{ label: 'Select...', value: '' }, ...list.map(s => ({ label: s.name, value: s.id }))];

  const surgeryTypeOptions = [
    { label: 'Select surgery type', value: '' },
    ...SURGERY_TYPES.map(t => ({ label: t, value: t })),
  ];
  const iolTypeOptions = [
    { label: 'Select IOL type', value: '' },
    ...IOL_TYPES.map(t => ({ label: t, value: t })),
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PatientSelector selectedPatient={patient} onSelectPatient={setPatient} />

        {patient && checkingRec && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.orange600} />
            <Text style={styles.loadingText}>Checking surgery recommendation...</Text>
          </View>
        )}

        {patient && !checkingRec && !hasSurgeryRec && (
          <View style={styles.warningBox}>
            <Ionicons name="alert-circle" size={20} color={Colors.orange700} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.warningTitle}>Surgery Recommendation Required</Text>
              <Text style={styles.warningText}>
                This patient needs a consultation with surgery recommended before proceeding.
              </Text>
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

            {/* Surgery Details */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Surgery Details</Text>
              <Field label="Surgery Date *" value={form.surgeryDate} onChange={v => handleChange('surgeryDate', v)} error={errors.surgeryDate} placeholder="YYYY-MM-DD" />
              <PickerModal label="Surgery Type *" value={form.surgeryType} options={surgeryTypeOptions} onChange={v => handleChange('surgeryType', v)} error={errors.surgeryType} />
              <View style={{ height: 8 }} />
              {showIolType() && (
                <>
                  <PickerModal label="IOL Type" value={form.iolType} options={iolTypeOptions} onChange={v => handleChange('iolType', v)} />
                  <View style={{ height: 8 }} />
                </>
              )}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <PickerModal label="Eye Operated *" value={form.eyeOperated} options={EYE_OPTIONS} onChange={v => handleChange('eyeOperated', v)} error={errors.eyeOperated} />
                </View>
                <View style={{ flex: 1 }}>
                  <PickerModal label="Anesthesia *" value={form.anesthesiaType} options={ANESTHESIA_OPTIONS} onChange={v => handleChange('anesthesiaType', v)} error={errors.anesthesiaType} />
                </View>
              </View>
              <View style={{ height: 8 }} />
              <Field label="Duration (minutes) *" value={form.durationMinutes} onChange={v => handleChange('durationMinutes', v)} error={errors.durationMinutes} keyboardType="numeric" placeholder="45" />
            </View>

            {/* IOL Power */}
            {showIolType() && (
              <View style={[styles.card, { backgroundColor: Colors.orange50, borderColor: Colors.orange200 }]}>
                <Text style={[styles.sectionTitle, { color: Colors.orange900 }]}>IOL Power</Text>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}><Field label="Right Eye (D)" value={form.iolPowerRight} onChange={v => handleChange('iolPowerRight', v)} placeholder="22.0" /></View>
                  <View style={{ flex: 1 }}><Field label="Left Eye (D)" value={form.iolPowerLeft} onChange={v => handleChange('iolPowerLeft', v)} placeholder="21.5" /></View>
                </View>
              </View>
            )}

            {/* Surgical Team */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Surgical Team</Text>
              <PickerModal label="Surgeon *" value={form.surgeonId} options={staffOptions(surgeons)} onChange={v => handleChange('surgeonId', v)} error={errors.surgeonId} />
              <View style={{ height: 8 }} />
              <PickerModal label="Scrub Nurse *" value={form.scrubNurseId} options={staffOptions(nurses)} onChange={v => handleChange('scrubNurseId', v)} error={errors.scrubNurseId} />
              <View style={{ height: 8 }} />
              <PickerModal label="Anesthetist *" value={form.anesthetistId} options={staffOptions(anesthetists)} onChange={v => handleChange('anesthetistId', v)} error={errors.anesthetistId} />
            </View>

            {/* Complications */}
            <View style={styles.surgeryToggle}>
              <View style={{ flex: 1 }}>
                <Text style={styles.surgeryTitle}>Complications?</Text>
                <Text style={styles.surgerySubtitle}>Were there any intra-operative complications?</Text>
              </View>
              <Switch
                value={form.hasComplications}
                onValueChange={v => handleChange('hasComplications', v)}
                trackColor={{ false: Colors.gray300, true: Colors.red300 }}
                thumbColor={form.hasComplications ? Colors.red500 : Colors.gray100}
              />
            </View>

            {form.hasComplications && (
              <View style={[styles.card, { backgroundColor: Colors.red50, borderColor: Colors.red300 }]}>
                <Field label="Complication Details *" value={form.complicationDetails} onChange={v => handleChange('complicationDetails', v)} error={errors.complicationDetails} multiline placeholder="Describe complications and management..." />
              </View>
            )}

            {/* Notes */}
            <View style={styles.card}>
              <Field label="Additional Notes (Optional)" value={form.notes} onChange={v => handleChange('notes', v)} multiline placeholder="Any other observations..." />
            </View>

            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Record Surgery</Text>}
            </TouchableOpacity>

            {/* History */}
            {history.length > 0 && (
              <View style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Surgery History ({history.length})</Text>
                </View>
                {history.slice(0, 5).map(r => (
                  <View key={r.id} style={styles.historyRow}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.historyDiag} numberOfLines={1}>{r.surgeryType || r.procedureType}</Text>
                      <Text style={styles.historyDate}>{new Date(r.surgeryDate).toLocaleDateString()}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: Colors.gray500, marginTop: 2 }}>
                      {r.eyeOperated} Eye · {r.durationMinutes} min · {r.anesthesiaType}
                    </Text>
                    {r.hasComplications && (
                      <View style={styles.compBadge}><Text style={styles.compBadgeText}>Complications</Text></View>
                    )}
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
  surgeryToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.red50, borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: Colors.red300 },
  surgeryTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  surgerySubtitle: { fontSize: 11, color: Colors.gray600, marginTop: 2 },
  submitBtn: { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  historyCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100, marginTop: 16 },
  historyHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100 },
  historyDiag: { fontSize: 13, fontWeight: '500', color: Colors.gray900, flex: 1 },
  historyDate: { fontSize: 11, color: Colors.gray400 },
  compBadge: { backgroundColor: Colors.red50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 4, borderWidth: 1, borderColor: Colors.red300 },
  compBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.red500 },
});