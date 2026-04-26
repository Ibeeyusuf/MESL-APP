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
import { mapApiDrugToUi, mapApiPrescriptionToUi, mapApiPatientToUi } from '@/utils/helpers';
import type { Patient, DrugItem, Prescription } from '@/types';

type TabMode = 'prescribe' | 'stock';

type PrescriptionItem = {
  drugId: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
};

const emptyItem = (): PrescriptionItem => ({
  drugId: '', dosage: '', frequency: '', duration: '', quantity: '', instructions: '',
});

const FREQUENCY_OPTIONS = [
  { label: 'Select frequency', value: '' },
  { label: 'Once daily (OD)', value: 'Once daily' },
  { label: 'Twice daily (BD)', value: 'Twice daily' },
  { label: 'Three times daily (TDS)', value: 'Three times daily' },
  { label: 'Four times daily (QDS)', value: 'Four times daily' },
  { label: 'Every 6 hours (Q6H)', value: 'Every 6 hours' },
  { label: 'Every 8 hours (Q8H)', value: 'Every 8 hours' },
  { label: 'As needed (PRN)', value: 'As needed' },
  { label: 'At bedtime (Nocte)', value: 'At bedtime' },
  { label: 'Stat (single dose)', value: 'Stat' },
];

const DURATION_OPTIONS = [
  { label: 'Select duration', value: '' },
  { label: '1 day', value: '1 day' },
  { label: '3 days', value: '3 days' },
  { label: '5 days', value: '5 days' },
  { label: '7 days', value: '7 days' },
  { label: '10 days', value: '10 days' },
  { label: '14 days', value: '14 days' },
  { label: '21 days', value: '21 days' },
  { label: '30 days', value: '30 days' },
  { label: 'Ongoing', value: 'Ongoing' },
];

// Roles that can access drug management (Admin manages stock, Doctor prescribes)
const ALLOWED_ROLES = ['Admin', 'Doctor', 'Anesthetist'];

export default function DrugsScreen() {
  const params = useLocalSearchParams<{ patientId?: string }>();
  const { user } = useAuth();
  const isAdminView = user?.role === 'Admin';

  // Guard — Admin, Doctor, Anesthetist only
  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.role)) router.replace('/(tabs)/');
  }, [user]);

  const [activeTab, setActiveTab] = useState<TabMode>('prescribe');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [drugs, setDrugs] = useState<DrugItem[]>([]);
  const [lowStock, setLowStock] = useState<DrugItem[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PrescriptionItem[]>([]);
  const [itemErrors, setItemErrors] = useState<Record<number, Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [issuingKeys, setIssuingKeys] = useState<string[]>([]);
  const [issuedKeys, setIssuedKeys] = useState<string[]>([]);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockInputValue, setStockInputValue] = useState('');
  const [updatingStockId, setUpdatingStockId] = useState<string | null>(null);

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
        const res = (await api.drugs.list()) as { data?: any[] };
        const d = (res.data ?? []).map(mapApiDrugToUi);
        setDrugs(d);
        setLowStock(d.filter((x: DrugItem) => x.currentStock < x.reorderLevel));
      } catch { setDrugs([]); }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!patient) { setPrescriptions([]); return; }
    (async () => {
      try {
        const res = (await api.prescriptions.list(patient.id)) as { data?: any[] };
        setPrescriptions((res.data ?? []).map(mapApiPrescriptionToUi));
      } catch { setPrescriptions([]); }
      setItems([]); setItemErrors({}); setSuccess('');
      setIssuedKeys([]); setIssuingKeys([]);
    })();
  }, [patient?.id]);

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setItemErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
  };
  const updateItem = (idx: number, field: keyof PrescriptionItem, value: string) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    if (itemErrors[idx]?.[field]) {
      setItemErrors(prev => {
        const n = { ...prev, [idx]: { ...prev[idx] } };
        delete n[idx][field];
        return n;
      });
    }
  };

  const handleSubmit = async () => {
    if (!patient || items.length === 0) return;
    const errs: Record<number, Record<string, string>> = {};
    items.forEach((item, i) => {
      const e: Record<string, string> = {};
      if (!item.drugId) e.drugId = 'Required';
      if (!item.dosage.trim()) e.dosage = 'Required';
      if (!item.frequency) e.frequency = 'Required';
      if (!item.duration) e.duration = 'Required';
      if (!item.quantity || Number(item.quantity) < 1) e.quantity = 'Required';
      if (Object.keys(e).length > 0) errs[i] = e;
    });
    setItemErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    try {
      for (const item of items) {
        await api.prescriptions.create(patient.id, {
          drugId: item.drugId,
          dosage: item.dosage.trim(),
          frequency: item.frequency,
          duration: item.duration,
          quantity: Number(item.quantity),
          instructions: item.instructions.trim() || undefined,
        });
      }
      const res = (await api.prescriptions.list(patient.id)) as { data?: any[] };
      setPrescriptions((res.data ?? []).map(mapApiPrescriptionToUi));
      const dRes = (await api.drugs.list()) as { data?: any[] };
      const d = (dRes.data ?? []).map(mapApiDrugToUi);
      setDrugs(d); setLowStock(d.filter((x: DrugItem) => x.currentStock < x.reorderLevel));
      setSuccess(`Prescription (${items.length} drug${items.length > 1 ? 's' : ''}) saved for ${patient.firstName}`);
      setItems([]); setItemErrors({});
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally { setSubmitting(false); }
  };

  const handleMarkAsIssued = async (prescriptionId: string, drugId: string, index: number) => {
    const key = `${prescriptionId}-${index}`;
    setIssuingKeys(prev => [...prev, key]);
    try {
      await (api.prescriptions as any).markItemIssued(prescriptionId, { drugId, index });
      setIssuedKeys(prev => [...prev, key]);
      const dRes = (await api.drugs.list()) as { data?: any[] };
      const d = (dRes.data ?? []).map(mapApiDrugToUi);
      setDrugs(d); setLowStock(d.filter((x: DrugItem) => x.currentStock < x.reorderLevel));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to mark as issued');
    } finally { setIssuingKeys(prev => prev.filter(k => k !== key)); }
  };

  const handleUpdateStock = async (drugId: string) => {
    const newStock = Number(stockInputValue);
    if (isNaN(newStock) || newStock < 0) { Alert.alert('Invalid', 'Enter a valid quantity'); return; }
    setUpdatingStockId(drugId);
    try {
      await (api.drugs as any).updateStock(drugId, { currentStock: newStock });
      const dRes = (await api.drugs.list()) as { data?: any[] };
      const d = (dRes.data ?? []).map(mapApiDrugToUi);
      setDrugs(d); setLowStock(d.filter((x: DrugItem) => x.currentStock < x.reorderLevel));
      setEditingStockId(null); setStockInputValue('');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update stock');
    } finally { setUpdatingStockId(null); }
  };

  const drugOptions = [
    { label: 'Select drug', value: '' },
    ...drugs.map(d => ({ label: `${d.name} (${d.strength}) — Stock: ${d.currentStock}`, value: d.id })),
  ];

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.orange600} /><Text style={styles.loadingText}>Loading drugs...</Text></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {lowStock.length > 0 && (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={18} color={Colors.red500} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Low Stock Warning</Text>
              <Text style={styles.warningText}>{lowStock.length} drug(s) below reorder level. Check Stock Management tab.</Text>
            </View>
          </View>
        )}

        {/* Tab row */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'prescribe' && styles.tabBtnActive]}
            onPress={() => setActiveTab('prescribe')}
          >
            <Ionicons name="document-text-outline" size={16} color={activeTab === 'prescribe' ? Colors.orange600 : Colors.gray500} />
            <Text style={[styles.tabBtnText, activeTab === 'prescribe' && styles.tabBtnTextActive]}>Issued Drugs</Text>
          </TouchableOpacity>
          {/* Stock Management tab — visible to Admin only */}
          {isAdminView && (
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'stock' && styles.tabBtnActive]}
              onPress={() => setActiveTab('stock')}
            >
              <Ionicons name="cube-outline" size={16} color={activeTab === 'stock' ? Colors.orange600 : Colors.gray500} />
              <Text style={[styles.tabBtnText, activeTab === 'stock' && styles.tabBtnTextActive]}>Stock Management</Text>
              {lowStock.length > 0 && (
                <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{lowStock.length}</Text></View>
              )}
            </TouchableOpacity>
          )}
        </View>

        {activeTab === 'prescribe' ? (
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

                {/* Prescription form — shown for non-Admin (Doctor/Anesthetist) */}
                {!isAdminView && (
                  <>
                    {items.length === 0 ? (
                      <View style={styles.emptyPrescription}>
                        <Text style={styles.emptyText}>No drugs added to prescription yet</Text>
                        <TouchableOpacity style={styles.addFirstBtn} onPress={addItem}>
                          <Ionicons name="add" size={18} color={Colors.white} />
                          <Text style={styles.addFirstBtnText}>Add Drug</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        {items.map((item, idx) => (
                          <View key={idx} style={styles.itemCard}>
                            <View style={styles.itemHeader}>
                              <Text style={styles.itemTitle}>Drug #{idx + 1}</Text>
                              <TouchableOpacity onPress={() => removeItem(idx)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Ionicons name="trash-outline" size={20} color={Colors.red500} />
                              </TouchableOpacity>
                            </View>
                            <PickerModal label="Drug *" value={item.drugId} options={drugOptions} onChange={v => updateItem(idx, 'drugId', v)} error={itemErrors[idx]?.drugId} />
                            <View style={{ height: 8 }} />
                            <Field label="Dosage *" value={item.dosage} onChange={v => updateItem(idx, 'dosage', v)} error={itemErrors[idx]?.dosage} placeholder="e.g., 1 drop, 500mg" />
                            <View style={styles.row}>
                              <View style={{ flex: 1 }}>
                                <PickerModal label="Frequency *" value={item.frequency} options={FREQUENCY_OPTIONS} onChange={v => updateItem(idx, 'frequency', v)} error={itemErrors[idx]?.frequency} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <PickerModal label="Duration *" value={item.duration} options={DURATION_OPTIONS} onChange={v => updateItem(idx, 'duration', v)} error={itemErrors[idx]?.duration} />
                              </View>
                            </View>
                            <View style={{ height: 8 }} />
                            <Field label="Quantity *" value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} error={itemErrors[idx]?.quantity} keyboardType="numeric" placeholder="1" />
                            <Field label="Instructions (Optional)" value={item.instructions} onChange={v => updateItem(idx, 'instructions', v)} placeholder="e.g., Apply to affected eye, Take with food" />
                          </View>
                        ))}
                        <TouchableOpacity style={styles.addMoreBtn} onPress={addItem}>
                          <Ionicons name="add-circle-outline" size={18} color={Colors.orange600} />
                          <Text style={styles.addMoreText}>Add Another Drug</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
                          {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Create Prescription ({items.length} drug{items.length > 1 ? 's' : ''})</Text>}
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}

                {/* Issued Drug History */}
                {prescriptions.length > 0 && (
                  <View style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyTitle}>Issued Drug History</Text>
                      <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{prescriptions.length} Records</Text></View>
                    </View>
                    {prescriptions.slice(0, 10).map(rx => {
                      const key = `${rx.id}-0`;
                      const isIssued = issuedKeys.includes(key);
                      const isIssuing = issuingKeys.includes(key);
                      return (
                        <View key={rx.id} style={styles.historyRow}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Text style={styles.historyDrug} numberOfLines={1}>{rx.drugName}</Text>
                            <Text style={styles.historyDate}>{new Date(rx.prescribedAt).toLocaleDateString()}</Text>
                          </View>
                          <Text style={{ fontSize: 11, color: Colors.gray500, marginTop: 2 }}>
                            {rx.dosage} · {rx.frequency} · {rx.duration} · Qty: {rx.quantity}
                          </Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                            <Text style={{ fontSize: 10, color: Colors.gray400 }}>By {rx.prescribedBy}</Text>
                            {isAdminView && (
                              isIssued ? (
                                <View style={styles.issuedBadge}>
                                  <Ionicons name="checkmark-circle" size={12} color={Colors.green700} />
                                  <Text style={styles.issuedText}>Issued</Text>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={[styles.markIssuedBtn, isIssuing && { opacity: 0.6 }]}
                                  onPress={() => handleMarkAsIssued(rx.id, rx.drugId, 0)}
                                  disabled={isIssuing}
                                >
                                  <Text style={styles.markIssuedText}>{isIssuing ? 'Updating...' : 'Mark As Issued'}</Text>
                                </TouchableOpacity>
                              )
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </>
        ) : (
          /* Stock Management Tab — Admin only */
          <View style={styles.stockCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Drug Inventory</Text>
              <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{drugs.length} Drugs</Text></View>
            </View>
            {drugs.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="medical-outline" size={40} color={Colors.gray300} />
                <Text style={styles.emptyStateText}>No drugs in inventory</Text>
              </View>
            ) : (
              drugs.map(d => (
                <View key={d.id} style={[styles.stockRow, d.currentStock < d.reorderLevel && { backgroundColor: Colors.red50 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stockName}>{d.name}</Text>
                    <Text style={styles.stockMeta}>{d.category} · {d.dosageForm} · {d.strength}</Text>
                    <Text style={styles.stockMeta}>Reorder: {d.reorderLevel}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {editingStockId === d.id ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextInput
                          style={styles.stockEditInput}
                          value={stockInputValue}
                          onChangeText={setStockInputValue}
                          keyboardType="numeric"
                          autoFocus
                          selectTextOnFocus
                        />
                        <TouchableOpacity
                          style={styles.stockSaveBtn}
                          onPress={() => handleUpdateStock(d.id)}
                          disabled={updatingStockId === d.id}
                        >
                          {updatingStockId === d.id
                            ? <ActivityIndicator size="small" color={Colors.white} />
                            : <Text style={styles.stockSaveBtnText}>Save</Text>
                          }
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setEditingStockId(null); setStockInputValue(''); }}>
                          <Ionicons name="close" size={18} color={Colors.gray500} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        <Text style={[styles.stockCount, d.currentStock < d.reorderLevel && { color: Colors.red600 }]}>{d.currentStock}</Text>
                        {d.currentStock < d.reorderLevel ? (
                          <View style={styles.lowBadge}><Text style={styles.lowBadgeText}>Low</Text></View>
                        ) : (
                          <Text style={{ fontSize: 10, color: Colors.green600, fontWeight: '600' }}>In Stock</Text>
                        )}
                        <TouchableOpacity
                          style={styles.editStockBtn}
                          onPress={() => { setEditingStockId(d.id); setStockInputValue(String(d.currentStock)); }}
                        >
                          <Ionicons name="pencil-outline" size={12} color={Colors.orange600} />
                          <Text style={styles.editStockText}>Update</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              ))
            )}
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
  warningBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.red50, borderRadius: 0, borderLeftWidth: 4, borderLeftColor: Colors.red400, padding: 12, marginBottom: 12 },
  warningTitle: { fontSize: 13, fontWeight: '700', color: Colors.red800, marginBottom: 2 },
  warningText: { fontSize: 12, color: Colors.red700 },
  tabRow: { flexDirection: 'row', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: Colors.orange500 },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  tabBtnTextActive: { color: Colors.orange600 },
  tabBadge: { backgroundColor: Colors.red100, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.red800 },
  sectionBox: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray200, marginBottom: 4 },
  sectionLabel: { fontSize: 14, fontWeight: '500', color: Colors.gray900, marginBottom: 12 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.green50, padding: 14, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.green100 },
  successText: { color: Colors.green800, fontSize: 13, fontWeight: '500' },
  emptyPrescription: { backgroundColor: Colors.white, borderRadius: 16, padding: 32, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.gray300, alignItems: 'center', marginTop: 12 },
  emptyText: { fontSize: 13, color: Colors.gray500, marginBottom: 16 },
  addFirstBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.orange600, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  addFirstBtnText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
  itemCard: { backgroundColor: Colors.gray50, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray200, marginTop: 12 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: Colors.gray900 },
  row: { flexDirection: 'row', gap: 12 },
  addMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray300, backgroundColor: Colors.white, marginTop: 12 },
  addMoreText: { fontSize: 14, fontWeight: '600', color: Colors.orange600 },
  submitBtn: { backgroundColor: Colors.orange600, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  submitText: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  historyCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100, marginTop: 16 },
  historyHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  historyBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  historyBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },
  historyRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100 },
  historyDrug: { fontSize: 13, fontWeight: '500', color: Colors.gray900, flex: 1 },
  historyDate: { fontSize: 11, color: Colors.gray400 },
  markIssuedBtn: { backgroundColor: Colors.orange50, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: Colors.orange200 },
  markIssuedText: { fontSize: 11, fontWeight: '600', color: Colors.orange700 },
  issuedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.green100, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.green200 },
  issuedText: { fontSize: 11, fontWeight: '600', color: Colors.green800 },
  stockCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100 },
  stockRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100 },
  stockName: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  stockMeta: { fontSize: 11, color: Colors.gray500, marginTop: 2 },
  stockCount: { fontSize: 20, fontWeight: '700', color: Colors.gray900 },
  lowBadge: { backgroundColor: Colors.red50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: Colors.red300 },
  lowBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.red600 },
  editStockBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.orange200, backgroundColor: Colors.orange50, marginTop: 2 },
  editStockText: { fontSize: 11, fontWeight: '600', color: Colors.orange600 },
  stockEditInput: { width: 70, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.orange400, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, fontWeight: '700', color: Colors.gray900, textAlign: 'center' },
  stockSaveBtn: { backgroundColor: Colors.orange600, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  stockSaveBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { fontSize: 14, color: Colors.gray500, marginTop: 8 },
});