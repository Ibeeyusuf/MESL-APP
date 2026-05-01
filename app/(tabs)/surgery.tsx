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
  mapApiSurgeryToUi, mapApiUserToStaff, mapApiPatientToUi,
  mapApiConsultationToUi, inferProcedureType, getTodayDate,
} from '@/utils/helpers';
import type { Patient, SurgeryRecord, StaffMember } from '@/types';

// Matches web version surgery types exactly
const SURGERY_TYPES = [
  'SICS + PCIOL',
  'SICS + ACIOL',
  'SICS NO IOL',
  'ICCE',
  'Pterygium Excision',
  'Chalazion I/C',
  'Other',
];

// Matches web version IOL types (PC/AC only)
const IOL_TYPE_OPTIONS = [
  { label: 'Select type', value: '' },
  { label: 'PC (Posterior Chamber)', value: 'PC' },
  { label: 'AC (Anterior Chamber)', value: 'AC' },
];

// IOL Power options 11–23 in 0.5 increments — matches web version select dropdown
const IOL_POWER_OPTIONS = (() => {
  const opts = [{ label: 'Select power', value: '' }];
  for (let i = 11; i <= 23; i += 0.5) {
    opts.push({ label: String(i % 1 === 0 ? i : i.toFixed(1)), value: String(i % 1 === 0 ? i : i.toFixed(1)) });
  }
  return opts;
})();

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

// Complication options — matches web COMPLICATION_OPTIONS exactly
const COMPLICATION_OPTIONS = [
  { label: 'Select a complication', value: '' },
  { label: 'Premature Entry', value: 'Premature Entry' },
  { label: 'Descemet Strip', value: 'Descemet Strip' },
  { label: 'Iris Injury', value: 'Iris Injury' },
  { label: 'Surgical Hyphema', value: 'Surgical Hyphema' },
  { label: 'PC Rent without Vitreous Loss', value: 'PC Rent without Vitreous Loss' },
  { label: 'PC Rent with Vitreous Loss', value: 'PC Rent with Vitreous Loss' },
  { label: 'Displaced IOL', value: 'Displaced IOL' },
  { label: 'Nucleus/Significant Lens Fragment In Vitreous', value: 'Nucleus/Significant Lens Fragment In Vitreous' },
  { label: 'Others', value: 'Others' },
];

// Surgical findings — matches web SURGICAL_FINDINGS_OPTIONS exactly
const SURGICAL_FINDINGS_OPTIONS = [
  { label: 'Select a surgical finding', value: '' },
  { label: 'Zonular Dialysis', value: 'Zonular Dialysis' },
  { label: 'Subluxated Lens', value: 'Subluxated Lens' },
  { label: 'PCO', value: 'PCO' },
  { label: 'Posterior Synaechia', value: 'Posterior Synaechia' },
  { label: 'Others', value: 'Others' },
];

// Surgery types that require IOL details
const IOL_SURGERY_TYPES = ['SICS + PCIOL', 'SICS + ACIOL'];

// ── Surgery History Table — matches web SurgeryHistoryTable exactly ──
function SurgeryHistoryTable({ records }: { records: SurgeryRecord[] }) {
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  if (records.length === 0) {
    return (
      <View style={tableStyles.empty}>
        <Ionicons name="pulse" size={36} color={Colors.gray300} />
        <Text style={tableStyles.emptyTitle}>No surgery records</Text>
        <Text style={tableStyles.emptyText}>
          This patient does not have any recorded surgeries yet.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* Column headers */}
      <View style={tableStyles.headerRow}>
        <Text style={[tableStyles.headerCell, { flex: 1.4 }]}>DATE</Text>
        <Text style={[tableStyles.headerCell, { flex: 2 }]}>PROCEDURE</Text>
        <Text style={[tableStyles.headerCell, { flex: 0.8 }]}>EYE</Text>
        <Text style={[tableStyles.headerCell, { flex: 1.6 }]}>SURGEON</Text>
        <Text style={[tableStyles.headerCell, { flex: 1.2 }]}>STATUS</Text>
      </View>

      {records.map((record, idx) => (
        <View
          key={record.id}
          style={[
            tableStyles.dataRow,
            idx % 2 === 0 ? { backgroundColor: Colors.white } : { backgroundColor: Colors.gray50 },
          ]}
        >
          {/* Date */}
          <View style={[tableStyles.cell, { flex: 1.4 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={13} color={Colors.gray400} />
              <Text style={tableStyles.cellText}>{formatDate(record.surgeryDate)}</Text>
            </View>
          </View>

          {/* Procedure + anesthesia */}
          <View style={[tableStyles.cell, { flex: 2 }]}>
            <Text style={[tableStyles.cellText, { fontWeight: '600' }]} numberOfLines={2}>
              {record.procedureType}
            </Text>
            {record.anesthesiaType ? (
              <Text style={tableStyles.cellSub}>{record.anesthesiaType} anesthesia</Text>
            ) : null}
          </View>

          {/* Eye badge */}
          <View style={[tableStyles.cell, { flex: 0.8 }]}>
            <View style={tableStyles.eyeBadge}>
              <Text style={tableStyles.eyeBadgeText}>{record.eyeOperated}</Text>
            </View>
          </View>

          {/* Surgeon + Nurse */}
          <View style={[tableStyles.cell, { flex: 1.6 }]}>
            <Text style={tableStyles.cellText} numberOfLines={1}>
              {record.surgeon?.name ?? '—'}
            </Text>
            {record.scrubNurse?.name ? (
              <Text style={tableStyles.cellSub} numberOfLines={1}>
                Nurse: {record.scrubNurse.name}
              </Text>
            ) : null}
          </View>

          {/* Status */}
          <View style={[tableStyles.cell, { flex: 1.2 }]}>
            {record.hasComplications ? (
              <View style={tableStyles.compBadge}>
                <Ionicons name="alert-circle" size={11} color="#991B1B" style={{ marginRight: 3 }} />
                <Text style={tableStyles.compBadgeText}>Complications</Text>
              </View>
            ) : (
              <View style={tableStyles.successBadge}>
                <Ionicons name="checkmark-circle" size={11} color="#166534" style={{ marginRight: 3 }} />
                <Text style={tableStyles.successBadgeText}>Successful</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

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
    surgeryOthers: '',
    iolType: '',
    iolPowerRight: '',
    iolPowerLeft: '',
    eyeOperated: '',
    anesthesiaType: '',
    hasComplications: false,
    complication: '',
    complicationOthers: '',
    surgicalFinding: '',
    surgicalFindingOthers: '',
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
      surgeryDate: getTodayDate(),
      surgeryType: '', surgeryOthers: '', iolType: '',
      iolPowerRight: '', iolPowerLeft: '',
      eyeOperated: '', anesthesiaType: '',
      hasComplications: false, complication: '', complicationOthers: '',
      surgicalFinding: '', surgicalFindingOthers: '',
      notes: '', surgeonId: '', scrubNurseId: '', anesthetistId: '',
    });
    setErrors({}); setSuccess('');
  };

  const handleChange = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const showIolDetails = IOL_SURGERY_TYPES.includes(form.surgeryType);

  const handleSubmit = async () => {
    if (!patient) return;
    const e: Record<string, string> = {};
    if (!form.surgeryDate) e.surgeryDate = 'Required';
    if (!form.surgeryType) e.surgeryType = 'Required';
    if (form.surgeryType === 'Other' && !form.surgeryOthers.trim()) e.surgeryOthers = 'Please specify surgery type';
    if (!form.eyeOperated) e.eyeOperated = 'Required';
    if (!form.anesthesiaType) e.anesthesiaType = 'Required';
    if (!form.surgeonId) e.surgeonId = 'Required';
    if (!form.scrubNurseId) e.scrubNurseId = 'Required';
    if (!form.anesthetistId) e.anesthetistId = 'Required';
    if (form.hasComplications && !form.complication) e.complication = 'Select a complication';
    if (form.hasComplications && form.complication === 'Others' && !form.complicationOthers.trim()) e.complicationOthers = 'Please specify';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      const resolvedSurgeryType = form.surgeryType === 'Other'
        ? (form.surgeryOthers.trim() || 'Other')
        : form.surgeryType;

      let complicationDetails = '';
      if (form.hasComplications && form.complication) {
        complicationDetails = form.complication === 'Others'
          ? `Others: ${form.complicationOthers}`
          : form.complication;
        if (form.surgicalFinding) {
          const finding = form.surgicalFinding === 'Others'
            ? `Others: ${form.surgicalFindingOthers}`
            : form.surgicalFinding;
          complicationDetails += ` | Finding: ${finding}`;
        }
      }

      const inferred = inferProcedureType(resolvedSurgeryType);
      
      const payload: any = {
        surgeryDate: new Date(form.surgeryDate).toISOString(),
        procedureType: inferred,
        surgeryType: resolvedSurgeryType,
        eyeOperated: form.eyeOperated,
        anesthesiaType: form.anesthesiaType,
        hasComplications: form.hasComplications,
        notes: form.notes.trim() || undefined,
        surgeonId: form.surgeonId,
        scrubNurseId: form.scrubNurseId,
        anesthetistId: form.anesthetistId,
      };

      // Only add IOL fields if applicable
      if (showIolDetails) {
        if (form.iolType) payload.iolType = form.iolType;
        if (form.iolPowerRight) payload.iolPowerRight = form.iolPowerRight;
        if (form.iolPowerLeft) payload.iolPowerLeft = form.iolPowerLeft;
      }

      // Only add complication details if there are complications
      if (form.hasComplications && complicationDetails) {
        payload.complicationDetails = complicationDetails;
      }
      
      await api.surgeries.create(patient.id, payload);
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
              <Field 
                label="Surgery Date *" 
                value={form.surgeryDate} 
                onChange={v => handleChange('surgeryDate', v)} 
                error={errors.surgeryDate} 
                placeholder="YYYY-MM-DD" 
              />
              <View style={{ height: 8 }} />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <PickerModal 
                    label="Eye Operated *" 
                    value={form.eyeOperated} 
                    options={EYE_OPTIONS} 
                    onChange={v => handleChange('eyeOperated', v)} 
                    error={errors.eyeOperated} 
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <PickerModal 
                    label="Anesthesia *" 
                    value={form.anesthesiaType} 
                    options={ANESTHESIA_OPTIONS} 
                    onChange={v => handleChange('anesthesiaType', v)} 
                    error={errors.anesthesiaType} 
                  />
                </View>
              </View>
            </View>

            {/* Surgery Type */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Surgery Type *</Text>
              {errors.surgeryType ? <Text style={{ fontSize: 11, color: Colors.red500, marginBottom: 8 }}>{errors.surgeryType}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                {SURGERY_TYPES.map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeChip, form.surgeryType === type && styles.typeChipActive]}
                    onPress={() => {
                      handleChange('surgeryType', type);
                      handleChange('iolType', '');
                      handleChange('iolPowerRight', '');
                      handleChange('iolPowerLeft', '');
                    }}
                  >
                    <Text style={[styles.typeText, form.surgeryType === type && styles.typeTextActive]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {form.surgeryType === 'Other' && (
                <Field
                  label="Specify other surgery type *"
                  value={form.surgeryOthers}
                  onChange={v => handleChange('surgeryOthers', v)}
                  error={errors.surgeryOthers}
                  placeholder="Specify other surgery type..."
                />
              )}
            </View>

            {/* IOL Details */}
            {showIolDetails && (
              <View style={styles.iolBox}>
                <Text style={styles.iolTitle}>Type of IOL</Text>
                <PickerModal 
                  label="IOL Type" 
                  value={form.iolType} 
                  options={IOL_TYPE_OPTIONS} 
                  onChange={v => handleChange('iolType', v)} 
                />
                <View style={{ height: 8 }} />
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <PickerModal 
                      label="IOL Power - Right Eye (D)" 
                      value={form.iolPowerRight} 
                      options={IOL_POWER_OPTIONS} 
                      onChange={v => handleChange('iolPowerRight', v)} 
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PickerModal 
                      label="IOL Power - Left Eye (D)" 
                      value={form.iolPowerLeft} 
                      options={IOL_POWER_OPTIONS} 
                      onChange={v => handleChange('iolPowerLeft', v)} 
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Surgical Team */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Surgical Team</Text>
              <PickerModal 
                label="Surgeon *" 
                value={form.surgeonId} 
                options={staffOptions(surgeons)} 
                onChange={v => handleChange('surgeonId', v)} 
                error={errors.surgeonId} 
              />
              <View style={{ height: 8 }} />
              <PickerModal 
                label="Scrub Nurse *" 
                value={form.scrubNurseId} 
                options={staffOptions(nurses)} 
                onChange={v => handleChange('scrubNurseId', v)} 
                error={errors.scrubNurseId} 
              />
              <View style={{ height: 8 }} />
              <PickerModal 
                label="Anesthetist *" 
                value={form.anesthetistId} 
                options={staffOptions(anesthetists)} 
                onChange={v => handleChange('anesthetistId', v)} 
                error={errors.anesthetistId} 
              />
            </View>

            {/* Complications */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Complications</Text>
              <View style={{ flexDirection: 'row', gap: 20, marginBottom: 12 }}>
                <TouchableOpacity
                  style={styles.radioRow}
                  onPress={() => {
                    handleChange('hasComplications', false);
                    handleChange('complication', '');
                    handleChange('complicationOthers', '');
                    handleChange('surgicalFinding', '');
                    handleChange('surgicalFindingOthers', '');
                  }}
                >
                  <View style={[styles.radio, !form.hasComplications && styles.radioActive]} />
                  <Text style={styles.radioLabel}>No complications</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.radioRow}
                  onPress={() => handleChange('hasComplications', true)}
                >
                  <View style={[styles.radio, form.hasComplications && styles.radioActiveRed]} />
                  <Text style={styles.radioLabel}>Complications occurred</Text>
                </TouchableOpacity>
              </View>

              {form.hasComplications && (
                <>
                  <View style={[styles.subCard, { backgroundColor: Colors.red50, borderColor: Colors.red200 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Ionicons name="warning" size={18} color={Colors.red600} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.red900 }}>Complications *</Text>
                    </View>
                    <PickerModal
                      label=""
                      value={form.complication}
                      options={COMPLICATION_OPTIONS}
                      onChange={v => handleChange('complication', v)}
                      error={errors.complication}
                    />
                    {form.complication === 'Others' && (
                      <View style={{ marginTop: 8 }}>
                        <Field
                          label="Please specify other complications"
                          value={form.complicationOthers}
                          onChange={v => handleChange('complicationOthers', v)}
                          error={errors.complicationOthers}
                          multiline
                          placeholder="Please specify other complications..."
                        />
                      </View>
                    )}
                  </View>

                  <View style={[styles.subCard, { backgroundColor: Colors.orange50, borderColor: Colors.orange200, marginTop: 10 }]}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.orange900, marginBottom: 10 }}>
                      Surgical Findings (Applicable to the eye operated)
                    </Text>
                    <PickerModal
                      label=""
                      value={form.surgicalFinding}
                      options={SURGICAL_FINDINGS_OPTIONS}
                      onChange={v => handleChange('surgicalFinding', v)}
                    />
                    {form.surgicalFinding === 'Others' && (
                      <View style={{ marginTop: 8 }}>
                        <Field
                          label="Please specify other surgical findings"
                          value={form.surgicalFindingOthers}
                          onChange={v => handleChange('surgicalFindingOthers', v)}
                          multiline
                          placeholder="Please specify other surgical findings..."
                        />
                      </View>
                    )}
                  </View>
                </>
              )}
            </View>

            {/* Notes */}
            <View style={styles.card}>
              <Field 
                label="Additional Notes (Optional)" 
                value={form.notes} 
                onChange={v => handleChange('notes', v)} 
                multiline 
                placeholder="Any other observations or special notes..." 
              />
            </View>

            <TouchableOpacity 
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]} 
              onPress={handleSubmit} 
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Record Surgery</Text>}
            </TouchableOpacity>

            {/* ── Surgery History — matches web SurgeryHistoryTable ── */}
            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>Surgery History ({history.length})</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ minWidth: 620 }}>
                  <SurgeryHistoryTable records={history} />
                </View>
              </ScrollView>
            </View>
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
  input: { 
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300, 
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, 
    fontSize: 15, color: Colors.gray900 
  },
  multiline: { minHeight: 80 },
});

// ── Table styles ──
const tableStyles = StyleSheet.create({
  empty: {
    alignItems: 'center', paddingVertical: 40,
    borderWidth: 1, borderColor: Colors.gray200, borderStyle: 'dashed', borderRadius: 12,
    backgroundColor: Colors.gray50, margin: 16,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900, marginTop: 8 },
  emptyText: { fontSize: 13, color: Colors.gray500, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },

  headerRow: {
    flexDirection: 'row', backgroundColor: Colors.gray50,
    borderBottomWidth: 1, borderBottomColor: Colors.gray200,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  headerCell: { fontSize: 10, fontWeight: '600', color: Colors.gray500, letterSpacing: 0.5, textTransform: 'uppercase' },

  dataRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray200,
  },
  cell: { justifyContent: 'center', paddingRight: 8 },
  cellText: { fontSize: 12, color: Colors.gray900 },
  cellSub: { fontSize: 11, color: Colors.gray500, marginTop: 2 },

  eyeBadge: {
    alignSelf: 'flex-start', backgroundColor: Colors.orange50,
    borderWidth: 1, borderColor: Colors.orange200,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20,
  },
  eyeBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.orange800 },

  compBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20,
  },
  compBadgeText: { fontSize: 10, fontWeight: '600', color: '#991B1B' },

  successBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#BBF7D0',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20,
  },
  successBadgeText: { fontSize: 10, fontWeight: '600', color: '#166534' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 40 },
  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, marginTop: 12 },
  loadingText: { fontSize: 13, color: Colors.gray500 },
  warningBox: { 
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.orange50, 
    borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: Colors.orange200 
  },
  warningTitle: { fontSize: 13, fontWeight: '700', color: Colors.orange800 },
  warningText: { fontSize: 12, color: Colors.orange700, marginTop: 2 },
  successBox: { 
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.green50, 
    padding: 14, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.green100 
  },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500' },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white },
  typeChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  typeText: { fontSize: 12, fontWeight: '500', color: Colors.gray700 },
  typeTextActive: { color: Colors.white },
  iolBox: { backgroundColor: '#EFF6FF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#BFDBFE', marginTop: 12 },
  iolTitle: { fontSize: 14, fontWeight: '700', color: '#1E3A8A', marginBottom: 12 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.gray400 },
  radioActive: { borderColor: Colors.orange600, backgroundColor: Colors.orange600 },
  radioActiveRed: { borderColor: Colors.red600, backgroundColor: Colors.red600 },
  radioLabel: { fontSize: 13, color: Colors.gray700 },
  subCard: { borderRadius: 12, padding: 14, borderWidth: 1 },
  submitBtn: { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  historyCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100, marginTop: 16 },
  historyHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
});