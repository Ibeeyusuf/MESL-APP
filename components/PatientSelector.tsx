import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import type { Patient } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { mapApiPatientToUi } from '@/utils/helpers';

interface Props {
  selectedPatient: Patient | null;
  onSelectPatient: (p: Patient | null) => void;
}

export function PatientSelector({ selectedPatient, onSelectPatient }: Props) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch all patients upfront (similar to web version)
  const fetchPatients = async () => {
    setIsLoading(true);
    try {
      // Build params similar to web version
      let params = 'page=1&limit=100';
      if (user?.role === 'Admin' && user.centre.id && user.centre.id !== 'N/A') {
        params += `&centreId=${user.centre.id}`;
      }
      
      const res = (await api.patients.list(params)) as { data?: any[] };
      const mappedPatients = (res.data ?? []).map(mapApiPatientToUi);
      setAllPatients(mappedPatients);
      setPatients(mappedPatients);
    } catch (error) {
      console.error('Failed to fetch patients:', error);
      setAllPatients([]);
      setPatients([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isModalVisible) {
      fetchPatients();
    }
  }, [isModalVisible, user]);

  // Filter patients client-side (similar to web)
  useEffect(() => {
    if (!searchQuery) {
      setPatients(allPatients);
      return;
    }
    
    const filtered = allPatients.filter((p) => {
      const query = searchQuery.toLowerCase();
      return (
        (p.patientCode ?? "").toLowerCase().includes(query) ||
        p.firstName.toLowerCase().includes(query) ||
        p.surname.toLowerCase().includes(query) ||
        p.phone.includes(query)
      );
    });
    
    setPatients(filtered.slice(0, 5)); // Show only top 5 results
  }, [searchQuery, allPatients]);

  if (selectedPatient) {
    return (
      <View style={styles.selected}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={22} color={Colors.orange600} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>
              {selectedPatient.firstName} {selectedPatient.surname}
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {selectedPatient.patientCode ?? selectedPatient.id}
              </Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {selectedPatient.age} yrs • {selectedPatient.sex} • {selectedPatient.phone}
          </Text>
        </View>
        <TouchableOpacity onPress={() => onSelectPatient(null)} style={styles.changeBtn}>
          <Text style={styles.changeTxt}>Change Patient</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity style={styles.selectBtn} onPress={() => setIsModalVisible(true)} activeOpacity={0.7}>
        <Ionicons name="search" size={20} color={Colors.gray400} />
        <Text style={styles.selectTxt}>
          {isLoading ? "Loading patients..." : "Search patient by name, phone, or patient ID..."}
        </Text>
      </TouchableOpacity>

      <Modal visible={isModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => {
              setIsModalVisible(false);
              setSearchQuery('');
              setPatients([]);
              setAllPatients([]);
            }}>
              <Ionicons name="close" size={24} color={Colors.gray700} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Patient</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={Colors.gray400} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={isLoading ? "Loading patients..." : "Search patient by name, phone, or patient ID..."}
              placeholderTextColor={Colors.gray400}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              editable={!isLoading}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={Colors.gray400} />
              </TouchableOpacity>
            )}
          </View>

          {isLoading ? (
            <View style={styles.skeletonContainer}>
              <View style={styles.skeletonItem}>
                <View style={styles.skeletonAvatar} />
                <View style={styles.skeletonTextContainer}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                </View>
              </View>
              <View style={styles.skeletonItem}>
                <View style={styles.skeletonAvatar} />
                <View style={styles.skeletonTextContainer}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                </View>
              </View>
              <View style={styles.skeletonItem}>
                <View style={styles.skeletonAvatar} />
                <View style={styles.skeletonTextContainer}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                </View>
              </View>
            </View>
          ) : (
            <FlatList
              data={patients}
              keyExtractor={p => p.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
              ListEmptyComponent={
                searchQuery ? (
                  <Text style={styles.empty}>
                    No patients found matching "{searchQuery}"
                  </Text>
                ) : (
                  <Text style={styles.empty}>
                    No patients available
                  </Text>
                )
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onSelectPatient(item);
                    setIsModalVisible(false);
                    setSearchQuery('');
                    setPatients([]);
                    setAllPatients([]);
                  }}
                >
                  <View style={styles.avatarSmall}>
                    <Ionicons name="person" size={18} color={Colors.orange600} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>
                      {item.firstName} {item.surname}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {item.age} yrs • {item.sex} • {item.phone}
                    </Text>
                  </View>
                  <View style={styles.codeBadge}>
                    <Text style={styles.codeBadgeText}>
                      {item.patientCode ?? item.id}
                    </Text>
                  </View>
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
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  selectTxt: { 
    color: Colors.gray400, 
    fontSize: 14, 
    flex: 1 
  },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.orange50,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.orange200,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.orange100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: Colors.gray900 
  },
  badge: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.orange200,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.orange700,
    fontFamily: 'monospace',
  },
  meta: { 
    fontSize: 12, 
    color: Colors.gray500, 
    marginTop: 4 
  },
  changeBtn: { 
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray300,
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 8,
  },
  changeTxt: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: Colors.gray700 
  },
  modal: { 
    flex: 1, 
    backgroundColor: Colors.gray50 
  },
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
  modalTitle: { 
    fontSize: 17, 
    fontWeight: '600', 
    color: Colors.gray900 
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: 12,
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  searchInput: { 
    flex: 1, 
    fontSize: 15, 
    color: Colors.gray900,
    paddingVertical: 0,
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray200,
  },
  skeletonTextContainer: {
    flex: 1,
    gap: 8,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: Colors.gray200,
    borderRadius: 4,
    width: '70%',
  },
  skeletonLineShort: {
    width: '40%',
  },
  empty: { 
    textAlign: 'center', 
    color: Colors.gray400, 
    marginTop: 40, 
    fontSize: 14,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.orange50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: Colors.gray900 
  },
  rowMeta: { 
    fontSize: 12, 
    color: Colors.gray500, 
    marginTop: 2 
  },
  codeBadge: {
    backgroundColor: Colors.gray100,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  codeBadgeText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: Colors.gray600,
  },
});