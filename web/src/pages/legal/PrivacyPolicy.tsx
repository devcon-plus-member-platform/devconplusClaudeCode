import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutline } from 'solar-icon-set'

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

interface DataRow {
  label: string
  text: string
}

interface Section {
  number: string
  title: string
  intro?: string
  rows?: DataRow[]
  items?: { label?: string; text: string }[]
  body?: string
  contact?: boolean
}

const SECTIONS: Section[] = [
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
      {
        label: 'Strictly Consented Talent Matching',
        text: 'With your explicit and separate consent, DEVCON may process and share your professional profile and community milestones with authorized partners. This is designed to connect members with career opportunities while ensuring your data is handled with the highest standard of accountability.',
      },
      {
        label: 'Compliant Data Processing Agreements (DPA)',
        text: 'All data sharing is conducted under strictly defined and compliant Data Processing Agreements. These agreements ensure that authorized partners adhere to the same rigorous privacy standards as DEVCON, limiting the use of shared data exclusively to the talent opportunities for which you have provided consent.',
      },
      {
        label: 'Consented Marketing',
        text: 'By opting into our marketing agreements, you agree to receive curated information regarding community updates, career opportunities, and partner-sponsored initiatives that align with your indicated tech interests.',
      },
      {
        label: 'Sustainability & Transparency',
        text: 'These partnerships are vital to sustaining DEVCON\'s non-profit mission. We remain transparent about who our authorized partners are and ensure that your data is never used for purposes outside of your documented consent.',
      },
    ],
  },
  {
    number: '4',
    title: 'Data Storage and Security',
    items: [
      {
        label: 'Security Measures',
        text: 'We utilize industry-standard encryption, secure authentication protocols, and protected cloud hosting.',
      },
      {
        label: 'Retention',
        text: 'Active data is kept for the duration of your membership. Points transaction history is purged 365 days after issuance.',
      },
      {
        label: 'Account Deletion',
        text: 'Upon requesting account deletion, all Personal Identifiable Information (PII) is permanently removed from our active databases within seven (7) working days.',
      },
    ],
  },
  {
    number: '5',
    title: 'Your Rights & Contact Information',
    body: 'You have the right to access, correct, or object to the processing of your data. You may withdraw your consent for talent matching or marketing at any time through your account settings.',
    contact: true,
  },
]

export default function PrivacyPolicy() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-50">
        <div
          className="bg-primary relative overflow-hidden pb-6 pt-14"
          style={{
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundRepeat: 'repeat',
          }}
        >
          <div className="relative z-10 px-4 flex items-start gap-3">
            <button
              onClick={() => navigate(-1)}
              className="mt-0.5 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
            >
              <ArrowLeftOutline color="white" size={20} />
            </button>
            <div className="min-w-0">
              <p className="text-white/70 text-md3-label-md font-proxima uppercase tracking-widest mb-0.5">
                DEVCON+ Beta
              </p>
              <h1 className="text-white text-[22px] font-bold font-proxima leading-tight">
                Data Privacy Policy
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="px-4 pt-5 pb-24 md:max-w-2xl md:mx-auto space-y-3">
        {/* RA 10173 badge */}
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

        {/* Sections */}
        {SECTIONS.map((section) => (
          <div
            key={section.number}
            className="bg-white rounded-2xl shadow-card overflow-hidden"
          >
            {/* Section header */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <span className="text-white text-[11px] font-bold font-proxima">{section.number}</span>
              </div>
              <h2 className="text-md3-title-md font-bold text-slate-900 font-proxima leading-tight">
                {section.title}
              </h2>
            </div>

            <div className="px-4 py-4 space-y-3">
              {section.intro && (
                <p className="text-md3-body-md text-slate-500 leading-relaxed">
                  {section.intro}
                </p>
              )}

              {/* Table-style rows for data types */}
              {section.rows && (
                <div className="rounded-xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
                  {section.rows.map((row) => (
                    <div key={row.label} className="px-3 py-3 bg-slate-50/60">
                      <p className="text-md3-label-md font-semibold text-primary mb-0.5">
                        {row.label}
                      </p>
                      <p className="text-md3-body-sm text-slate-600 leading-relaxed">
                        {row.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {section.body && (
                <p className="text-md3-body-md text-slate-600 leading-relaxed">
                  {section.body}
                </p>
              )}

              {section.items && (
                <ul className="space-y-3">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <p className="text-md3-body-md text-slate-600 leading-relaxed">
                        {item.label && (
                          <span className="font-semibold text-slate-800">{item.label}: </span>
                        )}
                        {item.text}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {/* Contact block for section 5 */}
              {section.contact && (
                <div className="mt-1 bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
                  <p className="text-md3-label-md text-slate-500 mb-1">
                    Data Protection Officer
                  </p>
                  <p className="text-md3-label-lg font-semibold text-primary font-proxima">
                    plusmemberplatform@devcon.ph
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Footer note */}
        <div className="rounded-2xl border border-slate-200 px-4 py-4 bg-white">
          <p className="text-md3-label-md text-slate-400 text-center leading-relaxed">
            This policy applies to the Beta version of DEVCON+. It may be updated as the platform evolves and our data practices mature.
          </p>
        </div>

        {/* T&C link */}
        <button
          onClick={() => navigate('/terms-and-conditions')}
          className="w-full bg-primary/5 border border-primary/15 rounded-2xl px-4 py-4 flex items-center justify-between active:bg-primary/10 transition-colors"
        >
          <div className="text-left">
            <p className="text-md3-label-lg font-semibold text-primary font-proxima">
              Terms &amp; Conditions
            </p>
            <p className="text-md3-label-md text-slate-500 mt-0.5">
              Rules governing use of the platform
            </p>
          </div>
          <span className="text-primary text-lg">›</span>
        </button>
      </div>
    </div>
  )
}
