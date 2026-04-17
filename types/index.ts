// ── Roles ──
export type MobileRole = 'Admin' | 'Doctor' | 'Surgeon' | 'Scrub Nurse' | 'Anesthetist' | 'Support Staff' | 'Data Entry';

export const MOBILE_ROLES: MobileRole[] = ['Admin', 'Doctor', 'Surgeon', 'Scrub Nurse', 'Anesthetist', 'Support Staff'];

export interface Centre {
  id: string;
  code: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: MobileRole;
  centre: Centre;
}

// ── Patient ──
export interface Patient {
  id: string;
  patientCode?: string;
  firstName: string;
  surname: string;
  age: number;
  phone: string;
  sex: 'Male' | 'Female';
  lgaTown: string;
  state?: string;
  outreachCentreName?: string;
  photo?: string;
  disabilityType?: 'Physical' | 'Hearing' | 'Visual' | 'Mental' | 'None';
  centreCode: string;
  createdAt: string;
  createdBy: string;
}

// ── Visual Acuity ──
export type VAStage = 'Presenting' | 'Unaided' | 'Pinhole' | 'Aided';

export interface VisualAcuityRecord {
  id: string;
  patientId: string;
  stage: VAStage;
  rightEye: string;
  leftEye: string;
  reasonForPoorVision?: string;
  notes?: string;
  recordedAt: string;
  recordedBy: string;
}

// ── Consultation ──
export interface ConsultationTeam {
  surgeonId: string;
  surgeonName: string;
  scrubNurseId: string;
  scrubNurseName: string;
  anesthetistId: string;
  anesthetistName: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  consultationDate: string;
  healthPractitioner?: string;
  symptoms?: string[];
  signs?: string[];
  vaRight?: string;
  vaLeft?: string;
  iopRight?: number;
  iopLeft?: number;
  anteriorSegment: string;
  posteriorSegment: string;
  surgeryRecommended: boolean;
  surgicalTeam?: ConsultationTeam;
  consultedAt: string;
  consultedBy: string;
  centreCode: string;
}

// ── Surgery ──
export type ProcedureType =
  | 'Cataract Extraction'
  | 'IOL Implantation'
  | 'Cataract + IOL (Combined)'
  | 'Trabeculectomy'
  | 'Pterygium Excision'
  | 'Eyelid Surgery'
  | 'Other';

export type EyeOperated = 'Right' | 'Left' | 'Both';
export type AnesthesiaType = 'Local' | 'General' | 'Topical';

export interface TeamMember {
  userId: string;
  name: string;
  role: 'Surgeon' | 'Scrub Nurse' | 'Anesthetist';
}

export interface SurgeryRecord {
  id: string;
  patientId: string;
  surgeryDate: string;
  procedureType: ProcedureType;
  surgeryType?: string;
  iolType?: string;
  eyeOperated: EyeOperated;
  anesthesiaType: AnesthesiaType;
  durationMinutes: number;
  iolPowerRight?: string;
  iolPowerLeft?: string;
  hasComplications: boolean;
  complicationDetails?: string;
  notes?: string;
  surgeon: TeamMember;
  scrubNurse: TeamMember;
  anesthetist: TeamMember;
  recordedAt: string;
  recordedBy: string;
}

// ── Post-Operative ──
export type PostOpStage = 'Day 1' | 'Week 1' | 'Week 5';

export type Sequelae =
  | 'Bullous Keratopathy'
  | 'PCO'
  | 'Endophthalmitis'
  | 'IOL Malposition'
  | 'Wound Leak'
  | 'Corneal Edema'
  | 'None';

export interface PostOperativeRecord {
  id: string;
  patientId: string;
  surgeryId: string;
  stage: PostOpStage;
  followUpDate: string;
  unaidedVA_Right: string;
  unaidedVA_Left: string;
  pinholeVA_Right?: string;
  pinholeVA_Left?: string;
  aidedVA_Right?: string;
  aidedVA_Left?: string;
  reasonForPoorVision?: string;
  sequelae?: Sequelae[];
  notes?: string;
  recordedAt: string;
  recordedBy: string;
}

// ── Pre-Surgery ──
export interface PreSurgeryRecord {
  id: string;
  patientId: string;
  assessmentDate: string;
  ocularBiometry: 'Yes' | 'No';
  alRight?: string;
  alLeft?: string;
  pcIolPowerRight?: string;
  pcIolPowerLeft?: string;
  biometryOthersRight?: string;
  biometryOthersLeft?: string;
  bloodPressure?: string;
  bloodSugar?: string;
  hivTest?: string;
  hepatitisTest?: string;
  ocularBScan?: string;
  fitnessForSurgery: boolean;
  consentSigned: boolean;
  preOpInstructionsGiven: boolean;
  notes?: string;
  recordedAt: string;
  recordedBy: string;
}

// ── Prescription / Drugs ──
export interface DrugItem {
  id: string;
  name: string;
  category: string;
  dosageForm: string;
  strength: string;
  currentStock: number;
  reorderLevel: number;
}

export interface Prescription {
  id: string;
  patientId: string;
  drugId: string;
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  notes?: string;
  prescribedAt: string;
  prescribedBy: string;
}

// ── Eyeglasses ──
export interface EyeglassesItem {
  id: string;
  description: string;
  type: string;
  powerRange?: string;
  currentStock: number;
  reorderLevel: number;
}

export interface EyeglassesIssuance {
  id: string;
  patientId: string;
  patientName?: string;
  eyeglassesItemId: string;
  eyeglassesDescription: string;
  glassesType?: string;
  quantity: number;
  purpose: string;
  prescription: {
    sphereRight?: number;
    cylinderRight?: number;
    axisRight?: number;
    sphereLeft?: number;
    cylinderLeft?: number;
    axisLeft?: number;
    pd?: number;
  };
  notes?: string;
  issuedAt: string;
  issuedBy: string;
}

// ── Reports ──
export interface PatientDemographics {
  total: number;
  bySex: { male: number; female: number };
  byAgeGroup: Record<string, number>;
  byDisability: Record<string, number>;
  topLGAs: { name: string; count: number }[];
}

export interface SurgeryOutcomes {
  total: number;
  byProcedure: Record<string, number>;
  byEye: { right: number; left: number; both: number };
  withComplications: number;
  complicationRate: number;
  averageDuration: number;
}

export interface VAOutcomes {
  totalAssessments: number;
  presentingStage: number;
  postOpStages: number;
  improvementRate: number;
}

export interface FollowUpCompliance {
  totalSurgeries: number;
  day1Completed: number;
  week1Completed: number;
  week5Completed: number;
  day1Rate: number;
  week1Rate: number;
  week5Rate: number;
  sequelaeBreakdown: Record<string, number>;
}

// ── Staff ──
export interface StaffMember {
  id: string;
  name: string;
  role: 'Surgeon' | 'Scrub Nurse' | 'Anesthetist';
  centreCode: string;
}
