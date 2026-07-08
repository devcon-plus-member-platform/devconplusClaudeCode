import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutline } from 'solar-icon-set'

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

interface Section {
  number: string
  title: string
  intro?: string
  items?: { label?: string; text: string }[]
  body?: string
}

const SECTIONS: Section[] = [
  {
    number: '1',
    title: 'Acceptance of Terms',
    body: 'By registering for an account, downloading the DEVCON+ mobile application, or accessing our web services, you agree to be bound by these Terms and Conditions. As a participant in this Beta phase, you support our mission as a non-profit organization to build a thriving Philippine developer ecosystem through technology, education, and community impact.',
  },
  {
    number: '2',
    title: 'Eligibility and Account Registration',
    items: [
      {
        label: 'Registration',
        text: 'You must provide a valid email address or utilize Google OAuth and complete all required fields, including Full Name, Username, and Chapter selection.',
      },
      {
        label: 'Nearby Chapter Selection',
        text: 'During registration, you are required to select a primary Chapter. The platform may suggest a Nearby Chapter based on your declared location to ensure you receive relevant local updates, regional event invitations, and localized community support.',
      },
      {
        label: 'Accuracy',
        text: 'You represent that all information provided — including School/Company, Social Links (LinkedIn, GitHub, Portfolio), and Tech Stack — is true and accurate.',
      },
      {
        label: 'Security',
        text: 'You are responsible for safeguarding your credentials. DEVCON Philippines Inc. is not liable for unauthorized access resulting from user negligence.',
      },
    ],
  },
  {
    number: '3',
    title: 'Points+ (XP) System & Annual Reset',
    items: [
      {
        label: 'Non-Monetary Nature',
        text: 'Points+ (XP) are virtual tokens of community appreciation. They hold no cash value, are not legal tender, and cannot be purchased or transferred.',
      },
      {
        label: 'Annual Reset (June 24)',
        text: 'All Points+ (XP) — including both your spendable balance and total earned points — are valid until June 24 of each year. On June 24 at 12:00 AM Philippine Standard Time (UTC+8), all point balances reset to zero and a new earning period begins. Points do not carry over between periods, so members are encouraged to redeem rewards before the reset date.',
      },
      {
        label: 'Abuse Policy',
        text: 'DEVCON reserves the right to audit balances and revoke points suspected of being earned through scripts, automated tools, or fraudulent activity.',
      },
    ],
  },
  {
    number: '4',
    title: 'Event Attendance & Digital Ticketing',
    items: [
      {
        label: 'Mandatory Registration',
        text: 'Participation in any DEVCON event requires registration via the app. Access is granted via the presentation of a digital QR ticket.',
      },
      {
        label: 'Attendance Policy',
        text: 'To ensure fair access for the community, DEVCON reserves the right to temporarily suspend the registration privileges of users who accrue excessive unexcused absences.',
      },
    ],
  },
  {
    number: '5',
    title: 'Mission Sustainability & Talent Opportunities',
    items: [
      {
        label: 'Non-Profit Operations',
        text: 'DEVCON+ is operated to sustain the non-profit initiatives of DEVCON Philippines. By using this platform, you acknowledge that certain features are designed to connect the community with career advancement opportunities that help fund and maintain our grassroots programs.',
      },
      {
        label: 'Career Facilitation',
        text: 'DEVCON+ acts as a bridge between the developer community and professional opportunities; however, we do not guarantee employment or specific outcomes.',
      },
    ],
  },
  {
    number: '6',
    title: 'Safe Space & Event Risk Consent',
    items: [
      {
        label: 'Safe and Respectful Environment',
        text: 'By attending a DEVCON offline event, you agree to help us maintain a safe, welcoming, and respectful environment for everyone. We will not tolerate harassment, discrimination, or threats.',
      },
      {
        label: 'Safety and Responsibility',
        text: 'We do our best to ensure safety at our events. However, by attending, you agree to accept the inherent risks associated with any in-person events.',
      },
    ],
  },
  {
    number: '7',
    title: 'Contact',
    items: [
      {
        label: 'Organizer Contact and Responsibility',
        text: 'Local events are organized by individual DEVCON chapters. For guidelines and support, contact the local Facebook page of the DEVCON Chapter organizing the event.',
      },
      {
        label: 'National Events',
        text: 'For summits or events organized directly by the national DEVCON office, contact hello@devcon.ph.',
      },
    ],
  },
]

export default function TermsAndConditions() {
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
                Terms &amp; Conditions
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="px-4 pt-5 pb-24 md:max-w-2xl md:mx-auto space-y-3">
        {/* Effective notice */}
        <div className="bg-blue/8 border border-blue/15 rounded-2xl px-4 py-3">
          <p className="text-md3-label-md text-slate-500 leading-relaxed">
            Please read these Terms carefully before using the DEVCON+ platform. By continuing, you agree to be bound by these terms.
          </p>
        </div>

        {/* Sections */}
        {SECTIONS.map((section, idx) => (
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

            {/* Section body */}
            <div className="px-4 py-4 space-y-3">
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
            </div>

            {/* Divider between sections that aren't the last */}
            {idx < SECTIONS.length - 1 && (
              <div className="h-px bg-slate-50 mx-4" />
            )}
          </div>
        ))}

        {/* Footer note */}
        <div className="rounded-2xl border border-slate-200 px-4 py-4 bg-white">
          <p className="text-md3-label-md text-slate-400 text-center leading-relaxed">
            These Terms &amp; Conditions apply to the Beta version of DEVCON+.{' '}
            They may be updated as the platform evolves.
          </p>
        </div>

        {/* Privacy Policy link */}
        <button
          onClick={() => navigate('/privacy-policy')}
          className="w-full bg-primary/5 border border-primary/15 rounded-2xl px-4 py-4 flex items-center justify-between active:bg-primary/10 transition-colors"
        >
          <div className="text-left">
            <p className="text-md3-label-lg font-semibold text-primary font-proxima">
              Data Privacy Policy
            </p>
            <p className="text-md3-label-md text-slate-500 mt-0.5">
              How we collect and handle your data
            </p>
          </div>
          <span className="text-primary text-lg">›</span>
        </button>
      </div>
    </div>
  )
}
