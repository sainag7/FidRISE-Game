const QUESTIONS = [
  {
    options: [
      { label: 'Struggling — limited support, I need to work', value: 'struggling' },
      { label: 'Working class — some support, tight budget',   value: 'working_class' },
      { label: 'Middle class — moderate parental support',     value: 'middle_class' },
      { label: 'Comfortable — parents cover most costs',       value: 'comfortable' },
    ],
  },
  {
    options: [
      { label: 'Full ride (tuition + housing covered)',  value: 'full_ride' },
      { label: 'Partial scholarship (tuition only)',     value: 'partial' },
      { label: 'Small merit award (under $5K/year)',     value: 'small_merit' },
      { label: 'No scholarship (loans or family)',       value: 'no_scholarship' },
    ],
  },
  {
    options: [
      { label: 'On-campus dorm',       value: 'dorm' },
      { label: 'Off-campus apartment', value: 'off_campus' },
      { label: 'At home with family',  value: 'family' },
    ],
  },
  {
    options: [
      { label: 'STEM / Engineering / CS',                    value: 'stem' },
      { label: 'Business / Finance / Economics',             value: 'business' },
      { label: 'Healthcare / Nursing / Pre-Med',             value: 'healthcare' },
      { label: 'Liberal Arts / Education / Social Sciences', value: 'liberal_arts' },
      { label: 'Arts / Design / Communications',             value: 'arts' },
    ],
  },
  {
    options: [
      { label: 'Yes — 15–20 hrs/week',    value: 'job_heavy' },
      { label: 'Yes — under 10 hrs/week', value: 'job_light' },
      { label: 'No — focused on school',  value: 'no_focused' },
      { label: 'No — but actively looking', value: 'no_looking' },
    ],
  },
];

const SAVINGS_BASE = { comfortable: 3000, middle_class: 1500, working_class: 800, struggling: 300 };
const JOB_BONUS   = { job_heavy: 600, job_light: 250, no_focused: 0, no_looking: 0 };
const DEBT_BASE   = { full_ride: 0, partial: 8000, small_merit: 18000, no_scholarship: 32000 };

function buildSummary(answers) {
  const bg = QUESTIONS[0].options.find(o => o.value === answers.q0)?.label || answers.q0;
  const sc = QUESTIONS[1].options.find(o => o.value === answers.q1)?.label || answers.q1;
  const lv = QUESTIONS[2].options.find(o => o.value === answers.q2)?.label || answers.q2;
  const mj = QUESTIONS[3].options.find(o => o.value === answers.q3)?.label || answers.q3;
  const jb = QUESTIONS[4].options.find(o => o.value === answers.q4)?.label || answers.q4;
  const savings = (SAVINGS_BASE[answers.q0] || 0) + (JOB_BONUS[answers.q4] || 0);
  const debtBase = DEBT_BASE[answers.q1] || 0;
  const debt = Math.max(0, debtBase - (answers.q2 === 'family' ? 6000 : 0));
  return `Background: ${bg}\nScholarship: ${sc}\nLiving: ${lv}\nMajor: ${mj}\nJob: ${jb}\nStarting savings: $${savings.toLocaleString()}\nStarting debt: $${debt.toLocaleString()}\nCredit: No Credit Yet`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });

  const { answers, count = 10, offset = 0 } = req.body || {};
  if (!answers) return res.status(400).json({ error: 'Missing answers' });

  const summary = buildSummary(answers);

  // Static portion — same on every request, cached by Anthropic so the second
  // half of a parallel split (and future replays) reuse this prefix for free.
  const staticInstructions = `You are a financial education game designer for a hackathon project targeting first-year college women. Generate financial scenarios for a college student.\n\nRules:\n- Each scenario must be genuinely hard — not obviously right or wrong\n- Cover a variety of topics: budgeting, first credit card, student loans, side hustles, investing, internship salary negotiation, emergency funds, subscriptions, FOMO spending, peer pressure, benefits enrollment, and compound interest\n- Scenarios should escalate in complexity — start simple (move-in week budgeting, first credit card offer) and build to complex (salary negotiation, 401k enrollment, investing)\n- Tone: relatable, slightly witty, specific — not corporate or preachy\n- BREVITY IS CRITICAL: First-year college students will not read long text. Every scenario must be skimmable in under 10 seconds. Cut filler words, no flowery openers, no run-on sentences. Aim for the minimum word count that still conveys the choice.\n- All three choices must be tempting — none should be obviously dumb. Two are wrong, one is correct.\n- Exactly ONE of choiceA/choiceB/choiceC must have isCorrect: true. The other two must have isCorrect: false.\n- IMPORTANT: Randomize which of choiceA/choiceB/choiceC is correct across scenarios. Roughly one-third of scenarios should have A correct, one-third B correct, and one-third C correct. Do NOT always put the correct answer in position A.\n- CRITICAL VARIETY REQUIREMENT: Each generation must produce meaningfully different scenarios from any prior generation, even for the same player profile. Vary the specific dollar amounts (e.g. textbook cost: not always $340; subscription totals: not always $143), the friend/character names, the brands/stores mentioned, the framing of each dilemma, and which topics get emphasized. Pick a fresh subset of topics from the list above rather than always covering the same ones in the same order. Do NOT reuse phrasing across runs.\n\nReturn ONLY valid JSON — no markdown, no preamble, no backticks. Format:\n[\n  {\n    "id": 1,\n    "timestamp": "September — Move-In Week",\n    "scenario": "1-2 short sentences, max ~35 words. Punchy and concrete — set the scene fast, no filler.",\n    "choiceA": { "text": "max ~12 words", "isCorrect": true },\n    "choiceB": { "text": "max ~12 words", "isCorrect": false },\n    "choiceC": { "text": "max ~12 words", "isCorrect": false },\n    "explanation": "1 sentence, max ~30 words. Include one specific number or dollar figure.",\n    "counterfactual": "1 short sentence starting with \\"If you\'d chosen X, by 2036 you\'d ...\\". Max ~20 words.",\n    "impact": {\n      "savings": 200,\n      "creditScore": 0,\n      "debt": -500\n    }\n  }\n]\n\nImpact values represent the correct choice\'s effect: savings range -800 to +800, creditScore range -40 to +40 (0 if not credit-related), debt range -2000 to +2000. Correct choice should generally have positive impact.`;

  // Dynamic portion — varies per request, not cached.
  const dynamicBlock = `PLAYER PROFILE FOR THIS REQUEST:\n${summary}\n\nFor this request, generate EXACTLY ${count} scenarios, numbered starting at id ${offset + 1} through id ${offset + count}.`;

  const variationSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const userMessage = `Generate the ${count} scenario cards (ids ${offset + 1}–${offset + count}) for this player profile. Return only the JSON array.\n\nVariation seed: ${variationSeed}. Use this seed to make this generation distinct from any previous generation: vary the specific dollar amounts, friend/character names, brands and stores referenced, the framing of each dilemma, and which subset of topics you emphasize. Do not repeat verbatim phrasing from prior generations.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        temperature: 1.0,
        system: [
          { type: 'text', text: staticInstructions, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: dynamicBlock },
        ],
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      console.error('Anthropic API error:', anthropicRes.status, JSON.stringify(err));
      return res.status(anthropicRes.status).json({
        error: err?.error?.message || `Anthropic ${anthropicRes.status}`,
        stage: 'anthropic_request',
      });
    }

    const data = await anthropicRes.json();
    const text = (data.content?.[0]?.text || '').trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      console.error('JSON parse error. Raw text:', text.slice(0, 500));
      return res.status(500).json({ error: `Could not parse model output: ${parseErr.message}`, stage: 'parse' });
    }

    if (!Array.isArray(parsed) || parsed.length < count) {
      return res.status(500).json({ error: `Insufficient scenarios returned (got ${Array.isArray(parsed) ? parsed.length : 'non-array'}, expected ${count})`, stage: 'validate' });
    }

    return res.status(200).json(parsed.slice(0, count));
  } catch (err) {
    console.error('Handler crash:', err);
    return res.status(500).json({ error: err.message || 'Internal server error', stage: 'handler' });
  }
}
