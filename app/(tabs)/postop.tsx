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
import type { Patient, SurgeryRecord, PostOperativeRecord, PostOpStage } from '@/types';

// Includes placeholder + WHO scale
const VA_OPTIONS = [
  { label: '-- Select --', value: '' },
  ...WHO_VA_SCALE.map(v => ({ label: v, value: v })),
];

// Stages — "Not Done" added to match web version
type ExtendedStage = PostOpStage | 'Not Done';
const STAGES: ExtendedStage[] = ['Day 1', 'Week 1', 'Week 5', 'Not Done'];

// Health Practitioner — matches web version names exactly
const PRACTITIONER_OPTIONS = [
  { label: 'Select practitioner', value: '' },
  { label: 'Ibrahim Wambai', value: 'Ibrahim Wambai' },
  { label: 'Nasiru Usman', value: 'Nasiru Usman' },
  { label: 'Adamu Mohammed', value: 'Adamu Mohammed' },
  { label: 'Murtala Umar', value: 'Murtala Umar' },
];

// Sequelae — matches web sequelaeOptions exactly (14 items)
const ALL_SEQUELAE = [
  'Bullous Keratopathy',
  'Cornea Oedema',
  'Cornea Scar',
  'Cornea Endothelial staining',
  'Uveitis',
  'PCO',
  'Secondary Glaucoma',
  'Endophthalmitis',
  'Shallow AC',
  'IOL Malposition',
  'Presumed Post Seg Pathology',
  'Hyphema',
  'Lens matter',
  'Others',
];

// REASONS A — pre-operative selection reasons (web selectionReasons)
const SELECTION_REASONS = [
  { label: 'Select a reason...', value: '' },
  { label: 'Subluxated lens', value: 'Subluxated lens' },
  { label: 'Glaucoma', value: 'Glaucoma' },
  { label: 'Maculopathy', value: 'Maculopathy' },
  { label: 'Diabetic retinopathy', value: 'Diabetic retinopathy' },
  { label: 'Retinal Detachment', value: 'Retinal Detachment' },
  { label: 'Cornea Scar', value: 'Cornea Scar' },
  { label: 'Uveitis', value: 'Uveitis' },
  { label: 'Ptosis', value: 'Ptosis' },
  { label: 'Others', value: 'Others' },
];

// REASONS B — surgical complications (same for all stages on web)
const SURGICAL_COMPLICATION_REASONS = [
  { label: 'Select a complication...', value: '' },
  { label: 'Cornea Oedema', value: 'Cornea Oedema' },
  { label: 'Significant SK', value: 'Significant SK' },
  { label: 'Shallow AC', value: 'Shallow AC' },
  { label: 'IOL Malposition', value: 'IOL Malposition' },
  { label: 'Presumed Post Seg Pathology', value: 'Presumed Post Seg Pathology' },
  { label: 'Hyphema', value: 'Hyphema' },
  { label: 'Lens matter', value: 'Lens matter' },
  { label: 'Others', value: 'Others' },
];

// Pinhole line numbers for C. Spectacles
const LINE_NUMBER_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  label: String(i + 1),
  value: String(i + 1),
}));

// Helper: is VA at or worse than a threshold?
function isAtOrWorseThan(va: string, threshold: string): boolean {
  return va !== 'Unable to determine' && isWorseThan(threshold, va) === false && isWorseThan(va, threshold) === false
    ? false
    : isWorseThan(va, threshold) || va === threshold;
}

// Helper: get VA badge colour matching web's getVAColorClass
function getVAColor(va?: string): { bg: string; text: string; border: string } {
  if (!va || va === 'Unable to determine') return { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB' };
  if (va === '6/6' || va === '6/9') return { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' };
  if (isAtOrWorseThan(va, '6/18') && !isAtOrWorseThan(va, '3/60')) return { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' };
  if (isAtOrWorseThan(va, '3/60')) return { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' };
  return { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' };
}

// Timeline stages (3 stages — "Not Done" is not shown in timeline, matches web)
const TIMELINE_STAGES = ['Day 1', 'Week 1', 'Week 5'];

// Merge prior records into the stage record (matches web getStageRecord logic)
function getStageRecord(records: PostOperativeRecord[], stage: string): PostOperativeRecord | undefined {
  const target = records.find(r => r.stage === stage);
  if (!target) return undefined;

  const currentIndex = TIMELINE_STAGES.indexOf(stage);
  const priorRecords = records.filter(r => TIMELINE_STAGES.indexOf(r.stage) <= currentIndex);

  return priorRecords.reduce<PostOperativeRecord>(
    (acc, record) => ({
      ...acc,
      ...record,
      reasonForPoorVision: record.reasonForPoorVision ?? acc.reasonForPoorVision,
      preOpReason: record.preOpReason ?? acc.preOpReason,
      preOpOthers: record.preOpOthers ?? acc.preOpOthers,
      surgicalComplication: record.surgicalComplication ?? acc.surgicalComplication,
      surgicalOthers: record.surgicalOthers ?? acc.surgicalOthers,
      pinholeImprovement: record.pinholeImprovement ?? acc.pinholeImprovement,
      pinholeLineNumber: record.pinholeLineNumber ?? acc.pinholeLineNumber,
      sequelae: record.sequelae && record.sequelae.length > 0 ? record.sequelae : acc.sequelae,
    }),
    target,
  );
}

// VA Badge component
function VABadge({ label, va }: { label: string; va?: string }) {
  if (!va) return null;
  const c = getVAColor(va);
  return (
    <View style={[styles.vaBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.vaBadgeText, { color: c.text }]}>{label}: {va}</Text>
    </View>
  );
}

// Full timeline component matching web PostOpHistoryTimeline
function PostOpHistoryTimeline({ records }: { records: PostOperativeRecord[] }) {
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  if (records.length === 0) {
    return (
      <View style={styles.timelineEmpty}>
        <Ionicons name="calendar-outline" size={36} color={Colors.gray300} />
        <Text style={styles.timelineEmptyTitle}>No follow-up records</Text>
        <Text style={styles.timelineEmptyText}>
          No post-operative follow-ups have been recorded for this surgery yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingTop: 4 }}>
      {TIMELINE_STAGES.map((stage, index) => {
        const record = getStageRecord(records, stage);
        const isCompleted = !!record;
        const isLast = index === TIMELINE_STAGES.length - 1;

        return (
          <View key={stage} style={{ flexDirection: 'row', gap: 12 }}>
            {/* Left: circle + connector */}
            <View style={{ alignItems: 'center', width: 40 }}>
              <View style={[
                styles.timelineDot,
                isCompleted ? styles.timelineDotDone : styles.timelineDotPending,
              ]}>
                <Ionicons
                  name={isCompleted ? 'checkmark-circle' : 'time-outline'}
                  size={20}
                  color={isCompleted ? '#16A34A' : Colors.gray400}
                />
              </View>
              {!isLast && (
                <View style={[
                  styles.timelineConnector,
                  { backgroundColor: isCompleted ? '#86EFAC' : Colors.gray200 },
                ]} />
              )}
            </View>

            {/* Right: content card */}
            <View style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
              <View style={[
                styles.timelineCard,
                isCompleted ? styles.timelineCardDone : styles.timelineCardPending,
              ]}>
                {/* Header row */}
                <View style={styles.timelineCardHeader}>
                  <Text style={[styles.timelineStageTitle, !isCompleted && { color: Colors.gray500 }]}>
                    {stage}
                  </Text>
                  {isCompleted && (
                    <Text style={styles.timelineDate}>{formatDate(record!.followUpDate)}</Text>
                  )}
                </View>

                {isCompleted ? (
                  <View style={{ gap: 10 }}>
                    {/* VA Grid — Right + Left eye */}
                    <View style={styles.vaGrid}>
                      {/* Right Eye */}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eyeColLabel}>Right Eye (OD)</Text>
                        <View style={{ gap: 4 }}>
                          {/* firstVA (new field) */}
                          {record!.firstVARight && (
                            <VABadge label="First" va={record!.firstVARight} />
                          )}
                          {/* unaidedVA */}
                          <VABadge label="Unaided" va={record!.unaidedVA_Right} />
                          {/* pinholeVA / aidedVA */}
                          {record!.pinholeVA_Right && (
                            <VABadge label="Aided" va={record!.pinholeVA_Right} />
                          )}
                          {!record!.pinholeVA_Right && record!.aidedVA_Right && (
                            <VABadge label="Aided" va={record!.aidedVA_Right} />
                          )}
                        </View>
                      </View>

                      {/* Left Eye */}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eyeColLabel}>Left Eye (OS)</Text>
                        <View style={{ gap: 4 }}>
                          {record!.firstVALeft && (
                            <VABadge label="First" va={record!.firstVALeft} />
                          )}
                          <VABadge label="Unaided" va={record!.unaidedVA_Left} />
                          {record!.pinholeVA_Left && (
                            <VABadge label="Aided" va={record!.pinholeVA_Left} />
                          )}
                          {!record!.pinholeVA_Left && record!.aidedVA_Left && (
                            <VABadge label="Aided" va={record!.aidedVA_Left} />
                          )}
                        </View>
                      </View>
                    </View>

                    {/* Sequelae */}
                    {record!.sequelae && record!.sequelae.length > 0 && (
                      <View style={styles.timelineSection}>
                        <Text style={styles.timelineSectionLabel}>Sequelae:</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {record!.sequelae.map(s => (
                            <View
                              key={s}
                              style={[
                                styles.seqBadge,
                                s === 'None' ? styles.seqBadgeGreen : styles.seqBadgeRed,
                              ]}
                            >
                              <Text style={[
                                styles.seqBadgeText,
                                s === 'None' ? { color: '#166534' } : { color: '#991B1B' },
                              ]}>{s}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Reason for Poor Vision */}
                    {record!.reasonForPoorVision && (
                      <View style={styles.timelineSection}>
                        <Text style={styles.timelineSectionLabel}>Reason for Poor Vision:</Text>
                        <Text style={styles.timelineSectionValue}>{record!.reasonForPoorVision}</Text>
                      </View>
                    )}

                    {/* Reasons A / B / C */}
                    {(record!.preOpReason || record!.surgicalComplication || record!.pinholeImprovement) && (
                      <View style={[styles.timelineSection, { gap: 6 }]}>
                        {record!.preOpReason && (
                          <View>
                            <Text style={styles.timelineSectionLabel}>A. Selection:</Text>
                            <Text style={styles.timelineSectionValue}>
                              {record!.preOpReason === 'Others' && record!.preOpOthers
                                ? `Others: ${record!.preOpOthers}`
                                : record!.preOpReason}
                            </Text>
                          </View>
                        )}
                        {record!.surgicalComplication && (
                          <View>
                            <Text style={styles.timelineSectionLabel}>B. Surgery:</Text>
                            <Text style={styles.timelineSectionValue}>
                              {record!.surgicalComplication === 'Others' && record!.surgicalOthers
                                ? `Others: ${record!.surgicalOthers}`
                                : record!.surgicalComplication}
                            </Text>
                          </View>
                        )}
                        {record!.pinholeImprovement && (
                          <View>
                            <Text style={styles.timelineSectionLabel}>C. Spectacles:</Text>
                            <Text style={styles.timelineSectionValue}>
                              {record!.pinholeImprovement === 'Yes' && record!.pinholeLineNumber
                                ? `Pinhole improvement: Yes, line ${record!.pinholeLineNumber}`
                                : `Pinhole improvement: ${record!.pinholeImprovement}`}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Recorded by */}
                    {record!.recordedBy && (
                      <Text style={styles.timelineRecordedBy}>
                        Recorded by {record!.recordedBy}
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.timelineNotDone}>Not yet completed</Text>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

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
  const [stage, setStage] = useState<ExtendedStage>('Day 1');
  const [healthPractitioner, setHealthPractitioner] = useState('');

  // First VA (for operated eye only — web's "First VA For Operated Eye")
  const [firstVA_Right, setFirstVA_Right] = useState('');
  const [firstVA_Left, setFirstVA_Left] = useState('');

  // Unaided VA — shown when First VA ≤ 6/18
  const [unaidedR, setUnaidedR] = useState('');
  const [unaidedL, setUnaidedL] = useState('');

  // Aided/Pinhole VA — shown when Unaided VA ≤ 6/18
  const [pinholeR, setPinholeR] = useState('');
  const [pinholeL, setPinholeL] = useState('');

  // REASONS A — Selection (preOpReason)
  const [preOpReason, setPreOpReason] = useState('');
  const [preOpOthers, setPreOpOthers] = useState('');

  // REASONS B — Surgery (surgicalComplication)
  const [surgicalComplication, setSurgicalComplication] = useState('');
  const [surgicalOthers, setSurgicalOthers] = useState('');

  // C — Spectacles (pinholeImprovement + pinholeLineNumber)
  const [pinholeImprovement, setPinholeImprovement] = useState('');
  const [pinholeLineNumber, setPinholeLineNumber] = useState('');

  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [sequelae, setSequelae] = useState<string[]>([]);
  const [sequelaeOthers, setSequelaeOthers] = useState('');
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

  useEffect(() => {
    if (surgery) { loadHistory(surgery.id); resetForm(); }
  }, [surgery?.id]);

  const loadHistory = async (sid: string) => {
    try {
      const res = (await api.postOps.list(sid)) as { data?: any[] };
      const mapped = (res.data ?? []).map(mapApiPostOpToUi);
      mapped.sort((a, b) => {
        const order: Record<string, number> = { 'Day 1': 1, 'Week 1': 2, 'Week 5': 3, 'Not Done': 4 };
        return (order[a.stage] ?? 99) - (order[b.stage] ?? 99);
      });
      setHistory(mapped);
    } catch { setHistory([]); }
  };

  const resetForm = () => {
    setStage('Day 1');
    setFirstVA_Right(''); setFirstVA_Left('');
    setUnaidedR(''); setUnaidedL('');
    setPinholeR(''); setPinholeL('');
    setPreOpReason(''); setPreOpOthers('');
    setSurgicalComplication(''); setSurgicalOthers('');
    setPinholeImprovement(''); setPinholeLineNumber('');
    setReason(''); setNotes('');
    setFollowUpDate(getTodayDate());
    setSequelae([]); setSequelaeOthers('');
    setErrors({}); setSuccess(''); setStageError('');
  };

  const hasStage = (s: string) => history.some(r => r.stage === s);

  const handleStageChange = (s: ExtendedStage) => {
    setStage(s);
    setFirstVA_Right(''); setFirstVA_Left('');
    setUnaidedR(''); setUnaidedL('');
    setPinholeR(''); setPinholeL('');
    setPreOpReason(''); setPreOpOthers('');
    setSurgicalComplication(''); setSurgicalOthers('');
    setPinholeImprovement(''); setPinholeLineNumber('');
    setErrors({});
    if (s === 'Week 1' && !hasStage('Day 1')) setStageError('Complete Day 1 first');
    else if (s === 'Week 5' && !hasStage('Week 1')) setStageError('Complete Week 1 first');
    else setStageError('');
  };

  const toggleSequela = (sq: string) => {
    setSequelae(prev =>
      prev.includes(sq) ? prev.filter(s => s !== sq) : [...prev, sq]
    );
  };

  // Visibility logic — matches web exactly
  const isNotDone = stage === 'Not Done';

  const showFirstVA_Right = !isNotDone && (surgery?.eyeOperated === 'Right' || surgery?.eyeOperated === 'Both');
  const showFirstVA_Left = !isNotDone && (surgery?.eyeOperated === 'Left' || surgery?.eyeOperated === 'Both');

  const showUnaidedRight = showFirstVA_Right && !!firstVA_Right && firstVA_Right !== 'Unable to determine' && isAtOrWorseThan(firstVA_Right, '6/18');
  const showUnaidedLeft = showFirstVA_Left && !!firstVA_Left && firstVA_Left !== 'Unable to determine' && isAtOrWorseThan(firstVA_Left, '6/18');
  const showUnaidedFields = showUnaidedRight || showUnaidedLeft;

  const showPinholeRight = showUnaidedRight && !!unaidedR && unaidedR !== 'Unable to determine' && isAtOrWorseThan(unaidedR, '6/18');
  const showPinholeLeft = showUnaidedLeft && !!unaidedL && unaidedL !== 'Unable to determine' && isAtOrWorseThan(unaidedL, '6/18');
  const showPinholeFields = showPinholeRight || showPinholeLeft;

  // Reasons A/B/C appear as soon as Unaided VA is selected (≤ 6/18),
  // or when First VA itself is ≤ 6/18 with no unaided step, matching web behaviour.
  // The "Severe Vision Loss" text area requires VA worse than 3/60.
  const requireReason = !isNotDone && (
    (showUnaidedRight && !!unaidedR && unaidedR !== 'Unable to determine') ||
    (showUnaidedLeft && !!unaidedL && unaidedL !== 'Unable to determine')
  );

  const requireSevereVisionText = !isNotDone && (
    (showPinholeRight && !!pinholeR && isWorseThan(pinholeR, '3/60')) ||
    (showPinholeLeft && !!pinholeL && isWorseThan(pinholeL, '3/60')) ||
    (!showPinholeRight && showUnaidedRight && !!unaidedR && isWorseThan(unaidedR, '3/60')) ||
    (!showPinholeLeft && showUnaidedLeft && !!unaidedL && isWorseThan(unaidedL, '3/60')) ||
    (!showUnaidedRight && showFirstVA_Right && !!firstVA_Right && isWorseThan(firstVA_Right, '3/60')) ||
    (!showUnaidedLeft && showFirstVA_Left && !!firstVA_Left && isWorseThan(firstVA_Left, '3/60'))
  );

  const hasPoorVision = !isNotDone && (
    (showPinholeRight && !!pinholeR && isAtOrWorseThan(pinholeR, '6/18')) ||
    (showPinholeLeft && !!pinholeL && isAtOrWorseThan(pinholeL, '6/18')) ||
    (!showPinholeRight && showUnaidedRight && !!unaidedR && isAtOrWorseThan(unaidedR, '6/18')) ||
    (!showPinholeLeft && showUnaidedLeft && !!unaidedL && isAtOrWorseThan(unaidedL, '6/18')) ||
    (!showUnaidedRight && showFirstVA_Right && !!firstVA_Right && isAtOrWorseThan(firstVA_Right, '6/18')) ||
    (!showUnaidedLeft && showFirstVA_Left && !!firstVA_Left && isAtOrWorseThan(firstVA_Left, '6/18'))
  );

  const handleSubmit = async () => {
    if (!surgery) return;
    const e: Record<string, string> = {};
    if (!healthPractitioner) e.healthPractitioner = 'Required';
    if (!isNotDone) {
      if (showFirstVA_Right && !firstVA_Right) e.firstVA_Right = 'Required';
      if (showFirstVA_Left && !firstVA_Left) e.firstVA_Left = 'Required';
      if (showUnaidedRight && !unaidedR) e.unaidedR = 'Required';
      if (showUnaidedLeft && !unaidedL) e.unaidedL = 'Required';
      if (showPinholeRight && !pinholeR) e.pinholeR = 'Required';
      if (showPinholeLeft && !pinholeL) e.pinholeL = 'Required';
      if (requireSevereVisionText && !reason.trim()) e.reason = 'Required for VA worse than 3/60';
    }
    if (stageError) e.stage = stageError;
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      const bestRight = pinholeR || unaidedR || firstVA_Right;
      const bestLeft = pinholeL || unaidedL || firstVA_Left;

      await api.postOps.create(surgery.id, {
        stage: mapStageToApi(stage as PostOpStage),
        followUpDate: new Date(followUpDate).toISOString(),
        healthPractitioner,
        firstVARight: firstVA_Right || undefined,
        firstVALeft: firstVA_Left || undefined,
        unaidedVARight: unaidedR || undefined,
        unaidedVALeft: unaidedL || undefined,
        pinholeVARight: pinholeR || undefined,
        pinholeVALeft: pinholeL || undefined,
        unaidedVA_Right: bestRight || undefined,
        unaidedVA_Left: bestLeft || undefined,
        reasonForPoorVision: requireSevereVisionText ? reason.trim() : undefined,
        preOpReason: requireReason ? preOpReason || undefined : undefined,
        preOpOthers: preOpReason === 'Others' ? preOpOthers.trim() : undefined,
        surgicalComplication: requireReason ? surgicalComplication || undefined : undefined,
        surgicalOthers: surgicalComplication === 'Others' ? surgicalOthers.trim() : undefined,
        pinholeImprovement: requireReason ? pinholeImprovement || undefined : undefined,
        pinholeLineNumber: pinholeImprovement === 'Yes' ? pinholeLineNumber || undefined : undefined,
        sequelae: stage === 'Week 5' ? sequelae : [],
        sequelaeOthers: stage === 'Week 5' && sequelae.includes('Others') ? sequelaeOthers.trim() : undefined,
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
                    <View style={styles.surgeryIcon}><Ionicons name="pulse" size={20} color={Colors.orange600} /></View>
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
                <Text style={styles.bannerPatient}>{patient.firstName} {(patient as any).surname ?? ''}</Text>
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
            {/* Follow-up Stage */}
            <Text style={styles.cardLabel}>Follow-up Stage *</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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

            {/* Health Practitioner */}
            <Text style={[styles.cardLabel, { marginTop: 16 }]}>Health Practitioner *</Text>
            <PickerModal
              label=""
              value={healthPractitioner}
              options={PRACTITIONER_OPTIONS}
              onChange={setHealthPractitioner}
              error={errors.healthPractitioner}
            />
          </View>

          {/* First VA For Operated Eye */}
          {!isNotDone && (showFirstVA_Right || showFirstVA_Left) && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>First VA For Operated Eye</Text>
              <View style={styles.row}>
                {showFirstVA_Right && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Right Eye (OD) *</Text>
                    <PickerModal label="" value={firstVA_Right} options={VA_OPTIONS} onChange={v => { setFirstVA_Right(v); setUnaidedR(''); setUnaidedL(''); setPinholeR(''); setPinholeL(''); }} error={errors.firstVA_Right} />
                  </View>
                )}
                {showFirstVA_Left && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Left Eye (OS) *</Text>
                    <PickerModal label="" value={firstVA_Left} options={VA_OPTIONS} onChange={v => { setFirstVA_Left(v); setUnaidedR(''); setUnaidedL(''); setPinholeR(''); setPinholeL(''); }} error={errors.firstVA_Left} />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Unaided VA */}
          {showUnaidedFields && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Unaided VA</Text>
              <View style={styles.row}>
                {showUnaidedRight && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Right Eye (OD) *</Text>
                    <PickerModal label="" value={unaidedR} options={VA_OPTIONS} onChange={v => { setUnaidedR(v); setPinholeR(''); setPinholeL(''); }} error={errors.unaidedR} />
                  </View>
                )}
                {showUnaidedLeft && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Left Eye (OS) *</Text>
                    <PickerModal label="" value={unaidedL} options={VA_OPTIONS} onChange={v => { setUnaidedL(v); setPinholeR(''); setPinholeL(''); }} error={errors.unaidedL} />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Aided VA prompt */}
          {showUnaidedFields && (showUnaidedRight || showUnaidedLeft) && (
            <View style={styles.promptBox}>
              <Ionicons name="information-circle" size={16} color={Colors.orange400} />
              <Text style={styles.promptText}>
                Unaided VA is worse than 6/18. Please record <Text style={{ fontWeight: '700' }}>Aided VA</Text>.
              </Text>
            </View>
          )}

          {/* Aided / Pinhole VA */}
          {showPinholeFields && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Aided Visual Acuity</Text>
              <View style={styles.row}>
                {showPinholeRight && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Right Eye (OD) *</Text>
                    <PickerModal label="" value={pinholeR} options={VA_OPTIONS} onChange={setPinholeR} error={errors.pinholeR} />
                  </View>
                )}
                {showPinholeLeft && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Left Eye (OS) *</Text>
                    <PickerModal label="" value={pinholeL} options={VA_OPTIONS} onChange={setPinholeL} error={errors.pinholeL} />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* REASONS A — Selection */}
          {requireReason && (
            <View style={styles.reasonBoxBlue}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Ionicons name="information-circle" size={18} color="#2563EB" />
                <Text style={styles.reasonTitleBlue}>REASONS - A. Selection</Text>
              </View>
              <Text style={styles.reasonSubLabel}>Select pre-operative reason:</Text>
              <PickerModal label="" value={preOpReason} options={SELECTION_REASONS} onChange={setPreOpReason} error={errors.preOpReason} />
              {preOpReason === 'Others' && (
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={styles.textArea}
                    value={preOpOthers}
                    onChangeText={setPreOpOthers}
                    placeholder="Enter other pre-operative reason(s)..."
                    placeholderTextColor={Colors.gray400}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              )}
            </View>
          )}

          {/* REASONS B — Surgery */}
          {requireReason && (
            <View style={styles.reasonBoxPurple}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Ionicons name="warning" size={18} color="#7C3AED" />
                <Text style={styles.reasonTitlePurple}>REASONS - B. Surgery</Text>
              </View>
              <Text style={styles.reasonSubLabel}>Select surgical complication:</Text>
              <PickerModal label="" value={surgicalComplication} options={SURGICAL_COMPLICATION_REASONS} onChange={setSurgicalComplication} error={errors.surgicalComplication} />
              {surgicalComplication === 'Others' && (
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={styles.textArea}
                    value={surgicalOthers}
                    onChangeText={setSurgicalOthers}
                    placeholder="Enter other surgical complication(s)..."
                    placeholderTextColor={Colors.gray400}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              )}
            </View>
          )}

          {/* C. Spectacles */}
          {requireReason && (
            <View style={styles.reasonBoxGreen}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Ionicons name="information-circle" size={18} color="#059669" />
                <Text style={styles.reasonTitleGreen}>C. Spectacles</Text>
              </View>
              <Text style={styles.reasonSubLabel}>Pinhole improvement:</Text>
              <View style={{ flexDirection: 'row', gap: 20, marginVertical: 8 }}>
                {['Yes', 'No'].map(opt => (
                  <TouchableOpacity key={opt} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} onPress={() => { setPinholeImprovement(opt); setPinholeLineNumber(''); }}>
                    <View style={[styles.radio, pinholeImprovement === opt && styles.radioGreen]} />
                    <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.gray700 }}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {errors.pinholeImprovement ? <Text style={styles.error}>{errors.pinholeImprovement}</Text> : null}
              {pinholeImprovement === 'Yes' && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.reasonSubLabel}>Select line number:</Text>
                  <PickerModal
                    label=""
                    value={pinholeLineNumber}
                    options={[{ label: 'Select line number', value: '' }, ...LINE_NUMBER_OPTIONS]}
                    onChange={setPinholeLineNumber}
                    error={errors.pinholeLineNumber}
                  />
                </View>
              )}
            </View>
          )}

          {/* Reason for Poor Vision — only when VA worse than 3/60 */}
          {requireSevereVisionText && (
            <View style={[styles.card, { backgroundColor: Colors.red50, borderColor: Colors.red200 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="alert-circle" size={18} color={Colors.red600} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.red900 }}>Severe Vision Loss Detected</Text>
              </View>
              <Text style={styles.cardLabel}>
                For person from 3/60 to NPL, tell the reason for the poor vision (VA) *
              </Text>
              <TextInput
                style={[styles.textArea, errors.reason ? { borderColor: Colors.red300 } : null]}
                value={reason}
                onChangeText={setReason}
                placeholder="E.g., Posterior capsule opacity, corneal edema..."
                placeholderTextColor={Colors.gray400}
                multiline
                textAlignVertical="top"
              />
              {errors.reason ? <Text style={styles.error}>{errors.reason}</Text> : null}
            </View>
          )}

          {/* D. Sequelae — Week 5 + hasPoorVision */}
          {stage === 'Week 5' && hasPoorVision && (
            <View style={styles.sequelaeBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="warning" size={18} color="#D97706" />
                <Text style={styles.seqTitle}>D. Sequelae</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#92400E', marginBottom: 12 }}>
                Select any post-operative complications observed:
              </Text>
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
              {sequelae.includes('Others') && (
                <View style={{ marginTop: 10 }}>
                  <TextInput
                    style={styles.textArea}
                    value={sequelaeOthers}
                    onChangeText={setSequelaeOthers}
                    placeholder="Please specify other complications..."
                    placeholderTextColor={Colors.gray400}
                    multiline
                    textAlignVertical="top"
                  />
                  {errors.sequelaeOthers ? <Text style={styles.error}>{errors.sequelaeOthers}</Text> : null}
                </View>
              )}
            </View>
          )}

          {/* Notes */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Additional Notes (Optional)</Text>
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
            {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Record Follow-up</Text>}
          </TouchableOpacity>

          {/* ── Follow-up Timeline — matches web PostOpHistoryTimeline ── */}
          <View style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Follow-up Timeline</Text>
              <View style={styles.historyBadge}>
                <Text style={styles.historyBadgeText}>
                  {history.filter(r => TIMELINE_STAGES.includes(r.stage)).length} / 3 Completed
                </Text>
              </View>
            </View>
            <View style={{ padding: 16 }}>
              <PostOpHistoryTimeline records={history} />
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 40 },
  stepLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.gray900 },
  surgeryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray100, marginBottom: 8 },
  surgeryIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.orange50, alignItems: 'center', justifyContent: 'center' },
  surgeryName: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  surgeryMeta: { fontSize: 12, color: Colors.gray500, marginTop: 1 },
  emptyBox: { alignItems: 'center', paddingVertical: 32, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray100 },
  emptyText: { fontSize: 13, color: Colors.gray500, marginTop: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.orange50, borderWidth: 1, borderColor: Colors.orange200, borderRadius: 14, padding: 14, marginTop: 12 },
  bannerPatient: { fontSize: 14, fontWeight: '700', color: Colors.orange900, marginBottom: 1 },
  bannerTitle: { fontSize: 13, fontWeight: '600', color: Colors.orange900 },
  bannerSub: { fontSize: 11, color: Colors.orange700, marginTop: 2 },
  bannerChange: { backgroundColor: Colors.orange100, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  bannerChangeText: { fontSize: 11, fontWeight: '600', color: Colors.orange600 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.green50, padding: 14, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.green100 },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500' },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },
  cardLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 8 },
  stageChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white },
  stageChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  stageText: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  stageTextActive: { color: Colors.white },
  error: { fontSize: 11, color: Colors.red500, marginTop: 4 },
  dateInput: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.gray900 },
  row: { flexDirection: 'row', gap: 12 },
  eyeLabel: { fontSize: 11, color: Colors.gray500, marginBottom: 4, fontWeight: '600' },
  promptBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.orange50, borderRadius: 0, borderLeftWidth: 4, borderLeftColor: Colors.orange400, padding: 12, marginTop: 8 },
  promptText: { fontSize: 12, color: Colors.orange700, flex: 1 },
  reasonBoxBlue: { backgroundColor: '#EFF6FF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#BFDBFE', marginTop: 12 },
  reasonTitleBlue: { fontSize: 14, fontWeight: '700', color: '#1E3A8A' },
  reasonBoxPurple: { backgroundColor: '#F5F3FF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#DDD6FE', marginTop: 12 },
  reasonTitlePurple: { fontSize: 14, fontWeight: '700', color: '#4C1D95' },
  reasonBoxGreen: { backgroundColor: '#F0FDF4', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#BBF7D0', marginTop: 12 },
  reasonTitleGreen: { fontSize: 14, fontWeight: '700', color: '#064E3B' },
  reasonSubLabel: { fontSize: 12, fontWeight: '500', color: Colors.gray700, marginBottom: 6 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.gray400 },
  radioGreen: { borderColor: '#059669', backgroundColor: '#059669' },
  textArea: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, padding: 14, minHeight: 70, fontSize: 15, color: Colors.gray900 },
  sequelaeBox: { backgroundColor: '#FFFBEB', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#FDE68A', marginTop: 12 },
  seqTitle: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  seqChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white },
  seqChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  seqText: { fontSize: 12, color: Colors.gray700 },
  seqTextActive: { color: Colors.white },
  submitBtn: { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },

  // ── Timeline styles (matching web PostOpHistoryTimeline) ──
  historyCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100, marginTop: 16 },
  historyHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },

  timelineEmpty: { alignItems: 'center', paddingVertical: 40, borderWidth: 1, borderColor: Colors.gray200, borderStyle: 'dashed', borderRadius: 12, backgroundColor: Colors.gray50 },
  timelineEmptyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900, marginTop: 8 },
  timelineEmptyText: { fontSize: 13, color: Colors.gray500, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },

  timelineDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  timelineDotDone: { backgroundColor: '#F0FDF4', borderColor: '#22C55E' },
  timelineDotPending: { backgroundColor: Colors.gray50, borderColor: Colors.gray300 },
  timelineConnector: { width: 2, flex: 1, marginVertical: 2, minHeight: 20 },

  timelineCard: { borderRadius: 12, padding: 14, borderWidth: 2 },
  timelineCardDone: { backgroundColor: Colors.white, borderColor: '#BBF7D0' },
  timelineCardPending: { backgroundColor: Colors.gray50, borderColor: Colors.gray200, borderStyle: 'dashed' },

  timelineCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  timelineStageTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  timelineDate: { fontSize: 12, color: Colors.gray500 },
  timelineNotDone: { fontSize: 13, color: Colors.gray500 },

  vaGrid: { flexDirection: 'row', gap: 12 },
  eyeColLabel: { fontSize: 11, fontWeight: '600', color: Colors.gray500, marginBottom: 6 },
  vaBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  vaBadgeText: { fontSize: 11, fontWeight: '700' },

  timelineSection: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray200 },
  timelineSectionLabel: { fontSize: 11, fontWeight: '600', color: Colors.gray500, marginBottom: 2 },
  timelineSectionValue: { fontSize: 13, color: Colors.gray700 },
  timelineRecordedBy: { fontSize: 11, color: Colors.gray400, marginTop: 4 },

  seqBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  seqBadgeGreen: { backgroundColor: '#DCFCE7' },
  seqBadgeRed: { backgroundColor: '#FEE2E2' },
  seqBadgeText: { fontSize: 11, fontWeight: '500' },
});