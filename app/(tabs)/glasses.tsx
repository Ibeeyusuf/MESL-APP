import React, { useState, useEffect, useCallback } from 'react';
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
import { mapApiPatientToUi } from '@/utils/helpers';
import type { Patient, EyeglassesItem, EyeglassesIssuance } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabMode = 'issue' | 'inventory' | 'history';
type GlassesType = 'Reading' | 'Distance' | 'Bifocal' | 'Progressive' | 'Sunglasses (UV)';
type IssuancePurpose = 'Post-Surgery' | 'Refraction Correction' | 'Low Vision Aid' | 'UV Protection' | 'Other';
type GlassesInventoryItem = Omit<EyeglassesItem, 'type'> & {
  type: GlassesType;
  power?: string;
  centreCode?: string;
  unitCost?: number;
  addedAt?: string;
  addedBy?: string;
};
type GlassesPrescription = EyeglassesIssuance['prescription'] & {
  addRight?: number;
  addLeft?: number;
};
type GlassesIssuanceRecord = Omit<EyeglassesIssuance, 'purpose' | 'glassesType' | 'prescription'> & {
  purpose: IssuancePurpose;
  glassesType?: GlassesType;
  prescription: GlassesPrescription;
  centreCode?: string;
  source: 'issuance' | 'consultation';
};

// ─── Mapping helpers (mirrors the web hook exactly) ──────────────────────────

function mapTypeFromApi(value: string): GlassesType {
  switch (value) {
    case 'READING': return 'Reading';
    case 'DISTANCE': return 'Distance';
    case 'BIFOCAL': return 'Bifocal';
    case 'PROGRESSIVE': return 'Progressive';
    case 'SUNGLASSES_UV': return 'Sunglasses (UV)';
    default: return 'Reading';
  }
}

function mapPurposeFromApi(value: string): IssuancePurpose {
  switch (value) {
    case 'POST_SURGERY': return 'Post-Surgery';
    case 'REFRACTION_CORRECTION': return 'Refraction Correction';
    case 'LOW_VISION_AID': return 'Low Vision Aid';
    case 'UV_PROTECTION': return 'UV Protection';
    case 'OTHER': return 'Other';
    default: return 'Other';
  }
}

function mapPurposeToApi(value: IssuancePurpose): string {
  switch (value) {
    case 'Post-Surgery': return 'POST_SURGERY';
    case 'Refraction Correction': return 'REFRACTION_CORRECTION';
    case 'Low Vision Aid': return 'LOW_VISION_AID';
    case 'UV Protection': return 'UV_PROTECTION';
    case 'Other': return 'OTHER';
    default: return 'OTHER';
  }
}

function mapItemToUi(item: any): GlassesInventoryItem {
  return {
    id: item.id,
    type: mapTypeFromApi(item.type),
    description: item.description,
    power: item.power ?? undefined,
    powerRange: item.powerRange ?? undefined,
    centreCode: item.centre?.code ?? 'N/A',
    currentStock: item.currentStock ?? 0,
    reorderLevel: item.reorderLevel ?? 0,
    unitCost: item.unitCost ?? undefined,
    addedAt: item.createdAt ?? new Date().toISOString(),
    addedBy: item.createdBy?.fullName ?? 'System',
  };
}

function resolveEyeglassesDescription(item: any, inventory: GlassesInventoryItem[]): string {
  const directDescription =
    item.eyeglassesItem?.description ??
    item.eyeglassesDescription ??
    item.glassesDescription;
  if (directDescription && directDescription !== item.eyeglassesItemId) return directDescription;
  const inventoryMatch = inventory.find(e => e.id === item.eyeglassesItemId);
  if (inventoryMatch?.description) return inventoryMatch.description;
  return directDescription || 'Eyeglasses';
}

function mapIssuanceToUi(item: any, inventory: GlassesInventoryItem[]): GlassesIssuanceRecord {
  const patientName =
    item.patientName ??
    (item.patient?.firstName && item.patient?.surname
      ? `${item.patient.firstName} ${item.patient.surname}`
      : 'Unknown Patient');
  return {
    id: item.id,
    patientId: item.patient?.patientCode ?? item.patientId,
    patientName,
    eyeglassesItemId: item.eyeglassesItemId,
    eyeglassesDescription: resolveEyeglassesDescription(item, inventory),
    glassesType: mapTypeFromApi(item.eyeglassesItem?.type ?? item.glassesType ?? 'READING'),
    prescription: {
      sphereRight: item.sphereRight ?? undefined,
      cylinderRight: item.cylinderRight ?? undefined,
      axisRight: item.axisRight ?? undefined,
      addRight: item.addRight ?? undefined,
      sphereLeft: item.sphereLeft ?? undefined,
      cylinderLeft: item.cylinderLeft ?? undefined,
      axisLeft: item.axisLeft ?? undefined,
      addLeft: item.addLeft ?? undefined,
      pd: item.pd ?? undefined,
    },
    purpose: mapPurposeFromApi(item.purpose ?? 'OTHER'),
    quantity: item.quantity ?? 0,
    issuedAt: item.issuedAt ?? item.createdAt ?? new Date().toISOString(),
    issuedBy: item.issuedBy?.fullName ?? 'System',
    centreCode: item.centre?.code ?? 'N/A',
    notes: item.notes ?? undefined,
    source: 'issuance' as const,
  };
}

/**
 * Mirrors web's mapConsultationToIssuances.
 * Converts prescribedGlasses entries on a consultation into EyeglassesIssuance
 * objects with source: 'consultation' so they appear in the history card
 * and show the "Mark As Issued" button.
 */
function mapConsultationToIssuances(
  item: any,
  selectedPatient: Patient | null,
  inventory: GlassesInventoryItem[],
): GlassesIssuanceRecord[] {
  return (item.prescribedGlasses ?? []).map((entry: any, index: number) => ({
    id: `consultation-${item.id}-${index}`,
    patientId: selectedPatient?.id ?? item.patientId,
    patientName: selectedPatient
      ? `${selectedPatient.firstName} ${selectedPatient.surname}`
      : item.patientName ?? 'Unknown Patient',
    eyeglassesItemId: entry.glassesItemId,
    eyeglassesDescription:
      inventory.find(i => i.id === entry.glassesItemId)?.description ??
      entry.glassesDescription ??
      'Eyeglasses',
    glassesType: inventory.find(i => i.id === entry.glassesItemId)?.type ?? ('Reading' as GlassesType),
    prescription: {},
    purpose: 'Refraction Correction' as IssuancePurpose,
    quantity: entry.quantity ?? 0,
    issuedAt: item.consultedAt ?? item.consultationDate ?? item.createdAt ?? new Date().toISOString(),
    issuedBy: item.consultedBy?.fullName ?? item.healthPractitioner ?? item.consultedBy ?? 'System',
    centreCode: item.centre?.code ?? 'N/A',
    notes: item.notes ?? undefined,
    source: 'consultation' as const,
  }));
}

/**
 * Deduplication signature — mirrors web's buildIssuedEyeglassesSignature.
 * Consultation records whose signature matches a real issuance are hidden.
 */
function buildIssuedSignature(item: GlassesIssuanceRecord): string {
  return [item.eyeglassesItemId, item.purpose, item.quantity ?? 0].join('|');
}

/**
 * Mirrors web's isEyeglassesMarkedAsIssued:
 * source === 'issuance' means it has been physically dispensed.
 */
function isMarkedAsIssued(issuance: GlassesIssuanceRecord): boolean {
  return issuance.source === 'issuance';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PURPOSE_OPTIONS = [
  { label: 'Select purpose', value: '' },
  { label: 'Post-Surgery', value: 'Post-Surgery' },
  { label: 'Refraction Correction', value: 'Refraction Correction' },
  { label: 'Low Vision Aid', value: 'Low Vision Aid' },
  { label: 'UV Protection', value: 'UV Protection' },
  { label: 'Other', value: 'Other' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GlassesScreen() {
  const params = useLocalSearchParams<{ patientId?: string }>();
  const { user } = useAuth();

  useEffect(() => {
    if (user && user.role !== 'Admin') router.replace('/(tabs)/');
  }, [user]);

  const isAdminView = user?.role === 'Admin';

  const [activeTab, setActiveTab] = useState<TabMode>('issue');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [inventory, setInventory] = useState<GlassesInventoryItem[]>([]);
  const [lowStock, setLowStock] = useState<GlassesInventoryItem[]>([]);
  const [patientIssuances, setPatientIssuances] = useState<GlassesIssuanceRecord[]>([]);
  const [isPatientIssuancesLoading, setIsPatientIssuancesLoading] = useState(false);
  const [allIssuances, setAllIssuances] = useState<GlassesIssuanceRecord[]>([]);
  const [isAllIssuancesLoading, setIsAllIssuancesLoading] = useState(false);
  const [allIssuancesError, setAllIssuancesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    eyeglassesItemId: '', quantity: '1', purpose: 'Post-Surgery', notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [issuingIds, setIssuingIds] = useState<string[]>([]);
  const [historyActionError, setHistoryActionError] = useState('');

  // ── Data loaders ─────────────────────────────────────────────────────────────

  const loadInventory = useCallback(async (): Promise<GlassesInventoryItem[]> => {
    try {
      const res = (await api.eyeglasses.listItems()) as { data?: any[] };
      const items = (res.data ?? []).map(mapItemToUi);
      setInventory(items);
      setLowStock(items.filter(i => i.currentStock < i.reorderLevel));
      return items;
    } catch {
      setInventory([]);
      setLowStock([]);
      return [];
    }
  }, []);

  /**
   * Mirrors web's loadPatientIssuances:
   * fetches real issuances AND consultation records, merges + deduplicates them.
   */
  const loadPatientIssuances = useCallback(async (
    p: Patient,
    inv: GlassesInventoryItem[],
  ) => {
    setIsPatientIssuancesLoading(true);
    try {
      // 1. Real issuances (source: 'issuance')
      const issRes = (await api.eyeglasses.listIssuances(p.id)) as { data?: any[] };
      const mapped = (issRes.data ?? []).map((item: any) => mapIssuanceToUi(item, inv));

      // 2. Signatures of already-issued records for deduplication
      const issuedSignatures = new Set(mapped.map(buildIssuedSignature));

      // 3. Consultation-prescribed glasses (source: 'consultation')
      const conRes = (await (api as any).consultations.list(p.id)) as { data?: any[] };
      const consultationMapped = (conRes.data ?? [])
        .flatMap((item: any) => mapConsultationToIssuances(item, p, inv))
        .filter((item: GlassesIssuanceRecord) => !issuedSignatures.has(buildIssuedSignature(item)));

      // 4. Merge, sort newest first
      const combined = [...mapped, ...consultationMapped];
      combined.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
      setPatientIssuances(combined);
    } catch {
      setPatientIssuances([]);
    } finally {
      setIsPatientIssuancesLoading(false);
    }
  }, []);

  const loadAllIssuances = useCallback(async (inv: GlassesInventoryItem[]) => {
    setIsAllIssuancesLoading(true);
    setAllIssuancesError('');
    try {
      const pRes = (await api.patients.list('page=1&limit=100')) as { data?: any[] };
      const patients = pRes.data ?? [];
      const nested = await Promise.all(
        patients.map(async (p: any) => {
          try {
            const r = (await api.eyeglasses.listIssuances(p.id)) as { data?: any[] };
            return (r.data ?? []).map((iss: any) => ({
              ...iss,
              patient: { firstName: p.firstName, surname: p.surname },
            }));
          } catch { return []; }
        })
      );
      const all = nested.flat().map((item: any) => mapIssuanceToUi(item, inv));
      all.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
      setAllIssuances(all);
    } catch (error) {
      setAllIssuances([]);
      setAllIssuancesError(error instanceof Error ? error.message : 'Failed to load issuance records.');
    } finally {
      setIsAllIssuancesLoading(false);
    }
  }, []);

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const inv = await loadInventory();
        await loadAllIssuances(inv);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

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
    if (!patient) { setPatientIssuances([]); return; }
    setForm({ eyeglassesItemId: '', quantity: '1', purpose: 'Post-Surgery', notes: '' });
    setErrors({});
    setSuccess('');
    setIssuingIds([]);
    setHistoryActionError('');
    void loadPatientIssuances(patient, inventory);
  }, [patient?.id]);

  useEffect(() => {
    if (activeTab === 'history' && allIssuances.length === 0) {
      void loadAllIssuances(inventory);
    }
  }, [activeTab]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async () => {
    if (!patient) return;
    const e: Record<string, string> = {};
    if (!form.eyeglassesItemId) e.eyeglassesItemId = 'Required';
    if (!form.quantity || Number(form.quantity) < 1) e.quantity = 'Required';
    const selectedItem = inventory.find(i => i.id === form.eyeglassesItemId);
    if (selectedItem && Number(form.quantity) > selectedItem.currentStock) {
      e.quantity = `Only ${selectedItem.currentStock} in stock`;
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      await api.eyeglasses.createIssuance(patient.id, {
        eyeglassesItemId: form.eyeglassesItemId,
        quantity: Number(form.quantity),
        purpose: mapPurposeToApi(form.purpose as IssuancePurpose),
        notes: form.notes.trim() || undefined,
      });
      const inv = await loadInventory();
      await Promise.all([loadPatientIssuances(patient, inv), loadAllIssuances(inv)]);
      setSuccess(`Eyeglasses issued to ${patient.firstName}`);
      setForm({ eyeglassesItemId: '', quantity: '1', purpose: 'Post-Surgery', notes: '' });
      setErrors({});
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Mirrors web's markEyeglassesAsIssued:
   * Creates a real issuance record for a consultation-prescribed entry,
   * validates stock, then refreshes everything.
   */
  const handleMarkAsIssued = async (issuanceId: string) => {
    const issuance = patientIssuances.find(e => e.id === issuanceId);
    if (!issuance) {
      setHistoryActionError('Unable to find the selected eyeglasses record.');
      return;
    }
    if (isMarkedAsIssued(issuance)) return;

    const item = inventory.find(e => e.id === issuance.eyeglassesItemId);
    if (!item) {
      setHistoryActionError('Eyeglasses item not found in current inventory.');
      return;
    }
    if (issuance.quantity > item.currentStock) {
      setHistoryActionError(`Only ${item.currentStock} in stock for ${item.description}.`);
      return;
    }

    setHistoryActionError('');
    setIssuingIds(prev => [...prev, issuanceId]);
    try {
      await api.eyeglasses.createIssuance(issuance.patientId, {
        eyeglassesItemId: issuance.eyeglassesItemId,
        purpose: mapPurposeToApi(issuance.purpose),
        quantity: issuance.quantity,
        notes: issuance.notes,
      });
      const inv = await loadInventory();
      await Promise.all([loadPatientIssuances(patient!, inv), loadAllIssuances(inv)]);
    } catch (err) {
      setHistoryActionError(err instanceof Error ? err.message : 'Failed to update eyeglasses stock.');
    } finally {
      setIssuingIds(prev => prev.filter(id => id !== issuanceId));
    }
  };

  // ── Formatters ────────────────────────────────────────────────────────────────

  const formatRx = (iss: GlassesIssuanceRecord) => {
    const rx = iss.prescription;
    if (!rx || Object.keys(rx).length === 0) return 'No prescription';
    const parts: string[] = [];
    if (rx.sphereRight !== undefined) parts.push(`OD: SPH ${rx.sphereRight > 0 ? '+' : ''}${rx.sphereRight.toFixed(2)}`);
    if (rx.cylinderRight !== undefined) parts.push(`CYL ${rx.cylinderRight > 0 ? '+' : ''}${rx.cylinderRight.toFixed(2)}`);
    if (rx.axisRight !== undefined) parts.push(`Axis ${rx.axisRight}°`);
    if (rx.sphereLeft !== undefined) parts.push(`OS: SPH ${rx.sphereLeft > 0 ? '+' : ''}${rx.sphereLeft.toFixed(2)}`);
    if (rx.cylinderLeft !== undefined) parts.push(`CYL ${rx.cylinderLeft > 0 ? '+' : ''}${rx.cylinderLeft.toFixed(2)}`);
    if (rx.axisLeft !== undefined) parts.push(`Axis ${rx.axisLeft}°`);
    if (rx.pd !== undefined) parts.push(`PD: ${rx.pd}mm`);
    return parts.length > 0 ? parts.join(' | ') : 'No prescription recorded';
  };

  const glassesOptions = [
    { label: 'Select eyeglasses', value: '' },
    ...inventory.map(i => ({
      label: `${i.description} (${i.type}) — Stock: ${i.currentStock}`,
      value: i.id,
    })),
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.orange600} />
        <Text style={styles.loadingText}>Loading inventory...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {lowStock.length > 0 && (
          <View style={styles.alertBox}>
            <Ionicons name="warning" size={18} color={Colors.orange600} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Low Stock Warning</Text>
              <Text style={styles.alertText}>
                {lowStock.length} item(s) below reorder: {lowStock.map(i => i.description).join(', ')}
              </Text>
            </View>
          </View>
        )}

        {/* Tab row */}
        <View style={styles.tabRow}>
          {(['issue', 'inventory', 'history'] as TabMode[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={tab === 'issue' ? 'document-text-outline' : tab === 'inventory' ? 'cube-outline' : 'time-outline'}
                size={14}
                color={activeTab === tab ? Colors.orange600 : Colors.gray500}
              />
              <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
                {tab === 'issue' ? 'Issue' : tab === 'inventory' ? 'Inventory' : 'History'}
              </Text>
              {tab === 'inventory' && lowStock.length > 0 && (
                <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{lowStock.length}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── ISSUE TAB ── */}
        {activeTab === 'issue' && (
          <>
            <View style={styles.sectionBox}>
              <Text style={styles.sectionLabel}>1. Select Patient</Text>
              <PatientSelector selectedPatient={patient} onSelectPatient={setPatient} />
            </View>

            {patient && (
              <>
                {success ? (
                  <View style={styles.successBox}>
                    <Ionicons name="checkmark-circle" size={18} color={Colors.green700} />
                    <Text style={styles.successText}>{success}</Text>
                  </View>
                ) : null}

                {/* Issue form — hidden for Admin, mirrors web's !isAdminView guard */}
                {!isAdminView && (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Issue Eyeglasses</Text>
                    <PickerModal
                      label="Eyeglasses *"
                      value={form.eyeglassesItemId}
                      options={glassesOptions}
                      onChange={v => handleChange('eyeglassesItemId', v)}
                      error={errors.eyeglassesItemId}
                    />
                    <View style={{ height: 8 }} />
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Field label="Quantity *" value={form.quantity} onChange={v => handleChange('quantity', v)} error={errors.quantity} keyboardType="numeric" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <PickerModal label="Purpose" value={form.purpose} options={PURPOSE_OPTIONS} onChange={v => handleChange('purpose', v)} />
                      </View>
                    </View>
                    <Field label="Notes (Optional)" value={form.notes} onChange={v => handleChange('notes', v)} multiline placeholder="Additional notes..." />
                    <TouchableOpacity
                      style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                      onPress={handleSubmit}
                      disabled={submitting}
                    >
                      {submitting
                        ? <ActivityIndicator color={Colors.white} />
                        : <Text style={styles.submitText}>Issue Eyeglasses</Text>}
                    </TouchableOpacity>
                  </View>
                )}

                {/* Patient Glasses History — always rendered once a patient is selected */}
                <View style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyTitle}>Patient's Glasses History</Text>
                    <View style={styles.historyBadge}>
                      <Text style={styles.historyBadgeText}>{patientIssuances.length} Records</Text>
                    </View>
                  </View>

                  {/* Inline error — mirrors web's historyActionError */}
                  {historyActionError ? (
                    <View style={styles.inlineErrorBox}>
                      <Text style={styles.inlineErrorText}>{historyActionError}</Text>
                    </View>
                  ) : null}

                  {isPatientIssuancesLoading ? (
                    <View style={styles.emptyState}>
                      <ActivityIndicator color={Colors.orange600} />
                      <Text style={styles.emptyStateText}>Loading history...</Text>
                    </View>
                  ) : patientIssuances.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="glasses-outline" size={40} color={Colors.gray300} />
                      <Text style={styles.emptyStateTitle}>No eyeglasses history</Text>
                      <Text style={styles.emptyStateText}>This patient has no eyeglasses history yet.</Text>
                    </View>
                  ) : (
                    patientIssuances.map(iss => {
                      const issued = isMarkedAsIssued(iss);
                      const issuing = issuingIds.includes(iss.id);
                      // Only Admin sees this button, and only on consultation-sourced records
                      const showMarkAsIssued = isAdminView && iss.source === 'consultation';

                      return (
                        <View key={iss.id} style={styles.historyRow}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.historyName} numberOfLines={1}>{iss.eyeglassesDescription}</Text>
                              <View style={styles.purposeBadge}>
                                <Text style={styles.purposeText}>{iss.purpose}</Text>
                              </View>
                            </View>
                            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                              <Text style={styles.historyDate}>{new Date(iss.issuedAt).toLocaleDateString()}</Text>
                              {showMarkAsIssued && (
                                issued ? (
                                  <View style={styles.issuedBadge}>
                                    <Ionicons name="checkmark-circle" size={12} color={Colors.green700} />
                                    <Text style={styles.issuedText}>Issued</Text>
                                  </View>
                                ) : (
                                  <TouchableOpacity
                                    style={[styles.markIssuedBtn, issuing && { opacity: 0.6 }]}
                                    onPress={() => void handleMarkAsIssued(iss.id)}
                                    disabled={issuing}
                                  >
                                    <Text style={styles.markIssuedText}>
                                      {issuing ? 'Updating...' : 'Mark As Issued'}
                                    </Text>
                                  </TouchableOpacity>
                                )
                              )}
                            </View>
                          </View>
                          <Text style={styles.rxText}>{formatRx(iss)}</Text>
                          <Text style={{ fontSize: 11, color: Colors.gray500, marginTop: 2 }}>
                            Issued by {iss.issuedBy} · Qty: {iss.quantity}
                          </Text>
                          {iss.notes ? (
                            <Text style={{ fontSize: 10, color: Colors.gray400, marginTop: 1, fontStyle: 'italic' }}>
                              {iss.notes}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                </View>
              </>
            )}
          </>
        )}

        {/* ── INVENTORY TAB ── */}
        {activeTab === 'inventory' && (
          <View style={styles.stockCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Eyeglasses Inventory</Text>
              <View style={styles.historyBadge}>
                <Text style={styles.historyBadgeText}>{inventory.length} Items</Text>
              </View>
            </View>
            {inventory.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="glasses-outline" size={40} color={Colors.gray300} />
                <Text style={styles.emptyStateText}>No items</Text>
              </View>
            ) : inventory.map(item => (
              <View
                key={item.id}
                style={[styles.stockRow, item.currentStock < item.reorderLevel && { backgroundColor: Colors.red50 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.stockName}>{item.description}</Text>
                  <Text style={styles.stockMeta}>{item.type}{item.powerRange ? ` · ${item.powerRange}` : ''}</Text>
                  <Text style={styles.stockMeta}>Reorder: {item.reorderLevel}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[styles.stockCount, item.currentStock < item.reorderLevel && { color: Colors.red600 }]}>
                    {item.currentStock}
                  </Text>
                  {item.currentStock < item.reorderLevel ? (
                    <View style={styles.lowBadge}><Text style={styles.lowBadgeText}>Low Stock</Text></View>
                  ) : (
                    <View style={styles.inStockBadge}><Text style={styles.inStockText}>In Stock</Text></View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <View style={styles.stockCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>All Issuance Records</Text>
              <View style={styles.historyBadge}>
                <Text style={styles.historyBadgeText}>{allIssuances.length} Records</Text>
              </View>
            </View>
            {isAllIssuancesLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={Colors.orange600} />
                <Text style={styles.emptyStateText}>Loading records...</Text>
              </View>
            ) : allIssuancesError ? (
              <View style={styles.emptyState}>
                <Ionicons name="alert-circle-outline" size={40} color={Colors.red500} />
                <Text style={styles.emptyStateTitle}>Unable to load records</Text>
                <Text style={styles.emptyStateText}>{allIssuancesError}</Text>
              </View>
            ) : allIssuances.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="glasses-outline" size={40} color={Colors.gray300} />
                <Text style={styles.emptyStateTitle}>No issuance records</Text>
                <Text style={styles.emptyStateText}>No eyeglasses have been issued yet.</Text>
              </View>
            ) : allIssuances.map(iss => (
              <View key={iss.id} style={styles.historyRow}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.historyName} numberOfLines={1}>{iss.eyeglassesDescription}</Text>
                  <Text style={styles.historyDate}>{new Date(iss.issuedAt).toLocaleDateString()}</Text>
                </View>
                {iss.patientName && (
                  <Text style={{ fontSize: 12, color: Colors.gray700, marginTop: 2, fontWeight: '500' }}>
                    {iss.patientName}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <View style={styles.purposeBadge}><Text style={styles.purposeText}>{iss.purpose}</Text></View>
                  <Text style={{ fontSize: 11, color: Colors.gray500 }}>{iss.glassesType} x {iss.quantity}</Text>
                </View>
                <Text style={styles.rxText}>{formatRx(iss)}</Text>
                <Text style={{ fontSize: 10, color: Colors.gray400, marginTop: 2 }}>By {iss.issuedBy}</Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({ label, value, onChange, error, multiline, placeholder, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; multiline?: boolean; placeholder?: string; keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.gray700, marginBottom: 6 }}>{label}</Text>
      <TextInput
        style={[fStyles.input, multiline && fStyles.multiline, error ? { borderColor: Colors.red300 } : null]}
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={Colors.gray400} multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'} keyboardType={keyboardType ?? 'default'}
      />
      {error ? <Text style={{ fontSize: 11, color: Colors.red500, marginTop: 3 }}>{error}</Text> : null}
    </View>
  );
}

const fStyles = StyleSheet.create({
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.gray900 },
  multiline: { minHeight: 80 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 13, color: Colors.gray500, marginTop: 8 },
  alertBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.orange50, borderLeftWidth: 4, borderLeftColor: Colors.orange500, padding: 12, marginBottom: 12 },
  alertTitle: { fontSize: 13, fontWeight: '700', color: Colors.orange800, marginBottom: 2 },
  alertText: { fontSize: 12, color: Colors.orange700 },
  tabRow: { flexDirection: 'row', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: Colors.orange500 },
  tabBtnText: { fontSize: 11, fontWeight: '600', color: Colors.gray500 },
  tabBtnTextActive: { color: Colors.orange600 },
  tabBadge: { backgroundColor: Colors.red50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.red600 },
  sectionBox: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray200, marginBottom: 4 },
  sectionLabel: { fontSize: 14, fontWeight: '500', color: Colors.gray900, marginBottom: 12 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.green50, padding: 14, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.green100 },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500' },
  inlineErrorBox: { margin: 16, marginBottom: 0, backgroundColor: Colors.red50, borderRadius: 8, borderWidth: 1, borderColor: Colors.red300, paddingHorizontal: 14, paddingVertical: 10 },
  inlineErrorText: { fontSize: 13, color: Colors.red600 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8 },
  submitBtn: { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  historyCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100, marginTop: 16 },
  historyHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },
  historyRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100 },
  historyName: { fontSize: 13, fontWeight: '600', color: Colors.gray900 },
  historyDate: { fontSize: 11, color: Colors.gray400 },
  purposeBadge: { alignSelf: 'flex-start', backgroundColor: Colors.orange100, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  purposeText: { fontSize: 10, fontWeight: '600', color: Colors.orange800 },
  markIssuedBtn: { backgroundColor: Colors.orange50, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: Colors.orange200 },
  markIssuedText: { fontSize: 11, fontWeight: '600', color: Colors.orange700 },
  issuedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.green100, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.green100 },
  issuedText: { fontSize: 11, fontWeight: '600', color: Colors.green800 },
  rxText: { fontSize: 10, color: Colors.gray500, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  stockCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100 },
  stockRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100 },
  stockName: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  stockMeta: { fontSize: 11, color: Colors.gray500, marginTop: 2 },
  stockCount: { fontSize: 20, fontWeight: '700', color: Colors.gray900 },
  lowBadge: { backgroundColor: Colors.red50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: Colors.red300 },
  lowBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.red600 },
  inStockBadge: { backgroundColor: Colors.green50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: Colors.green100 },
  inStockText: { fontSize: 9, fontWeight: '700', color: Colors.green700 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900, marginTop: 8 },
  emptyStateText: { fontSize: 13, color: Colors.gray500, marginTop: 4 },
});
