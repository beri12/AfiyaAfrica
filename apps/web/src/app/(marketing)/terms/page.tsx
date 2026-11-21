import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="21 November 2026">
      <p>These terms govern use of AfyaLink AI by clinics and their authorised users during the pilot programme.</p>
      <h2>1. The service</h2>
      <p>AfyaLink AI provides software for clinic administration, scheduling, documentation and communication. It is not a medical device and does not provide diagnosis, prescriptions or treatment decisions.</p>
      <h2>2. Clinical responsibility</h2>
      <p>All clinical decisions remain the responsibility of qualified healthcare professionals. AI-generated content is a draft that must be reviewed, corrected where necessary and signed by a clinician before it forms part of a record.</p>
      <h2>3. Accounts</h2>
      <ul>
        <li>Clinic administrators are responsible for inviting and removing staff and assigning appropriate roles.</li>
        <li>Users must keep credentials confidential. Multi-factor authentication is recommended for privileged roles.</li>
      </ul>
      <h2>4. Clinic obligations</h2>
      <p>Clinics must obtain and record patient consent, enter accurate information and use the service in line with applicable law, including data protection law.</p>
      <h2>5. Plans and billing</h2>
      <p>Plans are billed monthly in USD after a 30-day trial. During the pilot, payments are processed in sandbox mode and no real charges are made.</p>
      <h2>6. Availability</h2>
      <p>We aim for high availability but the pilot is provided without a formal service-level agreement. Clinics should maintain contingency procedures for downtime.</p>
      <h2>7. Liability</h2>
      <p>To the extent permitted by law, AfyaLink AI is not liable for clinical outcomes or for decisions made using information in the platform.</p>
      <h2>8. Contact</h2>
      <p>Questions about these terms can be sent through our contact page.</p>
    </LegalPage>
  );
}
