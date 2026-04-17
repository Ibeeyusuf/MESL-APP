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
import { mapApiEyeglassesItemToUi, mapApiIssuanceToUi, mapApiPatientToUi } from '@/utils/helpers';
import type { Patient, EyeglassesItem, EyeglassesIssuance } from '@/types';

type TabMode = 'issue' | 'inventory' | 'history';

const PURPOSE_OPTIONS = [
  { label: 'Select purpose', value: '' },
  { label: 'Post-Surgery', value: 'Post-Surgery' },
  { label: 'Refraction Correction', value: 'Refraction Correction' },
  { label: 'Low Vision Aid', value: 'Low Vision Aid' },
  { label: 'UV Protection', value: 'UV Protection' },
  { label: 'Other', value: 'Other' },
];

export default function GlassesScreen() {
  const params = useLocalSearchParams<{ patientId?: string }>();
  const { user } = useAuth();
  const isAdminView = user?.role === 'Admin';

  // Guard — Admin only
  useEffect(() => {
    if (user && user.role !== 'Admin') router.replace('/(tabs)/');
  }, [user]);

  const [activeTab, setActiveTab] = useState<TabMode>('issue');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [inventory, setInventory] = useState<EyeglassesItem[]>([]);
  const [lowStock, setLowStock] = useState<EyeglassesItem[]>([]);
  const [patientIssuances, setPatientIssuances] = useState<EyeglassesIssuance[]>([]);
  const [allIssuances, setAllIssuances] = useState<EyeglassesIssuance[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    eyeglassesItemId: '', quantity: '1', purpose: 'Post-Surgery', notes: '',
    sphereRight: '', cylinderRight: '', axisRight: '',
    sphereLeft: '', cylinderLeft: '', axisLeft: '',
    pd: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  // Admin: mark as issued state
  const [issuingIds, setIssuingIds] = useState<string[]>([]);
  const [issuedIds, setIssuedIds] = useState<string[]>([]);

  useEffect(() => {
    if (params.patientId && !patient) {
      (async () => {
        try { const res = await api.patients.getById(params.patientId!); setPatient(mapApiPatientToUi(res)); } catch {}
      })();
    }
  }, [params.patientId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = (await api.eyeglasses.listItems()) as { data?: any[] };
        const items = (res.data ?? []).map(mapApiEyeglassesItemToUi);
        setInventory(items);
        setLowStock(items.filter((i: EyeglassesItem) => i.currentStock < i.reorderLevel));
      } catch { setInventory([]); }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!patient) { setPatientIssuances([]); return; }
    (async () => {
      try {
        const res = (await api.eyeglasses.listIssuances(patient.id)) as { data?: any[] };
        setPatientIssuances((res.data ?? []).map(mapApiIssuanceToUi));
      } catch { setPatientIssuances([]); }
      resetForm();
      setIssuedIds([]); setIssuingIds([]);
    })();
  }, [patient?.id]);

  useEffect(() => {
    if (activeTab === 'history' && allIssuances.length === 0) loadAllIssuances();
  }, [activeTab]);

  const loadAllIssuances = async () => {
    try {
      const pRes = (await api.patients.list('page=1&limit=50')) as { data?: any[] };
      const patients = pRes.data ?? [];
      const nested = await Promise.all(
        patients.map(async (p: any) => {
          try {
            const r = (await api.eyeglasses.listIssuances(p.id)) as { data?: any[] };
            return (r.data ?? []).map((iss: any) => ({ ...iss, patient: { firstName: p.firstName, surname: p.surname } }));
          } catch { return []; }
        })
      );
      const all = nested.flat().map(mapApiIssuanceToUi);
      all.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
      setAllIssuances(all);
    } catch { setAllIssuances([]); }
  };

  const resetForm = () => {
    setForm({ eyeglassesItemId: '', quantity: '1', purpose: 'Post-Surgery', notes: '', sphereRight: '', cylinderRight: '', axisRight: '', sphereLeft: '', cylinderLeft: '', axisLeft: '', pd: '' });
    setErrors({}); setSuccess('');
  };

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async () => {
    if (!patient) return;
    const e: Record<string, string> = {};
    if (!form.eyeglassesItemId) e.eyeglassesItemId = 'Required';
    if (!form.quantity || Number(form.quantity) < 1) e.quantity = 'Required';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      const prescription: Record<string, number> = {};
      if (form.sphereRight) prescription.sphereRight = Number(form.sphereRight);
      if (form.cylinderRight) prescription.cylinderRight = Number(form.cylinderRight);
      if (form.axisRight) prescription.axisRight = Number(form.axisRight);
      if (form.sphereLeft) prescription.sphereLeft = Number(form.sphereLeft);
      if (form.cylinderLeft) prescription.cylinderLeft = Number(form.cylinderLeft);
      if (form.axisLeft) prescription.axisLeft = Number(form.axisLeft);
      if (form.pd) prescription.pd = Number(form.pd);

      await api.eyeglasses.createIssuance(patient.id, {
        eyeglassesItemId: form.eyeglassesItemId,
        quantity: Number(form.quantity),
        purpose: form.purpose,
        prescription: Object.keys(prescription).length > 0 ? prescription : undefined,
        notes: form.notes.trim() || undefined,
      });
      const iRes = (await api.eyeglasses.listIssuances(patient.id)) as { data?: any[] };
      setPatientIssuances((iRes.data ?? []).map(mapApiIssuanceToUi));
      const invRes = (await api.eyeglasses.listItems()) as { data?: any[] };
      const items = (invRes.data ?? []).map(mapApiEyeglassesItemToUi);
      setInventory(items); setLowStock(items.filter((i: EyeglassesItem) => i.currentStock < i.reorderLevel));
      setAllIssuances([]);
      setSuccess(`Eyeglasses issued to ${patient.firstName}`);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally { setSubmitting(false); }
  };

  // Admin: mark eyeglasses issuance as issued
  const handleMarkAsIssued = async (issuanceId: string) => {
    const issuance = patientIssuances.find(e => e.id === issuanceId);
    if (!issuance) return;
    setIssuingIds(prev => [...prev, issuanceId]);
    try {
      await (api.eyeglasses as any).markAsIssued(issuanceId, issuance);
      setIssuedIds(prev => [...prev, issuanceId]);
      const invRes = (await api.eyeglasses.listItems()) as { data?: any[] };
      const items = (invRes.data ?? []).map(mapApiEyeglassesItemToUi);
      setInventory(items); setLowStock(items.filter((i: EyeglassesItem) => i.currentStock < i.reorderLevel));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to mark as issued');
    } finally { setIssuingIds(prev => prev.filter(id => id !== issuanceId)); }
  };

  const glassesOptions = [
    { label: 'Select eyeglasses', value: '' },
    ...inventory.map(i => ({ label: `${i.description} (${i.type}) — Stock: ${i.currentStock}`, value: i.id })),
  ];

  const formatRx = (iss: EyeglassesIssuance) => {
    const rx = iss.prescription;
    if (!rx || Object.keys(rx).length === 0) return 'No prescription';
    const parts: string[] = [];
    if (rx.sphereRight !== undefined) parts.push(`OD: SPH ${rx.sphereRight > 0 ? '+' : ''}${rx.sphereRight?.toFixed(2)}`);
    if (rx.cylinderRight !== undefined) parts.push(`CYL ${rx.cylinderRight > 0 ? '+' : ''}${rx.cylinderRight?.toFixed(2)}`);
    if (rx.axisRight !== undefined) parts.push(`Axis ${rx.axisRight}°`);
    if (rx.sphereLeft !== undefined) parts.push(`OS: SPH ${rx.sphereLeft > 0 ? '+' : ''}${rx.sphereLeft?.toFixed(2)}`);
    if (rx.cylinderLeft !== undefined) parts.push(`CYL ${rx.cylinderLeft > 0 ? '+' : ''}${rx.cylinderLeft?.toFixed(2)}`);
    if (rx.axisLeft !== undefined) parts.push(`Axis ${rx.axisLeft}°`);
    if (rx.pd !== undefined) parts.push(`PD: ${rx.pd}mm`);
    return parts.join(' | ');
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.orange600} /><Text style={styles.loadingText}>Loading inventory...</Text></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {lowStock.length > 0 && (
          <View style={styles.alertBox}>
            <Ionicons name="warning" size={18} color={Colors.orange600} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Low Stock Warning</Text>
              <Text style={styles.alertText}>{lowStock.length} item(s) below reorder: {lowStock.map(i => i.description).join(', ')}</Text>
            </View>
          </View>
        )}

        {/* 3-tab row */}
        <View style={styles.tabRow}>
          {(['issue', 'inventory', 'history'] as TabMode[]).map(tab => (
            <TouchableOpacity key={tab} style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]} onPress={() => setActiveTab(tab)}>
              <Ionicons
                name={tab === 'issue' ? 'document-text-outline' : tab === 'inventory' ? 'cube-outline' : 'time-outline'}
                size={14}
                color={activeTab === tab ? Colors.orange600 : Colors.gray500}
              />
              <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
                {tab === 'issue' ? 'Issue Eyeglasses' : tab === 'inventory' ? 'Inventory' : 'Issuance History'}
              </Text>
              {tab === 'inventory' && lowStock.length > 0 && (
                <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{lowStock.length}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'issue' ? (
          <>
            {/* "1. Select Patient" — matches web */}
            <View style={styles.sectionBox}>
              <Text style={styles.sectionLabel}>1. Select Patient</Text>
              <PatientSelector selectedPatient={patient} onSelectPatient={setPatient} />
            </View>

            {patient && (
              <>
                {success ? (
                  <View style={styles.successBox}><Ionicons name="checkmark-circle" size={18} color={Colors.green700} /><Text style={styles.successText}>{success}</Text></View>
                ) : null}

                {/* Issue form — hidden for Admin (Admin only marks as issued) */}
                {!isAdminView && (
                  <>
                    <View style={styles.card}>
                      <Text style={styles.sectionTitle}>Issue Eyeglasses</Text>
                      <PickerModal label="Eyeglasses *" value={form.eyeglassesItemId} options={glassesOptions} onChange={v => handleChange('eyeglassesItemId', v)} error={errors.eyeglassesItemId} />
                      <View style={{ height: 8 }} />
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}><Field label="Quantity *" value={form.quantity} onChange={v => handleChange('quantity', v)} error={errors.quantity} keyboardType="numeric" /></View>
                        <View style={{ flex: 1 }}><PickerModal label="Purpose" value={form.purpose} options={PURPOSE_OPTIONS} onChange={v => handleChange('purpose', v)} /></View>
                      </View>
                    </View>

                    <View style={styles.card}>
                      <Text style={styles.sectionTitle}>Prescription (Optional)</Text>
                      <Text style={styles.eyeLabel}>Right Eye (OD)</Text>
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}><Field label="Sphere" value={form.sphereRight} onChange={v => handleChange('sphereRight', v)} keyboardType="numeric" placeholder="-2.50" /></View>
                        <View style={{ flex: 1 }}><Field label="Cylinder" value={form.cylinderRight} onChange={v => handleChange('cylinderRight', v)} keyboardType="numeric" placeholder="-0.75" /></View>
                        <View style={{ flex: 1 }}><Field label="Axis" value={form.axisRight} onChange={v => handleChange('axisRight', v)} keyboardType="numeric" placeholder="180" /></View>
                      </View>
                      <Text style={[styles.eyeLabel, { marginTop: 8 }]}>Left Eye (OS)</Text>
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}><Field label="Sphere" value={form.sphereLeft} onChange={v => handleChange('sphereLeft', v)} keyboardType="numeric" placeholder="-2.25" /></View>
                        <View style={{ flex: 1 }}><Field label="Cylinder" value={form.cylinderLeft} onChange={v => handleChange('cylinderLeft', v)} keyboardType="numeric" placeholder="-0.50" /></View>
                        <View style={{ flex: 1 }}><Field label="Axis" value={form.axisLeft} onChange={v => handleChange('axisLeft', v)} keyboardType="numeric" placeholder="170" /></View>
                      </View>
                      <View style={{ marginTop: 8, width: '50%' }}>
                        <Field label="PD (mm)" value={form.pd} onChange={v => handleChange('pd', v)} keyboardType="numeric" placeholder="63" />
                      </View>
                    </View>

                    <View style={styles.card}>
                      <Field label="Notes (Optional)" value={form.notes} onChange={v => handleChange('notes', v)} multiline placeholder="Additional notes..." />
                    </View>

                    <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
                      {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Issue Eyeglasses</Text>}
                    </TouchableOpacity>
                  </>
                )}

                {/* Patient's Glasses History — matches web title */}
                {patientIssuances.length > 0 && (
                  <View style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyTitle}>Patient's Glasses History</Text>
                      <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{patientIssuances.length} Records</Text></View>
                    </View>
                    {patientIssuances.map(iss => {
                      const isIssued = issuedIds.includes(iss.id);
                      const isIssuing = issuingIds.includes(iss.id);
                      return (
                        <View key={iss.id} style={styles.historyRow}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.historyName} numberOfLines={1}>{iss.eyeglassesDescription}</Text>
                              <View style={styles.purposeBadge}><Text style={styles.purposeText}>{iss.purpose}</Text></View>
                            </View>
                            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                              <Text style={styles.historyDate}>{new Date(iss.issuedAt).toLocaleDateString()}</Text>
                              {/* Admin: Mark As Issued */}
                              {isAdminView && (
                                isIssued ? (
                                  <View style={styles.issuedBadge}>
                                    <Ionicons name="checkmark-circle" size={12} color={Colors.green700} />
                                    <Text style={styles.issuedText}>Issued</Text>
                                  </View>
                                ) : (
                                  <TouchableOpacity
                                    style={[styles.markIssuedBtn, isIssuing && { opacity: 0.6 }]}
                                    onPress={() => handleMarkAsIssued(iss.id)}
                                    disabled={isIssuing}
                                  >
                                    <Text style={styles.markIssuedText}>{isIssuing ? 'Updating...' : 'Mark As Issued'}</Text>
                                  </TouchableOpacity>
                                )
                              )}
                            </View>
                          </View>
                          <Text style={styles.rxText}>{formatRx(iss)}</Text>
                          <Text style={{ fontSize: 11, color: Colors.gray500, marginTop: 2 }}>Issued by {iss.issuedBy} · Qty: {iss.quantity}</Text>
                          {iss.notes ? <Text style={{ fontSize: 10, color: Colors.gray400, marginTop: 1, fontStyle: 'italic' }}>{iss.notes}</Text> : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </>
        ) : activeTab === 'inventory' ? (
          <View style={styles.stockCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Eyeglasses Inventory</Text>
              <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{inventory.length} Items</Text></View>
            </View>
            {inventory.length === 0 ? (
              <View style={styles.emptyState}><Ionicons name="glasses-outline" size={40} color={Colors.gray300} /><Text style={styles.emptyStateText}>No items</Text></View>
            ) : inventory.map(item => (
              <View key={item.id} style={[styles.stockRow, item.currentStock < item.reorderLevel && { backgroundColor: Colors.red50 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stockName}>{item.description}</Text>
                  <Text style={styles.stockMeta}>{item.type}{item.powerRange ? ` · ${item.powerRange}` : ''}</Text>
                  <Text style={styles.stockMeta}>Reorder: {item.reorderLevel}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[styles.stockCount, item.currentStock < item.reorderLevel && { color: Colors.red600 }]}>{item.currentStock}</Text>
                  {item.currentStock < item.reorderLevel ? (
                    <View style={styles.lowBadge}><Text style={styles.lowBadgeText}>Low Stock</Text></View>
                  ) : (
                    <View style={styles.inStockBadge}><Text style={styles.inStockText}>In Stock</Text></View>
                  )}
                </View>
              </View>
            ))}
          </View>
        ) : (
          /* All Issuance History */
          <View style={styles.stockCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>All Issuance Records</Text>
              <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{allIssuances.length} Records</Text></View>
            </View>
            {allIssuances.length === 0 ? (
              <View style={styles.emptyState}><ActivityIndicator color={Colors.orange600} /><Text style={styles.emptyStateText}>Loading records...</Text></View>
            ) : allIssuances.map(iss => (
              <View key={iss.id} style={styles.historyRow}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.historyName} numberOfLines={1}>{iss.eyeglassesDescription}</Text>
                  <Text style={styles.historyDate}>{new Date(iss.issuedAt).toLocaleDateString()}</Text>
                </View>
                {iss.patientName && <Text style={{ fontSize: 12, color: Colors.gray700, marginTop: 2, fontWeight: '500' }}>{iss.patientName}</Text>}
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
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.gray900 },
  multiline: { minHeight: 80 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 13, color: Colors.gray500, marginTop: 8 },
  alertBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.orange50, borderRadius: 0, borderLeftWidth: 4, borderLeftColor: Colors.orange400, padding: 12, marginBottom: 12 },
  alertTitle: { fontSize: 13, fontWeight: '700', color: Colors.orange800, marginBottom: 2 },
  alertText: { fontSize: 12, color: Colors.orange700 },
  tabRow: { flexDirection: 'column', gap: 0, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  tabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: Colors.orange500 },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  tabBtnTextActive: { color: Colors.orange600 },
  tabBadge: { backgroundColor: Colors.red100, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.red800 },
  sectionBox: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray200, marginBottom: 4 },
  sectionLabel: { fontSize: 14, fontWeight: '500', color: Colors.gray900, marginBottom: 12 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.green50, padding: 14, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.green100 },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500' },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },
  eyeLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
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
  issuedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.green100, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.green200 },
  issuedText: { fontSize: 11, fontWeight: '600', color: Colors.green800 },
  rxText: { fontSize: 10, color: Colors.gray500, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  stockCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100 },
  stockRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100 },
  stockName: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  stockMeta: { fontSize: 11, color: Colors.gray500, marginTop: 2 },
  stockCount: { fontSize: 20, fontWeight: '700', color: Colors.gray900 },
  lowBadge: { backgroundColor: Colors.red50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: Colors.red300 },
  lowBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.red600 },
  inStockBadge: { backgroundColor: Colors.green50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: Colors.green200 },
  inStockText: { fontSize: 9, fontWeight: '700', color: Colors.green700 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { fontSize: 14, color: Colors.gray500, marginTop: 8 },
});