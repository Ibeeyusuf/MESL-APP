import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import type {
  PatientDemographics, SurgeryOutcomes, VAOutcomes, FollowUpCompliance,
} from '@/types';

export default function ReportsScreen() {
  const { user } = useAuth();
  const [demographics, setDemographics] = useState<PatientDemographics | null>(null);
  const [surgeryOutcomes, setSurgeryOutcomes] = useState<SurgeryOutcomes | null>(null);
  const [vaOutcomes, setVAOutcomes] = useState<VAOutcomes | null>(null);
  const [followUp, setFollowUp] = useState<FollowUpCompliance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadReports = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const params = user?.centre?.id ? `centreId=${user.centre.id}` : '';
      const [dRes, sRes, vRes, fRes] = await Promise.all([
        api.reports.demographics(params),
        api.reports.surgeryOutcomes(params),
        api.reports.vaOutcomes(params),
        api.reports.followUpCompliance(params),
      ]);
      setDemographics(dRes as PatientDemographics);
      setSurgeryOutcomes(sRes as SurgeryOutcomes);
      setVAOutcomes(vRes as VAOutcomes);
      setFollowUp(fRes as FollowUpCompliance);
    } catch {
      setError('Failed to load reports. Pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadReports(); }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.orange600} />
        <Text style={styles.loadingText}>Loading reports...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.centered}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadReports(true)} tintColor={Colors.orange600} />}
      >
        <Ionicons name="alert-circle-outline" size={48} color={Colors.red500} />
        <Text style={styles.errorText}>{error}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadReports(true)} tintColor={Colors.orange600} />}
    >
      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <StatCard icon="people" iconColor={Colors.orange600} title="Patients" value={demographics?.total ?? 0} subtitle={`${demographics?.bySex.male ?? 0}M / ${demographics?.bySex.female ?? 0}F`} />
        <StatCard icon="cut" iconColor={Colors.green600} title="Surgeries" value={surgeryOutcomes?.total ?? 0} subtitle={`${surgeryOutcomes?.averageDuration ?? 0} min avg`} />
      </View>
      <View style={styles.summaryRow}>
        <StatCard icon="eye" iconColor={Colors.purple500} title="VA Tests" value={vaOutcomes?.totalAssessments ?? 0} subtitle={`${(vaOutcomes?.improvementRate ?? 0).toFixed(1)}% improved`} />
        <StatCard icon="calendar" iconColor={Colors.orange600} title="Day 1 F/U" value={`${(followUp?.day1Rate ?? 0).toFixed(0)}%`} subtitle={`${followUp?.day1Completed ?? 0} / ${followUp?.totalSurgeries ?? 0}`} />
      </View>

      {/* Demographics */}
      {demographics && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="people" size={18} color={Colors.gray500} />
            <Text style={styles.cardTitle}>Patient Demographics</Text>
          </View>

          <Text style={styles.subTitle}>Age Distribution</Text>
          {Object.entries(demographics.byAgeGroup).map(([group, count]) => (
            <View key={group} style={styles.barRow}>
              <Text style={styles.barLabel}>{group} yrs</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${demographics.total > 0 ? (count / demographics.total) * 100 : 0}%` }]} />
              </View>
              <Text style={styles.barValue}>{count}</Text>
            </View>
          ))}

          {demographics.topLGAs.length > 0 && (
            <>
              <Text style={[styles.subTitle, { marginTop: 16 }]}>Top Locations</Text>
              {demographics.topLGAs.slice(0, 5).map((lga, i) => (
                <View key={lga.name} style={styles.lgaRow}>
                  <Text style={styles.lgaRank}>{i + 1}.</Text>
                  <Text style={styles.lgaName} numberOfLines={1}>{lga.name}</Text>
                  <Text style={styles.lgaCount}>{lga.count}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {/* Surgery Outcomes */}
      {surgeryOutcomes && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cut" size={18} color={Colors.gray500} />
            <Text style={styles.cardTitle}>Surgery Outcomes</Text>
          </View>

          <Text style={styles.subTitle}>Procedures</Text>
          {Object.entries(surgeryOutcomes.byProcedure).map(([proc, count]) => (
            <View key={proc} style={styles.procRow}>
              <Text style={styles.procName} numberOfLines={1}>{proc}</Text>
              <Text style={styles.procCount}>{count}</Text>
            </View>
          ))}

          <View style={styles.eyeRow}>
            <EyeStat label="Right" count={surgeryOutcomes.byEye.right} />
            <EyeStat label="Left" count={surgeryOutcomes.byEye.left} />
            <EyeStat label="Both" count={surgeryOutcomes.byEye.both} />
          </View>

          <View style={styles.complicationBox}>
            <Text style={styles.complicationRate}>{surgeryOutcomes.complicationRate.toFixed(1)}%</Text>
            <Text style={styles.complicationLabel}>Complication Rate</Text>
            <View style={[
              styles.ratingBadge,
              { backgroundColor: surgeryOutcomes.complicationRate < 5 ? Colors.green50 : surgeryOutcomes.complicationRate < 10 ? Colors.orange50 : Colors.red50 },
            ]}>
              <Text style={{
                fontSize: 11, fontWeight: '700',
                color: surgeryOutcomes.complicationRate < 5 ? Colors.green700 : surgeryOutcomes.complicationRate < 10 ? Colors.orange700 : Colors.red600,
              }}>
                {surgeryOutcomes.complicationRate < 5 ? 'Excellent' : surgeryOutcomes.complicationRate < 10 ? 'Good' : 'Needs Review'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* VA Outcomes */}
      {vaOutcomes && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="eye" size={18} color={Colors.gray500} />
            <Text style={styles.cardTitle}>Visual Acuity Outcomes</Text>
          </View>
          <View style={styles.vaRow}>
            <View style={styles.vaStat}>
              <Text style={styles.vaValue}>{vaOutcomes.presentingStage}</Text>
              <Text style={styles.vaLabel}>Presenting</Text>
            </View>
            <View style={styles.vaStat}>
              <Text style={styles.vaValue}>{vaOutcomes.postOpStages}</Text>
              <Text style={styles.vaLabel}>Post-Op</Text>
            </View>
            <View style={styles.vaStat}>
              <Text style={[styles.vaValue, { color: Colors.green600 }]}>{vaOutcomes.improvementRate.toFixed(1)}%</Text>
              <Text style={styles.vaLabel}>Improved</Text>
            </View>
          </View>
        </View>
      )}

      {/* Follow-up Compliance */}
      {followUp && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar" size={18} color={Colors.gray500} />
            <Text style={styles.cardTitle}>Follow-up Compliance</Text>
          </View>
          <ProgressBar label="Day 1" rate={followUp.day1Rate} completed={followUp.day1Completed} total={followUp.totalSurgeries} color={Colors.green600} />
          <ProgressBar label="Week 1" rate={followUp.week1Rate} completed={followUp.week1Completed} total={followUp.totalSurgeries} color={Colors.orange600} />
          <ProgressBar label="Week 5" rate={followUp.week5Rate} completed={followUp.week5Completed} total={followUp.totalSurgeries} color={Colors.purple500} />

          {Object.keys(followUp.sequelaeBreakdown).length > 0 && (
            <>
              <Text style={[styles.subTitle, { marginTop: 16 }]}>Week 5 Sequelae</Text>
              <View style={styles.seqWrap}>
                {Object.entries(followUp.sequelaeBreakdown).map(([seq, count]) => (
                  <View key={seq} style={[styles.seqBadge, seq === 'None' && { backgroundColor: Colors.green50, borderColor: Colors.green100 }]}>
                    <Text style={[styles.seqText, seq === 'None' && { color: Colors.green700 }]}>{seq}: {count}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({ icon, iconColor, title, value, subtitle }: {
  icon: keyof typeof Ionicons.glyphMap; iconColor: string; title: string; value: string | number; subtitle: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statSub}>{subtitle}</Text>
    </View>
  );
}

function EyeStat({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.eyeStat}>
      <Text style={styles.eyeLabel}>{label}</Text>
      <View style={styles.eyeBadge}><Text style={styles.eyeCount}>{count}</Text></View>
    </View>
  );
}

function ProgressBar({ label, rate, completed, total, color }: {
  label: string; rate: number; completed: number; total: number; color: string;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.gray700 }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.gray900 }}>{rate.toFixed(0)}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(rate, 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={{ fontSize: 10, color: Colors.gray400, marginTop: 2 }}>{completed} / {total}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { fontSize: 13, color: Colors.gray500, marginTop: 8 },
  errorText: { fontSize: 14, color: Colors.red500, marginTop: 12, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray100, alignItems: 'center' },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: '800', color: Colors.gray900 },
  statTitle: { fontSize: 12, fontWeight: '600', color: Colors.gray600, marginTop: 2 },
  statSub: { fontSize: 10, color: Colors.gray400, marginTop: 2 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  subTitle: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  barLabel: { width: 56, fontSize: 12, color: Colors.gray600 },
  barTrack: { flex: 1, height: 8, backgroundColor: Colors.gray200, borderRadius: 4, marginHorizontal: 8 },
  barFill: { height: 8, backgroundColor: Colors.orange500, borderRadius: 4 },
  barValue: { width: 28, fontSize: 12, fontWeight: '600', color: Colors.gray900, textAlign: 'right' },
  lgaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  lgaRank: { width: 20, fontSize: 12, color: Colors.gray500 },
  lgaName: { flex: 1, fontSize: 13, color: Colors.gray900 },
  lgaCount: { fontSize: 13, fontWeight: '600', color: Colors.gray900, marginLeft: 8 },
  procRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  procName: { fontSize: 12, color: Colors.gray600, flex: 1, paddingRight: 8 },
  procCount: { fontSize: 13, fontWeight: '600', color: Colors.gray900 },
  eyeRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  eyeStat: { alignItems: 'center' },
  eyeLabel: { fontSize: 11, color: Colors.gray500, marginBottom: 4 },
  eyeBadge: { backgroundColor: Colors.orange50, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  eyeCount: { fontSize: 14, fontWeight: '700', color: Colors.orange700 },
  complicationBox: { alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  complicationRate: { fontSize: 36, fontWeight: '800', color: Colors.gray900 },
  complicationLabel: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  ratingBadge: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
  vaRow: { flexDirection: 'row', justifyContent: 'space-around' },
  vaStat: { alignItems: 'center' },
  vaValue: { fontSize: 24, fontWeight: '800', color: Colors.gray900 },
  vaLabel: { fontSize: 11, color: Colors.gray500, marginTop: 2 },
  progressTrack: { height: 8, backgroundColor: Colors.gray200, borderRadius: 4 },
  progressFill: { height: 8, borderRadius: 4 },
  seqWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seqBadge: { backgroundColor: Colors.red50, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: Colors.red300 },
  seqText: { fontSize: 11, fontWeight: '600', color: Colors.red600 },
});
