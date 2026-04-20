import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import type { Patient } from '@/types';
import { api } from '@/services/api';
import { mapApiPatientToUi } from '@/utils/helpers';

interface Props {
  selectedPatient: Patient | null;
  onSelectPatient: (p: Patient | null) => void;
}

export function PatientSelector({ selectedPatient, onSelectPatient }: Props) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = q.trim()
        ? `search=${encodeURIComponent(q.trim())}&page=1&limit=30`
        : 'page=1&limit=30';
      const res = (await api.patients.list(params)) as { data?: any[] };
      setPatients((res.data ?? []).map(mapApiPatientToUi));
    } catch {
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) search(query);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => search(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  if (selectedPatient) {
    return (
      <View style={styles.selected}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={22} color={Colors.orange600} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{selectedPatient.firstName} {selectedPatient.surname}</Text>
          <Text style={styles.meta}>{selectedPatient.patientCode ?? selectedPatient.id} • {selectedPatient.age}y • {selectedPatient.sex}</Text>
        </View>
        <TouchableOpacity onPress={() => onSelectPatient(null)} style={styles.changeBtn}>
          <Text style={styles.changeTxt}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity style={styles.selectBtn} onPress={() => setVisible(true)} activeOpacity={0.7}>
        <Ionicons name="search" size={20} color={Colors.gray400} />
        <Text style={styles.selectTxt}>Search & select a patient...</Text>
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setVisible(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.gray700} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Patient</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={Colors.gray400} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Name, ID, or phone..."
              placeholderTextColor={Colors.gray400}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={18} color={Colors.gray400} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primaryLight} />
          ) : (
            <FlatList
              data={patients}
              keyExtractor={p => p.id}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              ListEmptyComponent={
                <Text style={styles.empty}>No patients found</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { onSelectPatient(item); setVisible(false); setQuery(''); }}
                >
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={18} color={Colors.orange600} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{item.firstName} {item.surname}</Text>
                    <Text style={styles.rowMeta}>
                      {item.patientCode ?? item.id} • {item.age}y • {item.sex}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  selectTxt: { color: Colors.gray400, fontSize: 15, flex: 1 },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.orange200,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.orange50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  meta: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  changeBtn: { backgroundColor: Colors.orange50, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  changeTxt: { fontSize: 12, fontWeight: '600', color: Colors.orange600 },
  modal: { flex: 1, backgroundColor: Colors.gray50 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.gray900 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    margin: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.gray900 },
  empty: { textAlign: 'center', color: Colors.gray400, marginTop: 40, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  rowName: { fontSize: 14, fontWeight: '600', color: Colors.gray900 },
  rowMeta: { fontSize: 12, color: Colors.gray500, marginTop: 1 },
});
