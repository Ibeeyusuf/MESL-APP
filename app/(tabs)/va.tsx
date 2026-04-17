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

const VA_OPTIONS = WHO_VA_SCALE.map(v => ({ label: v, value: v }));
const STAGES: VAStage[] = ['Presenting', 'Unaided', 'Pinhole', 'Aided'];

export default function VAScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ patientId?: string }>();

  // Guard — Doctor only
  useEffect(() => {
    if (user && user.role !== 'Doctor') router.replace('/(tabs)/');
  }, [user]);
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

  // Pre-select patient from params
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

  // Load history when patient changes
  useEffect(() => {
    if (patient) {
      loadHistory(patient.id);
      resetForm();
    } else {
      setHistory([]);
    }
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

  const requireReason = isWorseThan(rightEye, '3/60') || isWorseThan(leftEye, '3/60');
  const showPinholePrompt = stage === 'Unaided' && rightEye && leftEye &&
    (isWorseThan(rightEye, '6/12') || isWorseThan(leftEye, '6/12'));
  const showAidedPrompt = stage === 'Pinhole' && rightEye && leftEye &&
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
          {success ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.green700} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          {/* Stage */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>VA Stage *</Text>
            <View style={styles.stageGrid}>
              {STAGES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.stageChip, stage === s && styles.stageChipActive]}
                  onPress={() => setStage(s)}
                >
                  <Text style={[styles.stageText, stage === s && styles.stageTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Right Eye */}
          <View style={styles.card}>
            <View style={styles.eyeHeader}>
              <View style={[styles.dot, { backgroundColor: Colors.orange500 }]} />
              <Text style={styles.eyeTitle}>Right Eye (RE)</Text>
            </View>
            <PickerModal label="" value={rightEye} options={VA_OPTIONS} onChange={setRightEye} placeholder="Select VA" error={errors.rightEye} />
          </View>

          {/* Left Eye */}
          <View style={styles.card}>
            <View style={styles.eyeHeader}>
              <View style={[styles.dot, { backgroundColor: Colors.indigo500 }]} />
              <Text style={styles.eyeTitle}>Left Eye (LE)</Text>
            </View>
            <PickerModal label="" value={leftEye} options={VA_OPTIONS} onChange={setLeftEye} placeholder="Select VA" error={errors.leftEye} />
          </View>

          {/* Prompts */}
          {showPinholePrompt && (
            <View style={styles.promptBox}>
              <Ionicons name="information-circle" size={18} color={Colors.orange600} />
              <Text style={styles.promptText}>
                Poor unaided vision detected (worse than 6/12). Consider recording <Text style={{ fontWeight: '700' }}>Pinhole VA</Text> next.
              </Text>
            </View>
          )}

          {showAidedPrompt && (
            <View style={styles.promptBox}>
              <Ionicons name="information-circle" size={18} color={Colors.orange600} />
              <Text style={styles.promptText}>
                Poor pinhole vision detected (worse than 6/12). Consider recording <Text style={{ fontWeight: '700' }}>Aided VA</Text> next.
              </Text>
            </View>
          )}

          {/* Reason */}
          {requireReason && (
            <View style={[styles.card, { backgroundColor: Colors.red50, borderColor: Colors.red300 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="alert-circle" size={18} color={Colors.red500} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.red600 }}>Severe Vision Loss Detected</Text>
              </View>
              <Text style={styles.cardLabel}>Reason for Poor Vision (VA worse than 3/60) *</Text>
              <TextInput
                style={styles.textArea}
                value={reason}
                onChangeText={setReason}
                placeholder="Enter reason..."
                placeholderTextColor={Colors.gray400}
                multiline
                textAlignVertical="top"
              />
              {errors.reason ? <Text style={styles.error}>{errors.reason}</Text> : null}
            </View>
          )}

          {/* Notes */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Notes</Text>
            <TextInput
              style={styles.textArea}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes..."
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
            {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Save Visual Acuity</Text>}
          </TouchableOpacity>

          {/* History */}
          {history.length > 0 && (
            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>Assessment History</Text>
                <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{history.length} Records</Text></View>
              </View>
              {history.slice(0, 5).map(r => (
                <View key={r.id} style={styles.historyRow}>
                  <View style={styles.historyTop}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{r.stage}</Text>
                    </View>
                    <Text style={styles.historyDate}>{new Date(r.recordedAt).toLocaleDateString()}</Text>
                  </View>
                  <Text style={styles.historyVA}>RE: <Text style={{ fontWeight: '600' }}>{r.rightEye}</Text> • LE: <Text style={{ fontWeight: '600' }}>{r.leftEye}</Text></Text>
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
  stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stageChip: {
    flex: 1, minWidth: '45%', paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white,
  },
  stageChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  stageText: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  stageTextActive: { color: Colors.white },
  eyeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  eyeTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  textArea: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300,
    borderRadius: 12, padding: 14, minHeight: 70,
  },
  error: { fontSize: 11, color: Colors.red500, marginTop: 4 },
  promptBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.orange50, borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: Colors.orange200 },
  promptText: { fontSize: 13, color: Colors.orange700, flex: 1, lineHeight: 20 },
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
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { backgroundColor: Colors.orange50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600', color: Colors.orange600 },
  historyDate: { fontSize: 11, color: Colors.gray400 },
  historyVA: { fontSize: 13, color: Colors.gray700, marginTop: 4 },
});