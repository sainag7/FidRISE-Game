import React, { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, CreditCard, DollarSign, ArrowUpRight,
  CheckCircle, XCircle, Share2, RotateCcw, ChevronRight,
} from 'lucide-react';

// ─── Colors ─────────────────────────────────────────────────────────────────

const C = {
  green:   '#71A95A',
  pink:    '#E37383',
  bg:      '#FAFAF8',
  card:    '#FFFFFF',
  text:    '#1A1A1A',
  muted:   '#6B7280',
  border:  '#E5E7EB',
  greenBg: '#EEF6E9',
  pinkBg:  '#FDEEF1',
};

// ─── Character Questions ─────────────────────────────────────────────────────

const QUESTIONS = [
  {
    text: 'What\'s your family\'s financial background?',
    options: [
      { label: 'Struggling — limited support, I need to work', value: 'struggling' },
      { label: 'Working class — some support, tight budget',   value: 'working_class' },
      { label: 'Middle class — moderate parental support',     value: 'middle_class' },
      { label: 'Comfortable — parents cover most costs',       value: 'comfortable' },
    ],
  },
  {
    text: 'What\'s your scholarship situation?',
    options: [
      { label: 'Full ride (tuition + housing covered)',  value: 'full_ride' },
      { label: 'Partial scholarship (tuition only)',     value: 'partial' },
      { label: 'Small merit award (under $5K/year)',     value: 'small_merit' },
      { label: 'No scholarship (loans or family)',       value: 'no_scholarship' },
    ],
  },
  {
    text: 'Where are you living?',
    options: [
      { label: 'On-campus dorm',          value: 'dorm' },
      { label: 'Off-campus apartment',    value: 'off_campus' },
      { label: 'At home with family',     value: 'family' },
    ],
  },
  {
    text: 'What\'s your major?',
    options: [
      { label: 'STEM / Engineering / CS',                    value: 'stem' },
      { label: 'Business / Finance / Economics',             value: 'business' },
      { label: 'Healthcare / Nursing / Pre-Med',             value: 'healthcare' },
      { label: 'Liberal Arts / Education / Social Sciences', value: 'liberal_arts' },
      { label: 'Arts / Design / Communications',             value: 'arts' },
    ],
  },
  {
    text: 'Do you have a part-time job?',
    options: [
      { label: 'Yes — 15–20 hrs/week',    value: 'job_heavy' },
      { label: 'Yes — under 10 hrs/week', value: 'job_light' },
      { label: 'No — focused on school',  value: 'no_focused' },
      { label: 'No — but actively looking', value: 'no_looking' },
    ],
  },
];

// ─── Starting metric lookup tables ───────────────────────────────────────────

const SAVINGS_BASE = {
  comfortable:   3000,
  middle_class:  1500,
  working_class:  800,
  struggling:     300,
};

const JOB_BONUS = {
  job_heavy:   600,
  job_light:   250,
  no_focused:    0,
  no_looking:    0,
};

const DEBT_BASE = {
  full_ride:      0,
  partial:      8000,
  small_merit: 18000,
  no_scholarship: 32000,
};

function calculateStartingMetrics(answers) {
  const savings = (SAVINGS_BASE[answers.q0] || 0) + (JOB_BONUS[answers.q4] || 0);
  const debtBase = DEBT_BASE[answers.q1] || 0;
  const debt = Math.max(0, debtBase - (answers.q2 === 'family' ? 6000 : 0));
  return { savings, creditScore: null, debt };
}

// ─── Anthropic API (via serverless function) ──────────────────────────────────

async function fetchScenariosHalf(answers, count, offset) {
  const res = await fetch('/api/generate-scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, count, offset }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `API error ${res.status}`);
  }

  const parsed = await res.json();
  if (!Array.isArray(parsed) || parsed.length < count) {
    throw new Error(`Insufficient scenarios (got ${Array.isArray(parsed) ? parsed.length : 'non-array'})`);
  }
  return parsed.slice(0, count);
}

async function fetchScenarios(answers) {
  // Two parallel halves so the wall-clock wait is roughly one call, not two.
  const [first, second] = await Promise.all([
    fetchScenariosHalf(answers, 5, 0),
    fetchScenariosHalf(answers, 5, 5),
  ]);
  return [...first, ...second];
}

// ─── Shuffle choice positions so the correct answer isn't always A ────────────

function shuffleScenarioChoices(scenario) {
  const choices = [
    { ...scenario.choiceA },
    { ...scenario.choiceB },
    { ...scenario.choiceC },
  ];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return {
    ...scenario,
    choiceA: choices[0],
    choiceB: choices[1],
    choiceC: choices[2],
  };
}

// ─── Fallback scenarios ──────────────────────────────────────────────────────

const FALLBACK_SCENARIOS = [
  {
    id: 1, timestamp: 'September — Move-In Week',
    scenario: "A credit card company has a table outside your dorm with free t-shirts. They're offering a student card with no annual fee and a $1,000 limit. Your RA told you to get one to build credit. Do you sign up?",
    choiceA: { text: 'Sign up, use only for small purchases, pay in full monthly', isCorrect: true },
    choiceB: { text: "Skip it — credit cards are how people go into debt", isCorrect: false },
    choiceC: { text: 'Take the card but use it freely — you can always pay later', isCorrect: false },
    explanation: "Avoiding credit entirely means arriving at graduation with no credit history, which makes renting an apartment and getting good loan rates harder. A student card paid in full monthly costs nothing and builds your score significantly over 4 years.",
    counterfactual: "If you'd skipped credit entirely, by 2036 you'd likely face higher interest rates on car loans and mortgages — costing you tens of thousands over time.",
    impact: { savings: 0, creditScore: 25, debt: 0 },
  },
  {
    id: 2, timestamp: 'September — First Week',
    scenario: "Your textbooks this semester cost $340 new from the campus bookstore. You found the same books on Facebook Marketplace for $85 total. The seller is a junior on campus. Your roommate says just buy new — it's not worth the hassle.",
    choiceA: { text: 'Buy used from the Marketplace seller', isCorrect: true },
    choiceB: { text: 'Buy new — you need them guaranteed and fast', isCorrect: false },
    choiceC: { text: 'Buy the digital version for $120 — cheaper and instant', isCorrect: false },
    explanation: "Saving $255 on textbooks each semester adds up to over $2,000 across 4 years — money that could sit in a high-yield savings account earning interest.",
    counterfactual: "If you'd always bought new textbooks, by 2036 that habit of overpaying for convenience would have cost you $8,000+ in unnecessary spending.",
    impact: { savings: 255, creditScore: 0, debt: 0 },
  },
  {
    id: 3, timestamp: 'October — Fall Break',
    scenario: "Your friend group is planning a $600 fall break trip to a beach house. You technically have the money but it would wipe out your emergency fund. They're saying 'YOLO, we're only freshmen once.'",
    choiceA: { text: 'Stay back, pick up extra shifts, plan a cheaper local trip', isCorrect: true },
    choiceB: { text: 'Go — you only live once and these memories matter', isCorrect: false },
    choiceC: { text: "Put the $600 on a credit card so you keep your savings intact", isCorrect: false },
    explanation: "Wiping out your emergency fund for a trip means one unexpected expense — a doctor visit, a car repair, a broken laptop — puts you in credit card debt. Picking up shifts instead adds to your cushion.",
    counterfactual: "If you'd made a habit of FOMO spending, by 2036 you'd likely have carried credit card debt in your 20s, paying thousands extra in interest.",
    impact: { savings: 300, creditScore: 0, debt: 0 },
  },
  {
    id: 4, timestamp: 'November — Midterms',
    scenario: "You got a $1,200 financial aid refund check. Your friends are going shopping this weekend. Your mom says save it. A classmate told you about a high-yield savings account paying 4.5% APY.",
    choiceA: { text: 'Put it all in the high-yield savings account', isCorrect: true },
    choiceB: { text: "Spend some now — you've been stressed and deserve it", isCorrect: false },
    choiceC: { text: 'Invest it all in individual stocks for higher returns', isCorrect: false },
    explanation: "At 4.5% APY, $1,200 grows to about $1,470 in five years with zero effort. Building the habit of saving windfalls is one of the biggest wealth predictors.",
    counterfactual: "If you'd spent your refund checks throughout college, by 2036 you'd be starting from near zero savings instead of having a head start.",
    impact: { savings: 1200, creditScore: 0, debt: 0 },
  },
  {
    id: 5, timestamp: 'December — End of Semester',
    scenario: "You're auditing your subscriptions and find: Netflix $16, Hulu $18, Spotify $11, Adobe $55, iCloud $3, a gym you've used twice $40. That's $143/month. Your friends split Netflix — you could join their plan for $4.",
    choiceA: { text: "Cancel everything redundant, join friend's Netflix, keep only Spotify", isCorrect: true },
    choiceB: { text: "Keep them — you use most of them and it's not that much", isCorrect: false },
    choiceC: { text: 'Keep everything but call each company to negotiate a discount', isCorrect: false },
    explanation: "$143/month in subscriptions is $1,716/year. Cutting to $15/month saves $1,548 annually — that's a plane ticket, an emergency fund boost, or a year of compound interest growth.",
    counterfactual: "If you'd let subscriptions pile up unchecked through your 20s, by 2036 you'd have spent $15,000+ on services you barely used.",
    impact: { savings: 130, creditScore: 0, debt: 0 },
  },
  {
    id: 6, timestamp: 'January — Spring Semester',
    scenario: "Your credit card bill came: $380. You have $1,800 in your account. The minimum payment is $25. Your friend says just pay the minimum — 'that's what it's there for.' The APR is 24%.",
    choiceA: { text: 'Pay the full $380 balance now', isCorrect: true },
    choiceB: { text: 'Pay the $25 minimum, keep cash on hand', isCorrect: false },
    choiceC: { text: 'Pay $200 — a reasonable middle ground', isCorrect: false },
    explanation: "At 24% APR, carrying any balance costs you money every single day. A partial payment on $380 still leaves $180 accruing 24% interest. Paying in full monthly means credit cards are free money tools, not debt traps.",
    counterfactual: "If you'd developed a partial-payment habit, by 2036 you could have paid $5,000+ in interest on balances that were never that large to begin with.",
    impact: { savings: -380, creditScore: 15, debt: 0 },
  },
  {
    id: 7, timestamp: 'February — Side Hustle Season',
    scenario: "A junior offers to teach you how to tutor high school students for $35/hr on Wyzant. It's 5 hours/week. That's $700/month. It would cut into some Netflix time but your grades are solid.",
    choiceA: { text: 'Start tutoring and put the income toward loans', isCorrect: true },
    choiceB: { text: "Pass — you're already busy and need downtime", isCorrect: false },
    choiceC: { text: 'Take the gig but spend the extra income as a treat-yourself fund', isCorrect: false },
    explanation: "An extra $700/month directed toward debt is transformative. Over a year that's $8,400 — enough to eliminate a semester of loans and save thousands in interest.",
    counterfactual: "If you'd avoided side income opportunities throughout college, by 2036 you'd be starting your 30s with significantly more debt and less savings than peers who earned while studying.",
    impact: { savings: 700, creditScore: 0, debt: -500 },
  },
  {
    id: 8, timestamp: 'March — Internship Offer',
    scenario: "You got a summer internship offer: $18/hr, 40hrs/week. It's your first real offer and you're nervous. A friend got $22/hr at a similar company. The recruiter said the offer 'doesn't have much flexibility' but you haven't asked.",
    choiceA: { text: 'Ask for $21/hr, citing your research on market rates', isCorrect: true },
    choiceB: { text: "Accept $18/hr — you don't want to seem greedy on your first offer", isCorrect: false },
    choiceC: { text: 'Counter at $25/hr — swing for the fences', isCorrect: false },
    explanation: "Recruiters almost always expect negotiation. The worst outcome is they say no — you still get the job. $3/hr over a 10-week internship is $1,200. The habit of negotiating reasonably means you'll earn $1M+ more over a career.",
    counterfactual: "If you'd never learned to negotiate, by 2036 you'd likely have left $200,000+ on the table across your career in salary, raises, and benefits.",
    impact: { savings: 800, creditScore: 0, debt: 0 },
  },
  {
    id: 9, timestamp: 'April — 401k Moment',
    scenario: "Your internship offers a 401k with a 4% employer match starting day one. HR says you can opt in or out. You're only there for the summer so you think 'why bother' — but opting in means your $3,000 contribution gets matched with $1,200 free.",
    choiceA: { text: 'Opt in for the full match immediately', isCorrect: true },
    choiceB: { text: "Skip it — you're only there 10 weeks and need the take-home pay", isCorrect: false },
    choiceC: { text: 'Contribute just $200 — get some match without locking up too much cash', isCorrect: false },
    explanation: "Employer 401k match is a 100% instant return on your contribution — there is no better investment. That $1,200 free match, invested at 22, grows to over $12,000 by retirement. Contributing less means leaving free money on the table.",
    counterfactual: "If you'd skipped employer matches throughout early career, by 2036 you'd have left $30,000+ in free money unclaimed.",
    impact: { savings: 500, creditScore: 0, debt: 0 },
  },
  {
    id: 10, timestamp: 'May — End of Freshman Year',
    scenario: "You have $2,000 saved. A friend is excited about buying individual stocks — she made 30% on one pick. A finance professor suggested putting $1,000 in a diversified index fund (like VOO) and keeping $1,000 as an emergency fund.",
    choiceA: { text: 'Put $1,000 in an index fund, keep $1,000 as emergency savings', isCorrect: true },
    choiceB: { text: 'Try stock picking — higher risk, higher reward at your age', isCorrect: false },
    choiceC: { text: 'Put all $2,000 in crypto — maximum upside while you\'re young', isCorrect: false },
    explanation: "Over any 20-year period, over 90% of individual stock pickers underperform the index. $1,000 invested at 19 in VOO is projected to be ~$8,000 by 2036 with no effort. Keeping $1,000 liquid ensures one emergency doesn't spiral into debt.",
    counterfactual: "If you'd tried to beat the market through your 20s, you'd statistically end up with less money and more stress than if you'd just bought the index.",
    impact: { savings: 0, creditScore: 0, debt: 0 },
  },
];

// ─── Score & forecast helpers ─────────────────────────────────────────────────

function calculateScore(metrics, correctAnswers, totalScenarios, startingMetrics) {
  const n = Math.max(1, totalScenarios || 10);
  const { savings, creditScore, debt } = metrics;
  const start = startingMetrics || { savings: 0, creditScore: null, debt: 0 };

  // Knowledge dominates: 100% correct guarantees an A on its own.
  const knowledge = (correctAnswers / n) * 85;

  // Bonus points are improvement-based, not absolute.
  const savingsDelta = savings - (start.savings || 0);
  const savingsPts = Math.max(0, Math.min(1, savingsDelta / 4000)) * 7;

  const creditPts = creditScore === null ? 0
    : Math.max(0, Math.min(1, (creditScore - 580) / 120)) * 4;

  const debtReduction = (start.debt || 0) - debt;
  const debtPts = start.debt > 0
    ? Math.max(0, Math.min(1, debtReduction / Math.max(1, start.debt))) * 4
    : 4;

  return Math.min(100, Math.max(0, Math.round(knowledge + savingsPts + creditPts + debtPts)));
}

function getGrade(score) {
  if (score >= 85) return { grade: 'A', label: 'Future CFO Energy',   color: '#16A34A' };
  if (score >= 70) return { grade: 'B', label: 'Solid Foundation',    color: '#65A30D' };
  if (score >= 55) return { grade: 'C', label: 'Room to Grow',        color: '#D97706' };
  if (score >= 40) return { grade: 'D', label: 'Time to Reset',       color: '#EA580C' };
  return                  { grade: 'F', label: 'Glow-Up Needed',      color: '#DC2626' };
}

function getTagline(score) {
  if (score >= 70) return "You're on track to be debt-free by 29 — compound interest is working for you.";
  if (score >= 55) return "You're building a foundation — a few habit tweaks now could add $40K to your net worth by 35.";
  return "Your 2036 self needs you to start now. Even $50/month invested today changes everything.";
}

function get2036Projections(metrics, answers, score) {
  const major = answers?.q3;
  const highEarner = major === 'stem' || major === 'business' || major === 'healthcare';

  let netWorth;
  if (score >= 85) {
    netWorth = highEarner ? '$95K–$140K' : '$65K–$95K';
  } else if (score >= 70) {
    netWorth = '$35K–$65K';
  } else if (score >= 55) {
    netWorth = '$10K–$35K';
  } else {
    netWorth = '-$5K–$10K';
  }

  const baseCredit = metrics.creditScore === null ? 600 : metrics.creditScore;
  const projectedCredit = Math.min(850, Math.round(baseCredit + (score / 100) * 120));

  const SALARY = { stem: 95000, business: 70000, healthcare: 72000, liberal_arts: 52000, arts: 48000 };
  const salary = SALARY[major] || 60000;
  const monthlyRate = 0.05 / 12;
  const n = 120;
  const mp = metrics.debt > 0 ? (metrics.debt * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n)) : 0;
  const monthlyFreedom = Math.round((salary / 12) * 0.6 - mp - 2000);
  const monthlyDisplay = monthlyFreedom > 0 ? `~$${monthlyFreedom.toLocaleString()}/mo` : '~$0/mo';

  return { netWorth, projectedCredit, monthlyDisplay };
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function FidRiseLogo({ size = 'md', white = false }) {
  const sz = size === 'lg' ? { fid: 38, rise: 42, arrow: 38 }
           : size === 'md' ? { fid: 26, rise: 30, arrow: 26 }
           :                 { fid: 18, rise: 20, arrow: 18 };

  const greenColor = white ? '#FFFFFF' : C.green;
  const pinkColor  = white ? '#FFD0D8' : C.pink;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <span style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontSize: sz.fid,
          color: greenColor,
          fontWeight: 600,
          letterSpacing: '-0.5px',
        }}>Fid</span>
        <span style={{
          fontFamily: '"Arial Black", "Helvetica Neue", sans-serif',
          fontSize: sz.rise,
          color: pinkColor,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
        }}>RISE</span>
        <span style={{
          fontSize: sz.arrow,
          color: pinkColor,
          fontWeight: 900,
          marginLeft: 2,
          lineHeight: 1,
        }}>↗</span>
      </div>
      <div style={{
        height: 3,
        width: '100%',
        background: `linear-gradient(90deg, ${greenColor} 0%, ${pinkColor} 100%)`,
        borderRadius: 2,
        marginTop: 3,
        transform: 'skewX(-8deg)',
      }} />
    </div>
  );
}

// ─── MetricBar ────────────────────────────────────────────────────────────────

function MetricBar({ icon, label, value, min, max, inverted, prefix = '', suffix = '', delta }) {
  const displayVal = value === null ? 'No Credit Yet'
    : `${prefix}${value.toLocaleString()}${suffix}`;

  const pct = value === null ? 0
    : inverted
      ? ((max - Math.min(max, Math.max(min, value))) / (max - min)) * 100
      : ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;

  const barColor = inverted ? C.pink
    : value === null ? '#D1D5DB'
    : C.green;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
          {icon} {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {delta && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: delta.startsWith('+') ? C.green : C.pink,
              animation: 'fadeIn 0.3s ease',
            }}>{delta}</span>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{displayVal}</span>
        </div>
      </div>
      <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: barColor,
          borderRadius: 3,
          transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
    </div>
  );
}

// ─── State ────────────────────────────────────────────────────────────────────

const INITIAL_STATE = {
  screen: 'splash',
  currentQuestion: 0,
  answers: {},
  selectedAnswer: null,
  scenarios: [],
  apiError: null,
  currentScenarioIndex: 0,
  selectedChoice: null,
  showResult: false,
  correctAnswers: 0,
  creditInitialized: false,
  metrics: { savings: 0, creditScore: null, debt: 0 },
  startingMetrics: { savings: 0, creditScore: null, debt: 0 },
  metricDeltas: { savings: null, creditScore: null, debt: null },
  showShareModal: false,
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const btn = (bg, color = '#FFF') => ({
  width: '100%',
  padding: '16px 20px',
  borderRadius: 12,
  border: 'none',
  fontSize: 16,
  fontWeight: 700,
  color,
  background: bg,
  cursor: 'pointer',
  minHeight: 52,
  WebkitTapHighlightColor: 'transparent',
  transition: 'opacity 0.15s, transform 0.1s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
});

const card = {
  background: C.card,
  borderRadius: 16,
  boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  padding: '20px 16px',
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [state, setState] = useState(INITIAL_STATE);

  const set = (changes) => setState(prev => ({ ...prev, ...changes }));

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleAnswerSelect(qIndex, value) {
    if (state.selectedAnswer !== null) return;
    set({ selectedAnswer: value });

    setTimeout(() => {
      const newAnswers = { ...state.answers, [`q${qIndex}`]: value };
      if (qIndex < 4) {
        set({ answers: newAnswers, currentQuestion: qIndex + 1, selectedAnswer: null });
      } else {
        set({ answers: newAnswers, selectedAnswer: null });
        transitionToLoading(newAnswers);
      }
    }, 300);
  }

  function transitionToLoading(answers) {
    set({ screen: 'loading' });
    const metrics = calculateStartingMetrics(answers);
    set({ metrics, startingMetrics: metrics });
    fetchScenarios(answers)
      .then(scenarios => set({ scenarios: scenarios.map(shuffleScenarioChoices), screen: 'game' }))
      .catch(err => {
        console.error('API error, using fallback:', err.message);
        const shuffled = [...FALLBACK_SCENARIOS]
          .sort(() => Math.random() - 0.5)
          .map(shuffleScenarioChoices);
        set({ scenarios: shuffled, apiError: err.message, screen: 'game' });
      });
  }

  function applyChoice(choice) {
    const scenario = state.scenarios[state.currentScenarioIndex];
    const picked = scenario[`choice${choice}`];
    const impact = scenario.impact || { savings: 0, creditScore: 0, debt: 0 };
    const isCorrect = picked.isCorrect;

    const actualImpact = isCorrect ? impact : {
      savings: -(impact.savings || 0),
      creditScore: -(impact.creditScore || 0),
      debt: -(impact.debt || 0),
    };

    let newCredit = state.metrics.creditScore;
    let newCreditInit = state.creditInitialized;
    const creditDelta = actualImpact.creditScore || 0;

    if (creditDelta !== 0) {
      if (!state.creditInitialized) {
        newCredit = Math.min(850, Math.max(300, 580 + creditDelta));
        newCreditInit = true;
      } else {
        newCredit = Math.min(850, Math.max(300, (newCredit || 580) + creditDelta));
      }
    }

    const newSavings = state.metrics.savings + (actualImpact.savings || 0);
    const newDebt = Math.max(0, state.metrics.debt + (actualImpact.debt || 0));

    const fmtMoney = (n) => n === 0 ? null : `${n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString()}`;
    const fmtPts   = (n) => n === 0 ? null : `${n > 0 ? '+' : ''}${n} pts`;

    set({
      selectedChoice: choice,
      showResult: true,
      correctAnswers: state.correctAnswers + (isCorrect ? 1 : 0),
      creditInitialized: newCreditInit,
      metrics: { savings: newSavings, creditScore: newCredit, debt: newDebt },
      metricDeltas: {
        savings: fmtMoney(actualImpact.savings || 0),
        creditScore: fmtPts(creditDelta),
        debt: fmtMoney(actualImpact.debt || 0),
      },
    });
  }

  function handleNext() {
    const isLast = state.currentScenarioIndex >= state.scenarios.length - 1;
    if (isLast) {
      set({ screen: 'forecast', showResult: false });
    } else {
      set({
        currentScenarioIndex: state.currentScenarioIndex + 1,
        selectedChoice: null,
        showResult: false,
        metricDeltas: { savings: null, creditScore: null, debt: null },
      });
    }
  }

  // ── Render blocks ────────────────────────────────────────────────────────────

  const renderSplash = () => (
    <div className="app-shell fade-in" style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh', padding: '40px 24px',
      background: C.bg,
    }}>
      <div style={{ marginBottom: 40 }}>
        <FidRiseLogo size="lg" />
      </div>

      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <p style={{
          fontSize: 22, fontWeight: 800, color: C.text,
          lineHeight: 1.3, marginBottom: 12,
        }}>
          Want to see your finances in 2036?
        </p>
        <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.5 }}>
          Make 10 real money moves.<br />See where you land.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 340 }}>
        <button
          style={btn(C.green)}
          onPointerDown={e => e.currentTarget.style.opacity = '0.85'}
          onPointerUp={e => e.currentTarget.style.opacity = '1'}
          onClick={() => set({ screen: 'character_creation' })}
        >
          Start Your Journey <ArrowUpRight size={18} />
        </button>
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
        Financial education · Not financial advice
      </p>
    </div>
  );

  const renderCharacterCreation = () => {
    const q = QUESTIONS[state.currentQuestion];
    return (
      <div className="app-shell" style={{
        display: 'flex', flexDirection: 'column',
        minHeight: '100dvh', padding: '40px 20px 32px',
        background: C.bg,
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 36 }}>
          {QUESTIONS.map((_, i) => (
            <div key={i} style={{
              width: i === state.currentQuestion ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i < state.currentQuestion ? C.green
                        : i === state.currentQuestion ? C.green
                        : '#D1D5DB',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* Question */}
        <div key={state.currentQuestion} className="slide-up" style={{ flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Question {state.currentQuestion + 1} of 5
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.35, marginBottom: 28 }}>
            {q.text}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {q.options.map(opt => {
              const isSelected = state.selectedAnswer === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleAnswerSelect(state.currentQuestion, opt.value)}
                  style={{
                    width: '100%',
                    padding: '16px 18px',
                    borderRadius: 14,
                    border: `2px solid ${isSelected ? C.green : C.border}`,
                    background: isSelected ? C.greenBg : C.card,
                    fontSize: 15,
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? C.green : C.text,
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
                    transition: 'all 0.15s ease',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderLoading = () => (
    <div className="app-shell" style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh', padding: 40,
      background: C.bg,
    }}>
      <div className="logo-pulse" style={{ marginBottom: 36 }}>
        <FidRiseLogo size="lg" />
      </div>
      <p style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>
        Building your story…
      </p>
      <p style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>
        Personalizing 10 financial scenarios just for you
      </p>
    </div>
  );

  const renderGame = () => {
    const scenario = state.scenarios[state.currentScenarioIndex];
    if (!scenario) return null;

    const total = state.scenarios.length;
    const progress = ((state.currentScenarioIndex) / total) * 100;
    const isCorrect = state.selectedChoice
      ? (scenario[`choice${state.selectedChoice}`]?.isCorrect ?? false)
      : null;

    const choiceStyle = (choice) => {
      const selected = state.selectedChoice === choice;
      const other = state.selectedChoice && state.selectedChoice !== choice;
      const correct = selected && isCorrect;
      const wrong = selected && !isCorrect;
      return {
        width: '100%',
        padding: '14px 16px',
        borderRadius: 12,
        border: `2px solid ${
          correct ? C.green
          : wrong  ? C.pink
          : other  ? C.border
          : state.selectedChoice ? C.border
          : C.border
        }`,
        background: correct ? C.greenBg : wrong ? C.pinkBg : C.card,
        fontSize: 14,
        fontWeight: 600,
        color: correct ? C.green : wrong ? C.pink : other ? '#9CA3AF' : C.text,
        textAlign: 'left',
        cursor: state.selectedChoice ? 'default' : 'pointer',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        transition: 'all 0.2s ease',
        opacity: other ? 0.5 : 1,
        WebkitTapHighlightColor: 'transparent',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      };
    };

    return (
      <div className="app-shell scroll-hidden" style={{
        minHeight: '100dvh',
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: state.showResult ? 340 : 60,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 10px',
          background: C.card,
          borderBottom: `1px solid ${C.border}`,
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <FidRiseLogo size="sm" />
          <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>
            {state.currentScenarioIndex + 1} / {total}
          </span>
        </div>

        {state.apiError && (
          <div style={{
            background: '#FEF3C7',
            borderBottom: `1px solid #FDE68A`,
            color: '#92400E',
            fontSize: 11,
            fontWeight: 600,
            padding: '6px 16px',
            textAlign: 'center',
            letterSpacing: 0.2,
            lineHeight: 1.4,
          }}>
            ⚠️ Offline mode — using built-in scenarios
            <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>
              {state.apiError}
            </div>
          </div>
        )}

        {/* Metrics dashboard */}
        <div style={{ padding: '14px 16px 8px', background: C.card, borderBottom: `1px solid ${C.border}` }}>
          <MetricBar
            icon="💰" label="Savings"
            value={state.metrics.savings} min={0} max={10000}
            prefix="$" delta={state.showResult ? state.metricDeltas.savings : null}
          />
          <MetricBar
            icon="📊" label="Credit Score"
            value={state.metrics.creditScore} min={580} max={850}
            delta={state.showResult ? state.metricDeltas.creditScore : null}
          />
          <MetricBar
            icon="💳" label="Debt"
            value={state.metrics.debt} min={0} max={50000}
            prefix="$" inverted
            delta={state.showResult ? state.metricDeltas.debt : null}
          />
        </div>

        {/* Scenario card */}
        <div key={state.currentScenarioIndex} className="slide-up" style={{ padding: '16px 16px 0', flex: 1 }}>
          <div style={{ ...card, marginBottom: 12 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: C.muted,
              textTransform: 'uppercase', letterSpacing: 1,
              display: 'block', marginBottom: 8,
            }}>
              {scenario.timestamp}
            </span>
            <p style={{ fontSize: 15, color: C.text, lineHeight: 1.6 }}>
              {scenario.scenario}
            </p>
          </div>

          {/* Choices */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['A', 'B', 'C'].map(letter => {
              const ch = scenario[`choice${letter}`];
              if (!ch) return null;
              const sel = state.selectedChoice === letter;
              return (
                <button
                  key={letter}
                  style={choiceStyle(letter)}
                  onClick={() => !state.selectedChoice && applyChoice(letter)}
                >
                  <span style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                    background: sel && isCorrect ? C.green
                              : sel && !isCorrect ? C.pink
                              : '#E5E7EB',
                    color: sel ? '#FFF' : C.muted,
                    fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginTop: 1,
                  }}>{letter}</span>
                  <span>{ch.text}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Result bottom sheet */}
        <div style={{
          position: 'fixed', bottom: 0, left: '50%',
          transform: `translateX(-50%) translateY(${state.showResult ? '0' : '100%'})`,
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          width: '100%', maxWidth: 390,
          background: C.card,
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
          padding: '20px 20px 32px',
          zIndex: 50,
        }}>
          {state.showResult && (
            <>
              {/* Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                {isCorrect
                  ? <CheckCircle size={24} color={C.green} />
                  : <XCircle size={24} color={C.pink} />}
                <span style={{
                  fontSize: 15, fontWeight: 800,
                  color: isCorrect ? C.green : C.pink,
                }}>
                  {isCorrect ? 'Smart Move!' : 'Costly Mistake'}
                </span>
              </div>

              {/* Explanation */}
              <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>
                <strong>Here's why:</strong> {scenario.explanation}
              </p>

              {/* Counterfactual */}
              <div style={{
                background: '#FDF4F6',
                borderLeft: `3px solid ${C.pink}`,
                padding: '10px 12px',
                borderRadius: '0 8px 8px 0',
                marginBottom: 14,
              }}>
                <p style={{ fontSize: 12, color: '#9B6270', fontStyle: 'italic', lineHeight: 1.5 }}>
                  {scenario.counterfactual}
                </p>
              </div>

              {/* Delta pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {[
                  { key: 'savings', label: 'Savings' },
                  { key: 'creditScore', label: 'Credit' },
                  { key: 'debt', label: 'Debt' },
                ].filter(m => state.metricDeltas[m.key] !== null).map(m => (
                  <span key={m.key} style={{
                    fontSize: 12, fontWeight: 700,
                    padding: '4px 10px', borderRadius: 20,
                    background: state.metricDeltas[m.key]?.startsWith('+') ? C.greenBg : C.pinkBg,
                    color: state.metricDeltas[m.key]?.startsWith('+') ? C.green : C.pink,
                  }}>
                    {m.label}: {state.metricDeltas[m.key]}
                  </span>
                ))}
              </div>

              <button
                style={btn(C.green)}
                onClick={handleNext}
                onPointerDown={e => e.currentTarget.style.opacity = '0.85'}
                onPointerUp={e => e.currentTarget.style.opacity = '1'}
              >
                {state.currentScenarioIndex >= state.scenarios.length - 1 ? 'See My Forecast' : 'Next'} <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>

        {/* Bottom progress bar */}
        <div style={{
          position: 'fixed', bottom: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: '100%', maxWidth: 390,
          height: 4, background: '#E5E7EB', zIndex: state.showResult ? 0 : 20,
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: C.green, transition: 'width 0.5s ease',
          }} />
        </div>
      </div>
    );
  };

  const renderForecast = () => {
    const score = calculateScore(state.metrics, state.correctAnswers, state.scenarios.length, state.startingMetrics);
    const { grade, label, color } = getGrade(score);
    const tagline = getTagline(score);
    const { netWorth, projectedCredit, monthlyDisplay } = get2036Projections(state.metrics, state.answers, score);

    // Growth rate is driven by how well the player played:
    // score 0 → -3%/yr (curve trends down), score 100 → +8%/yr (steep up).
    const rate = -0.03 + (score / 100) * 0.11;
    const startingValue = Math.max(state.metrics.savings, 100);
    const chartData = Array.from({ length: 11 }, (_, i) => ({
      year: 2025 + i,
      savings: Math.round(startingValue * Math.pow(1 + rate, i)),
    }));

    const statBox = (label, value, sub) => (
      <div style={{
        flex: 1, background: C.card, borderRadius: 14,
        padding: '14px 12px', textAlign: 'center',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        border: `1px solid ${C.border}`,
      }}>
        <p style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 2 }}>{value}</p>
        <p style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
        {sub && <p style={{ fontSize: 10, color: C.green, marginTop: 2 }}>{sub}</p>}
      </div>
    );

    return (
      <div className="app-shell scroll-hidden fade-in" style={{
        minHeight: '100dvh', background: C.bg,
        padding: '0 0 40px', overflowY: 'auto',
      }}>
        {/* Header banner */}
        <div style={{
          background: `linear-gradient(135deg, ${C.green} 0%, #4A8640 100%)`,
          padding: '40px 24px 32px',
          textAlign: 'center', color: '#FFF',
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, marginBottom: 6, letterSpacing: 0.5 }}>
            YOUR 2036 FINANCIAL FORECAST
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <FidRiseLogo size="md" white />
          </div>

          {/* Score circle */}
          <div className="count-up" style={{
            width: 100, height: 100, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            border: '3px solid rgba(255,255,255,0.5)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <span style={{ fontSize: 32, fontWeight: 900, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>/ 100</span>
          </div>

          <div style={{
            display: 'inline-block',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 20,
            padding: '6px 18px',
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>Grade {grade} — {label}</span>
          </div>

          <p style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
            {state.correctAnswers} of {state.scenarios.length} decisions correct
          </p>
        </div>

        <div style={{ padding: '20px 16px' }}>
          {/* Stat boxes */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {statBox('Net Worth', netWorth, '2036 projection')}
            {statBox('Credit Score', projectedCredit, 'projected')}
            {statBox('Monthly Freedom', monthlyDisplay, 'after bills')}
          </div>

          {/* Tagline */}
          <div style={{
            background: C.card, borderRadius: 14, padding: '16px',
            border: `1px solid ${C.border}`,
            marginBottom: 20,
            borderLeft: `4px solid ${C.green}`,
          }}>
            <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6, fontStyle: 'italic' }}>
              "{tagline}"
            </p>
          </div>

          {/* Savings growth chart */}
          <div style={{ ...card, marginBottom: 24 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Savings Growth 2025 → 2036
            </p>
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.green} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={C.green} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={v => [`$${v.toLocaleString()}`, 'Savings']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                />
                <Area type="monotone" dataKey="savings"
                  stroke={C.green} fill="url(#sg)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* CTAs */}
          <button
            style={{ ...btn(C.green), marginBottom: 12 }}
            onClick={() => set({ showShareModal: true })}
            onPointerDown={e => e.currentTarget.style.opacity = '0.85'}
            onPointerUp={e => e.currentTarget.style.opacity = '1'}
          >
            <Share2 size={18} /> Share Your Forecast
          </button>
          <button
            style={{ ...btn('transparent', C.muted), border: `1.5px solid ${C.border}` }}
            onClick={() => setState(INITIAL_STATE)}
            onPointerDown={e => e.currentTarget.style.opacity = '0.7'}
            onPointerUp={e => e.currentTarget.style.opacity = '1'}
          >
            <RotateCcw size={16} /> Play Again
          </button>
        </div>
      </div>
    );
  };

  const renderShareModal = () => {
    const score = calculateScore(state.metrics, state.correctAnswers, state.scenarios.length, state.startingMetrics);
    const { grade, label } = getGrade(score);
    const { netWorth, projectedCredit, monthlyDisplay } = get2036Projections(state.metrics, state.answers, score);

    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: 16,
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          {/* 9:16 share card */}
          <div style={{
            background: `linear-gradient(160deg, #71A95A 0%, #2D6A2D 60%, #1A1A2E 100%)`,
            borderRadius: 20,
            padding: '36px 28px',
            color: '#FFF',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center',
            minHeight: 520,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Background decoration */}
            <div style={{
              position: 'absolute', top: -60, right: -60,
              width: 200, height: 200, borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
            }} />
            <div style={{
              position: 'absolute', bottom: -40, left: -40,
              width: 160, height: 160, borderRadius: '50%',
              background: 'rgba(255,255,255,0.04)',
            }} />

            <div style={{ marginBottom: 24 }}>
              <FidRiseLogo size="md" white />
            </div>

            <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 20, letterSpacing: 0.5, textAlign: 'center' }}>
              MY 2036 FINANCIAL FORECAST
            </p>

            {/* Score */}
            <div style={{
              width: 90, height: 90, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              border: '2px solid rgba(255,255,255,0.4)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 14,
            }}>
              <span style={{ fontSize: 30, fontWeight: 900, lineHeight: 1 }}>{score}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>/ 100</span>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 20, padding: '5px 16px', marginBottom: 28,
            }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Grade {grade} — {label}</span>
            </div>

            {/* Stats */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {[
                { label: 'Projected Net Worth', value: netWorth },
                { label: 'Projected Credit Score', value: projectedCredit },
                { label: 'Monthly Freedom', value: monthlyDisplay },
              ].map(s => (
                <div key={s.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.1)', borderRadius: 10,
                  padding: '10px 14px',
                }}>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>{s.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{s.value}</span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, opacity: 0.6, textAlign: 'center' }}>
              fid-rise-game.vercel.app/
            </p>
          </div>

          <p style={{ color: '#FFF', textAlign: 'center', marginTop: 12, fontSize: 13, opacity: 0.85 }}>
            Screenshot this card to share! 📸
          </p>

          <button
            style={{ ...btn('rgba(255,255,255,0.2)', '#FFF'), marginTop: 12, border: '1.5px solid rgba(255,255,255,0.3)' }}
            onClick={() => set({ showShareModal: false })}
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  // ── Root render ──────────────────────────────────────────────────────────────

  return (
    <>
      {state.screen === 'splash'             && renderSplash()}
      {state.screen === 'character_creation' && renderCharacterCreation()}
      {state.screen === 'loading'            && renderLoading()}
      {state.screen === 'game'               && renderGame()}
      {state.screen === 'forecast'           && renderForecast()}
      {state.showShareModal                  && renderShareModal()}
    </>
  );
}
