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

// ─── VA severity colour mapping ────────────
function getVAColors(va: string): { bg: string; border: string; text: string } {
  const scale = WHO_VA_SCALE;
  const idx = scale.indexOf(va);
  if (idx <= 1) return { bg: Colors.green50, border: Colors.green100, text: Colors.green800 };
  if (idx <= 3) return { bg: '#fefce8', border: '#fde68a', text: '#854d0e' };
  if (idx <= 5) return { bg: Colors.orange50, border: Colors.orange200, text: Colors.orange800 };
  return { bg: Colors.red50, border: Colors.red300, text: '#991b1b' };
}

function getStageBadgeColors(stage: VAStage): { bg: string; border: string; text: string } {
  switch (stage) {
    case 'Presenting': return { bg: '#eff6ff',       border: '#bfdbfe',         text: '#1d4ed8' };
    case 'Unaided':    return { bg: Colors.gray100,  border: Colors.gray300,   text: Colors.gray700 };
    case 'Pinhole':    return { bg: Colors.purple50, border: Colors.purple500, text: '#7e22ce' };
    case 'Aided':      return { bg: Colors.green50,  border: Colors.green100,  text: Colors.green700 };
    default:           return { bg: Colors.gray100,  border: Colors.gray300,   text: Colors.gray700 };
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const dayMs = 1000 * 3600 * 24;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfRecordDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffInDays = Math.round((startOfToday - startOfRecordDay) / dayMs);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (diffInDays === 0) return `Today, ${time}`;
  if (diffInDays === 1) return `Yesterday, ${time}`;
  if (diffInDays > 1 && diffInDays < 30) return `${diffInDays} days ago, ${time}`;
  return `${date.toLocaleDateString()}, ${time}`;
}

const VA_OPTIONS = [
  { label: 'Select Visual Acuity', value: '' },
  ...WHO_VA_SCALE.map(v => ({ label: v, value: v })),
];

const STAGES: { id: VAStage; label: string; desc: string }[] = [
  { id: 'Presenting', label: 'Presenting', desc: 'Initial assessment' },
  { id: 'Unaided',    label: 'Unaided',    desc: 'Post-op without correction' },
  { id: 'Pinhole',    label: 'Pinhole',    desc: 'Post-op with pinhole' },
  { id: 'Aided',      label: 'Aided',      desc: 'Post-op with glasses' },
];

export default function VAScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ patientId?: string }>();

  useEffect(() => {
    if (user && user.role !== 'Doctor' && user.role !== 'Support Staff') router.replace('/(tabs)/');
  }, [user]);

  const isDoctor = user?.role === 'Doctor';

  const [patient, setPatient] = useState<Patient | null>(null);
  const [stage, setStage] = useState<VAStage>('Presenting');
  const [rightEye, setRightEye] = useState('');
  const [leftEye, setLeftEye] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [history, setHistory] = useState<VisualAcuityRecord[]>([]);

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
      const records = (res.data ?? [])
        .map(mapApiVaToUi)
        .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
      setHistory(records);
    } catch { setHistory([]); }
  };

  const resetForm = () => {
    setStage('Presenting'); setRightEye(''); setLeftEye('');
    setReason(''); setNotes(''); setErrors({}); setSuccess('');
  };

  const requireReason = (!!rightEye && isWorseThan(rightEye, '3/60')) || (!!leftEye && isWorseThan(leftEye, '3/60'));
  const showPinholePrompt = stage === 'Unaided' && !!rightEye && !!leftEye &&
    (isWorseThan(rightEye, '6/12') || isWorseThan(leftEye, '6/12'));
  const showAidedPrompt = stage === 'Pinhole' && !!rightEye && !!leftEye &&
    (isWorseThan(rightEye, '6/12') || isWorseThan(leftEye, '6/12'));

  const handleSubmit = async () => {
    if (!patient) return;
    const e: Record<string, string> = {};
    if (!rightEye) e.rightEye = 'Required';
    if (!leftEye) e.leftEye = 'Required';
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
          {!!success && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.green600} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          )}

          {!isDoctor && (
            <>
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

              {/* Right Eye */}
              <View style={styles.eyeCard}>
                <Text style={styles.eyeTitle}>
                  Right Eye (OD) <Text style={styles.required}>*</Text>
                </Text>
                <PickerModal
                  label=""
                  value={rightEye}
                  options={VA_OPTIONS}
                  onChange={setRightEye}
                  error={errors.rightEye}
                  placeholder="Select Visual Acuity"
                />
              </View>

              {/* Left Eye */}
              <View style={styles.eyeCard}>
                <Text style={styles.eyeTitle}>
                  Left Eye (OS) <Text style={styles.required}>*</Text>
                </Text>
                <PickerModal
                  label=""
                  value={leftEye}
                  options={VA_OPTIONS}
                  onChange={setLeftEye}
                  error={errors.leftEye}
                  placeholder="Select Visual Acuity"
                />
              </View>

              {showPinholePrompt && (
                <View style={styles.promptBox}>
                  <Ionicons name="information-circle" size={18} color={Colors.orange500} />
                  <Text style={styles.promptText}>
                    Poor unaided vision detected (<Text style={{ fontWeight: '600' }}>worse than 6/12</Text>). Consider recording{' '}
                    <Text style={{ fontWeight: '700' }}>Pinhole VA</Text> next.
                  </Text>
                </View>
              )}

              {showAidedPrompt && (
                <View style={styles.promptBox}>
                  <Ionicons name="information-circle" size={18} color={Colors.orange500} />
                  <Text style={styles.promptText}>
                    Poor pinhole vision detected (<Text style={{ fontWeight: '600' }}>worse than 6/12</Text>). Consider recording{' '}
                    <Text style={{ fontWeight: '700' }}>Aided VA</Text> next.
                  </Text>
                </View>
              )}

              {requireReason && (
                <View style={[styles.card, styles.cardRed]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Ionicons name="alert-circle" size={18} color={Colors.red600} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#7f1d1d' }}>Severe Vision Loss Detected</Text>
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
                  {errors.reason && <Text style={styles.error}>{errors.reason}</Text>}
                </View>
              )}

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

              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.submitText}>Record Visual Acuity</Text>}
              </TouchableOpacity>
            </>
          )}

          <View style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Assessment History</Text>
              <View style={styles.historyBadge}>
                <Text style={styles.historyBadgeText}>{history.length} Records</Text>
              </View>
            </View>

            {history.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="eye-outline" size={40} color={Colors.gray300} />
                <Text style={styles.emptyTitle}>No visual acuity records</Text>
                <Text style={styles.emptyDesc}>This patient does not have any visual acuity assessments yet.</Text>
              </View>
            ) : (
              history.map(r => {
                const stageBadge = getStageBadgeColors(r.stage as VAStage);
                const rightColors = getVAColors(r.rightEye);
                const leftColors = getVAColors(r.leftEye);
                return (
                  <View key={r.id} style={styles.historyRow}>
                    <View style={styles.historyTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="time-outline" size={13} color={Colors.gray400} />
                        <Text style={styles.historyDate} numberOfLines={1}>
                          {formatRelativeTime(r.recordedAt)}
                        </Text>
                      </View>
                      <View style={[styles.stageBadge, { backgroundColor: stageBadge.bg, borderColor: stageBadge.border }]}>
                        <Text style={[styles.stageBadgeText, { color: stageBadge.text }]}>{r.stage}</Text>
                      </View>
                    </View>

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

                    {r.recordedBy && (
                      <Text style={styles.recordedBy}>Recorded by {r.recordedBy}</Text>
                    )}
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
  content: { padding: 16, paddingBottom: 40 },

  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.green50,
    borderLeftWidth: 4, borderLeftColor: Colors.green600,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 8, marginTop: 12,
  },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500', flex: 1 },

  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginTop: 12,
  },
  cardRed: { backgroundColor: Colors.red50, borderColor: Colors.red300 },
  cardLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 8 },
  required: { color: Colors.red500 },

  stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stageChip: {
    flex: 1, minWidth: '45%',
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1,
    borderColor: Colors.gray300, backgroundColor: Colors.white,
  },
  stageChipActive: { backgroundColor: Colors.orange50, borderColor: Colors.orange500 },
  stageChipInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stageChipText: { flex: 1 },
  stageText: { fontSize: 13, fontWeight: '600', color: Colors.gray900 },
  stageTextActive: { color: Colors.orange900 },
  stageDesc: { fontSize: 10, color: Colors.gray500, marginTop: 2 },
  stageDescActive: { color: Colors.orange700 },

  eyeCard: {
    backgroundColor: Colors.gray50, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.gray200, marginTop: 12,
  },
  eyeTitle: { fontSize: 14, fontWeight: '700', color: Colors.gray900, marginBottom: 10 },

  promptBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.orange50, borderLeftWidth: 4, borderLeftColor: Colors.orange500,
    padding: 14, marginTop: 12, borderRadius: 4,
  },
  promptText: { fontSize: 13, color: Colors.orange700, flex: 1, lineHeight: 20 },

  textArea: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300,
    borderRadius: 12, padding: 14, minHeight: 70, fontSize: 15, color: Colors.gray900,
  },
  error: { fontSize: 11, color: Colors.red500, marginTop: 4 },

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
    backgroundColor: Colors.gray50,
    borderBottomWidth: 1, borderBottomColor: Colors.gray200,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },

  emptyState: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16,
  },
  emptyTitle: { fontSize: 14, fontWeight: '500', color: Colors.gray900, marginTop: 8 },
  emptyDesc: { fontSize: 13, color: Colors.gray500, textAlign: 'center', marginTop: 4 },

  historyRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100,
  },
  historyTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  historyDate: { fontSize: 12, color: Colors.gray500 },

  stageBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
  },
  stageBadgeText: { fontSize: 11, fontWeight: '600' },

  vaRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  vaBadge: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  vaBadgeLabel: { fontSize: 11, fontWeight: '400' },
  vaBadgeValue: { fontSize: 13, fontWeight: '700' },

  recordedBy: { fontSize: 11, color: Colors.gray400, marginTop: 2 },
});
