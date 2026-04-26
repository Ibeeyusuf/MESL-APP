import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import type {
  PatientDemographics, SurgeryOutcomes, VAOutcomes, FollowUpCompliance, InventoryReport,
} from '@/types';

// ── Helpers matching web's mapDrugFormFromApi / mapGlassesTypeFromApi ─────────

function mapDrugFormFromApi(value: string): string {
  switch (value) {
    case 'EYE_DROPS':    return 'Eye Drops';
    case 'EYE_OINTMENT': return 'Eye Ointment';
    case 'TABLET':       return 'Tablet';
    case 'CAPSULE':      return 'Capsule';
    case 'INJECTION':    return 'Injection';
    default:             return value || 'Unknown';
  }
}

function mapGlassesTypeFromApi(value: string): string {
  switch (value) {
    case 'READING':       return 'Reading';
    case 'DISTANCE':      return 'Distance';
    case 'BIFOCAL':       return 'Bifocal';
    case 'PROGRESSIVE':   return 'Progressive';
    case 'SUNGLASSES_UV': return 'Sunglasses (UV)';
    default:              return value || 'Unknown';
  }
}

type BreakdownRow = { label: string; stock: number; issued: number };

function sortRows(rows: BreakdownRow[]): BreakdownRow[] {
  return [...rows].sort((a, b) => {
    if (b.issued !== a.issued) return b.issued - a.issued;
    if (b.stock !== a.stock)   return b.stock - a.stock;
    return a.label.localeCompare(b.label);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const { user } = useAuth();

  // Web: const showInventory = true — shown to ALL roles, not just Admin
  const showInventory = true;

  // Web: params only passed for Admin with a valid centreId
  const params =
    user?.role === 'Admin' && user?.centre?.id && user.centre.id !== 'N/A'
      ? `centreId=${user.centre.id}`
      : '';

  // Core report states
  const [demographics,    setDemographics]    = useState<PatientDemographics | null>(null);
  const [surgeryOutcomes, setSurgeryOutcomes] = useState<SurgeryOutcomes | null>(null);
  const [vaOutcomes,      setVAOutcomes]      = useState<VAOutcomes | null>(null);
  const [followUp,        setFollowUp]        = useState<FollowUpCompliance | null>(null);

  // Inventory — all roles see these (showInventory = true)
  const [drugsInventory,   setDrugsInventory]   = useState<InventoryReport | null>(null);
  const [glassesInventory, setGlassesInventory] = useState<InventoryReport | null>(null);
  const [drugRows,         setDrugRows]         = useState<BreakdownRow[]>([]);
  const [glassesRows,      setGlassesRows]      = useState<BreakdownRow[]>([]);

  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // ── Load reports ────────────────────────────────────────────────────────────
  const loadReports = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      // All 6 endpoints in parallel — inventory uses .catch(() => null) so they
      // never block the rest if the endpoint doesn't exist yet
      const [dRes, sRes, vRes, fRes, diRes, giRes] = await Promise.all([
        api.reports.demographics(params),
        api.reports.surgeryOutcomes(params),
        api.reports.vaOutcomes(params),
        api.reports.followUpCompliance(params),
        api.reports.drugsInventory(params).catch(() => null),
        api.reports.glassesInventory(params).catch(() => null),
      ]);

      setDemographics(dRes     as PatientDemographics);
      setSurgeryOutcomes(sRes  as SurgeryOutcomes);
      setVAOutcomes(vRes       as VAOutcomes);
      setFollowUp(fRes         as FollowUpCompliance);
      setDrugsInventory(diRes  as InventoryReport | null);
      setGlassesInventory(giRes as InventoryReport | null);

      // Breakdown tables — fire-and-forget, doesn't block page render
      loadBreakdowns().catch(() => {});
    } catch {
      setError('Failed to load reports. Pull down to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Breakdown tables — mirrors web loadBreakdowns() ────────────────────────
  const loadBreakdowns = async () => {
    const invParams = params ? `page=1&limit=100&${params}` : 'page=1&limit=100';

    const [drugsRes, glassesRes, patientsRes] = await Promise.all([
      api.drugs.list(invParams),
      api.eyeglasses.listItems(invParams),
      api.patients.list(invParams),
    ]);

    const drugItems    = ((drugsRes    as any).data ?? []) as any[];
    const glassesItems = ((glassesRes  as any).data ?? []) as any[];
    const patients     = ((patientsRes as any).data ?? []) as any[];

    // Seed stock totals
    const nextDrug    = new Map<string, BreakdownRow>();
    const nextGlasses = new Map<string, BreakdownRow>();

    for (const item of drugItems) {
      const label = [item.name, item.strength, mapDrugFormFromApi(item.form)]
        .filter(Boolean).join(' - ');
      const cur = nextDrug.get(label);
      nextDrug.set(label, {
        label,
        stock:  (cur?.stock  ?? 0) + (item.currentStock ?? 0),
        issued: cur?.issued ?? 0,
      });
    }

    for (const item of glassesItems) {
      const label = mapGlassesTypeFromApi(item.type);
      const cur = nextGlasses.get(label);
      nextGlasses.set(label, {
        label,
        stock:  (cur?.stock  ?? 0) + (item.currentStock ?? 0),
        issued: cur?.issued ?? 0,
      });
    }

    // Add issued counts from prescriptions & issuances per patient
    await Promise.all(patients.map(async (p: any) => {
      try {
        const rxRes = (await api.prescriptions.list(p.id)) as any;
        for (const rx of (rxRes.data ?? [])) {
          for (const rxItem of (rx.items ?? [])) {
            const label = [
              rxItem.drug?.name ?? rxItem.drugName ?? 'Drug',
              rxItem.drug?.strength ?? '',
              mapDrugFormFromApi(rxItem.drug?.form ?? ''),
            ].filter(Boolean).join(' - ');
            const cur = nextDrug.get(label) ?? { label, stock: 0, issued: 0 };
            nextDrug.set(label, { ...cur, issued: cur.issued + (rxItem.quantity ?? 0) });
          }
        }
      } catch {}

      try {
        const issRes = (await api.eyeglasses.listIssuances(p.id)) as any;
        for (const iss of (issRes.data ?? [])) {
          const label = mapGlassesTypeFromApi(
            iss.eyeglassesItem?.type ?? iss.glassesType ?? ''
          );
          const cur = nextGlasses.get(label) ?? { label, stock: 0, issued: 0 };
          nextGlasses.set(label, { ...cur, issued: cur.issued + (iss.quantity ?? 0) });
        }
      } catch {}
    }));

    setDrugRows(sortRows(Array.from(nextDrug.values())));
    setGlassesRows(sortRows(Array.from(nextGlasses.values())));
  };

  useEffect(() => { loadReports(); }, []);

  // ── Loading / Error ─────────────────────────────────────────────────────────
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

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadReports(true)} tintColor={Colors.orange600} />}
    >
      {/* Subtitle — matches web */}
      <Text style={styles.headerSub}>
        {user?.role === 'Admin' ? 'System-wide' : (user?.centre?.name ?? '')}{' '}
        performance metrics and outcomes.
      </Text>

      {/* ── 4 Summary Cards ── */}
      <View style={styles.summaryRow}>
        <StatCard
          icon="people" iconColor={Colors.orange600}
          title="Total Patients" value={demographics?.total ?? 0}
          subtitle={`${demographics?.bySex.male ?? 0} Male, ${demographics?.bySex.female ?? 0} Female`}
        />
        <StatCard
          icon="cut" iconColor="#22C55E"
          title="Total Surgeries" value={surgeryOutcomes?.total ?? 0}
          subtitle={`${surgeryOutcomes?.averageDuration ?? 0} min avg duration`}
        />
      </View>
      <View style={styles.summaryRow}>
        <StatCard
          icon="eye" iconColor="#A855F7"
          title="VA Assessments" value={vaOutcomes?.totalAssessments ?? 0}
          subtitle={`${(vaOutcomes?.improvementRate ?? 0).toFixed(1)}% improvement rate`}
        />
        <StatCard
          icon="calendar" iconColor={Colors.orange600}
          title="Follow-up Rate" value={`${(followUp?.day1Rate ?? 0).toFixed(0)}%`}
          subtitle="Day 1 completion"
        />
      </View>

      {/* ── Drugs Inventory — showInventory = true = all roles ── */}
      {showInventory && drugsInventory && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="medical" size={18} color={Colors.gray500} />
            <Text style={styles.cardTitle}>Drugs Inventory</Text>
          </View>
          <View style={styles.invGrid}>
            <InvStat label="Total Drug Types"     value={drugsInventory.totalItems} />
            <InvStat label="Total Units in Stock" value={drugsInventory.totalStock} />
            <InvStat label="Low Stock"            value={drugsInventory.lowStockCount}   valueColor={Colors.orange600} />
            <InvStat label="Out of Stock"         value={drugsInventory.outOfStockCount} valueColor={Colors.red600} />
          </View>
          <BreakdownTable
            title="Issued By Drug Type"
            itemLabel="Drug Type"
            rows={drugRows}
            emptyLabel="No drug data available yet."
          />
        </View>
      )}

      {/* ── Glasses Inventory — showInventory = true = all roles ── */}
      {showInventory && glassesInventory && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="glasses" size={18} color={Colors.gray500} />
            <Text style={styles.cardTitle}>Eyeglasses Inventory</Text>
          </View>
          <View style={styles.invGrid}>
            <InvStat label="Total Item Types"     value={glassesInventory.totalItems} />
            <InvStat label="Total Units in Stock" value={glassesInventory.totalStock} />
            <InvStat label="Low Stock"            value={glassesInventory.lowStockCount}   valueColor={Colors.orange600} />
            <InvStat label="Out of Stock"         value={glassesInventory.outOfStockCount} valueColor={Colors.red600} />
          </View>
          <BreakdownTable
            title="Issued By Glasses Type"
            itemLabel="Glasses Type"
            rows={glassesRows}
            emptyLabel="No glasses data available yet."
          />
        </View>
      )}

      {/* ── Patient Demographics ── */}
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
                <View
                  style={[
                    styles.barFill,
                    { width: `${demographics.total > 0 ? Math.round((count / demographics.total) * 100) : 0}%` },
                  ]}
                />
              </View>
              <Text style={styles.barValue}>{count}</Text>
            </View>
          ))}

          {demographics.topLGAs.length > 0 && (
            <>
              <Text style={[styles.subTitle, { marginTop: 16 }]}>Top Locations (LGA/Town)</Text>
              {demographics.topLGAs.map((lga, i) => (
                <View key={lga.name} style={styles.lgaRow}>
                  <Text style={styles.lgaRank}>{i + 1}.</Text>
                  <Text style={styles.lgaName} numberOfLines={1}>{lga.name}</Text>
                  <Text style={styles.lgaCount}>{lga.count}</Text>
                </View>
              ))}
            </>
          )}

          {Object.keys(demographics.byDisability ?? {}).length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.subTitle}>Disability Types</Text>
              <View style={styles.badgeWrap}>
                {Object.entries(demographics.byDisability).map(([type, count]) => (
                  <View key={type} style={styles.disabilityBadge}>
                    <Text style={styles.disabilityText}>{type}: {count}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      )}

      {/* ── Surgery Outcomes ── */}
      {surgeryOutcomes && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cut" size={18} color={Colors.gray500} />
            <Text style={styles.cardTitle}>Surgery Outcomes</Text>
          </View>

          <Text style={styles.subTitle}>Procedure Types</Text>
          {Object.entries(surgeryOutcomes.byProcedure).map(([proc, count]) => (
            <View key={proc} style={styles.procRow}>
              <Text style={styles.procName} numberOfLines={1}>{proc}</Text>
              <Text style={styles.procCount}>{count}</Text>
            </View>
          ))}

          <Text style={[styles.subTitle, { marginTop: 16 }]}>Eye Operated</Text>
          <View style={styles.eyeRows}>
            <EyeRow label="Right Eye (OD)" count={surgeryOutcomes.byEye.right} />
            <EyeRow label="Left Eye (OS)"  count={surgeryOutcomes.byEye.left} />
            <EyeRow label="Both Eyes (OU)" count={surgeryOutcomes.byEye.both} />
          </View>

          <Text style={[styles.subTitle, { marginTop: 16 }]}>Complication Rate</Text>
          <View style={styles.complicationBox}>
            <Text style={styles.complicationRate}>{surgeryOutcomes.complicationRate.toFixed(1)}%</Text>
            <Text style={styles.complicationSub}>
              {surgeryOutcomes.withComplications} of {surgeryOutcomes.total} surgeries
            </Text>
            <View style={[
              styles.ratingBadge,
              {
                backgroundColor:
                  surgeryOutcomes.complicationRate < 5  ? '#DCFCE7' :
                  surgeryOutcomes.complicationRate < 10 ? '#FEF9C3' : '#FEE2E2',
              },
            ]}>
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color:
                  surgeryOutcomes.complicationRate < 5  ? '#166534' :
                  surgeryOutcomes.complicationRate < 10 ? '#854D0E' : Colors.red600,
              }}>
                {surgeryOutcomes.complicationRate < 5  ? '✓ Excellent' :
                 surgeryOutcomes.complicationRate < 10 ? '⚠ Good' : '⚠ Needs Review'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ── VA Outcomes ── */}
      {vaOutcomes && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="eye" size={18} color={Colors.gray500} />
            <Text style={styles.cardTitle}>Visual Acuity Outcomes</Text>
          </View>
          <View style={styles.vaRow}>
            <VAStat value={vaOutcomes.totalAssessments} label="Total" />
            <VAStat value={vaOutcomes.presentingStage}  label="Presenting" />
            <VAStat value={vaOutcomes.postOpStages}     label="Post-Op" />
            <VAStat
              value={`${vaOutcomes.improvementRate.toFixed(1)}%`}
              label="Improved"
              color={Colors.green600}
            />
          </View>
        </View>
      )}

      {/* ── Follow-up Compliance ── */}
      {followUp && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar" size={18} color={Colors.gray500} />
            <Text style={styles.cardTitle}>Follow-up Compliance</Text>
          </View>
          <ProgressBar label="Day 1"  rate={followUp.day1Rate}  completed={followUp.day1Completed}  total={followUp.totalSurgeries} color={Colors.green600} />
          <ProgressBar label="Week 1" rate={followUp.week1Rate} completed={followUp.week1Completed} total={followUp.totalSurgeries} color={Colors.orange600} />
          <ProgressBar label="Week 5" rate={followUp.week5Rate} completed={followUp.week5Completed} total={followUp.totalSurgeries} color="#A855F7" />

          {Object.keys(followUp.sequelaeBreakdown ?? {}).length > 0 && (
            <>
              <Text style={[styles.subTitle, { marginTop: 16 }]}>Week 5 Sequelae</Text>
              <View style={styles.badgeWrap}>
                {Object.entries(followUp.sequelaeBreakdown).map(([seq, count]) => (
                  <View
                    key={seq}
                    style={[
                      styles.seqBadge,
                      seq === 'None' && { backgroundColor: Colors.green50, borderColor: Colors.green200 },
                    ]}
                  >
                    <Text style={[styles.seqText, seq === 'None' && { color: Colors.green700 }]}>
                      {seq}: {count}
                    </Text>
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, iconColor, title, value, subtitle }: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  value: string | number;
  subtitle: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statSub} numberOfLines={2}>{subtitle}</Text>
    </View>
  );
}

function InvStat({ label, value, valueColor }: { label: string; value: number; valueColor?: string }) {
  return (
    <View style={styles.invStat}>
      <Text style={[styles.invStatValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      <Text style={styles.invStatLabel}>{label}</Text>
    </View>
  );
}

function EyeRow({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.eyeStatRow}>
      <Text style={styles.eyeStatLabel}>{label}</Text>
      <View style={styles.eyeBadge}><Text style={styles.eyeCount}>{count}</Text></View>
    </View>
  );
}

function VAStat({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <View style={styles.vaStat}>
      <Text style={[styles.vaValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.vaLabel}>{label}</Text>
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

function BreakdownTable({ title, itemLabel, rows, emptyLabel }: {
  title: string;
  itemLabel: string;
  rows: BreakdownRow[];
  emptyLabel: string;
}) {
  return (
    <View style={{ marginTop: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={styles.subTitle}>{title}</Text>
        <Text style={{ fontSize: 11, color: Colors.gray400 }}>{rows.length} item(s)</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.emptyBreakdown}>
          <Text style={{ fontSize: 12, color: Colors.gray400 }}>{emptyLabel}</Text>
        </View>
      ) : (
        <View style={styles.tableCard}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, { flex: 3 }]}>{itemLabel.toUpperCase()}</Text>
            <Text style={[styles.tableCell, styles.tableRight]}>IN STOCK</Text>
            <Text style={[styles.tableCell, styles.tableRight]}>ISSUED</Text>
          </View>
          {rows.map((row, i) => (
            <View
              key={row.label}
              style={[styles.tableRow, i % 2 === 1 && { backgroundColor: Colors.gray50 }]}
            >
              <Text
                style={[styles.tableCell, { flex: 3, color: Colors.gray900, fontWeight: '500' }]}
                numberOfLines={2}
              >
                {row.label}
              </Text>
              <Text style={[styles.tableCell, styles.tableRight, { color: Colors.gray700 }]}>{row.stock}</Text>
              <Text style={[styles.tableCell, styles.tableRight, { color: Colors.gray700 }]}>{row.issued}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { fontSize: 13, color: Colors.gray500, marginTop: 8 },
  errorText: { fontSize: 14, color: Colors.red500, marginTop: 12, textAlign: 'center' },

  headerSub: { fontSize: 12, color: Colors.gray500, marginBottom: 14 },

  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.gray100, alignItems: 'center',
  },
  statIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.gray900 },
  statTitle: { fontSize: 11, fontWeight: '600', color: Colors.gray600, marginTop: 2, textAlign: 'center' },
  statSub: { fontSize: 10, color: Colors.gray400, marginTop: 2, textAlign: 'center' },

  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
    paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray900 },
  subTitle: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 8 },

  // Inventory 2×2 grid
  invGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  invStat: { width: '50%', alignItems: 'center', paddingVertical: 12 },
  invStatValue: { fontSize: 30, fontWeight: '800', color: Colors.gray900 },
  invStatLabel: { fontSize: 11, color: Colors.gray500, marginTop: 2, textAlign: 'center' },

  emptyBreakdown: {
    borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
    borderColor: Colors.gray200, paddingVertical: 20, alignItems: 'center',
  },
  tableCard: { borderRadius: 10, borderWidth: 1, borderColor: Colors.gray200, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.white },
  tableHeader: { backgroundColor: Colors.gray50, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  tableCell: { flex: 1, fontSize: 11, color: Colors.gray500, fontWeight: '600' },
  tableRight: { textAlign: 'right', flex: 0, width: 64 },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  barLabel: { width: 56, fontSize: 12, color: Colors.gray600 },
  barTrack: { flex: 1, height: 8, backgroundColor: Colors.gray200, borderRadius: 4, marginHorizontal: 8 },
  barFill: { height: 8, backgroundColor: Colors.orange500, borderRadius: 4 },
  barValue: { width: 28, fontSize: 12, fontWeight: '600', color: Colors.gray900, textAlign: 'right' },
  lgaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  lgaRank: { width: 22, fontSize: 12, color: Colors.gray500 },
  lgaName: { flex: 1, fontSize: 13, color: Colors.gray900 },
  lgaCount: { fontSize: 13, fontWeight: '600', color: Colors.gray900, marginLeft: 8 },
  divider: { height: 1, backgroundColor: Colors.gray100, marginVertical: 14 },
  badgeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  disabilityBadge: { backgroundColor: Colors.gray100, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  disabilityText: { fontSize: 12, fontWeight: '500', color: Colors.gray800 },

  procRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  procName: { fontSize: 12, color: Colors.gray600, flex: 1, paddingRight: 8 },
  procCount: { fontSize: 13, fontWeight: '600', color: Colors.gray900 },
  eyeRows: { gap: 10 },
  eyeStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyeStatLabel: { fontSize: 13, color: Colors.gray600 },
  eyeBadge: { backgroundColor: Colors.orange100, paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20 },
  eyeCount: { fontSize: 12, fontWeight: '700', color: Colors.orange800 },
  complicationBox: { alignItems: 'center', paddingVertical: 12 },
  complicationRate: { fontSize: 40, fontWeight: '800', color: Colors.gray900 },
  complicationSub: { fontSize: 13, color: Colors.gray500, marginTop: 4 },
  ratingBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginTop: 10 },

  vaRow: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap' },
  vaStat: { alignItems: 'center', minWidth: '22%', paddingVertical: 4 },
  vaValue: { fontSize: 22, fontWeight: '800', color: Colors.gray900 },
  vaLabel: { fontSize: 10, color: Colors.gray500, marginTop: 2, textAlign: 'center' },

  progressTrack: { height: 8, backgroundColor: Colors.gray200, borderRadius: 4 },
  progressFill: { height: 8, borderRadius: 4 },
  seqBadge: {
    backgroundColor: Colors.red50, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.red300,
  },
  seqText: { fontSize: 11, fontWeight: '600', color: Colors.red600 },
});