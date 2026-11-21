import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="21 November 2026">
      <p>This policy explains how AfyaLink AI processes personal data when clinics, their staff and their patients use our platform. It is designed with the Ethiopian Personal Data Protection Proclamation No. 1321/2024 in mind.</p>
      <h2>1. Roles</h2>
      <p>Each clinic is the controller of the patient data it records. AfyaLink AI acts as a processor on the clinic&apos;s behalf, and as controller only for account and billing data about clinic users.</p>
      <h2>2. Data we process</h2>
      <ul>
        <li>Account data: name, email, phone, role and sign-in activity of clinic staff.</li>
        <li>Patient demographics recorded by clinics: name, date of birth, sex, contact details and optional emergency contact.</li>
        <li>Clinical data recorded by clinicians: notes, clinical summaries and laboratory results — encrypted at the application layer.</li>
        <li>Operational data: appointments, follow-up tasks, notifications and audit logs.</li>
      </ul>
      <p>We do not ask for national ID numbers, religion, ethnicity or income.</p>
      <h2>3. Purposes and legal basis</h2>
      <p>Data is processed to provide healthcare operations services to clinics, on the basis of the clinic&apos;s contract with us and the patient&apos;s consent recorded by the clinic. Reminders by SMS or email are only sent with a recorded consent.</p>
      <h2>4. Artificial intelligence</h2>
      <ul>
        <li>AI features are optional and require a configured provider.</li>
        <li>Direct identifiers are removed before text is sent to an external AI service unless the clinic has completed a documented privacy, legal and contractual approval.</li>
        <li>We do not use patient data to train AI models. We store AI usage metadata (feature, model, timing, safety flags) and a one-way hash of the prompt — not the prompt itself.</li>
        <li>Patients may decline AI-assisted documentation.</li>
      </ul>
      <h2>5. Access and security</h2>
      <p>Access is role-based and limited to the clinic the user belongs to; doctors only see clinical data for patients in their care. Every record view is logged. Data is encrypted in transit (TLS) and sensitive fields are encrypted at rest.</p>
      <h2>6. Cross-border processing</h2>
      <p>Pilot infrastructure location and any external AI or messaging providers are listed in our data processing addendum. Transfers outside Ethiopia occur only where permitted by law and agreed with the clinic.</p>
      <h2>7. Retention</h2>
      <p>Clinical records, consents and audit logs are retained as required by the clinic&apos;s legal obligations. Operational data such as expired sessions, read notifications and AI usage metadata are purged on a fixed schedule.</p>
      <h2>8. Your rights</h2>
      <p>Patients may request access, correction or deletion through their clinic. Clinic users can contact us via the contact page. We will respond within the time limits set by applicable law.</p>
    </LegalPage>
  );
}
