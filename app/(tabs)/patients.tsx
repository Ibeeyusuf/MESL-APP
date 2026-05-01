import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { api } from '@/services/api';
import { mapApiPatientToUi } from '@/utils/helpers';
import { useAuth } from '@/contexts/AuthContext';
import type { Patient } from '@/types';

// Roles that should NOT see the register FAB
const PATIENT_VIEW_ONLY_ROLES = ['Surgeon', 'Scrub Nurse', 'Anesthetist', 'Doctor', 'Support Staff'];

// Relative time helper — matches web version ("Today", "Yesterday", "3 days ago")
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 30) return `${diffInDays} days ago`;
  return date.toLocaleDateString();
}

export default function PatientsScreen() {
  const { user } = useAuth();
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Only Doctor role can access VA and Consult from patient cards
  const isDoctor = user?.role === 'Doctor';

  // Fetch all patients — paginate through all pages so search covers everyone
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      let page = 1;
      const collected: Patient[] = [];
      while (true) {
        const res = (await api.patients.list(`page=${page}&limit=100`)) as { data?: any[]; total?: number };
        const batch = (res.data ?? []).map(mapApiPatientToUi);
        collected.push(...batch);
        // Stop when we get a short page (last page) or nothing
        if (batch.length < 100) break;
        page++;
        // Safety cap — stop after 20 pages (2000 patients)
        if (page > 20) break;
      }
      setAllPatients(collected);
    } catch {
      setAllPatients([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  // Client-side filtering — search by name, phone, or patient code
  const patients = query.trim()
    ? allPatients.filter(p => {
        const q = query.trim().toLowerCase();
        const fullName = `${p.firstName} ${p.surname}`.toLowerCase();
        return (
          fullName.includes(q) ||
          (p.patientCode ?? '').toLowerCase().includes(q) ||
          (p.phone ?? '').toLowerCase().includes(q)
        );
      })
    : allPatients;

  const renderPatient = ({ item }: { item: Patient }) => {
    const expanded = expandedId === item.id;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setExpandedId(expanded ? null : item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.cardTop}>
          {/* Patient code badge row — matches web card top */}
          <View style={styles.cardTopMeta}>
            <View style={styles.patientCodeBadge}>
              <Text style={styles.patientCodeText}>{item.patientCode ?? item.id}</Text>
            </View>
            <Text style={styles.relativeTime}>{formatRelativeTime(item.createdAt)}</Text>
          </View>

          {/* Photo + name + meta */}
          <View style={styles.cardBody}>
            {item.photo ? (
              <Image source={{ uri: item.photo }} style={styles.photo} />
            ) : (
              <View style={styles.avatar}>
                <Ionicons name="person" size={24} color={Colors.gray300} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name}>{item.firstName} {item.surname}</Text>
              <Text style={styles.meta}>{item.age} yrs · {item.sex}</Text>
            </View>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray400} />
          </View>

          {/* Phone + location */}
          <View style={styles.infoRow}>
            <Ionicons name="call" size={14} color={Colors.gray400} />
            <Text style={styles.infoText}>{item.phone}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location" size={14} color={Colors.gray400} />
            <Text style={styles.infoText}>{item.lgaTown}{item.state ? `, ${item.state}` : ''}</Text>
          </View>
        </View>

        {expanded && (
          <View style={styles.expanded}>
            {item.outreachCentreName ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Outreach Centre:</Text>
                <Text style={styles.detailValue}>{item.outreachCentreName}</Text>
              </View>
            ) : null}
            {item.disabilityType && item.disabilityType !== 'None' ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Disability:</Text>
                <Text style={styles.detailValue}>{item.disabilityType}</Text>
              </View>
            ) : null}
            {item.centreCode ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Centre Code:</Text>
                <Text style={styles.detailValue}>{item.centreCode}</Text>
              </View>
            ) : null}
            <Text style={styles.detailDate}>
              Registered {formatRelativeTime(item.createdAt)} · by {item.createdBy}
            </Text>

            {isDoctor && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push({ pathname: '/(tabs)/va', params: { patientId: item.id } })}
                >
                  <Text style={styles.actionBtnText}>Add VA</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnPrimary]}
                  onPress={() => router.push({ pathname: '/(tabs)/consult', params: { patientId: item.id } })}
                >
                  <Text style={styles.actionBtnTextPrimary}>Consult</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Colors.gray400} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone, or ID..."
          placeholderTextColor={Colors.gray400}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={Colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primaryLight} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={patients}
          keyExtractor={p => p.id}
          renderItem={renderPatient}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          onRefresh={() => load(true)}
          refreshing={refreshing}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search" size={40} color={Colors.gray300} />
              <Text style={styles.emptyTitle}>No patients found</Text>
              <Text style={styles.emptyText}>
                {query ? 'Try adjusting your search terms.' : 'Get started by registering a new patient.'}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB — only Admin registers patients (tab also exists for Admin) */}
      {user?.role === 'Admin' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/(tabs)/register')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color={Colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, marginHorizontal: 16, marginTop: 8,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.gray200,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.gray900 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.gray200, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  cardTop: { padding: 14 },
  cardTopMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  patientCodeBadge: { backgroundColor: Colors.orange50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: Colors.orange100 },
  patientCodeText: { fontSize: 12, fontWeight: '700', color: Colors.orange700, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  relativeTime: { fontSize: 11, color: Colors.gray400 },
  cardBody: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  photo: { width: 52, height: 52, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray200 },
  avatar: { width: 52, height: 52, borderRadius: 10, backgroundColor: Colors.gray100, borderWidth: 1, borderColor: Colors.gray200, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  meta: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  infoText: { fontSize: 13, color: Colors.gray600 },
  expanded: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.gray100, backgroundColor: Colors.gray50 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  detailLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray500, width: 120 },
  detailValue: { fontSize: 12, color: Colors.gray700, flex: 1 },
  detailDate: { fontSize: 11, color: Colors.gray400, marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray200 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray300 },
  actionBtnPrimary: { backgroundColor: Colors.orange600, borderColor: Colors.orange600 },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  actionBtnTextPrimary: { fontSize: 13, fontWeight: '600', color: Colors.white },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: Colors.gray900, marginTop: 10 },
  emptyText: { fontSize: 13, color: Colors.gray500, marginTop: 4, textAlign: 'center' },
  fab: {
    position: 'absolute', bottom: 20, right: 16,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.orange600, alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
});