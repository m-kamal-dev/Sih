import Link from 'next/link';
import { ArrowRight, BookOpenCheck, Gavel, EyeOff, Quote, UserCheck, ScanSearch } from 'lucide-react';
import { HeroGraph } from '@/components/landing/HeroGraph';
import { RevealRoot, CountUp, StoryScroll, ScanDemo } from '@/components/landing/LandingClient';
import { BrandMark } from '@/components/atoms/BrandMark';
import { PaletteButton } from '@/components/molecules/PaletteButton';
import { DemoButton } from '@/components/molecules/DemoButton';
import { ThemeToggle } from '@/components/molecules/ThemeToggle';
import { AccentPicker } from '@/components/molecules/AccentPicker';
import { EffectsToggle } from '@/components/molecules/EffectsToggle';
import { getLandingStats } from '@/lib/landing-stats';

const GUARDRAILS = [
  { icon: BookOpenCheck, title: 'AI reads and explains', body: 'It extracts values and writes plain-language explanations. It never sets a signal or a decision.' },
  { icon: Gavel, title: 'Rules decide what is flagged', body: 'Written, versioned rules raise every signal, so the same documents always give the same result.' },
  { icon: UserCheck, title: 'Humans approve', body: 'An officer makes every decision and records why. Low-confidence readings must be confirmed first.' },
  { icon: EyeOff, title: 'Hidden text is withheld', body: 'Text hidden in a file is shown to the officer and never sent to the AI, so it cannot steer the reading.' },
  { icon: Quote, title: 'Quotes are verified', body: 'Every AI quote is matched word-for-word against the source. Anything that does not match is dropped and reported.' },
];

export default function LandingPage() {
  const stats = getLandingStats();
  return (
    <div className="eg-landing">
      <header className="eg-landing-nav">
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--color-text)' }}>
          <BrandMark size={28} />
          <span className="font-display" style={{ fontSize: 19, fontWeight: 650 }}>EvidenceGraph</span>
        </Link>
        <nav aria-label="Site" style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <Link href="/queue" className="eg-btn eg-btn-ghost eg-hide-narrow">Officer queue</Link>
          <Link href="/analyze" className="eg-btn eg-btn-ghost eg-hide-narrow">Live check</Link>
          <PaletteButton />
          <EffectsToggle compact />
          <AccentPicker />
          <ThemeToggle />
        </nav>
      </header>

      <main>
        <section className="eg-hero" aria-labelledby="hero-h">
          <div className="eg-hero-bg" aria-hidden />
          <HeroGraph />
          <div className="eg-hero-copy">
            <span className="eg-pill"><span className="eg-live-dot" aria-hidden /> AICTE · SIH26261 prototype</span>
            <h1 id="hero-h">
              Every claim, <span className="eg-gradient-text">linked to its evidence.</span>
            </h1>
            <p className="eg-hero-lede">
              EvidenceGraph reads approval applications, checks every document against written rules, and shows an officer exactly where to look. AI explains. Rules raise signals. A person decides.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/analyze" className="eg-btn eg-btn-primary eg-btn-lg">
                <ScanSearch size={17} aria-hidden /> Try it live
              </Link>
              <DemoButton />
            </div>
          </div>
        </section>

        <RevealRoot>
          <section className="eg-section eg-stats" aria-label="Figures from this repository">
            <Stat value={stats.rules} label="rules loaded" note="from the APH-style rule pack in rules/" />
            <Stat value={stats.faults} label="planted faults in the sample dataset" note={`across ${stats.applications} applications and ${stats.documents} documents`} />
            {stats.tests ? (
              <Stat value={stats.tests.passed} label={`of ${stats.tests.total} automated tests passing`} note={stats.tests.at ? `last run ${stats.tests.at}` : 'from the last test run'} />
            ) : (
              <div className="eg-stat eg-reveal">
                <div className="eg-stat-value">–</div>
                <div className="eg-stat-label">automated tests</div>
                <div className="eg-stat-note">Run the test suite to publish this figure</div>
              </div>
            )}
          </section>

          <section className="eg-section" aria-labelledby="story-h">
            <div className="eg-reveal" style={{ maxWidth: 680, marginBottom: 40 }}>
              <div className="eg-eyebrow">How it works</div>
              <h2 id="story-h" className="eg-h2">From upload to a reasoned decision</h2>
            </div>
            <StoryScroll />
          </section>

          <section className="eg-section" aria-labelledby="scan-h">
            <div className="eg-split">
              <div className="eg-reveal">
                <div className="eg-eyebrow">Live check</div>
                <h2 id="scan-h" className="eg-h2">See what a single PDF gives away</h2>
                <p className="eg-lede">
                  The real check runs on the local server against the actual PDF bytes: file fingerprint, saved versions, the signed part of the file, hidden text and dates. This animation shows the kind of signals it raises.
                </p>
                <Link href="/analyze" className="eg-btn eg-btn-primary" style={{ marginTop: 8 }}>
                  Run it on a sample <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
              <div className="eg-reveal"><ScanDemo /></div>
            </div>
          </section>

          <section className="eg-section" aria-labelledby="guard-h">
            <div className="eg-reveal" style={{ maxWidth: 680, marginBottom: 32 }}>
              <div className="eg-eyebrow">Guardrails</div>
              <h2 id="guard-h" className="eg-h2">Built so the AI cannot overreach</h2>
              <p className="eg-lede">Findings are signals for a person to weigh, never verdicts.</p>
            </div>
            <div className="eg-guard-grid">
              {GUARDRAILS.map((g) => (
                <article key={g.title} className="eg-card eg-reveal eg-guard">
                  <span className="eg-guard-icon"><g.icon size={20} aria-hidden /></span>
                  <h3 style={{ fontSize: 17, margin: '14px 0 6px' }}>{g.title}</h3>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>{g.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="eg-section" aria-labelledby="cta-h">
            <div className="eg-cta eg-reveal">
              <h2 id="cta-h" className="eg-h2" style={{ margin: 0 }}>Ready to look at the evidence?</h2>
              <p className="eg-lede" style={{ margin: '10px auto 24px' }}>Everything runs locally on synthetic sample data. No account needed.</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href="/analyze" className="eg-btn eg-btn-primary eg-btn-lg">Try it live <ArrowRight size={16} aria-hidden /></Link>
                <DemoButton />
                <Link href="/queue" className="eg-btn eg-btn-lg">Open the officer queue</Link>
              </div>
            </div>
          </section>
        </RevealRoot>
      </main>

      <footer className="eg-footer">
        Prototype for Smart India Hackathon problem SIH26261. Sample data is synthetic. Findings are signals for review, not decisions.
      </footer>
    </div>
  );
}

function Stat({ value, label, note }: { value: number; label: string; note: string }) {
  return (
    <div className="eg-stat eg-reveal">
      <div className="eg-stat-value"><CountUp value={value} /></div>
      <div className="eg-stat-label">{label}</div>
      <div className="eg-stat-note">{note}</div>
    </div>
  );
}
