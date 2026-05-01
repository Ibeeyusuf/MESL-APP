import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import type { MobileRole } from '@/types';

type Stats = {
  totalPatients: number;
  totalSurgeries: number;
  thisMonthSurgeries: number;
  pendingFollowUps: number;
  totalConsultations: number;
  totalVAAssessments: number;
  lowStockDrugs: number;
  totalPrescriptions: number;
};

type ActivityItem = {
  id: string;
  action: string;
  patient: string;
  time: string;
  user: string;
  timestamp: number;
};

const initialStats: Stats = {
  totalPatients: 0, totalSurgeries: 0, thisMonthSurgeries: 0,
  pendingFollowUps: 0, totalConsultations: 0, totalVAAssessments: 0,
  lowStockDrugs: 0, totalPrescriptions: 0,
};

function formatTimeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

type QuickAction = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  bg: string;
  roles: MobileRole[];
};

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Register\nPatient', icon: 'person-add', route: '/(tabs)/register', bg: Colors.orange500, roles: ['Admin', 'Doctor'] },
  { label: 'Search\nPatient', icon: 'search', route: '/(tabs)/patients', bg: Colors.indigo500, roles: ['Admin', 'Sen Admin', 'Doctor', 'Support Staff'] },
  { label: 'Visual\nAcuity', icon: 'eye', route: '/(tabs)/va', bg: Colors.purple500, roles: ['Doctor', 'Support Staff'] },
  { label: 'Consultation', icon: 'medkit', route: '/(tabs)/consult', bg: Colors.orange600, roles: ['Doctor'] },
  { label: 'Pre-Surgery', icon: 'clipboard', route: '/(tabs)/presurgery', bg: Colors.orange500, roles: ['Doctor'] },
  { label: 'Surgery', icon: 'cut', route: '/(tabs)/surgery', bg: Colors.green600, roles: ['Doctor'] },
  { label: 'Post-Op\nFollow-up', icon: 'pulse', route: '/(tabs)/postop', bg: Colors.orange700, roles: ['Doctor'] },
  { label: 'Glasses', icon: 'glasses', route: '/(tabs)/glasses', bg: Colors.indigo500, roles: ['Admin'] },
  { label: 'Drugs', icon: 'medical', route: '/(tabs)/drugs', bg: Colors.red600, roles: ['Admin'] },
  { label: 'Reports', icon: 'bar-chart', route: '/(tabs)/reports', bg: Colors.purple500, roles: ['Admin', 'Doctor', 'Support Staff'] },
];

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<Stats>(initialStats);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      // Stats — server-side aggregated report endpoints (accurate regardless of patient count)
      const [demoRes, surgRes, followRes, vaRes, drugsRes] = await Promise.allSettled([
        api.reports.demographics(),
        api.reports.surgeryOutcomes(),
        api.reports.followUpCompliance(),
        api.reports.vaOutcomes(),
        api.reports.drugsInventory(),
      ]);

      const demo   = demoRes.status   === 'fulfilled' ? (demoRes.value   as any) : {};
      const surg   = surgRes.status   === 'fulfilled' ? (surgRes.value   as any) : {};
      const follow = followRes.status === 'fulfilled' ? (followRes.value as any) : {};
      const va     = vaRes.status     === 'fulfilled' ? (vaRes.value     as any) : {};
      const drugs  = drugsRes.status  === 'fulfilled' ? (drugsRes.value  as any) : {};

      setStats({
        totalPatients:      demo.totalPatients      ?? demo.total              ?? demo.count        ?? 0,
        totalSurgeries:     surg.totalSurgeries     ?? surg.total              ?? surg.count        ?? 0,
        thisMonthSurgeries: surg.thisMonthSurgeries ?? surg.thisMonth          ?? surg.currentMonth ?? 0,
        pendingFollowUps:   Math.max(0, (follow.totalSurgeries ?? follow.total ?? 0) - (follow.week5Completed ?? follow.completed ?? 0)),
        totalVAAssessments: va.totalAssessments     ?? va.total                ?? va.count          ?? 0,
        totalConsultations: surg.totalConsultations ?? demo.totalConsultations ?? 0,
        totalPrescriptions: surg.totalPrescriptions ?? demo.totalPrescriptions ?? 0,
        lowStockDrugs:      drugs.lowStockCount     ?? drugs.lowStock          ?? drugs.belowReorder ?? 0,
      });

      // Activity — fetch 100 patients then their records (matches web approach)
      const pRes = (await api.patients.list('page=1&limit=100')) as { data?: any[] };
      const patients = pRes.data ?? [];
      const patientIds = patients.map((p: any) => p.id);
      const patientCodeById = new Map<string, string>(
        patients.map((p: any) => [p.id, p.patientCode ?? p.id])
      );

      // VA only for the 20 most recently registered patients (same as web)
      const recentPatientIds = [...patients]
        .sort((a: any, b: any) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())
        .slice(-20)
        .map((p: any) => p.id);

      const [surgNested, consultNested, vaNested] = await Promise.all([
        Promise.allSettled(patientIds.map((pid: string) => api.surgeries.list(pid).catch(() => ({ data: [] })))),
        Promise.allSettled(patientIds.map((pid: string) => api.consultations.list(pid).catch(() => ({ data: [] })))),
        Promise.allSettled(recentPatientIds.map((pid: string) => api.visualAcuity.list(pid).catch(() => ({ data: [] })))),
      ]);

      const surgeries     = surgNested.flatMap(r    => r.status === 'fulfilled' ? ((r.value as any)?.data ?? []) : []);
      const consultations = consultNested.flatMap(r => r.status === 'fulfilled' ? ((r.value as any)?.data ?? []) : []);
      const vaRecords     = vaNested.flatMap(r      => r.status === 'fulfilled' ? ((r.value as any)?.data ?? []) : []);

      const acts: ActivityItem[] = [];

      patients.slice(-5).forEach((p: any) => {
        const ts = p.createdAt ?? new Date().toISOString();
        acts.push({ id: `reg-${p.id}`, action: 'Patient Registered', patient: p.patientCode ?? p.id, time: formatTimeAgo(ts), user: p.createdBy?.fullName ?? p.createdBy ?? 'Unknown', timestamp: new Date(ts).getTime() });
      });

      surgeries.slice(-5).forEach((s: any) => {
        const ts = s.recordedAt ?? s.createdAt ?? s.surgeryDate;
        if (!ts) return;
        acts.push({ id: `surg-${s.id}`, action: 'Surgery Completed', patient: patientCodeById.get(s.patientId) ?? s.patientId, time: formatTimeAgo(ts), user: s.recordedBy?.fullName ?? s.createdBy?.fullName ?? 'Unknown', timestamp: new Date(ts).getTime() });
      });

      consultations.slice(-5).forEach((c: any) => {
        const ts = c.consultedAt ?? c.createdAt ?? c.consultationDate;
        if (!ts) return;
        acts.push({ id: `con-${c.id}`, action: 'Consultation Recorded', patient: patientCodeById.get(c.patientId) ?? c.patientId, time: formatTimeAgo(ts), user: c.consultedBy?.fullName ?? c.healthPractitioner ?? 'Unknown', timestamp: new Date(ts).getTime() });
      });

      vaRecords.slice(-5).forEach((v: any) => {
        const ts = v.recordedAt ?? v.createdAt;
        if (!ts) return;
        acts.push({ id: `va-${v.id}`, action: `VA Assessment (${v.stage ?? 'Presenting'})`, patient: patientCodeById.get(v.patientId) ?? v.patientId, time: formatTimeAgo(ts), user: v.recordedBy?.fullName ?? v.createdBy?.fullName ?? 'Unknown', timestamp: new Date(ts).getTime() });
      });

      acts.sort((a, b) => b.timestamp - a.timestamp);
      setActivity(acts.slice(0, 6));
    } catch {
      setStats(initialStats);
      setActivity([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  const visibleActions = QUICK_ACTIONS.filter(a => a.roles.includes(user?.role ?? 'Doctor'));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDashboard(true)} tintColor={Colors.orange600} />}
    >
      {/* Alerts */}
      {!loading && stats.lowStockDrugs > 0 && (
        <TouchableOpacity style={styles.alertBox} onPress={() => router.push('/(tabs)/drugs' as any)} activeOpacity={0.7}>
          <Ionicons name="warning" size={18} color={Colors.orange700} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.alertTitle}>Low Stock Alert</Text>
            <Text style={styles.alertText}>{stats.lowStockDrugs} drug(s) below reorder level. Tap to view.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.orange500} />
        </TouchableOpacity>
      )}

      {!loading && stats.pendingFollowUps > 5 && (
        <TouchableOpacity style={[styles.alertBox, { marginTop: 8 }]} onPress={() => router.push('/(tabs)/postop' as any)} activeOpacity={0.7}>
          <Ionicons name="time" size={18} color={Colors.orange700} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.alertTitle}>Pending Follow-ups</Text>
            <Text style={styles.alertText}>{stats.pendingFollowUps} patient(s) need follow-up. Tap to view.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.orange500} />
        </TouchableOpacity>
      )}

      {/* Primary Stats */}
      {loading ? (
        <ActivityIndicator color={Colors.orange600} style={{ marginVertical: 24 }} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard icon="people" color={Colors.orange500} label="Patients" value={stats.totalPatients} />
            <StatCard icon="cut" color={Colors.green600} label="Surgeries" value={stats.totalSurgeries} />
          </View>
          <View style={styles.statsRow}>
            <StatCard icon="calendar" color={Colors.orange600} label="This Month" value={stats.thisMonthSurgeries} />
            <StatCard icon="time" color={Colors.purple500} label="Pending F/U" value={stats.pendingFollowUps} />
          </View>

          {/* Secondary Stats */}
          <View style={styles.miniStatsRow}>
            <MiniStat icon="eye" color={Colors.indigo500} label="VA Tests" value={stats.totalVAAssessments} />
            <MiniStat icon="medkit" color={Colors.orange600} label="Consults" value={stats.totalConsultations} />
            <MiniStat icon="medical" color={Colors.red600} label="Rx" value={stats.totalPrescriptions} />
            <MiniStat icon="warning" color={stats.lowStockDrugs > 0 ? Colors.red500 : Colors.green600} label="Low Stock" value={stats.lowStockDrugs} />
          </View>
        </>
      )}

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionGrid}>
        {visibleActions.map((action, i) => (
          <TouchableOpacity
            key={i}
            style={styles.actionCard}
            onPress={() => router.push(action.route as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: action.bg }]}>
              <Ionicons name={action.icon} size={22} color={Colors.white} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent Activity */}
      {activity.length > 0 && (
        <View style={styles.activityCard}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>Recent Activity</Text>
            <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>Live</Text></View>
          </View>
          {activity.map(a => (
            <View key={a.id} style={styles.activityRow}>
              <View style={styles.activityDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.activityAction}>{a.action}</Text>
                <Text style={styles.activityPatient}>Patient: {a.patient}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.activityTime}>{a.time}</Text>
                <Text style={styles.activityUser}>{a.user}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({ icon, color, label, value }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBg, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ marginLeft: 12 }}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      </View>
    </View>
  );
}

function MiniStat({ icon, color, label, value }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; value: number }) {
  return (
    <View style={styles.miniStat}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 32 },
  alertBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.orange50, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.orange200 },
  alertTitle: { fontSize: 13, fontWeight: '700', color: Colors.orange800 },
  alertText: { fontSize: 11, color: Colors.orange700, marginTop: 1 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray100 },
  statIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 11, fontWeight: '500', color: Colors.gray500 },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.gray900 },
  miniStatsRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 20 },
  miniStat: { flex: 1, backgroundColor: Colors.white, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.gray100 },
  miniValue: { fontSize: 18, fontWeight: '800', color: Colors.gray900, marginTop: 4 },
  miniLabel: { fontSize: 9, color: Colors.gray500, marginTop: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.gray900, marginBottom: 12 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: { width: '31%', backgroundColor: Colors.orange50, padding: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, fontWeight: '600', color: Colors.gray900, textAlign: 'center' },
  activityCard: { backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100, marginTop: 20 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  activityTitle: { fontSize: 15, fontWeight: '700', color: Colors.gray900 },
  liveBadge: { backgroundColor: Colors.green50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  liveBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.green700 },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100 },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gray300, marginRight: 12 },
  activityAction: { fontSize: 13, fontWeight: '600', color: Colors.gray900 },
  activityPatient: { fontSize: 11, color: Colors.gray500, marginTop: 1 },
  activityTime: { fontSize: 11, color: Colors.gray500 },
  activityUser: { fontSize: 10, color: Colors.gray400 },
});