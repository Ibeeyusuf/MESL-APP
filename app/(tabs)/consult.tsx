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
  WHO_VA_SCALE, mapApiConsultationToUi, mapApiUserToStaff,
  mapApiPatientToUi, getTodayDate,
} from '@/utils/helpers';
import type { Patient, Consultation, StaffMember } from '@/types';

const VA_OPTIONS = [{ label: '-- None --', value: '' }, ...WHO_VA_SCALE.map(v => ({ label: v, value: v }))];
const PRACTITIONER_OPTIONS = [
  { label: 'Select Practitioner', value: '' },
  { label: 'Ophthalmologist', value: 'Ophthalmologist' },
  { label: 'Optometrist', value: 'Optometrist' },
  { label: 'Ophthalmic Nurse', value: 'Ophthalmic Nurse' },
  { label: 'General Practitioner', value: 'General Practitioner' },
  { label: 'Community Health Worker', value: 'Community Health Worker' },
  { label: 'Other', value: 'Other' },
];

const SYMPTOMS = [
  'Blurred Vision', 'Eye Pain', 'Redness', 'Tearing/Watering',
  'Discharge', 'Itching', 'Foreign Body Sensation', 'Light Sensitivity (Photophobia)',
  'Halos Around Lights', 'Double Vision (Diplopia)', 'Floaters', 'Flashes of Light',
  'Gradual Vision Loss', 'Sudden Vision Loss', 'Difficulty Reading',
  'Night Blindness', 'Headache', 'Swelling of Eyelid',
];

const SIGNS = [
  'Conjunctival Injection', 'Corneal Opacity', 'Corneal Ulcer',
  'Anterior Chamber Reaction', 'Cataract', 'Shallow Anterior Chamber',
  'Raised IOP', 'Optic Disc Cupping', 'Macular Pathology',
  'Retinal Detachment', 'Vitreous Hemorrhage', 'Pterygium',
  'Lid Mass/Chalazion', 'Proptosis', 'Strabismus',
  'Nystagmus', 'Pupil Abnormality', 'Lens Subluxation',
];

// FIX: surgery types matching web version
const SURGERY_TYPES = [
  'RE Cataract Surgery',
  'LE Cataract Surgery',
  'RE Pterygium Excision',
  'LE Pterygium Excision',
  'RE Chalazion I/C',
  'LE Chalazion I/C',
];

// FIX: referral hospitals matching web version
const REFERRAL_HOSPITALS = [
  'General Hospital Minna',
  'General Hospital Kontagora',
  'FMC Bida',
  'NEC Kaduna',
  'UDUTH Sokoto',
  'Others',
];

export default function ConsultScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ patientId?: string }>();

  // Guard — Doctor only
  useEffect(() => {
    if (user && user.role !== 'Doctor') router.replace('/(tabs)/');
  }, [user]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [form, setForm] = useState({
    consultationDate: getTodayDate(),
    healthPractitioner: '',
    symptoms: [] as string[],
    signs: [] as string[],
    chiefComplaint: '',
    historyOfPresentIllness: '',
    anteriorSegment: '',
    posteriorSegment: '',
    diagnosis: '',
    treatmentPlan: '',
    vaRight: '',
    vaLeft: '',
    iopRight: '',
    iopLeft: '',
    surgeryRecommended: false,
    // FIX: new field — required when surgery is recommended
    selectedSurgeryType: '',
    surgeonId: '',
    scrubNurseId: '',
    anesthetistId: '',
    // FIX: new field — recommendations checkboxes (Health Education + referrals)
    recommendations: [] as string[],
    recommendationsOther: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [history, setHistory] = useState<Consultation[]>([]);
  const [surgeons, setSurgeons] = useState<StaffMember[]>([]);
  const [nurses, setNurses] = useState<StaffMember[]>([]);
  const [anesthetists, setAnesthetists] = useState<StaffMember[]>([]);
  const [showSymptoms, setShowSymptoms] = useState(false);
  const [showSigns, setShowSigns] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  useEffect(() => {
    if (params.patientId && !patient) {
      (async () => {
        try { const res = await api.patients.getById(params.patientId!); setPatient(mapApiPatientToUi(res)); } catch {}
      })();
    }
  }, [params.patientId]);

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

  useEffect(() => {
    if (patient) { loadHistory(patient.id); resetForm(); }
    else { setHistory([]); }
  }, [patient?.id]);

  const loadHistory = async (pid: string) => {
    try {
      const res = (await api.consultations.list(pid)) as { data?: any[] };
      setHistory((res.data ?? []).map(mapApiConsultationToUi));
    } catch { setHistory([]); }
  };

  const resetForm = () => {
    setForm({
      consultationDate: getTodayDate(), healthPractitioner: '',
      symptoms: [], signs: [],
      chiefComplaint: '', historyOfPresentIllness: '',
      anteriorSegment: '', posteriorSegment: '', diagnosis: '', treatmentPlan: '',
      vaRight: '', vaLeft: '', iopRight: '', iopLeft: '',
      surgeryRecommended: false, selectedSurgeryType: '',
      surgeonId: '', scrubNurseId: '', anesthetistId: '',
      recommendations: [], recommendationsOther: '',
    });
    setErrors({}); setSuccess('');
  };

  const handleChange = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const toggleArrayItem = (field: 'symptoms' | 'signs' | 'recommendations', item: string) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter((i: string) => i !== item)
        : [...prev[field], item],
    }));
  };

  const handleSubmit = async () => {
    if (!patient) return;
    const e: Record<string, string> = {};
    if (!form.consultationDate) e.consultationDate = 'Required';
    if (!form.anteriorSegment.trim()) e.anteriorSegment = 'Required';
    if (!form.posteriorSegment.trim()) e.posteriorSegment = 'Required';
    if (form.surgeryRecommended) {
      // FIX: validate selectedSurgeryType — required on web when surgery recommended
      if (!form.selectedSurgeryType) e.selectedSurgeryType = 'Select a surgery type';
      if (!form.surgeonId) e.surgeonId = 'Required for surgery';
      if (!form.scrubNurseId) e.scrubNurseId = 'Required for surgery';
      if (!form.anesthetistId) e.anesthetistId = 'Required for surgery';
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      await api.consultations.create(patient.id, {
        consultationDate: new Date(form.consultationDate).toISOString(),
        healthPractitioner: form.healthPractitioner || undefined,
        symptoms: form.symptoms,
        signs: form.signs,
        chiefComplaint: form.chiefComplaint.trim() || undefined,
        historyOfPresentIllness: form.historyOfPresentIllness.trim() || undefined,
        anteriorSegment: form.anteriorSegment.trim(),
        posteriorSegment: form.posteriorSegment.trim(),
        diagnosis: form.diagnosis.trim() || undefined,
        treatmentPlan: form.treatmentPlan.trim() || undefined,
        vaRight: form.vaRight || undefined,
        vaLeft: form.vaLeft || undefined,
        iopRight: form.iopRight ? Number(form.iopRight) : undefined,
        iopLeft: form.iopLeft ? Number(form.iopLeft) : undefined,
        surgeryRecommended: form.surgeryRecommended,
        // FIX: include selectedSurgeryType and recommendations in payload
        selectedSurgeryType: form.surgeryRecommended ? form.selectedSurgeryType : undefined,
        surgeonId: form.surgeryRecommended ? form.surgeonId : undefined,
        scrubNurseId: form.surgeryRecommended ? form.scrubNurseId : undefined,
        anesthetistId: form.surgeryRecommended ? form.anesthetistId : undefined,
        recommendations: form.recommendations,
      });
      await loadHistory(patient.id);
      setSuccess(`Consultation recorded for ${patient.firstName}`);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally { setSubmitting(false); }
  };

  const staffOptions = (list: StaffMember[]) =>
    [{ label: 'Select...', value: '' }, ...list.map(s => ({ label: s.name, value: s.id }))];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PatientSelector selectedPatient={patient} onSelectPatient={setPatient} />

        {patient && (
          <>
            {success ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.green700} />
                <Text style={styles.successText}>{success}</Text>
              </View>
            ) : null}

            {/* Date & Practitioner */}
            <View style={styles.card}>
              <InputField label="Consultation Date *" value={form.consultationDate} onChange={v => handleChange('consultationDate', v)} error={errors.consultationDate} placeholder="YYYY-MM-DD" />
              <PickerModal label="Health Practitioner" value={form.healthPractitioner} options={PRACTITIONER_OPTIONS} onChange={v => handleChange('healthPractitioner', v)} />
            </View>

            {/* Symptoms */}
            <View style={styles.card}>
              <TouchableOpacity style={styles.expandHeader} onPress={() => setShowSymptoms(!showSymptoms)} activeOpacity={0.7}>
                <Text style={styles.sectionTitle}>Symptoms ({form.symptoms.length} selected)</Text>
                <Ionicons name={showSymptoms ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gray500} />
              </TouchableOpacity>
              {showSymptoms && (
                <View style={styles.checkGrid}>
                  {SYMPTOMS.map(s => (
                    <TouchableOpacity key={s} style={styles.checkRow} onPress={() => toggleArrayItem('symptoms', s)} activeOpacity={0.7}>
                      <Ionicons name={form.symptoms.includes(s) ? 'checkbox' : 'square-outline'} size={20} color={form.symptoms.includes(s) ? Colors.orange600 : Colors.gray400} />
                      <Text style={styles.checkLabel}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Signs */}
            <View style={styles.card}>
              <TouchableOpacity style={styles.expandHeader} onPress={() => setShowSigns(!showSigns)} activeOpacity={0.7}>
                <Text style={styles.sectionTitle}>Signs ({form.signs.length} selected)</Text>
                <Ionicons name={showSigns ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gray500} />
              </TouchableOpacity>
              {showSigns && (
                <View style={styles.checkGrid}>
                  {SIGNS.map(s => (
                    <TouchableOpacity key={s} style={styles.checkRow} onPress={() => toggleArrayItem('signs', s)} activeOpacity={0.7}>
                      <Ionicons name={form.signs.includes(s) ? 'checkbox' : 'square-outline'} size={20} color={form.signs.includes(s) ? Colors.orange600 : Colors.gray400} />
                      <Text style={styles.checkLabel}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Complaint & History */}
            <View style={styles.card}>
              <InputField label="Chief Complaint" value={form.chiefComplaint} onChange={v => handleChange('chiefComplaint', v)} multiline placeholder="Patient's main complaint..." />
              <InputField label="History of Present Illness" value={form.historyOfPresentIllness} onChange={v => handleChange('historyOfPresentIllness', v)} multiline placeholder="Duration, onset, progression..." />
            </View>

            {/* Examination */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Clinical Examination</Text>
              <InputField label="Anterior Segment *" value={form.anteriorSegment} onChange={v => handleChange('anteriorSegment', v)} error={errors.anteriorSegment} multiline placeholder="Cornea, anterior chamber, iris, lens..." />
              <InputField label="Posterior Segment *" value={form.posteriorSegment} onChange={v => handleChange('posteriorSegment', v)} error={errors.posteriorSegment} multiline placeholder="Vitreous, retina, optic disc, macula..." />
            </View>

            {/* VA & IOP */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>VA & IOP (Optional)</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}><PickerModal label="VA Right" value={form.vaRight} options={VA_OPTIONS} onChange={v => handleChange('vaRight', v)} /></View>
                <View style={{ flex: 1 }}><PickerModal label="VA Left" value={form.vaLeft} options={VA_OPTIONS} onChange={v => handleChange('vaLeft', v)} /></View>
              </View>
              <View style={[styles.row, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}><InputField label="IOP Right (mmHg)" value={form.iopRight} onChange={v => handleChange('iopRight', v)} keyboardType="numeric" placeholder="10-21 normal" /></View>
                <View style={{ flex: 1 }}><InputField label="IOP Left (mmHg)" value={form.iopLeft} onChange={v => handleChange('iopLeft', v)} keyboardType="numeric" placeholder="10-21 normal" /></View>
              </View>
            </View>

            {/* Diagnosis & Plan */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Diagnosis & Plan</Text>
              <InputField label="Diagnosis" value={form.diagnosis} onChange={v => handleChange('diagnosis', v)} multiline placeholder="Enter diagnosis..." />
              <InputField label="Treatment Plan" value={form.treatmentPlan} onChange={v => handleChange('treatmentPlan', v)} multiline placeholder="Treatment and management plan..." />
            </View>

            {/* FIX: Recommendations section — matches web (Health Education + Referrals) */}
            <View style={styles.card}>
              <TouchableOpacity style={styles.expandHeader} onPress={() => setShowRecommendations(!showRecommendations)} activeOpacity={0.7}>
                <Text style={styles.sectionTitle}>Recommendations ({form.recommendations.length} selected)</Text>
                <Ionicons name={showRecommendations ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gray500} />
              </TouchableOpacity>
              {showRecommendations && (
                <View style={styles.checkGrid}>
                  {/* Health Education */}
                  <TouchableOpacity style={styles.checkRow} onPress={() => toggleArrayItem('recommendations', 'Health Education')} activeOpacity={0.7}>
                    <Ionicons name={form.recommendations.includes('Health Education') ? 'checkbox' : 'square-outline'} size={20} color={form.recommendations.includes('Health Education') ? Colors.orange600 : Colors.gray400} />
                    <Text style={styles.checkLabel}>Health Education</Text>
                  </TouchableOpacity>

                  {/* Referral hospitals */}
                  <Text style={[styles.checkLabel, { color: Colors.gray500, marginTop: 8, marginBottom: 4 }]}>Referral</Text>
                  {REFERRAL_HOSPITALS.map(hospital => (
                    <TouchableOpacity key={hospital} style={styles.checkRow} onPress={() => toggleArrayItem('recommendations', hospital)} activeOpacity={0.7}>
                      <Ionicons name={form.recommendations.includes(hospital) ? 'checkbox' : 'square-outline'} size={20} color={form.recommendations.includes(hospital) ? Colors.orange600 : Colors.gray400} />
                      <Text style={styles.checkLabel}>{hospital}</Text>
                    </TouchableOpacity>
                  ))}

                  {/* Others free-text */}
                  {form.recommendations.includes('Others') && (
                    <InputField
                      label="Specify other recommendation"
                      value={form.recommendationsOther}
                      onChange={v => handleChange('recommendationsOther', v)}
                      multiline
                      placeholder="Enter recommendation..."
                    />
                  )}
                </View>
              )}
            </View>

            {/* Surgery Toggle */}
            <View style={styles.surgeryToggle}>
              <View style={{ flex: 1 }}>
                <Text style={styles.surgeryTitle}>Recommend Surgery?</Text>
                <Text style={styles.surgerySubtitle}>Flag for pre-surgery screening</Text>
              </View>
              <Switch
                value={form.surgeryRecommended}
                onValueChange={v => handleChange('surgeryRecommended', v)}
                trackColor={{ false: Colors.gray300, true: Colors.orange200 }}
                thumbColor={form.surgeryRecommended ? Colors.orange600 : Colors.gray100}
              />
            </View>

            {form.surgeryRecommended && (
              <View style={styles.card}>
                {/* FIX: Surgery type selection — required field matching web */}
                <Text style={styles.sectionTitle}>Select Surgery Type *</Text>
                {errors.selectedSurgeryType ? (
                  <Text style={{ fontSize: 11, color: Colors.red500, marginBottom: 8 }}>{errors.selectedSurgeryType}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {SURGERY_TYPES.map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.surgTypeChip, form.selectedSurgeryType === type && styles.surgTypeChipActive]}
                      onPress={() => handleChange('selectedSurgeryType', type)}
                    >
                      <Text style={[styles.surgTypeText, form.selectedSurgeryType === type && styles.surgTypeTextActive]}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>Surgical Team</Text>
                <PickerModal label="Surgeon *" value={form.surgeonId} options={staffOptions(surgeons)} onChange={v => handleChange('surgeonId', v)} error={errors.surgeonId} />
                <View style={{ height: 8 }} />
                <PickerModal label="Scrub Nurse *" value={form.scrubNurseId} options={staffOptions(nurses)} onChange={v => handleChange('scrubNurseId', v)} error={errors.scrubNurseId} />
                <View style={{ height: 8 }} />
                <PickerModal label="Anesthetist *" value={form.anesthetistId} options={staffOptions(anesthetists)} onChange={v => handleChange('anesthetistId', v)} error={errors.anesthetistId} />
              </View>
            )}

            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Save Consultation</Text>}
            </TouchableOpacity>

            {history.length > 0 && (
              <View style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Consultation History</Text>
                  <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{history.length} Records</Text></View>
                </View>
                {history.slice(0, 5).map(r => (
                  <View key={r.id} style={styles.historyRow}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.historyDiag} numberOfLines={1}>{r.diagnosis || r.anteriorSegment}</Text>
                      <Text style={styles.historyDate}>{new Date(r.consultationDate).toLocaleDateString()}</Text>
                    </View>
                    {r.surgeryRecommended && (
                      <View style={styles.surgeryBadge}><Text style={styles.surgeryBadgeText}>Surgery Recommended</Text></View>
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

function InputField({ label, value, onChange, error, multiline, placeholder, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; multiline?: boolean; placeholder?: string; keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 6 }}>{label}</Text>
      <TextInput
        style={[ifStyles.input, multiline && ifStyles.multiline, error ? { borderColor: Colors.red300 } : null]}
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.gray400}
        multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} keyboardType={keyboardType ?? 'default'}
      />
      {error ? <Text style={{ fontSize: 11, color: Colors.red500, marginTop: 3 }}>{error}</Text> : null}
    </View>
  );
}

const ifStyles = StyleSheet.create({
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.gray900 },
  multiline: { minHeight: 80 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 40 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.green50, padding: 14, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.green100 },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500' },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },
  expandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checkGrid: { marginTop: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  checkLabel: { fontSize: 13, color: Colors.gray700, flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  surgeryToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.orange50, borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: Colors.orange100 },
  surgeryTitle: { fontSize: 14, fontWeight: '600', color: Colors.orange900 },
  surgerySubtitle: { fontSize: 11, color: Colors.orange700, marginTop: 2 },
  // FIX: surgery type chip styles
  surgTypeChip: {
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white,
  },
  surgTypeChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  surgTypeText: { fontSize: 12, fontWeight: '500', color: Colors.gray700 },
  surgTypeTextActive: { color: Colors.white },
  submitBtn: { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  historyCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100, marginTop: 16 },
  historyHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },
  historyRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100 },
  historyDiag: { fontSize: 13, fontWeight: '500', color: Colors.gray900, flex: 1 },
  historyDate: { fontSize: 11, color: Colors.gray400 },
  surgeryBadge: { backgroundColor: Colors.orange50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 4 },
  surgeryBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.orange700 },
});