import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { PatientSelector } from '@/components/PatientSelector';
import { PickerModal } from '@/components/PickerModal';
import { api } from '@/services/api';
import { WHO_VA_SCALE, isWorseThan, mapApiVaToUi, mapApiPatientToUi } from '@/utils/helpers';
import type { Patient, VisualAcuityRecord, VAStage } from '@/types';

// ─── VA severity colour mapping (mirrors web's getVAColorClass) ────────────
// Web uses Tailwind colour classes; here we map to RN colour tokens.
function getVAColors(va: string): { bg: string; border: string; text: string } {
  const scale = WHO_VA_SCALE; // ordered best→worst
  const idx = scale.indexOf(va);
  // 6/6 → 6/9: normal/near-normal → green
  if (idx <= 1) return { bg: Colors.green50,  border: Colors.green300,  text: Colors.green800 };
  // 6/12 → 6/18: mild
  if (idx <= 3) return { bg: Colors.yellow50, border: Colors.yellow300, text: Colors.yellow800 };
  // 6/24 → 6/60: moderate
  if (idx <= 5) return { bg: Colors.orange50, border: Colors.orange300, text: Colors.orange800 };
  // 3/60 → CF: severe / blind
  return { bg: Colors.red50, border: Colors.red300, text: Colors.red800 };
}

// ─── Stage badge colour mapping (mirrors web's getStageBadgeClass) ─────────
function getStageBadgeColors(stage: VAStage): { bg: string; border: string; text: string } {
  switch (stage) {
    case 'Presenting': return { bg: Colors.blue50,   border: Colors.blue200,   text: Colors.blue700 };
    case 'Unaided':    return { bg: Colors.gray100,  border: Colors.gray300,   text: Colors.gray700 };
    case 'Pinhole':    return { bg: Colors.purple50, border: Colors.purple200, text: Colors.purple700 };
    case 'Aided':      return { bg: Colors.green50,  border: Colors.green200,  text: Colors.green700 };
    default:           return { bg: Colors.gray100,  border: Colors.gray300,   text: Colors.gray700 };
  }
}

// ─── Relative time helper (mirrors web's formatRelativeTime) ───────────────
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 30) return `${diffInDays} days ago`;
  return date.toLocaleDateString();
}

// ─── Constants ────────────────────────────────────────────────────────────
const VA_OPTIONS = [
  { label: 'Select Visual Acuity', value: '' },
  ...WHO_VA_SCALE.map(v => ({ label: v, value: v })),
];

type StageDef = { id: VAStage; label: string; desc: string };
const STAGES: StageDef[] = [
  { id: 'Presenting', label: 'Presenting', desc: 'Initial assessment' },
  { id: 'Unaided',    label: 'Unaided',    desc: 'Post-op without correction' },
  { id: 'Pinhole',    label: 'Pinhole',    desc: 'Post-op with pinhole' },
  { id: 'Aided',      label: 'Aided',      desc: 'Post-op with glasses' },
];

// ─── Screen ───────────────────────────────────────────────────────────────
export default function VAScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ patientId?: string }>();

  useEffect(() => {
    if (user && user.role !== 'Doctor' && user.role !== 'Support Staff') router.replace('/(tabs)/');
  }, [user]);

  const isDoctor = user?.role === 'Doctor';

  const [patient,    setPatient]    = useState<Patient | null>(null);
  const [stage,      setStage]      = useState<VAStage>('Presenting');
  const [rightEye,   setRightEye]   = useState('');
  const [leftEye,    setLeftEye]    = useState('');
  const [reason,     setReason]     = useState('');
  const [notes,      setNotes]      = useState('');
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState('');
  const [history,    setHistory]    = useState<VisualAcuityRecord[]>([]);

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
    if (patient) { loadHistory(patient.id); resetForm(); }
    else setHistory([]);
  }, [patient?.id]);

  const loadHistory = async (pid: string) => {
    try {
      const res = (await api.visualAcuity.list(pid)) as { data?: any[] };
      setHistory((res.data ?? []).map(mapApiVaToUi));
    } catch { setHistory([]); }
  };

  const resetForm = () => {
    setStage('Presenting'); setRightEye(''); setLeftEye('');
    setReason(''); setNotes(''); setErrors({}); setSuccess('');
  };

  const requireReason     = (!!rightEye && isWorseThan(rightEye, '3/60')) || (!!leftEye && isWorseThan(leftEye, '3/60'));
  const showPinholePrompt = stage === 'Unaided' && !!rightEye && !!leftEye &&
    (isWorseThan(rightEye, '6/12') || isWorseThan(leftEye, '6/12'));
  const showAidedPrompt   = stage === 'Pinhole' && !!rightEye && !!leftEye &&
    (isWorseThan(rightEye, '6/12') || isWorseThan(leftEye, '6/12'));

  const handleSubmit = async () => {
    if (!patient) return;
    const e: Record<string, string> = {};
    if (!rightEye) e.rightEye = 'Required';
    if (!leftEye)  e.leftEye  = 'Required';
    if (requireReason && !reason.trim()) e.reason = 'Required for VA worse than 3/60';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      await api.visualAcuity.create(patient.id, {
        stage,
        rightEye,
        leftEye,
        reasonForPoorVision: requireReason ? reason.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      await loadHistory(patient.id);
      setSuccess(`VA recorded for ${patient.firstName}`);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally { setSubmitting(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <PatientSelector selectedPatient={patient} onSelectPatient={setPatient} />

      {patient && (
        <>
          {/* ── Success banner (left-border style matching web) ── */}
          {!!success && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.green500} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          )}

          {/* ── Form — hidden for Doctor role (matches web's !isDoctor guard) ── */}
          {!isDoctor && (<>

          {/* ── Assessment Stage ── */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Assessment Stage</Text>
            <View style={styles.stageGrid}>
              {STAGES.map(s => {
                const active = stage === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.stageChip, active && styles.stageChipActive]}
                    onPress={() => setStage(s.id)}
                  >
                    <View style={styles.stageChipInner}>
                      <View style={styles.stageChipText}>
                        <Text style={[styles.stageText, active && styles.stageTextActive]}>{s.label}</Text>
                        <Text style={[styles.stageDesc, active && styles.stageDescActive]}>{s.desc}</Text>
                      </View>
                      {/* CheckCircle icon when active — matches web */}
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={active ? Colors.orange600 : 'transparent'}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Right Eye (OD) ── */}
          <View style={styles.eyeCard}>
            <Text style={styles.eyeTitle}>Right Eye (OD) <Text style={styles.required}>*</Text></Text>
            <PickerModal
              label=""
              value={rightEye}
              options={VA_OPTIONS}
              onChange={setRightEye}
              placeholder="Select Visual Acuity"
              error={errors.rightEye}
            />
          </View>

          {/* ── Left Eye (OS) ── */}
          <View style={styles.eyeCard}>
            <Text style={styles.eyeTitle}>Left Eye (OS) <Text style={styles.required}>*</Text></Text>
            <PickerModal
              label=""
              value={leftEye}
              options={VA_OPTIONS}
              onChange={setLeftEye}
              placeholder="Select Visual Acuity"
              error={errors.leftEye}
            />
          </View>

          {/* ── Pinhole prompt ── */}
          {showPinholePrompt && (
            <View style={styles.promptBox}>
              <Ionicons name="information-circle" size={18} color={Colors.orange400} />
              <Text style={styles.promptText}>
                Poor unaided vision detected (<Text style={{ fontWeight: '600' }}>worse than 6/12</Text>). Consider recording{' '}
                <Text style={{ fontWeight: '700' }}>Pinhole VA</Text> next.
              </Text>
            </View>
          )}

          {/* ── Aided prompt ── */}
          {showAidedPrompt && (
            <View style={styles.promptBox}>
              <Ionicons name="information-circle" size={18} color={Colors.orange400} />
              <Text style={styles.promptText}>
                Poor pinhole vision detected (<Text style={{ fontWeight: '600' }}>worse than 6/12</Text>). Consider recording{' '}
                <Text style={{ fontWeight: '700' }}>Aided VA</Text> next.
              </Text>
            </View>
          )}

          {/* ── Reason for poor vision ── */}
          {requireReason && (
            <View style={[styles.card, styles.cardRed]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="alert-circle" size={18} color={Colors.red600} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.red900 }}>Severe Vision Loss Detected</Text>
              </View>
              <Text style={styles.cardLabel}>
                Reason for Poor Vision (VA worse than 3/60) <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.textArea, errors.reason ? { borderColor: Colors.red300 } : null]}
                value={reason}
                onChangeText={setReason}
                placeholder="E.g., Advanced mature cataract, corneal opacity..."
                placeholderTextColor={Colors.gray400}
                multiline
                textAlignVertical="top"
              />
              {errors.reason ? <Text style={styles.error}>{errors.reason}</Text> : null}
            </View>
          )}

          {/* ── Notes ── */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              Additional Notes <Text style={{ color: Colors.gray400, fontWeight: '400' }}>(Optional)</Text>
            </Text>
            <TextInput
              style={styles.textArea}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any other observations..."
              placeholderTextColor={Colors.gray400}
              multiline
              textAlignVertical="top"
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
              : <Text style={styles.submitText}>Record Visual Acuity</Text>}
          </TouchableOpacity>

          </>)} {/* end !isDoctor */}

          {/* ── Assessment History ── */}
          <View style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Assessment History</Text>
              <View style={styles.historyBadge}>
                <Text style={styles.historyBadgeText}>{history.length} Records</Text>
              </View>
            </View>

            {history.length === 0 ? (
              /* Empty state — matches web's dashed border empty state */
              <View style={styles.emptyState}>
                <Ionicons name="eye-outline" size={40} color={Colors.gray300} />
                <Text style={styles.emptyTitle}>No visual acuity records</Text>
                <Text style={styles.emptyDesc}>This patient does not have any visual acuity assessments yet.</Text>
              </View>
            ) : (
              history.map(r => {
                const stageBadge = getStageBadgeColors(r.stage as VAStage);
                const rightColors = getVAColors(r.rightEye);
                const leftColors  = getVAColors(r.leftEye);
                return (
                  <View key={r.id} style={styles.historyRow}>
                    {/* Date + Stage row */}
                    <View style={styles.historyTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="time-outline" size={13} color={Colors.gray400} />
                        <Text style={styles.historyDate} numberOfLines={1}>
                          {formatRelativeTime(r.recordedAt)}
                        </Text>
                      </View>
                      {/* Stage badge — colour-coded per stage */}
                      <View style={[styles.stageBadge, { backgroundColor: stageBadge.bg, borderColor: stageBadge.border }]}>
                        <Text style={[styles.stageBadgeText, { color: stageBadge.text }]}>{r.stage}</Text>
                      </View>
                    </View>

                    {/* VA values — colour-coded by severity */}
                    <View style={styles.vaRow}>
                      <View style={[styles.vaBadge, { backgroundColor: rightColors.bg, borderColor: rightColors.border }]}>
                        <Text style={[styles.vaBadgeLabel, { color: rightColors.text }]}>RE </Text>
                        <Text style={[styles.vaBadgeValue, { color: rightColors.text }]}>{r.rightEye}</Text>
                      </View>
                      <View style={[styles.vaBadge, { backgroundColor: leftColors.bg, borderColor: leftColors.border }]}>
                        <Text style={[styles.vaBadgeLabel, { color: leftColors.text }]}>LE </Text>
                        <Text style={[styles.vaBadgeValue, { color: leftColors.text }]}>{r.leftEye}</Text>
                      </View>
                    </View>

                    {/* Recorded by — matches web's 5th column */}
                    {r.recordedBy ? (
                      <Text style={styles.recordedBy}>Recorded by {r.recordedBy}</Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content:   { padding: 16, paddingBottom: 40 },

  // ── Success banner — left-border style matching web ──
  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.green50,
    borderLeftWidth: 4, borderLeftColor: Colors.green500,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 8, marginTop: 12,
  },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500', flex: 1 },

  // ── Cards ──
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginTop: 12,
  },
  cardRed: { backgroundColor: Colors.red50, borderColor: Colors.red200 },
  cardLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 8 },
  required: { color: Colors.red500 },

  // ── Stage grid — 2-col, checkmark icon on active ──
  stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stageChip: {
    flex: 1, minWidth: '45%',
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1,
    borderColor: Colors.gray300, backgroundColor: Colors.white,
  },
  stageChipActive: { backgroundColor: Colors.orange50, borderColor: Colors.orange500 },
  stageChipInner:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stageChipText:   { flex: 1 },
  stageText:       { fontSize: 13, fontWeight: '600', color: Colors.gray900 },
  stageTextActive: { color: Colors.orange900 },
  stageDesc:       { fontSize: 10, color: Colors.gray500, marginTop: 2 },
  stageDescActive: { color: Colors.orange700 },

  // ── Eye cards ──
  eyeCard: {
    backgroundColor: Colors.gray50, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.gray200, marginTop: 12,
  },
  eyeTitle: { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 10 },

  // ── Conditional prompts ──
  promptBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.orange50, borderLeftWidth: 4, borderLeftColor: Colors.orange400,
    padding: 14, marginTop: 12, borderRadius: 4,
  },
  promptText: { fontSize: 13, color: Colors.orange700, flex: 1, lineHeight: 20 },

  // ── Text inputs ──
  textArea: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300,
    borderRadius: 12, padding: 14, minHeight: 70, fontSize: 15, color: Colors.gray900,
  },
  error: { fontSize: 11, color: Colors.red500, marginTop: 4 },

  // ── Submit button ──
  submitBtn: {
    backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18,
    alignItems: 'center', marginTop: 16,
  },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },

  // ── History card ──
  historyCard: {
    backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.gray100, marginTop: 16,
  },
  historyHeader: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.gray50,
    borderBottomWidth: 1, borderBottomColor: Colors.gray200,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16,
  },
  emptyTitle: { fontSize: 14, fontWeight: '500', color: Colors.gray900, marginTop: 8 },
  emptyDesc:  { fontSize: 13, color: Colors.gray500, textAlign: 'center', marginTop: 4 },

  // ── History rows ──
  historyRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100,
  },
  historyTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  historyDate: { fontSize: 12, color: Colors.gray500 },

  // Stage badge — dynamic colour applied inline
  stageBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
  },
  stageBadgeText: { fontSize: 11, fontWeight: '600' },

  // VA severity badges — dynamic colour applied inline
  vaRow:       { flexDirection: 'row', gap: 8, marginBottom: 6 },
  vaBadge:     { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  vaBadgeLabel:{ fontSize: 11, fontWeight: '400' },
  vaBadgeValue:{ fontSize: 13, fontWeight: '700' },

  // Recorded by
  recordedBy: { fontSize: 11, color: Colors.gray400, marginTop: 2 },
});