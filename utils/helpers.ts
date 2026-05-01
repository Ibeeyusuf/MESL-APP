import type {
  MobileRole,
  Patient,
  VisualAcuityRecord,
  Consultation,
  SurgeryRecord,
  PostOperativeRecord,
  PreSurgeryRecord,
  DrugItem,
  Prescription,
  EyeglassesItem,
  EyeglassesIssuance,
  ProcedureType,
  EyeOperated,
  AnesthesiaType,
  PostOpStage,
  Sequelae,
  StaffMember,
} from '@/types';

// ── WHO VA Scale ──
export const WHO_VA_SCALE = [
  '6/6', '6/9', '6/12', '6/18', '6/24', '6/36', '6/60',
  '3/60', '<3/60 (CF)', 'HM', 'PL', 'NPL', 'Unable to Determine',
];

export const isWorseThan = (va: string, threshold: string): boolean => {
  const i1 = WHO_VA_SCALE.indexOf(va);
  const i2 = WHO_VA_SCALE.indexOf(threshold);
  if (i1 === -1 || i2 === -1) return false;
  return i1 > i2;
};

// ── Validators ──
export const validateName = (name: string): string | null => {
  if (!name || name.trim().length === 0) return 'Required';
  const t = name.trim();
  if (t.length < 2 || t.length > 100) return 'Must be 2-100 characters';
  if (!/^[a-zA-Z\s]+$/.test(t)) return 'Letters and spaces only';
  return null;
};

export const validateAge = (age: string): string | null => {
  if (!age) return 'Required';
  const n = Number(age);
  if (isNaN(n) || n < 1 || n > 120) return 'Must be 1-120';
  return null;
};

export const validatePhone = (phone: string): string | null => {
  if (!phone || phone.trim().length === 0) return 'Required';
  if (!/^0\d{9,10}$/.test(phone.trim())) return 'Must be 10-11 digits starting with 0';
  return null;
};

export const validateRequired = (value: string): string | null => {
  if (!value || value.trim().length === 0) return 'Required';
  return null;
};

// ── Date helper ──
export const getTodayDate = () => new Date().toISOString().split('T')[0];

// ── Role mappers ──
export function mapApiRoleToUiRole(apiRole: string): MobileRole {
  const m: Record<string, MobileRole> = {
    // Handle API format (old uppercase)
    ADMIN: 'Admin',
    SEN_ADMIN: 'Sen Admin',
    DOCTOR: 'Doctor',
    SURGEON: 'Surgeon',
    SCRUB_NURSE: 'Scrub Nurse',
    ANESTHETIST: 'Anesthetist',
    SUPPORT_STAFF: 'Support Staff',
    DATA_ENTRY: 'Data Entry',
    // Handle UI format (direct)
    Admin: 'Admin',
    'Sen Admin': 'Sen Admin',
    Doctor: 'Doctor',
    Surgeon: 'Surgeon',
    'Scrub Nurse': 'Scrub Nurse',
    Anesthetist: 'Anesthetist',
    'Support Staff': 'Support Staff',
    'Data Entry': 'Data Entry',
  };
  return m[apiRole] ?? 'Doctor';
}

// ── Patient mapper ──
export function mapApiPatientToUi(p: any): Patient {
  const disabilityMap: Record<string, Patient['disabilityType']> = {
    PHYSICAL: 'Physical', HEARING: 'Hearing', VISUAL: 'Visual', MENTAL: 'Mental', NONE: 'None',
  };
  return {
    id: p.id,
    patientCode: p.patientCode ?? p.id,
    firstName: p.firstName,
    surname: p.surname,
    age: p.age,
    phone: p.phone,
    sex: p.sex === 'FEMALE' ? 'Female' : 'Male',
    lgaTown: p.lgaTown,
    state: p.state ?? undefined,
    outreachCentreName: p.outreachCentreName ?? undefined,
    photo: p.photoUrl ?? undefined,
    disabilityType: disabilityMap[p.disabilityType] ?? 'None',
    centreCode: p.centre?.code ?? 'N/A',
    createdAt: p.createdAt,
    createdBy: p.createdBy?.fullName ?? 'System',
  };
}

// ── VA mapper ──
export function mapApiVaStageToUi(stage?: string): VisualAcuityRecord['stage'] {
  const m: Record<string, VisualAcuityRecord['stage']> = {
    PRESENTING: 'Presenting',
    UNAIDED: 'Unaided',
    PINHOLE: 'Pinhole',
    AIDED: 'Aided',
    Presenting: 'Presenting',
    Unaided: 'Unaided',
    Pinhole: 'Pinhole',
    Aided: 'Aided',
  };
  return stage ? (m[stage] ?? 'Presenting') : 'Presenting';
}

export function mapUiVaStageToApi(stage: VisualAcuityRecord['stage']): string {
  const m: Record<VisualAcuityRecord['stage'], string> = {
    Presenting: 'PRESENTING',
    Unaided: 'UNAIDED',
    Pinhole: 'PINHOLE',
    Aided: 'AIDED',
  };
  return m[stage];
}

export function mapApiVaToUi(item: any): VisualAcuityRecord {
  return {
    id: item.id,
    patientId: item.patientId,
    stage: mapApiVaStageToUi(item.stage),
    rightEye: item.rightEye,
    leftEye: item.leftEye,
    reasonForPoorVision: item.reasonForPoorVision ?? undefined,
    notes: item.notes ?? undefined,
    recordedAt: item.recordedAt ?? item.createdAt ?? new Date().toISOString(),
    recordedBy: item.recordedBy?.fullName ?? item.createdBy?.fullName ?? 'Unknown',
  };
}

// ── Consultation mapper ──
export function mapApiConsultationToUi(item: any): Consultation {
  return {
    id: item.id,
    patientId: item.patientId,
    consultationDate: new Date(item.consultationDate).toISOString().split('T')[0],
    healthPractitioner: item.healthPractitioner ?? undefined,
    symptoms: item.symptoms ?? [],
    signs: item.signs ?? [],
    vaRight: item.vaRight ?? undefined,
    vaLeft: item.vaLeft ?? undefined,
    iopRight: item.iopRight ?? undefined,
    iopLeft: item.iopLeft ?? undefined,
    anteriorSegment: item.anteriorSegment,
    posteriorSegment: item.posteriorSegment,
    surgeryRecommended: item.surgeryRecommended,
    surgicalTeam: item.surgicalTeam ? {
      surgeonId: item.surgicalTeam.surgeonId,
      surgeonName: 'Assigned Surgeon',
      scrubNurseId: item.surgicalTeam.scrubNurseId,
      scrubNurseName: 'Assigned Scrub Nurse',
      anesthetistId: item.surgicalTeam.anesthetistId,
      anesthetistName: 'Assigned Anesthetist',
    } : undefined,
    consultedAt: item.consultedAt,
    consultedBy: item.consultedBy?.fullName ?? item.healthPractitioner ?? 'Unknown',
    centreCode: item.centre?.code ?? 'N/A',
  };
}

// ── Surgery mappers ──
const procedureMap: Record<string, ProcedureType> = {
  CATARACT_EXTRACTION: 'Cataract Extraction',
  IOL_IMPLANTATION: 'IOL Implantation',
  CATARACT_IOL_COMBINED: 'Cataract + IOL (Combined)',
  TRABECULECTOMY: 'Trabeculectomy',
  PTERYGIUM_EXCISION: 'Pterygium Excision',
  EYELID_SURGERY: 'Eyelid Surgery',
  OTHER: 'Other',
};
const eyeMap: Record<string, EyeOperated> = { RIGHT: 'Right', LEFT: 'Left', BOTH: 'Both' };
const anesthesiaMap: Record<string, AnesthesiaType> = { LOCAL: 'Local', GENERAL: 'General', TOPICAL: 'Topical' };

export function mapApiSurgeryToUi(item: any): SurgeryRecord {
  return {
    id: item.id,
    patientId: item.patientId,
    surgeryDate: item.surgeryDate,
    procedureType: procedureMap[item.procedureType] ?? 'Other',
    surgeryType: item.surgeryType ?? undefined,
    iolType: item.iolType ?? undefined,
    eyeOperated: eyeMap[item.eyeOperated] ?? 'Right',
    anesthesiaType: anesthesiaMap[item.anesthesiaType] ?? 'Local',
    durationMinutes: item.durationMinutes,
    iolPowerRight: item.iolPowerRight ?? undefined,
    iolPowerLeft: item.iolPowerLeft ?? undefined,
    hasComplications: item.hasComplications,
    complicationDetails: item.complicationDetails ?? undefined,
    notes: item.notes ?? undefined,
    surgeon: { userId: item.surgeonId, name: item.surgeon?.fullName ?? 'Surgeon', role: 'Surgeon' },
    scrubNurse: { userId: item.scrubNurseId, name: item.scrubNurse?.fullName ?? 'Scrub Nurse', role: 'Scrub Nurse' },
    anesthetist: { userId: item.anesthetistId, name: item.anesthetist?.fullName ?? 'Anesthetist', role: 'Anesthetist' },
    recordedAt: item.recordedAt,
    recordedBy: item.recordedBy?.fullName ?? 'Unknown',
  };
}

export function inferProcedureType(surgeryType: string): ProcedureType {
  const n = surgeryType.toLowerCase();
  if (n.includes('pterygium')) return 'Pterygium Excision';
  if (n.includes('trabec')) return 'Trabeculectomy';
  if (n.includes('lid')) return 'Eyelid Surgery';
  if (n.includes('iol') && n.includes('cataract')) return 'Cataract + IOL (Combined)';
  if (n.includes('iol')) return 'IOL Implantation';
  if (n.includes('cataract') || n.includes('sics') || n.includes('phaco')) return 'Cataract Extraction';
  return 'Other';
}

// ── PostOp mappers ──
export function mapStageFromApi(v: string): PostOpStage {
  if (v === 'Day1') return 'Day 1';
  if (v === 'Week1') return 'Week 1';
  if (v === 'Week5') return 'Week 5';
  return (v as PostOpStage) ?? 'Day 1';
}

export function mapStageToApi(v: PostOpStage): string {
  if (v === 'Day 1') return 'Day1';
  if (v === 'Week 1') return 'Week1';
  if (v === 'Week 5') return 'Week5';
  return 'Day1';
}

export function mapApiPostOpToUi(item: any): PostOperativeRecord {
  const resolved = item.resolved ?? {};
  return {
    id: item.id,
    patientId: item.patientId,
    surgeryId: item.surgeryId,
    stage: mapStageFromApi(item.stage),
    followUpDate: item.followUpDate,
    healthPractitioner: item.healthPractitioner ?? undefined,
    firstVARight: item.firstVARight ?? undefined,
    firstVALeft: item.firstVALeft ?? undefined,
    unaidedVA_Right: item.unaidedVARight ?? '',
    unaidedVA_Left: item.unaidedVALeft ?? '',
    pinholeVA_Right: item.pinholeVARight ?? undefined,
    pinholeVA_Left: item.pinholeVALeft ?? undefined,
    aidedVA_Right: item.aidedVARight ?? undefined,
    aidedVA_Left: item.aidedVALeft ?? undefined,
    reasonForPoorVision: item.reasonForPoorVision ?? resolved.reasonForPoorVision ?? undefined,
    preOpReason: item.preOpReason ?? resolved.preOpReason ?? undefined,
    preOpOthers: item.preOpOthers ?? resolved.preOpOthers ?? undefined,
    surgicalComplication: item.surgicalComplication ?? resolved.surgicalComplication ?? undefined,
    surgicalOthers: item.surgicalOthers ?? resolved.surgicalOthers ?? undefined,
    pinholeImprovement: item.pinholeImprovement ?? resolved.pinholeImprovement ?? undefined,
    pinholeLineNumber: item.pinholeLineNumber ?? resolved.pinholeLineNumber ?? undefined,
    sequelae: (item.sequelae ?? []) as Sequelae[],
    notes: item.notes ?? undefined,
    recordedAt: item.recordedAt ?? item.createdAt ?? new Date().toISOString(),
    recordedBy: item.recordedBy?.fullName ?? 'Unknown',
  };
}

// ── Staff mapper ──
export function mapApiUserToStaff(user: any): StaffMember {
  const roleMap: Record<string, StaffMember['role']> = {
    SURGEON: 'Surgeon', DOCTOR: 'Surgeon', SCRUB_NURSE: 'Scrub Nurse', ANESTHETIST: 'Anesthetist',
  };
  return {
    id: user.id,
    name: user.fullName,
    role: roleMap[user.role] ?? 'Surgeon',
    centreCode: user.centre?.code ?? 'N/A',
  };
}

// ── Pre-Surgery mapper ──
export function mapApiPreSurgeryToUi(item: any): PreSurgeryRecord {
  return {
    id: item.id,
    patientId: item.patientId,
    assessmentDate: item.assessmentDate ?? item.createdAt,
    ocularBiometry: item.ocularBiometry === 'Yes' || item.ocularBiometry === true ? 'Yes' : 'No',
    alRight: item.alRight ?? undefined,
    alLeft: item.alLeft ?? undefined,
    pcIolPowerRight: item.pcIolPowerRight ?? undefined,
    pcIolPowerLeft: item.pcIolPowerLeft ?? undefined,
    biometryOthersRight: item.biometryOthersRight ?? undefined,
    biometryOthersLeft: item.biometryOthersLeft ?? undefined,
    bloodPressure: item.bloodPressure ?? undefined,
    bloodSugar: item.bloodSugar ?? undefined,
    hivTest: item.hivTest ?? undefined,
    hepatitisTest: item.hepatitisTest ?? undefined,
    ocularBScan: item.ocularBScan ?? undefined,
    fitnessForSurgery: item.fitnessForSurgery ?? false,
    consentSigned: item.consentSigned ?? false,
    preOpInstructionsGiven: item.preOpInstructionsGiven ?? false,
    notes: item.notes ?? undefined,
    recordedAt: item.recordedAt ?? item.createdAt ?? new Date().toISOString(),
    recordedBy: item.recordedBy?.fullName ?? item.createdBy?.fullName ?? 'Unknown',
  };
}

// ── Drug / Prescription mappers ──
export function mapApiDrugToUi(item: any): DrugItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category ?? 'General',
    dosageForm: item.dosageForm ?? '',
    strength: item.strength ?? '',
    currentStock: item.currentStock ?? 0,
    reorderLevel: item.reorderLevel ?? 10,
  };
}

export function mapApiPrescriptionToUi(item: any): Prescription {
  return {
    id: item.id,
    patientId: item.patientId,
    drugId: item.drugId ?? '',
    drugName: item.drug?.name ?? item.drugName ?? 'Unknown Drug',
    dosage: item.dosage ?? '',
    frequency: item.frequency ?? '',
    duration: item.duration ?? '',
    quantity: item.quantity ?? 1,
    notes: item.notes ?? undefined,
    prescribedAt: item.prescribedAt ?? item.createdAt ?? new Date().toISOString(),
    prescribedBy: item.prescribedBy?.fullName ?? item.createdBy?.fullName ?? 'Unknown',
  };
}

// ── Eyeglasses mappers ──
export function mapApiEyeglassesItemToUi(item: any): EyeglassesItem {
  return {
    id: item.id,
    description: item.description ?? '',
    type: item.type ?? '',
    powerRange: item.powerRange ?? undefined,
    currentStock: item.currentStock ?? 0,
    reorderLevel: item.reorderLevel ?? 5,
  };
}

export function mapApiIssuanceToUi(item: any): EyeglassesIssuance {
  return {
    id: item.id,
    patientId: item.patientId,
    patientName: item.patient ? `${item.patient.firstName} ${item.patient.surname}` : undefined,
    eyeglassesItemId: item.eyeglassesItemId ?? '',
    eyeglassesDescription: item.eyeglassesItem?.description ?? item.eyeglassesDescription ?? '',
    glassesType: item.eyeglassesItem?.type ?? item.glassesType ?? '',
    quantity: item.quantity ?? 1,
    purpose: item.purpose ?? 'Post-Surgery',
    prescription: item.prescription ?? {},
    notes: item.notes ?? undefined,
    issuedAt: item.issuedAt ?? item.createdAt ?? new Date().toISOString(),
    issuedBy: item.issuedBy?.fullName ?? item.createdBy?.fullName ?? 'Unknown',
  };
}

// ── Nigerian states ──
export const NIGERIAN_STATES = [
  'Niger', 'Kwara', 'Kebbi', 'Sokoto', 'Zamfara', 'Kaduna', 'Kano',
  'Katsina', 'FCT', 'Lagos', 'Oyo', 'Others',
];
