import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  CalendarClock,
  ClipboardList,
  FileClock,
  FileLock2,
  FileText,
  FlaskConical,
  Fingerprint,
  KeyRound,
  Languages,
  ListChecks,
  ScrollText,
  ShieldCheck,
  Stethoscope,
  Unplug,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { Counter } from '@/components/motion/counter';
import { Parallax } from '@/components/motion/parallax';
import { HomeHero } from '@/components/marketing/home-hero';
import { ConnectDiagram, HowItWorks } from '@/components/marketing/home-sections';
import { CheckList, Container, CtaBand, FeatureGrid, PricingCards, SectionHeading } from '@/components/marketing/blocks';

const PROBLEMS = [
  { icon: FileClock, title: 'Paper registers and lost files', description: 'Patient details live in notebooks and folders that are slow to search and easy to lose.' },
  { icon: CalendarClock, title: 'Missed and double-booked visits', description: 'Without a shared schedule, appointments clash and patients forget follow-up visits.' },
  { icon: Unplug, title: 'Disconnected care', description: 'Front desk, doctors and labs work from separate records, so information falls through the gaps.' },
  { icon: ClipboardList, title: 'Heavy administrative load', description: 'Clinicians spend valuable time writing up notes and chasing paperwork instead of seeing patients.' },
];

const FEATURES = [
  { icon: Users, title: 'Patient management', description: 'Fast registration, search by name, phone or MRN, consent records and a complete visit history.' },
  { icon: CalendarClock, title: 'Smart scheduling', description: 'Doctor availability, service durations and real-time slot search — conflicting bookings are blocked automatically.' },
  { icon: FileText, title: 'Clinical documentation', description: 'Structured notes with draft, review, signed and amended states. Every version is preserved.' },
  { icon: Bell, title: 'Reminders & notifications', description: 'In-app, SMS and email reminders that respect patient consent and never expose clinical details.' },
  { icon: ListChecks, title: 'Follow-up tasks', description: 'Assign, prioritise and track patient follow-ups so nothing slips through the cracks.' },
  { icon: FlaskConical, title: 'Laboratory workflow', description: 'Doctors order tests, lab staff record results, and results reach the right clinician securely.' },
  { icon: BarChart3, title: 'Operational analytics', description: 'Appointment volumes, completion, cancellations, no-shows and service utilisation from live data.' },
  { icon: Languages, title: 'Built for Ethiopia', description: 'English and Amharic today, with Afaan Oromo and Tigrinya designed in. Addis Ababa time by default.' },
];

const SECURITY = [
  { icon: Fingerprint, title: 'Strict tenant isolation', description: "Each clinic's data is separated and every request is checked against the user's clinic membership." },
  { icon: KeyRound, title: 'Strong authentication', description: 'Argon2id password hashing, rotating sessions with theft detection, and optional two-factor sign-in.' },
  { icon: UserRoundCheck, title: 'Role-based access', description: 'Receptionists never see clinical notes. Doctors only see patients in their care. Enforced on the server.' },
  { icon: FileLock2, title: 'Encrypted clinical content', description: 'Clinical notes, results and summaries are encrypted at the application layer on top of disk encryption.' },
  { icon: ScrollText, title: 'Complete audit trail', description: 'Every record view and change is logged, so clinics can show who accessed what, and when.' },
  { icon: ShieldCheck, title: 'Privacy by design', description: 'Data minimisation and consent management, designed for review against Ethiopian data protection law.' },
];

export default function HomePage() {
  return (
    <>
      {/* 1. Hero */}
      <HomeHero />

      {/* 2. The problem */}
      <section className="py-24 sm:py-28">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="The challenge"
              title="Clinic operations still run on paper and memory"
              description="Private clinics deliver care under pressure. Fragmented, manual workflows make every day harder for staff and patients."
            />
          </Reveal>
          <div className="mt-14">
            <FeatureGrid features={PROBLEMS} columns={4} />
          </div>
        </Container>
      </section>

      {/* 3. The AfyaLink solution */}
      <section className="relative overflow-hidden bg-white py-24 sm:py-28">
        <Parallax speed={0.25} className="pointer-events-none absolute -right-32 top-10 size-96 rounded-full bg-teal-100/60 blur-3xl">
          <span />
        </Parallax>
        <Container className="relative grid items-center gap-16 lg:grid-cols-2">
          <Reveal>
            <SectionHeading
              align="left"
              eyebrow="The AfyaLink solution"
              title="One connected platform for the whole care journey"
              description="AfyaLink AI brings patients, health professionals and clinic teams onto a single secure system, so information flows to the people who need it."
            />
            <div className="mt-8">
              <CheckList
                items={[
                  'A shared, real-time schedule for front desk and doctors',
                  'One patient record per clinic, with clinical data protected separately',
                  'Patients book, receive reminders and see shared summaries in a portal',
                  'AI that drafts paperwork — clinicians review and decide',
                ]}
              />
            </div>
          </Reveal>
          <ConnectDiagram />
        </Container>
      </section>

      {/* 4. Product features */}
      <section className="py-24 sm:py-28" id="features">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Product features" title="Everything a modern clinic needs" description="Purpose-built modules that work together out of the box." />
          </Reveal>
          <div className="mt-14">
            <FeatureGrid features={FEATURES} columns={4} />
          </div>
        </Container>
      </section>

      {/* 5. How it works */}
      <section className="bg-white py-24 sm:py-28">
        <Container className="grid gap-16 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal className="lg:sticky lg:top-32 lg:self-start">
            <SectionHeading align="left" eyebrow="How it works" title="Live in four simple steps" description="No servers to install. Your team works from any modern browser on desktop, tablet or phone." />
            <div data-reveal className="mt-8">
              <Button asChild>
                <Link href="/register-clinic">
                  Start with step one <ArrowRight />
                </Link>
              </Button>
            </div>
          </Reveal>
          <HowItWorks />
        </Container>
      </section>

      {/* 6. Clinic benefits */}
      <section className="py-24 sm:py-28">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Clinic benefits" title="Designed around how clinics actually work" />
          </Reveal>
          <Reveal className="mt-14 grid gap-5 md:grid-cols-3" stagger={0.1}>
            {[
              { value: 6, suffix: '', label: 'Role-based workspaces', text: 'Admin, doctor, reception, lab, patient and platform views — each showing only what that role needs.' },
              { value: 5, suffix: '', label: 'Appointment states tracked', text: 'Pending through completed, cancelled and no-show, with full status history for every visit.' },
              { value: 100, suffix: '%', label: 'Clinician sign-off on AI drafts', text: 'No AI-assisted note becomes part of the record until a clinician reviews and signs it.' },
            ].map((b) => (
              <div key={b.label} data-reveal className="rounded-3xl border border-line bg-white p-8 shadow-[var(--shadow-card)]">
                <p className="font-display text-5xl font-extrabold text-brand-800">
                  <Counter value={b.value} suffix={b.suffix} />
                </p>
                <p className="mt-3 text-base font-semibold text-ink">{b.label}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{b.text}</p>
              </div>
            ))}
          </Reveal>
          <p className="mt-6 text-center text-xs text-muted">Figures describe product design, not measured clinical or operational outcomes.</p>
        </Container>
      </section>

      {/* 7. AI capabilities */}
      <section className="relative overflow-hidden bg-brand-950 py-24 text-white sm:py-28">
        <div className="bg-grid absolute inset-0 opacity-20" aria-hidden />
        <div className="absolute -left-40 top-20 size-[480px] rounded-full bg-violet-500/15 blur-3xl" aria-hidden />
        <Container className="relative grid items-center gap-16 lg:grid-cols-2">
          <Reveal>
            <SectionHeading
              light
              align="left"
              eyebrow="AI capabilities"
              title="AI that assists. Clinicians decide."
              description="AfyaLink AI takes on administrative and documentation work. It never diagnoses, prescribes or decides treatment."
            />
            <div className="mt-8">
              <CheckList
                light
                items={[
                  "Structures a doctor's own notes into a clear draft and lists what's missing",
                  'Every AI draft is labelled and must be reviewed and signed by a clinician',
                  'Identifiers are removed before anything reaches an external AI service',
                  'Health information answers come only from approved sources',
                  'Emergency language triggers immediate guidance to seek urgent care',
                ]}
              />
            </div>
          </Reveal>
          <Reveal className="space-y-4" stagger={0.12}>
            <div data-reveal className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Doctor&apos;s notes</p>
              <p className="mt-2 font-mono text-sm text-white/80">cough 3 days, productive, temp 37.9, no SOB. review 1 wk</p>
            </div>
            <div data-reveal className="rounded-2xl border border-violet-300/30 bg-white p-5 text-ink shadow-[var(--shadow-lift)]">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
                  <Bot className="size-3.5" aria-hidden /> AI-generated draft · not reviewed
                </span>
                <span className="text-xs text-muted">Illustrative example</span>
              </div>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div><dt className="font-semibold">Chief complaint</dt><dd className="text-muted">Productive cough for 3 days.</dd></div>
                <div><dt className="font-semibold">Examination</dt><dd className="text-muted">Temperature 37.9 °C. No shortness of breath reported.</dd></div>
                <div><dt className="font-semibold">Plan</dt><dd className="text-muted">Review in one week.</dd></div>
                <div><dt className="font-semibold text-amber-700">Missing information</dt><dd className="text-muted">Associated symptoms and medication history not documented.</dd></div>
              </dl>
              <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
                <Stethoscope className="size-4 text-teal-600" aria-hidden /> Awaiting clinician review and signature
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* 8. Security and privacy */}
      <section className="py-24 sm:py-28" id="security">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Security & privacy" title="Patient trust is built into every layer" description="Security is a core product requirement, not an add-on." />
          </Reveal>
          <div className="mt-14">
            <FeatureGrid features={SECURITY} />
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted">
            AfyaLink AI is in pilot. We do not claim regulatory certification; our data handling is being reviewed against the Ethiopian Personal Data Protection Proclamation No. 1321/2024.
          </p>
        </Container>
      </section>

      {/* 9. Pricing */}
      <section className="bg-white py-24 sm:py-28" id="pricing">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Pricing" title="Simple plans that grow with your clinic" description="Every plan starts with a 30-day trial. Payments run in sandbox mode during the pilot." />
          </Reveal>
          <div className="mt-14">
            <PricingCards />
          </div>
        </Container>
      </section>

      {/* 10. Call to action (11. footer rendered by layout) */}
      <CtaBand />
    </>
  );
}
