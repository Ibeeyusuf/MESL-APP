import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { PickerModal } from '@/components/PickerModal';
import { api } from '@/services/api';
import {
  WHO_VA_SCALE, isWorseThan, mapApiSurgeryToUi, mapApiPostOpToUi,
  mapStageToApi, getTodayDate, mapApiPatientToUi,
} from '@/utils/helpers';
import type { Patient, SurgeryRecord, PostOperativeRecord, PostOpStage } from '@/types';

// Includes placeholder + WHO scale
const VA_OPTIONS = [
  { label: '-- Select --', value: '' },
  { label: 'Unable to determine', value: 'Unable to determine' },
  ...WHO_VA_SCALE.map(v => ({ label: v, value: v })),
];

// Stages
type ExtendedStage = PostOpStage | 'Not Done';
const STAGES: ExtendedStage[] = ['Day 1', 'Week 1', 'Week 5', 'Not Done'];

// Health Practitioner
const PRACTITIONER_OPTIONS = [
  { label: 'Select practitioner', value: '' },
  { label: 'Ibrahim Wambai', value: 'Ibrahim Wambai' },
  { label: 'Nasiru Usman', value: 'Nasiru Usman' },
  { label: 'Adamu Mohammed', value: 'Adamu Mohammed' },
  { label: 'Murtala Umar', value: 'Murtala Umar' },
];

// Sequelae options
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

// REASONS A
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

// REASONS B
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

// Line numbers
const LINE_NUMBER_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  label: String(i + 1),
  value: String(i + 1),
}));

// Helper functions
function isAtOrWorseThan(va: string, threshold: string): boolean {
  if (va === 'Unable to determine' || !va) return false;
  return isWorseThan(va, threshold) || va === threshold;
}

function getVAColor(va?: string): { bg: string; text: string; border: string } {
  if (!va || va === 'Unable to determine') return { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB' };
  if (va === '6/6' || va === '6/9') return { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' };
  if (isAtOrWorseThan(va, '6/18') && !isAtOrWorseThan(va, '3/60')) return { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' };
  if (isAtOrWorseThan(va, '3/60')) return { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' };
  return { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' };
}

const TIMELINE_STAGES = ['Day 1', 'Week 1', 'Week 5'];

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

function VABadge({ label, va }: { label: string; va?: string }) {
  if (!va) return null;
  const c = getVAColor(va);
  return (
    <View style={[styles.vaBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.vaBadgeText, { color: c.text }]}>{label}: {va}</Text>
    </View>
  );
}

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
          <View key={stage} style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
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

            <View style={{ flex: 1 }}>
              <View style={[
                styles.timelineCard,
                isCompleted ? styles.timelineCardDone : styles.timelineCardPending,
              ]}>
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
                    <View style={styles.vaGrid}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eyeColLabel}>Right Eye (OD)</Text>
                        <View style={{ gap: 4 }}>
                          {record!.firstVARight && <VABadge label="First" va={record!.firstVARight} />}
                          <VABadge label="Unaided" va={record!.unaidedVA_Right} />
                          {record!.pinholeVA_Right && <VABadge label="Aided" va={record!.pinholeVA_Right} />}
                          {!record!.pinholeVA_Right && record!.aidedVA_Right && <VABadge label="Aided" va={record!.aidedVA_Right} />}
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eyeColLabel}>Left Eye (OS)</Text>
                        <View style={{ gap: 4 }}>
                          {record!.firstVALeft && <VABadge label="First" va={record!.firstVALeft} />}
                          <VABadge label="Unaided" va={record!.unaidedVA_Left} />
                          {record!.pinholeVA_Left && <VABadge label="Aided" va={record!.pinholeVA_Left} />}
                          {!record!.pinholeVA_Left && record!.aidedVA_Left && <VABadge label="Aided" va={record!.aidedVA_Left} />}
                        </View>
                      </View>
                    </View>

                    {record!.sequelae && record!.sequelae.length > 0 && (
                      <View style={styles.timelineSection}>
                        <Text style={styles.timelineSectionLabel}>Sequelae:</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {record!.sequelae.map(s => (
                            <View key={s} style={[styles.seqBadge, s === 'None' ? styles.seqBadgeGreen : styles.seqBadgeRed]}>
                              <Text style={[styles.seqBadgeText, s === 'None' ? { color: '#166534' } : { color: '#991B1B' }]}>{s}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {record!.reasonForPoorVision && (
                      <View style={styles.timelineSection}>
                        <Text style={styles.timelineSectionLabel}>Reason for Poor Vision:</Text>
                        <Text style={styles.timelineSectionValue}>{record!.reasonForPoorVision}</Text>
                      </View>
                    )}

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

                    {record!.recordedBy && (
                      <Text style={styles.timelineRecordedBy}>Recorded by {record!.recordedBy}</Text>
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

// Main component
export default function PostOpScreen() {
  const { user } = useAuth();

  useEffect(() => {
    if (user && user.role !== 'Doctor') router.replace('/(tabs)/');
  }, [user]);

  // State for surgeries list (loaded from all patients)
  const [allSurgeries, setAllSurgeries] = useState<SurgeryRecord[]>([]);
  const [patientsById, setPatientsById] = useState<Record<string, Patient>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadSummary, setLoadSummary] = useState<{ patients: number; surgeries: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected surgery and form state
  const [selectedSurgery, setSelectedSurgery] = useState<SurgeryRecord | null>(null);
  const [stage, setStage] = useState<ExtendedStage>('Day 1');
  const [healthPractitioner, setHealthPractitioner] = useState('');
  
  // VA fields
  const [firstVA_Right, setFirstVA_Right] = useState('');
  const [firstVA_Left, setFirstVA_Left] = useState('');
  const [unaidedR, setUnaidedR] = useState('');
  const [unaidedL, setUnaidedL] = useState('');
  const [pinholeR, setPinholeR] = useState('');
  const [pinholeL, setPinholeL] = useState('');
  
  // Reasons
  const [preOpReason, setPreOpReason] = useState('');
  const [preOpOthers, setPreOpOthers] = useState('');
  const [surgicalComplication, setSurgicalComplication] = useState('');
  const [surgicalOthers, setSurgicalOthers] = useState('');
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

  // Load all surgeries from all patients (matching web version)
  // Load all surgeries from all patients (matching web version)
useEffect(() => {
  const loadAllSurgeries = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // Fetch all patients with pagination (API limit is 100)
      let allPatients: Patient[] = [];
      let page = 1;
      const limit = 100;
      let hasMore = true;
      
      while (hasMore) {
        const response = (await api.patients.list(`limit=${limit}&page=${page}`)) as { data?: any[] };
        const patients = (response.data || []).map(mapApiPatientToUi);
        
        if (patients.length === 0) {
          hasMore = false;
        } else {
          allPatients = [...allPatients, ...patients];
          page++;
          // If we got less than the limit, this is the last page
          if (patients.length < limit) {
            hasMore = false;
          }
        }
      }
      
      console.log(`Loaded ${allPatients.length} patients`);
      
      // Build patients lookup for quick name/code access
      const byId: Record<string, Patient> = {};
      allPatients.forEach(p => { byId[p.id] = p; });
      setPatientsById(byId);
      
      // Fetch surgeries for each patient (no pagination needed for surgeries per patient)
      const allSurgeryPromises = allPatients.map(async (patient) => {
        try {
          const response = (await api.surgeries.list(patient.id)) as { data?: any[] };
          const surgeries = (response.data || []).map(mapApiSurgeryToUi);
          // Attach patient info to each surgery for easier access
          return surgeries.map((surgery: SurgeryRecord) => ({
            ...surgery,
            patientName: `${patient.firstName} ${patient.surname || ''}`,
            patientCode: patient.patientCode || patient.id,
          }));
        } catch (error) {
          console.error(`Error fetching surgeries for patient ${patient.id}:`, error);
          return [];
        }
      });
      
      const surgeriesArrays = await Promise.all(allSurgeryPromises);
      const flattened = surgeriesArrays
        .flat()
        .sort((a: SurgeryRecord, b: SurgeryRecord) => new Date(b.surgeryDate).getTime() - new Date(a.surgeryDate).getTime());
      
      console.log(`Loaded ${flattened.length} surgeries`);
      setAllSurgeries(flattened);
      setLoadSummary({ patients: allPatients.length, surgeries: flattened.length });
    } catch (error) {
      console.error('Failed to load surgeries:', error);
      Alert.alert('Error', 'Failed to load surgeries. Please try again.');
      setAllSurgeries([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  loadAllSurgeries();
}, [user]);

  // Load post-op history when surgery is selected
  useEffect(() => {
    if (selectedSurgery) {
      loadHistory(selectedSurgery.id);
      resetForm();
    }
  }, [selectedSurgery?.id]);

  const loadHistory = async (surgeryId: string) => {
    try {
      const res = (await api.postOps.list(surgeryId)) as any[] | { data?: any[] };
      const records = Array.isArray(res) ? res : (res.data ?? []);
      const mapped = records.map(mapApiPostOpToUi);
      mapped.sort((a, b) => {
        const order: Record<string, number> = { 'Day 1': 1, 'Week 1': 2, 'Week 5': 3 };
        return (order[a.stage] ?? 99) - (order[b.stage] ?? 99);
      });
      setHistory(mapped);
    } catch (error) {
      console.error('Failed to load post-op history:', error);
      setHistory([]);
    }
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

  const getPatientName = (patientId: string) => {
    const patient = patientsById[patientId];
    return patient ? `${patient.firstName} ${patient.surname || ''}` : 'Unknown Patient';
  };

  const getPatientCode = (patientId: string) => {
    const patient = patientsById[patientId];
    return patient?.patientCode || patientId;
  };

  // Filter surgeries based on search
  const filteredSurgeries = useMemo(() => {
    if (!searchQuery.trim()) return allSurgeries;
    const query = searchQuery.toLowerCase();
    return allSurgeries.filter(surgery => {
      const patientName = getPatientName(surgery.patientId).toLowerCase();
      const patientCode = getPatientCode(surgery.patientId).toLowerCase();
      const procedure = surgery.procedureType.toLowerCase();
      const eye = surgery.eyeOperated.toLowerCase();
      const date = new Date(surgery.surgeryDate).toLocaleDateString().toLowerCase();
      
      return patientName.includes(query) || 
             patientCode.includes(query) || 
             procedure.includes(query) || 
             eye.includes(query) || 
             date.includes(query) ||
             surgery.id.toLowerCase().includes(query);
    });
  }, [searchQuery, allSurgeries, patientsById]);

  // Visibility logic
  const isNotDone = stage === 'Not Done';
  const showFirstVA_Right = !isNotDone && (selectedSurgery?.eyeOperated === 'Right' || selectedSurgery?.eyeOperated === 'Both');
  const showFirstVA_Left = !isNotDone && (selectedSurgery?.eyeOperated === 'Left' || selectedSurgery?.eyeOperated === 'Both');
  
  const showUnaidedRight = showFirstVA_Right && !!firstVA_Right && firstVA_Right !== 'Unable to determine' && isAtOrWorseThan(firstVA_Right, '6/18');
  const showUnaidedLeft = showFirstVA_Left && !!firstVA_Left && firstVA_Left !== 'Unable to determine' && isAtOrWorseThan(firstVA_Left, '6/18');
  const showUnaidedFields = showUnaidedRight || showUnaidedLeft;
  
  const showPinholeRight = showUnaidedRight && !!unaidedR && unaidedR !== 'Unable to determine' && isAtOrWorseThan(unaidedR, '6/18');
  const showPinholeLeft = showUnaidedLeft && !!unaidedL && unaidedL !== 'Unable to determine' && isAtOrWorseThan(unaidedL, '6/18');
  const showPinholeFields = showPinholeRight || showPinholeLeft;
  
  const requireReason = !isNotDone && (
    (showUnaidedRight && !!unaidedR && unaidedR !== 'Unable to determine') ||
    (showUnaidedLeft && !!unaidedL && unaidedL !== 'Unable to determine') ||
    (!showUnaidedRight && showFirstVA_Right && !!firstVA_Right && firstVA_Right !== 'Unable to determine' && isAtOrWorseThan(firstVA_Right, '6/18')) ||
    (!showUnaidedLeft && showFirstVA_Left && !!firstVA_Left && firstVA_Left !== 'Unable to determine' && isAtOrWorseThan(firstVA_Left, '6/18'))
  );
  
  const bestRightVA = pinholeR || unaidedR || firstVA_Right;
  const bestLeftVA = pinholeL || unaidedL || firstVA_Left;
  const requireSevereVisionText = !isNotDone && (
    (bestRightVA && bestRightVA !== 'Unable to determine' && isWorseThan(bestRightVA, '3/60')) ||
    (bestLeftVA && bestLeftVA !== 'Unable to determine' && isWorseThan(bestLeftVA, '3/60'))
  );
  
  const hasPoorVision = !isNotDone && (
    (bestRightVA && bestRightVA !== 'Unable to determine' && isAtOrWorseThan(bestRightVA, '6/18')) ||
    (bestLeftVA && bestLeftVA !== 'Unable to determine' && isAtOrWorseThan(bestLeftVA, '6/18'))
  );

  const handleSubmit = async () => {
    if (!selectedSurgery) return;
    const e: Record<string, string> = {};
    
    if (!healthPractitioner) e.healthPractitioner = 'Required';
    if (!followUpDate) e.followUpDate = 'Required';
    
    if (!isNotDone) {
      if (showFirstVA_Right && !firstVA_Right) e.firstVA_Right = 'Required';
      if (showFirstVA_Left && !firstVA_Left) e.firstVA_Left = 'Required';
      if (showUnaidedRight && !unaidedR) e.unaidedR = 'Required';
      if (showUnaidedLeft && !unaidedL) e.unaidedL = 'Required';
      if (showPinholeRight && !pinholeR) e.pinholeR = 'Required';
      if (showPinholeLeft && !pinholeL) e.pinholeL = 'Required';
      if (requireReason && !preOpReason) e.preOpReason = 'Required';
      if (requireReason && !surgicalComplication) e.surgicalComplication = 'Required';
      if (requireReason && !pinholeImprovement) e.pinholeImprovement = 'Required';
      if (requireReason && pinholeImprovement === 'Yes' && !pinholeLineNumber) e.pinholeLineNumber = 'Required';
      if (requireSevereVisionText && !reason.trim()) e.reason = 'Required for VA worse than 3/60';
    }
    
    if (stageError) e.stage = stageError;
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      await api.postOps.create(selectedSurgery.id, {
        stage: mapStageToApi(stage as PostOpStage),
        followUpDate: new Date(followUpDate).toISOString(),
        healthPractitioner,
        firstVARight: firstVA_Right || undefined,
        firstVALeft: firstVA_Left || undefined,
        unaidedVARight: unaidedR || undefined,
        unaidedVALeft: unaidedL || undefined,
        pinholeVARight: pinholeR || undefined,
        pinholeVALeft: pinholeL || undefined,
        reasonForPoorVision: requireSevereVisionText ? reason.trim() : undefined,
        preOpReason: requireReason ? (preOpReason || undefined) : undefined,
        preOpOthers: preOpReason === 'Others' ? preOpOthers.trim() : undefined,
        surgicalComplication: requireReason ? (surgicalComplication || undefined) : undefined,
        surgicalOthers: surgicalComplication === 'Others' ? surgicalOthers.trim() : undefined,
        pinholeImprovement: requireReason ? (pinholeImprovement || undefined) : undefined,
        pinholeLineNumber: pinholeImprovement === 'Yes' ? pinholeLineNumber : undefined,
        sequelae: stage === 'Week 5' && hasPoorVision ? sequelae : [],
        sequelaeOthers: stage === 'Week 5' && sequelae.includes('Others') ? sequelaeOthers.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      await loadHistory(selectedSurgery.id);
      setSuccess(`${stage} follow-up recorded`);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally { setSubmitting(false); }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.orange600} />
        <Text style={styles.loadingText}>Loading surgeries...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.pageTitle}>Post-Operative Follow-up</Text>
        <Text style={styles.pageSubtitle}>Track patient recovery with Day 1, Week 1, and Week 5 assessments.</Text>
      </View>

      {/* Surgery Selection Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Select Surgery</Text>
        {loadSummary && (
          <Text style={styles.summaryText}>
            Loaded {loadSummary.surgeries} surgery record(s) from {loadSummary.patients} patient(s)
          </Text>
        )}

        {selectedSurgery ? (
          <View style={styles.selectedSurgeryCard}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={styles.selectedSurgeryName}>{getPatientName(selectedSurgery.patientId)}</Text>
                <View style={styles.patientCodeBadge}>
                  <Text style={styles.patientCodeText}>{getPatientCode(selectedSurgery.patientId)}</Text>
                </View>
              </View>
              <Text style={styles.selectedSurgeryDetails}>
                {selectedSurgery.procedureType} · {selectedSurgery.eyeOperated} · {new Date(selectedSurgery.surgeryDate).toLocaleDateString()}
              </Text>
            </View>
            <TouchableOpacity style={styles.changeButton} onPress={() => setSelectedSurgery(null)}>
              <Text style={styles.changeButtonText}>Change Surgery</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color={Colors.gray400} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by patient name, patient code, or surgery ID..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor={Colors.gray400}
              />
            </View>
            <ScrollView style={styles.surgeryList} nestedScrollEnabled={true}>
              {filteredSurgeries.map(surgery => (
                <TouchableOpacity
                  key={surgery.id}
                  style={styles.surgeryItem}
                  onPress={() => setSelectedSurgery(surgery)}
                >
                  <View>
                    <Text style={styles.surgeryItemName}>{getPatientName(surgery.patientId)}</Text>
                    <Text style={styles.surgeryItemDetails}>
                      {surgery.procedureType} · {surgery.eyeOperated}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={styles.surgeryCodeBadge}>
                      <Text style={styles.surgeryCodeText}>{getPatientCode(surgery.patientId)}</Text>
                    </View>
                    <Text style={styles.surgeryDateText}>{new Date(surgery.surgeryDate).toLocaleDateString()}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {filteredSurgeries.length === 0 && (
                <View style={styles.noResultsContainer}>
                  <Text style={styles.noResultsText}>No surgeries found</Text>
                </View>
              )}
            </ScrollView>
          </>
        )}
      </View>

      {/* Post-Op Form - Only shown when a surgery is selected */}
      {selectedSurgery && (
        <>
          {success && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.green700} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Follow-up Stage *</Text>
            <View style={styles.stageRow}>
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
            {(errors.stage || stageError) && <Text style={styles.error}>{errors.stage || stageError}</Text>}

            <Text style={[styles.cardLabel, { marginTop: 16 }]}>Follow-up Date *</Text>
            <TextInput
              style={[styles.dateInput, errors.followUpDate && { borderColor: Colors.red300 }]}
              value={followUpDate}
              onChangeText={setFollowUpDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.gray400}
            />
            {errors.followUpDate && <Text style={styles.error}>{errors.followUpDate}</Text>}

            <Text style={[styles.cardLabel, { marginTop: 16 }]}>Health Practitioner *</Text>
            <PickerModal
              label=""
              value={healthPractitioner}
              options={PRACTITIONER_OPTIONS}
              onChange={setHealthPractitioner}
              error={errors.healthPractitioner}
            />
          </View>

          {/* First VA */}
          {!isNotDone && (showFirstVA_Right || showFirstVA_Left) && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>First VA For Operated Eye</Text>
              <View style={styles.row}>
                {showFirstVA_Right && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Right Eye (OD) *</Text>
                    <PickerModal label="" value={firstVA_Right} options={VA_OPTIONS} onChange={setFirstVA_Right} error={errors.firstVA_Right} />
                  </View>
                )}
                {showFirstVA_Left && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Left Eye (OS) *</Text>
                    <PickerModal label="" value={firstVA_Left} options={VA_OPTIONS} onChange={setFirstVA_Left} error={errors.firstVA_Left} />
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
                    <PickerModal label="" value={unaidedR} options={VA_OPTIONS} onChange={setUnaidedR} error={errors.unaidedR} />
                  </View>
                )}
                {showUnaidedLeft && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyeLabel}>Left Eye (OS) *</Text>
                    <PickerModal label="" value={unaidedL} options={VA_OPTIONS} onChange={setUnaidedL} error={errors.unaidedL} />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Unaided VA prompt */}
          {showUnaidedFields && (
            <View style={styles.promptBox}>
              <Ionicons name="information-circle" size={16} color={Colors.orange500} />
              <Text style={styles.promptText}>
                Unaided VA is worse than 6/18. Please record <Text style={{ fontWeight: '700' }}>Aided VA</Text>.
              </Text>
            </View>
          )}

          {/* Aided VA */}
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

          {/* REASONS A */}
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
                  <TextInput style={styles.textArea} value={preOpOthers} onChangeText={setPreOpOthers} placeholder="Enter other pre-operative reason(s)..." multiline textAlignVertical="top" />
                </View>
              )}
            </View>
          )}

          {/* REASONS B */}
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
                  <TextInput style={styles.textArea} value={surgicalOthers} onChangeText={setSurgicalOthers} placeholder="Enter other surgical complication(s)..." multiline textAlignVertical="top" />
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
              {errors.pinholeImprovement && <Text style={styles.error}>{errors.pinholeImprovement}</Text>}
              {pinholeImprovement === 'Yes' && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.reasonSubLabel}>Select line number:</Text>
                  <PickerModal label="" value={pinholeLineNumber} options={[{ label: 'Select line number', value: '' }, ...LINE_NUMBER_OPTIONS]} onChange={setPinholeLineNumber} error={errors.pinholeLineNumber} />
                </View>
              )}
            </View>
          )}

          {/* Severe Vision Loss */}
          {requireSevereVisionText && (
            <View style={[styles.card, { backgroundColor: Colors.red50, borderColor: Colors.red300 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="alert-circle" size={18} color={Colors.red600} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#7f1d1d' }}>Severe Vision Loss Detected</Text>
              </View>
              <Text style={styles.cardLabel}>For person from 3/60 to NPL, tell the reason for the poor vision (VA) *</Text>
              <TextInput style={[styles.textArea, errors.reason && { borderColor: Colors.red300 }]} value={reason} onChangeText={setReason} placeholder="E.g., Posterior capsule opacity, corneal edema..." multiline textAlignVertical="top" />
              {errors.reason && <Text style={styles.error}>{errors.reason}</Text>}
            </View>
          )}

          {/* Sequelae - Week 5 */}
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
                  <TouchableOpacity key={sq} style={[styles.seqChip, sequelae.includes(sq) && styles.seqChipActive]} onPress={() => toggleSequela(sq)}>
                    <Text style={[styles.seqText, sequelae.includes(sq) && styles.seqTextActive]}>{sq}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {sequelae.includes('Others') && (
                <View style={{ marginTop: 10 }}>
                  <TextInput style={styles.textArea} value={sequelaeOthers} onChangeText={setSequelaeOthers} placeholder="Please specify other complications..." multiline textAlignVertical="top" />
                </View>
              )}
            </View>
          )}

          {/* Notes */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Additional Notes (Optional)</Text>
            <TextInput style={styles.textArea} value={notes} onChangeText={setNotes} placeholder="Any other observations..." multiline textAlignVertical="top" />
          </View>

          <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Record Follow-up</Text>}
          </TouchableOpacity>

          {/* Timeline */}
          <View style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>{getPatientName(selectedSurgery.patientId)} Follow-up Timeline</Text>
              <View style={styles.historyBadge}>
                <Text style={styles.historyBadgeText}>{history.filter(r => TIMELINE_STAGES.includes(r.stage)).length} / 3 Completed</Text>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray50 },
  loadingText: { marginTop: 12, fontSize: 14, color: Colors.gray600 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: Colors.gray900 },
  pageSubtitle: { fontSize: 13, color: Colors.gray500, marginTop: 2 },
  
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginTop: 12 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.gray900, marginBottom: 8 },
  summaryText: { fontSize: 11, color: Colors.gray500, marginBottom: 12 },
  
  selectedSurgeryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.orange50, borderWidth: 1, borderColor: Colors.orange200, borderRadius: 12, padding: 12 },
  selectedSurgeryName: { fontSize: 14, fontWeight: '700', color: Colors.orange900 },
  selectedSurgeryDetails: { fontSize: 12, color: Colors.orange700, marginTop: 2 },
  changeButton: { backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.gray300 },
  changeButtonText: { fontSize: 12, fontWeight: '500', color: Colors.gray700 },
  
  searchContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Colors.gray300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.gray900 },
  
  surgeryList: { maxHeight: 400 },
  surgeryItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  surgeryItemName: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  surgeryItemDetails: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  surgeryCodeBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginBottom: 4 },
  surgeryCodeText: { fontSize: 10, fontWeight: '600', color: Colors.gray600 },
  surgeryDateText: { fontSize: 11, color: Colors.gray400 },
  
  patientCodeBadge: { backgroundColor: Colors.white, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1, borderColor: Colors.orange200 },
  patientCodeText: { fontSize: 10, fontWeight: '600', color: Colors.orange700 },
  
  noResultsContainer: { alignItems: 'center', paddingVertical: 32 },
  noResultsText: { fontSize: 14, color: Colors.gray500 },
  
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.green50, padding: 14, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.green100 },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500' },
  
  cardLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 8 },
  stageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stageChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white },
  stageChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  stageText: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  stageTextActive: { color: Colors.white },
  error: { fontSize: 11, color: Colors.red500, marginTop: 4 },
  dateInput: { borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.gray900, backgroundColor: Colors.white },
  
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  eyeLabel: { fontSize: 11, fontWeight: '600', color: Colors.gray500, marginBottom: 4 },
  
  promptBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.orange50, borderLeftWidth: 4, borderLeftColor: Colors.orange500, padding: 12, marginTop: 8, borderRadius: 4 },
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
  
  textArea: { borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, padding: 14, minHeight: 70, fontSize: 15, color: Colors.gray900, backgroundColor: Colors.white, textAlignVertical: 'top' },
  
  sequelaeBox: { backgroundColor: '#FFFBEB', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#FDE68A', marginTop: 12 },
  seqTitle: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  seqChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white },
  seqChipActive: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  seqText: { fontSize: 12, color: Colors.gray700 },
  seqTextActive: { color: Colors.white },
  
  submitBtn: { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  
  historyCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100, marginTop: 16 },
  historyHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },
  
  timelineEmpty: { alignItems: 'center', paddingVertical: 40, borderWidth: 1, borderColor: Colors.gray200, borderStyle: 'dashed', borderRadius: 12, backgroundColor: Colors.gray50, margin: 16 },
  timelineEmptyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900, marginTop: 8 },
  timelineEmptyText: { fontSize: 13, color: Colors.gray500, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },
  
  timelineDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  timelineDotDone: { backgroundColor: '#F0FDF4', borderColor: '#22C55E' },
  timelineDotPending: { backgroundColor: Colors.gray50, borderColor: Colors.gray300 },
  timelineConnector: { width: 2, height: 50, marginVertical: 2, alignSelf: 'center' },
  
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
