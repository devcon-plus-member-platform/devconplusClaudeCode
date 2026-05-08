import { AnimatePresence, motion } from 'framer-motion'
import { CloseCircleOutline } from 'solar-icon-set'
import { slideUp, backdrop } from '../lib/animation'

// ── Terms & Conditions content ───────────────────────────────────────────────

interface Section {
  number: string
  title: string
  intro?: string
  items?: { label?: string; text: string }[]
  body?: string
}

const TC_SECTIONS: Section[] = [
  {
    number: '1',
    title: 'Acceptance of Terms',
    body: 'By registering for an account, downloading the DEVCON+ mobile application, or accessing our web services, you agree to be bound by these Terms and Conditions. As a participant in this Beta phase, you support our mission as a non-profit organization to build a thriving Philippine developer ecosystem through technology, education, and community impact.',
  },
  {
    number: '2',
    title: 'Eligibility and Account Registration',
    items: [
      { label: 'Registration', text: 'You must provide a valid email address or utilize Google OAuth and complete all required fields, including Full Name, Username, and Chapter selection.' },
      { label: 'Nearby Chapter Selection', text: 'During registration, you are required to select a primary Chapter. The platform may suggest a Nearby Chapter based on your declared location to ensure you receive relevant local updates, regional event invitations, and localized community support.' },
      { label: 'Accuracy', text: 'You represent that all information provided — including School/Company, Social Links (LinkedIn, GitHub, Portfolio), and Tech Stack — is true and accurate.' },
      { label: 'Security', text: 'You are responsible for safeguarding your credentials. DEVCON Philippines Inc. is not liable for unauthorized access resulting from user negligence.' },
    ],
  },
  {
    number: '3',
    title: 'Points+ (XP) System & One-Year Expiration',
    items: [
      { label: 'Non-Monetary Nature', text: 'Points+ (XP) are virtual tokens of community appreciation. They hold no cash value, are not legal tender, and cannot be purchased or transferred.' },
      { label: 'Rolling Expiration', text: "All Points+ (XP) earned shall expire exactly 365 days (one year) from the date of issuance. Expired points will be automatically removed from the user's balance. The platform utilizes a First-In, First-Out (FIFO) redemption model; the system will automatically deduct the oldest active points first when a reward is claimed." },
      { label: 'Abuse Policy', text: 'DEVCON reserves the right to audit balances and revoke points suspected of being earned through scripts, automated tools, or fraudulent activity.' },
    ],
  },
  {
    number: '4',
    title: 'Event Attendance & Digital Ticketing',
    items: [
      { label: 'Mandatory Registration', text: 'Participation in any DEVCON event requires registration via the app. Access is granted via the presentation of a digital QR ticket.' },
      { label: 'Attendance Policy', text: 'To ensure fair access for the community, DEVCON reserves the right to temporarily suspend the registration privileges of users who accrue excessive unexcused absences.' },
    ],
  },
  {
    number: '5',
    title: 'Mission Sustainability & Talent Opportunities',
    items: [
      { label: 'Non-Profit Operations', text: 'DEVCON+ is operated to sustain the non-profit initiatives of DEVCON Philippines. By using this platform, you acknowledge that certain features are designed to connect the community with career advancement opportunities that help fund and maintain our grassroots programs.' },
      { label: 'Career Facilitation', text: 'DEVCON+ acts as a bridge between the developer community and professional opportunities; however, we do not guarantee employment or specific outcomes.' },
    ],
  },
]

// ── Privacy Policy content ───────────────────────────────────────────────────

interface DataRow { label: string; text: string }
interface PPSection {
  number: string
  title: string
  intro?: string
  rows?: DataRow[]
  items?: { label?: string; text: string }[]
  body?: string
  contact?: boolean
}

const PP_SECTIONS: PPSection[] = [
  {
    number: '1',
    title: 'Information Collection',
    intro: 'We collect personal and professional data that you voluntarily provide to facilitate community engagement:',
    rows: [
      { label: 'Identity Data', text: 'Full Name, Username, Email, and Password.' },
      { label: 'Professional Data', text: 'School/Company, Tech Stack, Tech Passions, and Contribution Preferences.' },
      { label: 'Digital Footprint', text: 'Social Links (LinkedIn, GitHub) and Portfolio URLs.' },
      { label: 'Technical Data', text: 'Collected via Google Analytics and Google Tag Manager (GTM), including device type, IP address, and platform usage patterns.' },
    ],
  },
  {
    number: '2',
    title: 'Use of Personal Data',
    intro: 'Your data is processed to:',
    items: [
      { text: 'Manage your member profile and Chapter-specific engagement based on your Nearby Chapter selection.' },
      { text: 'Enforce the 365-day Points+ expiration through timestamp tracking.' },
      { text: 'Deliver push notifications and service updates.' },
      { text: 'Optimize platform performance via monitoring and technical analysis.' },
    ],
  },
  {
    number: '3',
    title: 'Responsible Talent Matching & Partner Consent',
    intro: 'To sustain our non-profit operations and provide value to our members, we implement the following responsible data practices:',
    items: [
      { label: 'Strictly Consented Talent Matching', text: 'With your explicit and separate consent, DEVCON may process and share your professional profile and community milestones with authorized partners. This is designed to connect members with career opportunities while ensuring your data is handled with the highest standard of accountability.' },
      { label: 'Compliant Data Processing Agreements (DPA)', text: 'All data sharing is conducted under strictly defined and compliant Data Processing Agreements. These agreements ensure that authorized partners adhere to the same rigorous privacy standards as DEVCON, limiting the use of shared data exclusively to the talent opportunities for which you have provided consent.' },
      { label: 'Consented Marketing', text: 'By opting into our marketing agreements, you agree to receive curated information regarding community updates, career opportunities, and partner-sponsored initiatives that align with your indicated tech interests.' },
      { label: 'Sustainability & Transparency', text: "These partnerships are vital to sustaining DEVCON's non-profit mission. We remain transparent about who our authorized partners are and ensure that your data is never used for purposes outside of your documented consent." },
    ],
  },
  {
    number: '4',
    title: 'Data Storage and Security',
    items: [
      { label: 'Security Measures', text: 'We utilize industry-standard encryption, secure authentication protocols, and protected cloud hosting.' },
      { label: 'Retention', text: 'Active data is kept for the duration of your membership. Points transaction history is purged 365 days after issuance.' },
      { label: 'Account Deletion', text: 'Upon requesting account deletion, all Personal Identifiable Information (PII) is permanently removed from our active databases within seven (7) working days.' },
    ],
  },
  {
    number: '5',
    title: 'Your Rights & Contact Information',
    body: 'You have the right to access, correct, or object to the processing of your data. You may withdraw your consent for talent matching or marketing at any time through your account settings.',
    contact: true,
  },
]

// ── Shared section renderer ───────────────────────────────────────────────────

function SectionCard({ section }: { section: PPSection }) {
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="w-7 h-7 rounded-lg bg-[#1152d4] flex items-center justify-center shrink-0">
          <span className="text-white text-[11px] font-bold font-proxima">{section.number}</span>
        </div>
        <h2 className="text-md3-title-md font-bold text-slate-900 font-proxima leading-tight">
          {section.title}
        </h2>
      </div>
      <div className="px-4 py-4 space-y-3">
        {section.intro && (
          <p className="text-md3-body-md text-slate-500 leading-relaxed">{section.intro}</p>
        )}
        {section.rows && (
          <div className="rounded-xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
            {section.rows.map((row) => (
              <div key={row.label} className="px-3 py-3 bg-slate-50/60">
                <p className="text-md3-label-md font-semibold text-[#1152d4] mb-0.5">{row.label}</p>
                <p className="text-md3-body-sm text-slate-600 leading-relaxed">{row.text}</p>
              </div>
            ))}
          </div>
        )}
        {section.body && (
          <p className="text-md3-body-md text-slate-600 leading-relaxed">{section.body}</p>
        )}
        {section.items && (
          <ul className="space-y-3">
            {section.items.map((item, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#1152d4] shrink-0" />
                <p className="text-md3-body-md text-slate-600 leading-relaxed">
                  {item.label && <span className="font-semibold text-slate-800">{item.label}: </span>}
                  {item.text}
                </p>
              </li>
            ))}
          </ul>
        )}
        {section.contact && (
          <div className="mt-1 bg-blue/5 border border-blue/15 rounded-xl px-4 py-3">
            <p className="text-md3-label-md text-slate-500 mb-1">Data Protection Officer</p>
            <p className="text-md3-label-lg font-semibold text-[#1152d4] font-proxima">
              plusmemberplatform@devcon.ph
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

export type LegalModalType = 'terms' | 'privacy'

interface LegalModalProps {
  type: LegalModalType | null
  onClose: () => void
}

export default function LegalModal({ type, onClose }: LegalModalProps) {
  const isTerms = type === 'terms'

  return (
    <AnimatePresence>
      {type && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-50"
            variants={backdrop}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 bg-slate-50 rounded-t-3xl max-h-[90dvh] flex flex-col shadow-2xl"
            variants={slideUp}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            {/* Handle + title row */}
            <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-slate-100 shrink-0">
              <div className="w-9 h-1 bg-slate-200 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
              <h2 className="text-md3-title-md font-bold text-slate-900 font-proxima pt-2">
                {isTerms ? 'Terms & Conditions' : 'Privacy Policy'}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors pt-2"
              >
                <CloseCircleOutline color="#94A3B8" width={22} height={22} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-4 pt-4 pb-8 space-y-3">
              {isTerms ? (
                <>
                  <div className="bg-blue/8 border border-blue/15 rounded-2xl px-4 py-3">
                    <p className="text-md3-label-md text-slate-500 leading-relaxed">
                      Please read these Terms carefully before using the DEVCON+ platform. By continuing, you agree to be bound by these terms.
                    </p>
                  </div>
                  {TC_SECTIONS.map((s) => <SectionCard key={s.number} section={s} />)}
                  <div className="rounded-2xl border border-slate-200 px-4 py-4 bg-white">
                    <p className="text-md3-label-md text-slate-400 text-center leading-relaxed">
                      These Terms &amp; Conditions apply to the Beta version of DEVCON+. They may be updated as the platform evolves.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-green/8 border border-green/20 rounded-2xl px-4 py-3 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-green/15 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-green text-[11px] font-bold">RA</span>
                    </div>
                    <p className="text-md3-label-md text-slate-600 leading-relaxed">
                      In compliance with{' '}
                      <span className="font-semibold text-slate-800">
                        Republic Act No. 10173 — Philippine Data Privacy Act of 2012
                      </span>
                    </p>
                  </div>
                  {PP_SECTIONS.map((s) => <SectionCard key={s.number} section={s} />)}
                  <div className="rounded-2xl border border-slate-200 px-4 py-4 bg-white">
                    <p className="text-md3-label-md text-slate-400 text-center leading-relaxed">
                      This policy applies to the Beta version of DEVCON+. It may be updated as the platform evolves and our data practices mature.
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
