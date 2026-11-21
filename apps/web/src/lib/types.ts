/** Response shapes used by the web app (mirroring API selects). */
export interface PersonName { id?: string; firstName: string; lastName: string }

export interface PatientSummary {
  id: string;
  medicalRecordNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  phone: string | null;
  status: string;
  createdAt: string;
}

export interface PatientDetail extends PatientSummary {
  email: string | null;
  city: string | null;
  subCity: string | null;
  preferredLanguage: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  hasPortalAccount: boolean;
  consents: { type: string; granted: boolean; createdAt: string; method: string }[];
  careAssignments: { id: string; doctor: { id: string; specialty: string | null; membership: { user: PersonName } } }[];
}

export interface DoctorRef { id: string; specialty: string | null; membership: { user: PersonName } }

export interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  reason: string | null;
  cancellationReason: string | null;
  bookedByPatient: boolean;
  patient: { id: string; firstName: string; lastName: string; medicalRecordNumber: string; phone: string | null };
  doctor: DoctorRef;
  service: { id: string; name: string; durationMinutes: number };
  statusHistory?: { fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }[];
}

export interface ClinicService { id: string; name: string; description: string | null; durationMinutes: number; priceEtbCents: number | null; active: boolean }

export interface Doctor extends DoctorRef { availability: { dayOfWeek: number; startMinute: number; endMinute: number }[] }

export interface StaffMember {
  id: string;
  role: string;
  status: string;
  createdAt: string;
  user: { id: string; email: string; firstName: string; lastName: string; phone: string | null; lastLoginAt: string | null; mfaEnabled: boolean };
  doctor: { id: string; specialty: string | null; licenseNumber: string | null } | null;
}

export interface NoteMeta {
  id: string;
  title: string;
  status: string;
  source: string;
  shareWithPatient: boolean;
  currentVersion: number;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  patient: { id: string; firstName: string; lastName: string; medicalRecordNumber: string };
  author: PersonName;
}

export interface NoteSectionsT { chiefComplaint?: string; history?: string; examination?: string; assessment?: string; plan?: string; additionalNotes?: string }

export interface NoteDetail extends NoteMeta {
  versions: { id: string; version: number; status: string; source: string; amendmentReason: string | null; createdAt: string; aiInteractionId: string | null; author: PersonName; sections: NoteSectionsT }[];
  current: NoteDetail['versions'][number];
  aiReviews: { decision: string; createdAt: string; reviewer: PersonName }[];
}

export interface FollowUp {
  id: string;
  title: string;
  details: string | null;
  dueDate: string;
  priority: string;
  status: string;
  completedAt: string | null;
  patient: { id: string; firstName: string; lastName: string; medicalRecordNumber: string };
  assignedTo: PersonName | null;
  createdBy: PersonName;
}

export interface NotificationItem { id: string; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

export interface Clinic {
  id: string;
  name: string;
  status: string;
  statusReason: string | null;
  city: string;
  subCity: string | null;
  addressLine: string | null;
  phone: string;
  email: string;
  licenseNumber: string | null;
  timezone: string;
  defaultAppointmentMinutes: number;
  reminderHoursBefore: number;
  aiExternalProcessingApproved: boolean;
}

export interface LabOrder {
  id: string;
  testName: string;
  priority: string;
  instructions: string | null;
  status: string;
  createdAt: string;
  laboratory: { id: string; name: string };
  patient: { id: string; firstName: string; lastName: string; medicalRecordNumber: string; dateOfBirth: string; sex: string };
  orderedBy: PersonName;
  result: null | { id: string; createdAt: string; restricted?: boolean; resultText?: string; unit?: string | null; referenceRange?: string | null; abnormal?: boolean };
}
