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
  'Poor Distance Vision', 'Poor Near Vision', 'Itching', 'Redness',
  'Whitish Speck', 'Discharge', 'Eye Injury', 'Growth',
  'Tearing', 'Foreign Body Sensation', 'Others',
];

const SIGNS = [
  'Conj. Injection', 'Cornea Opacity', 'Ptosis', 'Eyelid swelling',
  'Eye deviation', 'Eye Protrusion', 'Trichiasis', 'Lens: Opacity',
  'Lens: Aphakic', 'Lens: Pseudophakia', 'Poor Pupillary Reaction',
  'Glaucomatous Cupped Disc', 'Optic Atrophy', 'Maculopathy', 'Others',
];

const SURGERY_TYPES = [
  'SICS + PCIOL', 'SICS + ACIOL', 'SICS NO IOL', 'ICCE',
  'Pterygium Excision', 'Chalazion I/C', 'Others',
];

const IOL_TYPE_OPTIONS = [
  { label: 'Select IOL Type', value: '' },
  { label: 'PMMA (Polymethyl Methacrylate)', value: 'PMMA' },
  { label: 'Foldable Acrylic', value: 'Foldable Acrylic' },
  { label: 'Foldable Hydrophilic', value: 'Foldable Hydrophilic' },
  { label: 'Foldable Hydrophobic', value: 'Foldable Hydrophobic' },
  { label: 'Scleral Fixated', value: 'Scleral Fixated' },
];

const DIAGNOSIS_OPTIONS = [
  { label: 'Select diagnosis', value: '' },
  { label: 'Normal Anterior Segment', value: 'Normal Anterior Segment' },
  { label: 'Pterygium', value: 'Pterygium' },
  { label: 'Chalazion', value: 'Chalazion' },
  { label: 'Presbyopia', value: 'Presbyopia' },
  { label: 'Allergic Conjunctivitis', value: 'Allergic Conjunctivitis' },
  { label: 'Infective Conjunctivitis', value: 'Infective Conjunctivitis' },
  { label: 'Operable Cataract', value: 'Operable Cataract' },
  { label: 'Inoperable Cataract', value: 'Inoperable Cataract' },
  { label: 'Lens opacity not ready for Surgery', value: 'Lens opacity not ready for Surgery' },
  { label: 'Aphakia', value: 'Aphakia' },
  { label: 'Pseudophakia', value: 'Pseudophakia' },
  { label: 'Subluxated lens', value: 'Subluxated lens' },
  { label: 'Glaucoma', value: 'Glaucoma' },
  { label: 'Maculopathy', value: 'Maculopathy' },
  { label: 'Diabetic retinopathy', value: 'Diabetic retinopathy' },
  { label: 'Retinal Detachment', value: 'Retinal Detachment' },
];

const REFERRAL_HOSPITALS = [
  'General Hospital Minna', 'General Hospital Kontagora', 'FMC Bida',
  'NEC Kaduna', 'UDUTH Sokoto', 'Others',
];

const IOL_SURGERY_TYPES = ['SICS + PCIOL', 'SICS + ACIOL'];

// ── Consultation History Cards — matches web ConsultationHistoryTable exactly ──
function ConsultationHistoryTable({ consultations }: { consultations: Consultation[] }) {
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  if (consultations.length === 0) {
    return (
      <View style={histStyles.empty}>
        <Ionicons name="document-text-outline" size={36} color={Colors.gray300} />
        <Text style={histStyles.emptyTitle}>No consultations</Text>
        <Text style={histStyles.emptyText}>This patient has no consultation history yet.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {consultations.map((c, index) => (
        <View key={c.id} style={histStyles.card}>
          {/* Card header — number + surgery badge + date */}
          <View style={histStyles.cardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* Orange circle icon */}
              <View style={histStyles.iconCircle}>
                <Ionicons name="document-text" size={18} color={Colors.orange600} />
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={histStyles.consultNumber}>
                    Consultation #{consultations.length - index}
                  </Text>
                  {c.surgeryRecommended ? (
                    <View style={histStyles.surgeryBadge}>
                      <Ionicons name="checkmark-circle" size={11} color="#166534" style={{ marginRight: 3 }} />
                      <Text style={histStyles.surgeryBadgeText}>
                        {c.selectedSurgeryType || 'Surgery Recommended'}
                      </Text>
                    </View>
                  ) : (
                    <View style={histStyles.noSurgeryBadge}>
                      <Ionicons name="close-circle" size={11} color="#374151" style={{ marginRight: 3 }} />
                      <Text style={histStyles.noSurgeryBadgeText}>No Surgery</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Ionicons name="time-outline" size={13} color={Colors.gray400} style={{ marginRight: 4 }} />
                  <Text style={histStyles.dateText}>{formatDate(c.consultationDate)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Health Practitioner */}
          {c.healthPractitioner ? (
            <View style={histStyles.section}>
              <Text style={histStyles.inlineLabel}>Health Practitioner: </Text>
              <Text style={histStyles.inlineValue}>{c.healthPractitioner}</Text>
            </View>
          ) : null}

          {/* Symptoms + Signs */}
          {((c.symptoms?.length ?? 0) > 0 || (c.signs?.length ?? 0) > 0) && (
            <View style={[histStyles.section, histStyles.divider]}>
              <View style={histStyles.twoCol}>
                {(c.symptoms?.length ?? 0) > 0 && (
                  <View style={{ flex: 1 }}>
                    <Text style={histStyles.colLabel}>SYMPTOMS</Text>
                    <View style={histStyles.chipWrap}>
                      {c.symptoms.map((s: string, i: number) => (
                        <View key={i} style={histStyles.orangeChip}>
                          <Text style={histStyles.orangeChipText}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {(c.signs?.length ?? 0) > 0 && (
                  <View style={{ flex: 1 }}>
                    <Text style={histStyles.colLabel}>SIGNS</Text>
                    <View style={histStyles.chipWrap}>
                      {c.signs.map((s: string, i: number) => (
                        <View key={i} style={histStyles.purpleChip}>
                          <Text style={histStyles.purpleChipText}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* VA & IOP */}
          {(c.vaRight || c.vaLeft || c.iopRight || c.iopLeft) && (
            <View style={[histStyles.section, histStyles.divider]}>
              <View style={histStyles.fourCol}>
                {c.vaRight ? (
                  <View>
                    <Text style={histStyles.colLabel}>VA RIGHT</Text>
                    <Text style={histStyles.metricValue}>{c.vaRight}</Text>
                  </View>
                ) : null}
                {c.vaLeft ? (
                  <View>
                    <Text style={histStyles.colLabel}>VA LEFT</Text>
                    <Text style={histStyles.metricValue}>{c.vaLeft}</Text>
                  </View>
                ) : null}
                {c.iopRight ? (
                  <View>
                    <Text style={histStyles.colLabel}>IOP RIGHT</Text>
                    <Text style={histStyles.metricValue}>{c.iopRight} mmHg</Text>
                  </View>
                ) : null}
                {c.iopLeft ? (
                  <View>
                    <Text style={histStyles.colLabel}>IOP LEFT</Text>
                    <Text style={histStyles.metricValue}>{c.iopLeft} mmHg</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {/* Diagnosis */}
          {c.diagnosis ? (
            <View style={[histStyles.section, histStyles.divider]}>
              <Text style={histStyles.colLabel}>DIAGNOSIS</Text>
              <View style={{ marginTop: 4 }}>
                <View style={histStyles.blueBadge}>
                  <Text style={histStyles.blueBadgeText}>{c.diagnosis}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Recommendations */}
          {(c.recommendations?.length ?? 0) > 0 && (
            <View style={[histStyles.section, histStyles.divider]}>
              <Text style={histStyles.colLabel}>RECOMMENDATIONS</Text>
              <View style={[histStyles.chipWrap, { marginTop: 4 }]}>
                {c.recommendations.map((r: string, i: number) => (
                  <View key={i} style={histStyles.greenChip}>
                    <Text style={histStyles.greenChipText}>{r}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Prescribed Drugs */}
          {(c.prescribedDrugs?.length ?? 0) > 0 && (
            <View style={[histStyles.section, histStyles.divider]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <Ionicons name="medkit-outline" size={12} color={Colors.gray500} />
                <Text style={histStyles.colLabel}>PRESCRIBED DRUGS</Text>
              </View>
              {c.prescribedDrugs.map((drug: any, i: number) => (
                <Text key={i} style={histStyles.listItem}>
                  {drug.drugName} — Qty: {drug.quantity}{drug.duration ? ` (${drug.duration})` : ''}
                </Text>
              ))}
            </View>
          )}

          {/* Prescribed Glasses */}
          {(c.prescribedGlasses?.length ?? 0) > 0 && (
            <View style={[histStyles.section, histStyles.divider]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <Ionicons name="glasses-outline" size={12} color={Colors.gray500} />
                <Text style={histStyles.colLabel}>PRESCRIBED GLASSES</Text>
              </View>
              {c.prescribedGlasses.map((g: any, i: number) => (
                <Text key={i} style={histStyles.listItem}>
                  {g.glassesDescription} — Qty: {g.quantity}
                </Text>
              ))}
            </View>
          )}

          {/* Consulted by footer */}
          {c.consultedBy ? (
            <View style={[histStyles.divider, { paddingTop: 10, marginTop: 6 }]}>
              <Text style={histStyles.footer}>Consulted by {c.consultedBy}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export default function ConsultScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ patientId?: string }>();

  useEffect(() => {
    if (user && user.role !== 'Doctor') router.replace('/(tabs)/');
  }, [user]);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [form, setForm] = useState({
    consultationDate: getTodayDate(),
    healthPractitioner: '',
    symptoms: [] as string[],
    symptomsOther: '',
    signs: [] as string[],
    signsOther: '',
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
    selectedSurgeryType: '',
    surgeryOthers: '',
    iolType: '',
    iolPower: '',
    surgeonId: '',
    scrubNurseId: '',
    anesthetistId: '',
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
      symptoms: [], symptomsOther: '',
      signs: [], signsOther: '',
      chiefComplaint: '', historyOfPresentIllness: '',
      anteriorSegment: '', posteriorSegment: '', diagnosis: '', treatmentPlan: '',
      vaRight: '', vaLeft: '', iopRight: '', iopLeft: '',
      surgeryRecommended: false, selectedSurgeryType: '', surgeryOthers: '',
      iolType: '', iolPower: '',
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
      if (!form.selectedSurgeryType) e.selectedSurgeryType = 'Select a surgery type';
      if (!form.surgeonId) e.surgeonId = 'Required for surgery';
      if (!form.scrubNurseId) e.scrubNurseId = 'Required for surgery';
      if (!form.anesthetistId) e.anesthetistId = 'Required for surgery';
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      const resolvedSurgeryType =
        form.surgeryRecommended && form.selectedSurgeryType === 'Others'
          ? form.surgeryOthers.trim() || 'Others'
          : form.surgeryRecommended
          ? form.selectedSurgeryType
          : undefined;

      await api.consultations.create(patient.id, {
        consultationDate: new Date(form.consultationDate).toISOString(),
        healthPractitioner: form.healthPractitioner || undefined,
        symptoms: form.symptoms,
        symptomsOther: form.symptoms.includes('Others') ? form.symptomsOther.trim() : undefined,
        signs: form.signs,
        signsOther: form.signs.includes('Others') ? form.signsOther.trim() : undefined,
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
        selectedSurgeryType: resolvedSurgeryType,
        iolType: form.surgeryRecommended && IOL_SURGERY_TYPES.includes(form.selectedSurgeryType) ? form.iolType : undefined,
        iolPower: form.surgeryRecommended && IOL_SURGERY_TYPES.includes(form.selectedSurgeryType) ? form.iolPower.trim() : undefined,
        surgeonId: form.surgeryRecommended ? form.surgeonId : undefined,
        scrubNurseId: form.surgeryRecommended ? form.scrubNurseId : undefined,
        anesthetistId: form.surgeryRecommended ? form.anesthetistId : undefined,
        recommendations: form.recommendations,
        recommendationsOther: form.recommendations.includes('Others') ? form.recommendationsOther.trim() : undefined,
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

  const showIolFields = form.surgeryRecommended && IOL_SURGERY_TYPES.includes(form.selectedSurgeryType);

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
                  {form.symptoms.includes('Others') && (
                    <InputField label="Specify other symptoms" value={form.symptomsOther} onChange={v => handleChange('symptomsOther', v)} multiline placeholder="Enter other symptoms..." />
                  )}
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
                  {form.signs.includes('Others') && (
                    <InputField label="Specify other signs" value={form.signsOther} onChange={v => handleChange('signsOther', v)} multiline placeholder="Enter other signs..." />
                  )}
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
              <PickerModal label="Diagnosis" value={form.diagnosis} options={DIAGNOSIS_OPTIONS} onChange={v => handleChange('diagnosis', v)} />
              <View style={{ height: 8 }} />
              <InputField label="Treatment Plan" value={form.treatmentPlan} onChange={v => handleChange('treatmentPlan', v)} multiline placeholder="Treatment and management plan..." />
            </View>

            {/* Recommendations */}
            <View style={styles.card}>
              <TouchableOpacity style={styles.expandHeader} onPress={() => setShowRecommendations(!showRecommendations)} activeOpacity={0.7}>
                <Text style={styles.sectionTitle}>Recommendations ({form.recommendations.length} selected)</Text>
                <Ionicons name={showRecommendations ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gray500} />
              </TouchableOpacity>
              {showRecommendations && (
                <View style={styles.checkGrid}>
                  <TouchableOpacity style={styles.checkRow} onPress={() => toggleArrayItem('recommendations', 'Health Education')} activeOpacity={0.7}>
                    <Ionicons name={form.recommendations.includes('Health Education') ? 'checkbox' : 'square-outline'} size={20} color={form.recommendations.includes('Health Education') ? Colors.orange600 : Colors.gray400} />
                    <Text style={styles.checkLabel}>Health Education</Text>
                  </TouchableOpacity>
                  <Text style={[styles.checkLabel, { color: Colors.gray500, marginTop: 8, marginBottom: 4, fontWeight: '600' }]}>Referral</Text>
                  {REFERRAL_HOSPITALS.map(hospital => (
                    <TouchableOpacity key={hospital} style={styles.checkRow} onPress={() => toggleArrayItem('recommendations', hospital)} activeOpacity={0.7}>
                      <Ionicons name={form.recommendations.includes(hospital) ? 'checkbox' : 'square-outline'} size={20} color={form.recommendations.includes(hospital) ? Colors.orange600 : Colors.gray400} />
                      <Text style={styles.checkLabel}>{hospital}</Text>
                    </TouchableOpacity>
                  ))}
                  {form.recommendations.includes('Others') && (
                    <InputField label="Specify other recommendation" value={form.recommendationsOther} onChange={v => handleChange('recommendationsOther', v)} multiline placeholder="Enter recommendation..." />
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
                onValueChange={v => { handleChange('surgeryRecommended', v); if (!v) { handleChange('selectedSurgeryType', ''); handleChange('iolType', ''); handleChange('iolPower', ''); } }}
                trackColor={{ false: Colors.gray300, true: Colors.orange200 }}
                thumbColor={form.surgeryRecommended ? Colors.orange600 : Colors.gray100}
              />
            </View>

            {form.surgeryRecommended && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>C. Surgery Type *</Text>
                {errors.selectedSurgeryType ? (
                  <Text style={{ fontSize: 11, color: Colors.red500, marginBottom: 8 }}>{errors.selectedSurgeryType}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {SURGERY_TYPES.map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.surgTypeChip, form.selectedSurgeryType === type && styles.surgTypeChipActive]}
                      onPress={() => { handleChange('selectedSurgeryType', type); handleChange('iolType', ''); handleChange('iolPower', ''); }}
                    >
                      <Text style={[styles.surgTypeText, form.selectedSurgeryType === type && styles.surgTypeTextActive]}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {form.selectedSurgeryType === 'Others' && (
                  <InputField label="Specify surgery type" value={form.surgeryOthers} onChange={v => handleChange('surgeryOthers', v)} placeholder="Enter surgery type..." />
                )}
                {showIolFields && (
                  <View style={styles.iolBox}>
                    <Text style={styles.iolTitle}>IOL Details</Text>
                    <PickerModal label="IOL Type" value={form.iolType} options={IOL_TYPE_OPTIONS} onChange={v => handleChange('iolType', v)} />
                    <View style={{ height: 8 }} />
                    <InputField label="IOL Power" value={form.iolPower} onChange={v => handleChange('iolPower', v)} placeholder="e.g. 22.5 D" />
                  </View>
                )}
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Surgical Team</Text>
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

            {/* ── Consultation History — matches web ConsultationHistoryTable ── */}
            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>Consultation History</Text>
                <View style={styles.historyBadge}>
                  <Text style={styles.historyBadgeText}>{history.length} Records</Text>
                </View>
              </View>
              <View style={{ padding: 16 }}>
                <ConsultationHistoryTable consultations={history} />
              </View>
            </View>
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

// ── History card styles ──
const histStyles = StyleSheet.create({
  empty: {
    alignItems: 'center', paddingVertical: 40,
    borderWidth: 1, borderColor: Colors.gray200, borderStyle: 'dashed',
    borderRadius: 12, backgroundColor: Colors.gray50,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900, marginTop: 8 },
  emptyText: { fontSize: 13, color: Colors.gray500, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },

  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.gray200,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.orange50, alignItems: 'center', justifyContent: 'center',
  },
  consultNumber: { fontSize: 13, fontWeight: '600', color: Colors.gray600 },

  surgeryBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#DCFCE7', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  surgeryBadgeText: { fontSize: 11, fontWeight: '600', color: '#166534' },

  noSurgeryBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.gray100, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  noSurgeryBadgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },

  dateText: { fontSize: 13, color: Colors.gray500 },

  section: { marginTop: 6 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray200, paddingTop: 10, marginTop: 10 },

  inlineLabel: { fontSize: 13, color: Colors.gray500 },
  inlineValue: { fontSize: 13, fontWeight: '600', color: Colors.gray900 },

  twoCol: { flexDirection: 'row', gap: 12 },
  fourCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },

  colLabel: { fontSize: 10, fontWeight: '600', color: Colors.gray500, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  metricValue: { fontSize: 14, fontWeight: '700', color: Colors.gray900 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },

  orangeChip: { backgroundColor: Colors.orange50, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  orangeChipText: { fontSize: 11, fontWeight: '500', color: Colors.orange800 },

  purpleChip: { backgroundColor: '#F5F3FF', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  purpleChipText: { fontSize: 11, fontWeight: '500', color: '#6D28D9' },

  blueBadge: { backgroundColor: '#DBEAFE', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  blueBadgeText: { fontSize: 13, fontWeight: '600', color: '#1E40AF' },

  greenChip: { backgroundColor: '#DCFCE7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  greenChipText: { fontSize: 11, fontWeight: '500', color: '#166534' },

  listItem: { fontSize: 13, color: Colors.gray900, marginTop: 2 },
  footer: { fontSize: 12, color: Colors.gray500 },
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
  surgTypeChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white },
  surgTypeChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  surgTypeText: { fontSize: 12, fontWeight: '500', color: Colors.gray700 },
  surgTypeTextActive: { color: Colors.white },
  iolBox: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 16 },
  iolTitle: { fontSize: 14, fontWeight: '700', color: '#1E3A8A', marginBottom: 10 },
  submitBtn: { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  historyCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100, marginTop: 16 },
  historyHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },
});