import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { PatientSelector } from '@/components/PatientSelector';
import { PickerModal } from '@/components/PickerModal';
import { api } from '@/services/api';
import {
  WHO_VA_SCALE, isWorseThan, mapApiSurgeryToUi, mapApiPostOpToUi,
  mapStageToApi, getTodayDate,
} from '@/utils/helpers';
import type { Patient, SurgeryRecord, PostOperativeRecord, PostOpStage, Sequelae } from '@/types';

const VA_OPTIONS = [{ label: '-- Select --', value: '' }, ...WHO_VA_SCALE.map(v => ({ label: v, value: v }))];
const STAGES: PostOpStage[] = ['Day 1', 'Week 1', 'Week 5'];
const ALL_SEQUELAE: Sequelae[] = [
  'Bullous Keratopathy', 'PCO', 'Endophthalmitis',
  'IOL Malposition', 'Wound Leak', 'Corneal Edema', 'None',
];

// Matches web version health practitioner options
const PRACTITIONER_OPTIONS = [
  { label: 'Select Practitioner', value: '' },
  { label: 'Ophthalmologist', value: 'Ophthalmologist' },
  { label: 'Optometrist', value: 'Optometrist' },
  { label: 'Ophthalmic Nurse', value: 'Ophthalmic Nurse' },
  { label: 'General Practitioner', value: 'General Practitioner' },
  { label: 'Community Health Worker', value: 'Community Health Worker' },
  { label: 'Other', value: 'Other' },
];

export default function PostOpScreen() {
  const { user } = useAuth();

  // Guard — Doctor only
  useEffect(() => {
    if (user && user.role !== 'Doctor') router.replace('/(tabs)/');
  }, [user]);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [surgeries, setSurgeries] = useState<SurgeryRecord[]>([]);
  const [surgery, setSurgery] = useState<SurgeryRecord | null>(null);
  const [loadingSurgeries, setLoadingSurgeries] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stage, setStage] = useState<PostOpStage>('Day 1');
  // FIX: added healthPractitioner — required field matching web version
  const [healthPractitioner, setHealthPractitioner] = useState('');
  const [unaidedR, setUnaidedR] = useState('');
  const [unaidedL, setUnaidedL] = useState('');
  const [pinholeR, setPinholeR] = useState('');
  const [pinholeL, setPinholeL] = useState('');
  const [aidedR, setAidedR] = useState('');
  const [aidedL, setAidedL] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [sequelae, setSequelae] = useState<Sequelae[]>([]);
  const [followUpDate, setFollowUpDate] = useState(getTodayDate());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [history, setHistory] = useState<PostOperativeRecord[]>([]);
  const [stageError, setStageError] = useState('');

  // Load surgeries when patient changes
  useEffect(() => {
    if (patient) {
      setLoadingSurgeries(true);
      setSurgery(null);
      setHistory([]);
      setSearchQuery('');
      (async () => {
        try {
          const res = (await api.surgeries.list(patient.id)) as { data?: any[] };
          setSurgeries((res.data ?? []).map(mapApiSurgeryToUi));
        } catch { setSurgeries([]); }
        finally { setLoadingSurgeries(false); }
      })();
    } else {
      setSurgeries([]);
      setSurgery(null);
    }
  }, [patient?.id]);

  // Load post-op history when surgery selected
  useEffect(() => {
    if (surgery) {
      loadHistory(surgery.id);
      resetForm();
    }
  }, [surgery?.id]);

  const loadHistory = async (sid: string) => {
    try {
      const res = (await api.postOps.list(sid)) as { data?: any[] };
      const mapped = (res.data ?? []).map(mapApiPostOpToUi);
      mapped.sort((a, b) => {
        const order = { 'Day 1': 1, 'Week 1': 2, 'Week 5': 3 };
        return (order[a.stage] ?? 99) - (order[b.stage] ?? 99);
      });
      setHistory(mapped);
    } catch { setHistory([]); }
  };

  const resetForm = () => {
    setStage('Day 1');
    setUnaidedR(''); setUnaidedL('');
    setPinholeR(''); setPinholeL('');
    setAidedR(''); setAidedL('');
    setReason(''); setNotes('');
    setFollowUpDate(getTodayDate());
    setSequelae([]);
    setErrors({});
    setSuccess('');
    setStageError('');
    // NOTE: healthPractitioner is intentionally NOT reset — web preserves it between submissions
  };

  const hasStage = (s: PostOpStage) => history.some(r => r.stage === s);

  const handleStageChange = (s: PostOpStage) => {
    setStage(s);
    if (s === 'Week 1' && !hasStage('Day 1')) setStageError('Complete Day 1 first');
    else if (s === 'Week 5' && !hasStage('Week 1')) setStageError('Complete Week 1 first');
    else setStageError('');
  };

  const toggleSequela = (sq: Sequelae) => {
    setSequelae(prev => {
      if (sq === 'None') return prev.includes('None') ? [] : ['None'];
      const filtered = prev.filter(s => s !== 'None');
      return filtered.includes(sq) ? filtered.filter(s => s !== sq) : [...filtered, sq];
    });
  };

  const showPinhole = !!unaidedR && !!unaidedL && (isWorseThan(unaidedR, '6/12') || isWorseThan(unaidedL, '6/12'));
  const showAided = showPinhole && !!pinholeR && !!pinholeL && (isWorseThan(pinholeR, '6/12') || isWorseThan(pinholeL, '6/12'));
  const requireReason =
    (aidedR && isWorseThan(aidedR, '3/60')) || (aidedL && isWorseThan(aidedL, '3/60')) ||
    (!showAided && pinholeR && isWorseThan(pinholeR, '3/60')) || (!showAided && pinholeL && isWorseThan(pinholeL, '3/60')) ||
    (!showPinhole && isWorseThan(unaidedR, '3/60')) || (!showPinhole && isWorseThan(unaidedL, '3/60'));

  const handleSubmit = async () => {
    if (!surgery) return;
    const e: Record<string, string> = {};
    // FIX: validate healthPractitioner — required on web
    if (!healthPractitioner) e.healthPractitioner = 'Required';
    if (!unaidedR) e.unaidedR = 'Required';
    if (!unaidedL) e.unaidedL = 'Required';
    if (showPinhole && !pinholeR) e.pinholeR = 'Required (VA < 6/12)';
    if (showPinhole && !pinholeL) e.pinholeL = 'Required (VA < 6/12)';
    if (showAided && !aidedR) e.aidedR = 'Required (Pinhole < 6/12)';
    if (showAided && !aidedL) e.aidedL = 'Required (Pinhole < 6/12)';
    if (requireReason && !reason.trim()) e.reason = 'Required for VA < 3/60';
    if (stageError) e.stage = stageError;
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      await api.postOps.create(surgery.id, {
        stage: mapStageToApi(stage),
        followUpDate: new Date(followUpDate).toISOString(),
        // FIX: include healthPractitioner in payload
        healthPractitioner: healthPractitioner,
        unaidedVARight: unaidedR,
        unaidedVALeft: unaidedL,
        pinholeVARight: pinholeR || undefined,
        pinholeVALeft: pinholeL || undefined,
        aidedVARight: aidedR || undefined,
        aidedVALeft: aidedL || undefined,
        reasonForPoorVision: requireReason ? reason.trim() : undefined,
        sequelae: stage === 'Week 5' ? sequelae : [],
        notes: notes.trim() || undefined,
      });
      await loadHistory(surgery.id);
      setSuccess(`${stage} follow-up recorded`);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally { setSubmitting(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Step 1: Patient */}
      <PatientSelector selectedPatient={patient} onSelectPatient={p => { setPatient(p); setSurgery(null); }} />

      {/* Step 2: Surgery */}
      {patient && !surgery && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.stepLabel}>2. Select Surgery Record</Text>
          {loadingSurgeries ? (
            <ActivityIndicator color={Colors.primaryLight} style={{ marginTop: 20 }} />
          ) : surgeries.length > 0 ? (
            <>
              {/* Search bar */}
              <View style={styles.searchBar}>
                <Ionicons name="search" size={16} color={Colors.gray400} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by procedure or date..."
                  placeholderTextColor={Colors.gray400}
                  clearButtonMode="while-editing"
                />
              </View>
              {surgeries
                .filter(s => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    s.procedureType.toLowerCase().includes(q) ||
                    s.eyeOperated.toLowerCase().includes(q) ||
                    new Date(s.surgeryDate).toLocaleDateString().includes(q)
                  );
                })
                .map(s => (
                  <TouchableOpacity key={s.id} style={styles.surgeryCard} onPress={() => setSurgery(s)}>
                    <View style={styles.surgeryIcon}>
                      <Ionicons name="pulse" size={20} color={Colors.orange600} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.surgeryName}>{s.procedureType}</Text>
                      <Text style={styles.surgeryMeta}>{s.eyeOperated} Eye • {new Date(s.surgeryDate).toLocaleDateString()}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
                  </TouchableOpacity>
                ))
              }
            </>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="pulse" size={36} color={Colors.gray300} />
              <Text style={styles.emptyText}>No surgery records found</Text>
            </View>
          )}
        </View>
      )}

      {/* Step 3: Post-Op Form */}
      {surgery && (
        <>
          {/* Surgery banner */}
          <View style={styles.banner}>
            <View style={{ flex: 1 }}>
              {patient && (
                <Text style={styles.bannerPatient}>{patient.firstName} {patient.lastName ?? patient.surname ?? ''}</Text>
              )}
              <Text style={styles.bannerTitle}>{surgery.procedureType} — {surgery.eyeOperated} Eye</Text>
              <Text style={styles.bannerSub}>{new Date(surgery.surgeryDate).toLocaleDateString()}</Text>
            </View>
            <TouchableOpacity onPress={() => setSurgery(null)} style={styles.bannerChange}>
              <Text style={styles.bannerChangeText}>Change</Text>
            </TouchableOpacity>
          </View>

          {success ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.green700} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            {/* Stage */}
            <Text style={styles.cardLabel}>Follow-up Stage *</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {STAGES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.stageChip, stage === s && styles.stageChipActive]}
                  onPress={() => handleStageChange(s)}
                >
                  <Text style={[styles.stageText, stage === s && styles.stageTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {(errors.stage || stageError) ? <Text style={styles.error}>{errors.stage || stageError}</Text> : null}

            {/* Follow-up Date */}
            <Text style={[styles.cardLabel, { marginTop: 16 }]}>Follow-up Date *</Text>
            <TextInput
              style={[styles.dateInput, errors.followUpDate ? { borderColor: Colors.red300 } : null]}
              value={followUpDate}
              onChangeText={setFollowUpDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.gray400}
            />
            {errors.followUpDate ? <Text style={styles.error}>{errors.followUpDate}</Text> : null}

            {/* FIX: Health Practitioner — new required field matching web */}
            <Text style={[styles.cardLabel, { marginTop: 16 }]}>Health Practitioner *</Text>
            <PickerModal
              label=""
              value={healthPractitioner}
              options={PRACTITIONER_OPTIONS}
              onChange={setHealthPractitioner}
              error={errors.healthPractitioner}
            />

            {/* Unaided VA */}
            <Text style={[styles.cardLabel, { marginTop: 16 }]}>Unaided VA *</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyeLabel}>Right Eye</Text>
                <PickerModal label="" value={unaidedR} options={VA_OPTIONS} onChange={setUnaidedR} error={errors.unaidedR} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyeLabel}>Left Eye</Text>
                <PickerModal label="" value={unaidedL} options={VA_OPTIONS} onChange={setUnaidedL} error={errors.unaidedL} />
              </View>
            </View>

            {/* Pinhole VA */}
            {showPinhole && (
              <>
                <Text style={[styles.cardLabel, { marginTop: 16 }]}>Pinhole VA</Text>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Right Eye</Text>
                    <PickerModal label="" value={pinholeR} options={VA_OPTIONS} onChange={setPinholeR} error={errors.pinholeR} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Left Eye</Text>
                    <PickerModal label="" value={pinholeL} options={VA_OPTIONS} onChange={setPinholeL} error={errors.pinholeL} />
                  </View>
                </View>
              </>
            )}

            {/* Aided VA */}
            {showAided && (
              <>
                <Text style={[styles.cardLabel, { marginTop: 16 }]}>Aided VA</Text>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Right Eye</Text>
                    <PickerModal label="" value={aidedR} options={VA_OPTIONS} onChange={setAidedR} error={errors.aidedR} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Left Eye</Text>
                    <PickerModal label="" value={aidedL} options={VA_OPTIONS} onChange={setAidedL} error={errors.aidedL} />
                  </View>
                </View>
              </>
            )}

            {/* Reason for Poor Vision */}
            {requireReason && (
              <>
                <Text style={[styles.cardLabel, { marginTop: 16 }]}>Reason for Poor Vision *</Text>
                <TextInput
                  style={[styles.textarea, errors.reason ? { borderColor: Colors.red300 } : null]}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Required for VA worse than 3/60..."
                  placeholderTextColor={Colors.gray400}
                  multiline
                  textAlignVertical="top"
                />
                {errors.reason ? <Text style={styles.error}>{errors.reason}</Text> : null}
              </>
            )}

            {/* Sequelae for Week 5 */}
            {stage === 'Week 5' && (
              <>
                <Text style={[styles.cardLabel, { marginTop: 16 }]}>Sequelae</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {ALL_SEQUELAE.map(sq => (
                    <TouchableOpacity
                      key={sq}
                      style={[styles.seqChip, sequelae.includes(sq) && styles.seqChipActive]}
                      onPress={() => toggleSequela(sq)}
                    >
                      <Text style={[styles.seqText, sequelae.includes(sq) && styles.seqTextActive]}>{sq}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Notes */}
            <Text style={[styles.cardLabel, { marginTop: 16 }]}>Notes / Management</Text>
            <TextInput
              style={styles.textarea}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes..."
              placeholderTextColor={Colors.gray400}
              multiline
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Save Post-Op Record</Text>}
          </TouchableOpacity>

          {/* Timeline */}
          {history.length > 0 && (
            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>Follow-up Timeline</Text>
                <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{history.length} / 3 Completed</Text></View>
              </View>
              {history.map(r => (
                <View key={r.id} style={styles.historyRow}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={styles.badge}><Text style={styles.badgeText}>{r.stage}</Text></View>
                    <Text style={styles.historyDate}>{new Date(r.followUpDate).toLocaleDateString()}</Text>
                  </View>
                  <Text style={styles.historyVA}>
                    RE: <Text style={{ fontWeight: '600' }}>{r.unaidedVA_Right}</Text> • LE: <Text style={{ fontWeight: '600' }}>{r.unaidedVA_Left}</Text>
                  </Text>
                  {r.notes ? <Text style={styles.historyNotes}>{r.notes}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 40 },
  stepLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 8 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.gray900 },
  surgeryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginBottom: 8,
  },
  surgeryIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.orange50, alignItems: 'center', justifyContent: 'center',
  },
  surgeryName: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  surgeryMeta: { fontSize: 12, color: Colors.gray500, marginTop: 1 },
  emptyBox: { alignItems: 'center', paddingVertical: 32, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray100 },
  emptyText: { fontSize: 13, color: Colors.gray500, marginTop: 8 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.orange50, borderWidth: 1, borderColor: Colors.orange200,
    borderRadius: 14, padding: 14, marginTop: 12,
  },
  bannerPatient: { fontSize: 14, fontWeight: '700', color: Colors.orange900, marginBottom: 1 },
  bannerTitle: { fontSize: 13, fontWeight: '600', color: Colors.orange900 },
  bannerSub: { fontSize: 11, color: Colors.orange700, marginTop: 2 },
  bannerChange: { backgroundColor: Colors.orange100, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  bannerChangeText: { fontSize: 11, fontWeight: '600', color: Colors.orange600 },
  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.green50, padding: 14, borderRadius: 12, marginTop: 12,
    borderWidth: 1, borderColor: Colors.green100,
  },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500' },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginTop: 12,
  },
  cardLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 8 },
  stageChip: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white,
  },
  stageChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  stageText: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  stageTextActive: { color: Colors.white },
  error: { fontSize: 11, color: Colors.red500, marginTop: 4 },
  dateInput: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.gray900 },
  row: { flexDirection: 'row', gap: 12 },
  eyeLabel: { fontSize: 11, color: Colors.gray500, marginBottom: 4 },
  seqChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white,
  },
  seqChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  seqText: { fontSize: 12, color: Colors.gray700 },
  seqTextActive: { color: Colors.white },
  textarea: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300,
    borderRadius: 12, padding: 14, minHeight: 70, fontSize: 15, color: Colors.gray900,
  },
  submitBtn: {
    backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18,
    alignItems: 'center', marginTop: 16,
  },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  historyCard: {
    backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.gray100, marginTop: 16,
  },
  historyHeader: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },
  historyRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100 },
  badge: { backgroundColor: Colors.orange50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600', color: Colors.orange600 },
  historyDate: { fontSize: 11, color: Colors.gray400 },
  historyVA: { fontSize: 13, color: Colors.gray700, marginTop: 4 },
  historyNotes: { fontSize: 11, color: Colors.gray500, marginTop: 2 },
});