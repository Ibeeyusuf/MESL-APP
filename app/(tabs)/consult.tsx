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
  WHO_VA_SCALE, mapApiConsultationToUi, mapApiPatientToUi, getTodayDate,
} from '@/utils/helpers';
import type { Patient, Consultation } from '@/types';

// ─── Constants — must exactly match web ──────────────────────────────────────

const VA_OPTIONS = [{ label: '-- None --', value: '' }, ...WHO_VA_SCALE.map(v => ({ label: v, value: v }))];

// Web: specific doctor names, not job titles
const PRACTITIONER_OPTIONS = [
  { label: 'Select practitioner', value: '' },
  { label: 'Dr. Ibrahim Wambai',  value: 'Dr. Ibrahim Wambai' },
  { label: 'Dr. Nasiru Usman',    value: 'Dr. Nasiru Usman' },
  { label: 'Dr. Adamu Mohammed',  value: 'Dr. Adamu Mohammed' },
  { label: 'Dr. Murtala Umar',    value: 'Dr. Murtala Umar' },
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
  'Glaucomatous Cupped Disc', 'Optic Atrophy', 'Maculopathy',
  'Unable to examine ant. segment', 'Unable to examine post. segment', 'Others',
];

const DIAGNOSIS_OPTIONS = [
  { label: 'Select diagnosis', value: '' },
  { label: 'Normal Anterior Segment',            value: 'Normal Anterior Segment' },
  { label: 'Pterygium',                           value: 'Pterygium' },
  { label: 'Chalazion',                           value: 'Chalazion' },
  { label: 'Presbyopia',                          value: 'Presbyopia' },
  { label: 'Allergic Conjunctivitis',             value: 'Allergic Conjunctivitis' },
  { label: 'Infective Conjunctivitis',            value: 'Infective Conjunctivitis' },
  { label: 'Operable Cataract',                   value: 'Operable Cataract' },
  { label: 'Inoperable Cataract',                 value: 'Inoperable Cataract' },
  { label: 'Lens opacity not ready for Surgery',  value: 'Lens opacity not ready for Surgery' },
  { label: 'Aphakia',                             value: 'Aphakia' },
  { label: 'Pseudophakia',                        value: 'Pseudophakia' },
  { label: 'Subluxated lens',                     value: 'Subluxated lens' },
  { label: 'Glaucoma',                            value: 'Glaucoma' },
  { label: 'Maculopathy',                         value: 'Maculopathy' },
  { label: 'Diabetic retinopathy',                value: 'Diabetic retinopathy' },
  { label: 'Retinal Detachment',                  value: 'Retinal Detachment' },
];

const REFERRAL_HOSPITALS = [
  'General Hospital Minna', 'General Hospital Kontagora',
  'FMC Bida', 'NEC Kaduna', 'UDUTH Sokoto', 'Others',
];

const SURGERY_TYPES = [
  'SICS + PCIOL', 'SICS + ACIOL', 'SICS NO IOL',
  'ICCE', 'Pterygium Excision', 'Chalazion I/C', 'Others',
];

const IOL_SURGERY_TYPES = ['SICS + PCIOL', 'SICS + ACIOL'];

// IOL Type — web has only PC / AC
const IOL_TYPE_OPTIONS = [
  { label: 'Select type', value: '' },
  { label: 'PC (Posterior Chamber)', value: 'PC' },
  { label: 'AC (Anterior Chamber)',  value: 'AC' },
];

// IOL Power — web dropdown 11–30 in 0.5 steps
const IOL_POWER_OPTIONS = (() => {
  const opts = [{ label: 'Select power', value: '' }];
  for (let p = 11; p <= 30; p += 0.5) {
    const label = p % 1 === 0 ? `${p}` : `${p}`;
    opts.push({ label, value: String(p) });
  }
  return opts;
})();

const FREQUENCY_OPTIONS = [
  { label: 'Frequency', value: '' },
  { label: '1 time daily',  value: '1 time daily' },
  { label: '2 times daily', value: '2 times daily' },
  { label: '3 times daily', value: '3 times daily' },
  { label: '4 times daily', value: '4 times daily' },
  { label: '5 times daily', value: '5 times daily' },
  { label: '6 times daily', value: '6 times daily' },
];

const DURATION_OPTIONS = [
  { label: 'Duration', value: '' },
  { label: '1 - 3 days', value: '1 - 3 days' },
  { label: '1 - 7 days', value: '1 - 7 days' },
  { label: '2 weeks',    value: '2 weeks' },
  { label: '3 weeks',    value: '3 weeks' },
  { label: '4 weeks',    value: '4 weeks' },
  { label: '5 weeks',    value: '5 weeks' },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface PrescribedDrug {
  drugId: string;
  quantity: string;
  frequency: string;
  duration: string;
}

interface PrescribedGlasses {
  glassesItemId: string;
  quantity: string;
}

interface AvailableDrug { id: string; name: string; currentStock: number; }
interface AvailableGlasses { id: string; description: string; type: string; currentStock: number; }

// ─── History Cards — matches web ConsultationHistoryTable exactly ─────────────

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

          {/* Header: number + surgery badge + date */}
          <View style={histStyles.cardHeader}>
            <View style={histStyles.iconCircle}>
              <Ionicons name="document-text" size={18} color={Colors.orange600} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
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
                {c.vaRight  ? <View><Text style={histStyles.colLabel}>VA RIGHT</Text><Text style={histStyles.metricValue}>{c.vaRight}</Text></View>  : null}
                {c.vaLeft   ? <View><Text style={histStyles.colLabel}>VA LEFT</Text><Text style={histStyles.metricValue}>{c.vaLeft}</Text></View>    : null}
                {c.iopRight ? <View><Text style={histStyles.colLabel}>IOP RIGHT</Text><Text style={histStyles.metricValue}>{c.iopRight} mmHg</Text></View> : null}
                {c.iopLeft  ? <View><Text style={histStyles.colLabel}>IOP LEFT</Text><Text style={histStyles.metricValue}>{c.iopLeft} mmHg</Text></View>  : null}
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

          {/* Consulted by */}
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

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ConsultScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ patientId?: string }>();

  useEffect(() => {
    if (user && user.role !== 'Doctor') router.replace('/(tabs)/');
  }, [user]);

  const [patient, setPatient] = useState<Patient | null>(null);

  const [form, setForm] = useState({
    consultationDate:    getTodayDate(),
    healthPractitioner:  '',
    symptoms:            [] as string[],
    symptomsOther:       '',
    signs:               [] as string[],
    signsOther:          '',
    diagnosis:           '',
    anteriorSegment:     '',
    posteriorSegment:    '',
    vaRight:             '',
    vaLeft:              '',
    iopRight:            '',
    iopLeft:             '',
    recommendations:     [] as string[],
    recommendationsOther: '',
    surgeryRecommended:  false,
    selectedSurgeryType: '',
    surgeryOthers:       '',
    iolType:             '',
    iolPower:            '',
    prescribedDrugs:     [] as PrescribedDrug[],
    prescribedGlasses:   [] as PrescribedGlasses[],
  });

  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState('');
  const [history,    setHistory]    = useState<Consultation[]>([]);

  // Available inventory from API
  const [availableDrugs,   setAvailableDrugs]   = useState<AvailableDrug[]>([]);
  const [availableGlasses, setAvailableGlasses] = useState<AvailableGlasses[]>([]);

  // Collapsible section toggles
  const [showSymptoms,         setShowSymptoms]         = useState(false);
  const [showSigns,            setShowSigns]            = useState(false);
  const [showRecommendations,  setShowRecommendations]  = useState(false);

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

  // Load inventory once
  useEffect(() => {
    (async () => {
      try {
        const [drugsRes, glassesRes] = await Promise.all([
          api.drugs.list() as Promise<{ data?: any[] }>,
          api.eyeglasses.listItems() as Promise<{ data?: any[] }>,
        ]);
        setAvailableDrugs(drugsRes.data ?? []);
        // eyeglasses items use 'description' and 'type' fields directly
        setAvailableGlasses(glassesRes.data ?? []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (patient) { loadHistory(patient.id); resetForm(); }
    else setHistory([]);
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
      diagnosis: '',
      anteriorSegment: '', posteriorSegment: '',
      vaRight: '', vaLeft: '', iopRight: '', iopLeft: '',
      recommendations: [], recommendationsOther: '',
      surgeryRecommended: false, selectedSurgeryType: '', surgeryOthers: '',
      iolType: '', iolPower: '',
      prescribedDrugs: [], prescribedGlasses: [],
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

  // Prescribed Drugs CRUD
  const addDrug    = () => handleChange('prescribedDrugs', [...form.prescribedDrugs, { drugId: '', quantity: '', frequency: '', duration: '' }]);
  const removeDrug = (i: number) => handleChange('prescribedDrugs', form.prescribedDrugs.filter((_, idx) => idx !== i));
  const updateDrug = (i: number, field: keyof PrescribedDrug, val: string) => {
    const updated = [...form.prescribedDrugs];
    updated[i] = { ...updated[i], [field]: val };
    handleChange('prescribedDrugs', updated);
  };

  // Prescribed Glasses CRUD
  const addGlasses    = () => handleChange('prescribedGlasses', [...form.prescribedGlasses, { glassesItemId: '', quantity: '' }]);
  const removeGlasses = (i: number) => handleChange('prescribedGlasses', form.prescribedGlasses.filter((_, idx) => idx !== i));
  const updateGlasses = (i: number, field: keyof PrescribedGlasses, val: string) => {
    const updated = [...form.prescribedGlasses];
    updated[i] = { ...updated[i], [field]: val };
    handleChange('prescribedGlasses', updated);
  };

  const handleSubmit = async () => {
    if (!patient) return;
    const e: Record<string, string> = {};
    if (!form.consultationDate)    e.consultationDate    = 'Required';
    if (!form.healthPractitioner)  e.healthPractitioner  = 'Required';
    if (!form.anteriorSegment.trim())  e.anteriorSegment  = 'Required';
    if (!form.posteriorSegment.trim()) e.posteriorSegment = 'Required';
    if (form.surgeryRecommended && !form.selectedSurgeryType) e.selectedSurgeryType = 'Select a surgery type';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      const resolvedSurgeryType =
        form.surgeryRecommended && form.selectedSurgeryType === 'Others'
          ? form.surgeryOthers.trim() || 'Others'
          : form.surgeryRecommended ? form.selectedSurgeryType : undefined;

      await api.consultations.create(patient.id, {
        consultationDate:    new Date(form.consultationDate).toISOString(),
        healthPractitioner:  form.healthPractitioner || undefined,
        symptoms:            form.symptoms,
        symptomsOther:       form.symptoms.includes('Others') ? form.symptomsOther.trim() : undefined,
        signs:               form.signs,
        signsOther:          form.signs.includes('Others') ? form.signsOther.trim() : undefined,
        diagnosis:           form.diagnosis || undefined,
        anteriorSegment:     form.anteriorSegment.trim(),
        posteriorSegment:    form.posteriorSegment.trim(),
        vaRight:             form.vaRight   || undefined,
        vaLeft:              form.vaLeft    || undefined,
        iopRight:            form.iopRight  ? Number(form.iopRight) : undefined,
        iopLeft:             form.iopLeft   ? Number(form.iopLeft)  : undefined,
        recommendations:     form.recommendations,
        recommendationsOther: form.recommendations.includes('Others') ? form.recommendationsOther.trim() : undefined,
        surgeryRecommended:  form.surgeryRecommended,
        selectedSurgeryType: resolvedSurgeryType,
        iolType:  form.surgeryRecommended && IOL_SURGERY_TYPES.includes(form.selectedSurgeryType) ? form.iolType  : undefined,
        iolPower: form.surgeryRecommended && IOL_SURGERY_TYPES.includes(form.selectedSurgeryType) ? form.iolPower : undefined,
        prescribedDrugs:   form.prescribedDrugs.filter(d => d.drugId),
        prescribedGlasses: form.prescribedGlasses.filter(g => g.glassesItemId),
      });

      await loadHistory(patient.id);
      setSuccess(`Consultation recorded for ${patient.firstName}`);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally { setSubmitting(false); }
  };

  const showIolFields = form.surgeryRecommended && IOL_SURGERY_TYPES.includes(form.selectedSurgeryType);

  const drugOptions = [
    { label: 'Select drug', value: '' },
    ...availableDrugs.map(d => ({ label: `${d.name} (Stock: ${d.currentStock})`, value: d.id })),
  ];
  const glassesOptions = [
    { label: 'Select glasses', value: '' },
    ...availableGlasses.map(g => ({ label: `${g.description} - ${g.type} (Stock: ${g.currentStock})`, value: g.id })),
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PatientSelector selectedPatient={patient} onSelectPatient={setPatient} />

        {patient && (
          <>
            {/* Success banner */}
            {!!success && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.green500} />
                <Text style={styles.successText}>{success}</Text>
              </View>
            )}

            {/* ── Date & Practitioner ── */}
            <View style={styles.card}>
              <InputField
                label="Consultation Date *"
                value={form.consultationDate}
                onChange={v => handleChange('consultationDate', v)}
                error={errors.consultationDate}
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

            {/* ── Symptoms ── */}
            <View style={styles.card}>
              <TouchableOpacity style={styles.expandHeader} onPress={() => setShowSymptoms(!showSymptoms)} activeOpacity={0.7}>
                <Text style={styles.sectionTitle}>
                  Symptoms <Text style={styles.sectionHint}>(Select all that apply)</Text>
                  {form.symptoms.length > 0 ? ` · ${form.symptoms.length}` : ''}
                </Text>
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
                    <InputField label="Specify other symptoms" value={form.symptomsOther} onChange={v => handleChange('symptomsOther', v)} multiline placeholder="Specify other symptoms..." />
                  )}
                </View>
              )}
            </View>

            {/* ── Signs ── */}
            <View style={styles.card}>
              <TouchableOpacity style={styles.expandHeader} onPress={() => setShowSigns(!showSigns)} activeOpacity={0.7}>
                <Text style={styles.sectionTitle}>
                  Signs <Text style={styles.sectionHint}>(Select all that apply)</Text>
                  {form.signs.length > 0 ? ` · ${form.signs.length}` : ''}
                </Text>
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
                    <InputField label="Specify other signs" value={form.signsOther} onChange={v => handleChange('signsOther', v)} multiline placeholder="Specify other signs..." />
                  )}
                </View>
              )}
            </View>

            {/* Clinical Examination */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Clinical Examination</Text>
              <InputField label="Anterior Segment *" value={form.anteriorSegment} onChange={v => handleChange('anteriorSegment', v)} error={errors.anteriorSegment} multiline placeholder="Cornea, anterior chamber, iris, lens..." />
              <InputField label="Posterior Segment *" value={form.posteriorSegment} onChange={v => handleChange('posteriorSegment', v)} error={errors.posteriorSegment} multiline placeholder="Vitreous, retina, optic disc, macula..." />
            </View>

            {/* ── Diagnosis ── */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Diagnosis <Text style={styles.sectionHint}>(Optional)</Text></Text>
              <PickerModal
                label=""
                value={form.diagnosis}
                options={DIAGNOSIS_OPTIONS}
                onChange={v => handleChange('diagnosis', v)}
              />
            </View>

            {/* Recommendations — collapsible with Health Education + Referral */}
            <View style={styles.card}>
              <TouchableOpacity style={styles.expandHeader} onPress={() => setShowRecommendations(!showRecommendations)} activeOpacity={0.7}>
                <Text style={styles.sectionTitle}>
                  Recommendations <Text style={styles.sectionHint}>(Select all that apply)</Text>
                  {form.recommendations.length > 0 ? ` · ${form.recommendations.length}` : ''}
                </Text>
                <Ionicons name={showRecommendations ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gray500} />
              </TouchableOpacity>
              {showRecommendations && (
                <View style={styles.checkGrid}>
                  <Text style={styles.checkGroupLabel}>Health Education</Text>
                  <TouchableOpacity style={styles.checkRow} onPress={() => toggleArrayItem('recommendations', 'Health Education')} activeOpacity={0.7}>
                    <Ionicons name={form.recommendations.includes('Health Education') ? 'checkbox' : 'square-outline'} size={20} color={form.recommendations.includes('Health Education') ? Colors.orange600 : Colors.gray400} />
                    <Text style={styles.checkLabel}>Health Education</Text>
                  </TouchableOpacity>
                  <Text style={[styles.checkGroupLabel, { marginTop: 10 }]}>Referral</Text>
                  {REFERRAL_HOSPITALS.map(hospital => (
                    <TouchableOpacity key={hospital} style={styles.checkRow} onPress={() => toggleArrayItem('recommendations', hospital)} activeOpacity={0.7}>
                      <Ionicons name={form.recommendations.includes(hospital) ? 'checkbox' : 'square-outline'} size={20} color={form.recommendations.includes(hospital) ? Colors.orange600 : Colors.gray400} />
                      <Text style={styles.checkLabel}>{hospital}</Text>
                    </TouchableOpacity>
                  ))}
                  {form.recommendations.includes('Others') && (
                    <InputField label="Specify other referral" value={form.recommendationsOther} onChange={v => handleChange('recommendationsOther', v)} multiline placeholder="Specify other referral..." />
                  )}
                </View>
              )}
            </View>

            {/* ── Prescribed Drugs ── */}
            <View style={styles.card}>
              <View style={styles.sectionRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="medkit-outline" size={18} color={Colors.orange600} />
                  <Text style={styles.sectionTitle}>Prescribe Drugs</Text>
                </View>
                <TouchableOpacity onPress={addDrug} style={styles.addBtn}>
                  <Ionicons name="add" size={16} color={Colors.orange600} />
                  <Text style={styles.addBtnText}>Add Drug</Text>
                </TouchableOpacity>
              </View>
              {form.prescribedDrugs.map((drug, i) => (
                <View key={i} style={styles.prescriptionRow}>
                  <View style={{ flex: 2 }}>
                    <PickerModal label="" value={drug.drugId} options={drugOptions} onChange={v => updateDrug(i, 'drugId', v)} placeholder="Select drug" />
                  </View>
                  <View style={{ width: 60 }}>
                    <InputField label="" value={drug.quantity} onChange={v => updateDrug(i, 'quantity', v)} placeholder="Qty" keyboardType="numeric" />
                  </View>
                  <TouchableOpacity onPress={() => removeDrug(i)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={18} color={Colors.red500} />
                  </TouchableOpacity>
                </View>
              ))}
              {form.prescribedDrugs.map((drug, i) => (
                drug.drugId ? (
                  <View key={`detail-${i}`} style={styles.prescriptionDetail}>
                    <View style={{ flex: 1 }}>
                      <PickerModal label="Frequency" value={drug.frequency} options={FREQUENCY_OPTIONS} onChange={v => updateDrug(i, 'frequency', v)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <PickerModal label="Duration" value={drug.duration} options={DURATION_OPTIONS} onChange={v => updateDrug(i, 'duration', v)} />
                    </View>
                  </View>
                ) : null
              ))}
            </View>

            {/* ── Prescribed Glasses ── */}
            <View style={styles.card}>
              <View style={styles.sectionRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="glasses-outline" size={18} color={Colors.orange600} />
                  <Text style={styles.sectionTitle}>Prescribe Glasses</Text>
                </View>
                <TouchableOpacity onPress={addGlasses} style={styles.addBtn}>
                  <Ionicons name="add" size={16} color={Colors.orange600} />
                  <Text style={styles.addBtnText}>Add Glasses</Text>
                </TouchableOpacity>
              </View>
              {form.prescribedGlasses.map((g, i) => (
                <View key={i} style={styles.prescriptionRow}>
                  <View style={{ flex: 2 }}>
                    <PickerModal label="" value={g.glassesItemId} options={glassesOptions} onChange={v => updateGlasses(i, 'glassesItemId', v)} placeholder="Select glasses" />
                  </View>
                  <View style={{ width: 60 }}>
                    <InputField label="" value={g.quantity} onChange={v => updateGlasses(i, 'quantity', v)} placeholder="Qty" keyboardType="numeric" />
                  </View>
                  <TouchableOpacity onPress={() => removeGlasses(i)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={18} color={Colors.red500} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>


            {/* Surgery Recommendation */}
            <View style={[styles.card, { backgroundColor: Colors.gray50 }]}>
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => {
                  handleChange('surgeryRecommended', !form.surgeryRecommended);
                  if (form.surgeryRecommended) {
                    handleChange('selectedSurgeryType', '');
                    handleChange('iolType', '');
                    handleChange('iolPower', '');
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={form.surgeryRecommended ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={form.surgeryRecommended ? Colors.orange600 : Colors.gray400}
                />
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Surgery Recommended</Text>
              </TouchableOpacity>

              {form.surgeryRecommended && (
                <View style={{ marginTop: 16 }}>
                  {/* Surgery Type */}
                  <Text style={[styles.sectionTitle, { borderTopWidth: 1, borderTopColor: Colors.gray300, paddingTop: 14 }]}>
                    C. Surgery Type <Text style={{ color: Colors.red500 }}>*</Text>
                  </Text>
                  {errors.selectedSurgeryType ? <Text style={styles.errorText}>{errors.selectedSurgeryType}</Text> : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
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
                    <InputField label="Specify surgery type" value={form.surgeryOthers} onChange={v => handleChange('surgeryOthers', v)} multiline placeholder="Specify other surgery type..." />
                  )}

                  {/* IOL Details */}
                  {showIolFields && (
                    <View style={styles.iolBox}>
                      <Text style={styles.iolTitle}>Type of IOL</Text>
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <PickerModal label="IOL Type" value={form.iolType} options={IOL_TYPE_OPTIONS} onChange={v => handleChange('iolType', v)} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <PickerModal label="IOL Power" value={form.iolPower} options={IOL_POWER_OPTIONS} onChange={v => handleChange('iolPower', v)} />
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* ── Submit ── */}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.submitText}>Create Consultation</Text>}
            </TouchableOpacity>

            {/* ── Consultation History ── */}
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

// ─── InputField helper ────────────────────────────────────────────────────────

function InputField({ label, value, onChange, error, multiline, placeholder, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; multiline?: boolean; placeholder?: string; keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ marginBottom: label ? 10 : 0 }}>
      {!!label && <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 6 }}>{label}</Text>}
      <TextInput
        style={[ifStyles.input, multiline && ifStyles.multiline, error ? { borderColor: Colors.red300 } : null]}
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={Colors.gray400}
        multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'}
        keyboardType={keyboardType ?? 'default'}
      />
      {error ? <Text style={{ fontSize: 11, color: Colors.red500, marginTop: 3 }}>{error}</Text> : null}
    </View>
  );
}

const ifStyles = StyleSheet.create({
  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: Colors.gray900,
  },
  multiline: { minHeight: 80 },
});

// ─── History styles ───────────────────────────────────────────────────────────

const histStyles = StyleSheet.create({
  empty: {
    alignItems: 'center', paddingVertical: 40,
    borderWidth: 1, borderColor: Colors.gray200, borderStyle: 'dashed',
    borderRadius: 12, backgroundColor: Colors.gray50,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900, marginTop: 8 },
  emptyText:  { fontSize: 13, color: Colors.gray500, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },

  card: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.gray200,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.orange50, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  consultNumber: { fontSize: 13, fontWeight: '600', color: Colors.gray600 },

  surgeryBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#DCFCE7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2,
  },
  surgeryBadgeText: { fontSize: 11, fontWeight: '600', color: '#166534' },

  noSurgeryBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.gray100, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2,
  },
  noSurgeryBadgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },

  dateText: { fontSize: 13, color: Colors.gray500 },

  section: { marginTop: 6 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray200, paddingTop: 10, marginTop: 10 },

  inlineLabel: { fontSize: 13, color: Colors.gray500 },
  inlineValue: { fontSize: 13, fontWeight: '600', color: Colors.gray900 },

  twoCol:  { flexDirection: 'row', gap: 12 },
  fourCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },

  colLabel:    { fontSize: 10, fontWeight: '600', color: Colors.gray500, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
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
  footer:   { fontSize: 12, color: Colors.gray500 },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content:   { padding: 16, paddingBottom: 40 },

  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.green50, borderLeftWidth: 4, borderLeftColor: Colors.green500,
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, marginTop: 12,
  },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500', flex: 1 },

  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginTop: 12,
  },

  sectionTitle: { fontSize: 15, fontWeight: '600', color: Colors.gray900, marginBottom: 12 },
  sectionHint:  { fontSize: 13, fontWeight: '400', color: Colors.gray400 },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

  expandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  checkGrid:       { marginTop: 8 },
  checkRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  checkLabel:      { fontSize: 13, color: Colors.gray700, flex: 1 },
  checkGroupLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginTop: 4, marginBottom: 2 },

  row: { flexDirection: 'row', gap: 12 },

  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 13, color: Colors.orange600, fontWeight: '500' },
  removeBtn:  { padding: 8, justifyContent: 'center' },

  prescriptionRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  prescriptionDetail: { flexDirection: 'row', gap: 12, marginBottom: 12, paddingLeft: 0 },

  surgTypeChip:       { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white },
  surgTypeChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  surgTypeText:       { fontSize: 12, fontWeight: '500', color: Colors.gray700 },
  surgTypeTextActive: { color: Colors.white },

  iolBox:   { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BFDBFE', marginTop: 12, marginBottom: 8 },
  iolTitle: { fontSize: 14, fontWeight: '700', color: '#1E3A8A', marginBottom: 10 },

  errorText: { fontSize: 11, color: Colors.red500, marginBottom: 8 },

  submitBtn:  { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },

  historyCard: {
    backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.gray100, marginTop: 16,
  },
  historyHeader: {
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50,
    borderBottomWidth: 1, borderBottomColor: Colors.gray200,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  historyTitle:     { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge:     { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },
});