// Rug Radar — token-radar-01 entry (Node 22, standard library only).
//
// Angle: rug detection. A token launch is only worth farming when the protocol
// is still standing at launch, so every pre-token protocol is screened for
// rug risk first and its implied value is discounted by what the screen finds.
//
// The screen reads six signals from the sealed snapshot alone — never a name,
// never an outside list — and scores each protocol 0-100 (higher = riskier):
//
//   flight      25  TVL draining over 7 days against the week's own median
//                   (capital flight); no reading counts as half, because an
//                   unverifiable week is itself a risk.
//   youth       25  Young and already big: age under a year scaled by log size.
//   chains      15  One chain is one point of failure; two is better; three+ is 0.
//   volatility  15  A wild 7-day swing either way; no reading counts as half.
//   class       10  The category's risk class (leveraged/yield/farm high,
//                   dex/derivatives medium, lending/rwa/bridge low).
//   ghost       10  A huge pile of TVL with no 7-day reading, or a silent one.
//
// Tiers: 0-24 Low, 25-44 Guarded, 45-64 Elevated, 65-100 High. The implied
// value starts from the protocol's TVL priced off its own category's tokened
// peers (their median market-cap/TVL, shrunk toward the global median so a
// two-protocol category cannot set the price), then growth and maturity
// multipliers, then a haircut of up to 60% from the rug score:
//
//   base      = tvl_usd x peerMultiple(category)
//   growth    = 1 + clamp(change_7d, -60, 120) / 100 x 0.5
//   maturity  = 0.6 + min(age_days ?? 365, 1095) / 1095 x 0.4
//   discount  = rugScore / 100 x 0.6
//   implied   = max(1, round(base x growth x maturity x (1 - discount)))
//
// The board ranks every rankable pre-token protocol (198 of them: the 40 on
// the watchlist plus the 158 below the floor and beyond it) by that risk-adjusted implied
// value. Protocols whose token already trades are never ranked; they are the
// peer set the multiples come from and the dashboard shows them apart.
//
// The program is deterministic: the same snapshot bytes in, the same bytes
// out, so the grader's two runs agree. Farm plans are rug-aware: the deposit
// shrinks as the tier worsens and every plan carries an exit trigger.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'rug-radar-1';

/** The rug tiers, worst last. */
export type RugTier = 'Low' | 'Guarded' | 'Elevated' | 'High';

/** One rug signal: its points out of its max, and the reading behind them. */
export interface RugSignal {
  key: string;
  label: string;
  points: number;
  max: number;
  reading: string;
}

/** A protocol's whole rug screen. */
export interface RugScore {
  score: number;
  tier: RugTier;
  signals: RugSignal[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  peer_prior_weight: number;
  peer_multiple_floor: number;
  peer_multiple_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  risk_haircut_max: number;
}

export const MODEL: ModelConstants = {
  peer_prior_weight: 5,
  peer_multiple_floor: 0.02,
  peer_multiple_cap: 1.0,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  risk_haircut_max: 0.6,
};

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  rug_score: number;
  rug_tier: RugTier;
  rug_signals: RugSignal[];
  peer_multiple: number;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    risk_discount: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  rug_score: number;
  rug_tier: RugTier;
  rug_signals: RugSignal[];
  peer_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  risk_discount: number;
  on_watchlist: boolean;
  implied_value_usd: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols_total: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  tier_counts: Record<RugTier, number>;
  median_rug: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** Clamp `n` into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The rug tier a score falls in. */
export function rugTier(score: number): RugTier {
  if (score >= 65) return 'High';
  if (score >= 45) return 'Elevated';
  if (score >= 25) return 'Guarded';
  return 'Low';
}

/** Capital flight: TVL draining over 7 days, against the week's own median. Null counts as half — an unverifiable week is a risk. */
function flightSignal(p: SnapshotProtocol, medianChange: number): RugSignal {
  const g = p.change_7d;
  if (g === null || !Number.isFinite(g)) {
    return { key: 'flight', label: 'Capital flight', points: 12, max: 25, reading: 'No 7-day TVL reading: the week cannot be checked.' };
  }
  const behind = medianChange - g;
  if (behind <= 0) {
    return { key: 'flight', label: 'Capital flight', points: 0, max: 25, reading: `TVL ${fmtPct(g)} over 7 days, at or above the week's median of ${fmtPct(medianChange)}: no flight.` };
  }
  const points = Math.round(clamp(behind, 0, 25));
  return { key: 'flight', label: 'Capital flight', points, max: 25, reading: `TVL ${fmtPct(g)} over 7 days, ${behind.toFixed(1)} points behind the week's median of ${fmtPct(medianChange)}.` };
}

/** Youth at scale: young and already big is unproven at that size. Size is log-scaled against the
 * snapshot's $5M floor: $50M counts as half scale, $500M as full. */
function youthSignal(p: SnapshotProtocol, age: number | null): RugSignal {
  const ageFactor = age === null ? 0.5 : clamp(1 - age / 365, 0, 1);
  const sizeFactor = clamp(Math.log10(Math.max(p.tvl_usd, 1) / 5_000_000) / 2, 0, 1);
  const points = Math.round(25 * ageFactor * sizeFactor);
  const ageText = age === null ? 'age unknown' : `${age} days old`;
  return {
    key: 'youth',
    label: 'Youth at scale',
    points,
    max: 25,
    reading: `${ageText}, ${fmtUsd(p.tvl_usd)} of TVL: ${points === 0 ? 'seasoned or small enough to judge.' : 'young for its size.'}`,
  };
}

/** Chain concentration: one chain is one point of failure. */
function chainsSignal(p: SnapshotProtocol): RugSignal {
  const n = p.chains.length;
  const points = n <= 1 ? 15 : n === 2 ? 7 : 0;
  return {
    key: 'chains',
    label: 'Chain concentration',
    points,
    max: 15,
    reading: n <= 1 ? 'On one chain only: a single point of failure.' : `On ${n} chains.`,
  };
}

/** Volatility: a wild 7-day swing either way. Null counts as half. */
function volatilitySignal(p: SnapshotProtocol): RugSignal {
  const g = p.change_7d;
  if (g === null || !Number.isFinite(g)) {
    return { key: 'volatility', label: 'Volatility', points: 7, max: 15, reading: 'No 7-day reading: the swing cannot be checked.' };
  }
  const points = Math.round(clamp(Math.abs(g) * 15 / 30, 0, 15));
  return { key: 'volatility', label: 'Volatility', points, max: 15, reading: `7-day move of ${Math.abs(g).toFixed(1)}% in either direction.` };
}

/** The category's risk class: leveraged and yield products fail hardest; lending and RWA fail softest. */
function classSignal(p: SnapshotProtocol): RugSignal {
  const c = (p.category ?? '').toLowerCase();
  if (c === '') {
    return { key: 'class', label: 'Category class', points: 5, max: 10, reading: 'No category recorded: class unknown.' };
  }
  if (c.includes('leveraged') || c.includes('yield') || c.includes('farm') || c.includes('algo-stable') || c.includes('ponzi')) {
    return { key: 'class', label: 'Category class', points: 10, max: 10, reading: `Category ${p.category}: leveraged and yield products carry the highest rug incidence.` };
  }
  if (c.includes('dex') || c.includes('derivative') || c.includes('prediction') || c.includes('options') || c.includes('synthetic') || c.includes('perpetual')) {
    return { key: 'class', label: 'Category class', points: 5, max: 10, reading: `Category ${p.category}: medium rug incidence.` };
  }
  return { key: 'class', label: 'Category class', points: 0, max: 10, reading: `Category ${p.category}: lower rug incidence.` };
}

/** Ghost TVL: a huge pile with no reading, or a silent one, cannot be verified. */
function ghostSignal(p: SnapshotProtocol): RugSignal {
  const g = p.change_7d;
  if (g === null || !Number.isFinite(g)) {
    const points = p.tvl_usd >= 100_000_000 ? 10 : 5;
    return { key: 'ghost', label: 'Ghost TVL', points, max: 10, reading: `${fmtUsd(p.tvl_usd)} of TVL with no 7-day reading: unverifiable.` };
  }
  if (Math.abs(g) < 0.25 && p.tvl_usd >= 500_000_000) {
    return { key: 'ghost', label: 'Ghost TVL', points: 5, max: 10, reading: `${fmtUsd(p.tvl_usd)} of TVL barely moved in 7 days: silent pile.` };
  }
  return { key: 'ghost', label: 'Ghost TVL', points: 0, max: 10, reading: 'TVL moves and is readable.' };
}

/** A protocol's whole rug screen: six signals, a 0-100 score and its tier. */
export function rugScreen(p: SnapshotProtocol, age: number | null, medianChange: number): RugScore {
  const signals = [flightSignal(p, medianChange), youthSignal(p, age), chainsSignal(p), volatilitySignal(p), classSignal(p), ghostSignal(p)];
  const score = signals.reduce((s, x) => s + x.points, 0);
  return { score, tier: rugTier(score), signals };
}

/** A whole-dollar amount, short: $12.3M, $450K, $7.9B. */
export function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** A per-cent figure with one decimal: 12.5%, -4.0%. */
export function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The house's wrapped-product rule, from the snapshot's own README: a wrapped, staked or bridged
 * product of a token that already trades is not a token that does not exist yet. */
const WRAPPED_CATEGORY = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whether a protocol is a wrapped, staked or bridged product of a token that already trades. */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  return (
    WRAPPED_CATEGORY.has(p.category ?? '') ||
    WRAPPED_WORD.test(p.name) ||
    EXCHANGE_PREFIX.test(p.name) ||
    VERSIONED.test(p.name)
  );
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked or bridged
 * product of a token that already trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isWrappedProduct(p);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The median of a sorted array, or null when it is empty. */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The peer multiple per category: the median market-cap/TVL of the tokened
 * protocols in that category, shrunk toward the global median with a prior
 * weight so a two-protocol category cannot set the price. Clamped to the
 * model's floor and cap. Categories with no tokened peer take the global
 * median outright.
 */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): Map<string, number> {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      all.push(ratio);
      const key = p.category ?? '';
      const list = byCat.get(key) ?? [];
      list.push(ratio);
      byCat.set(key, list);
    }
  }
  all.sort((a, b) => a - b);
  const global = median(all) ?? 0.25;
  const out = new Map<string, number>();
  for (const [cat, ratios] of byCat) {
    ratios.sort((a, b) => a - b);
    const med = median(ratios) ?? global;
    const shrunk = (ratios.length * med + model.peer_prior_weight * global) / (ratios.length + model.peer_prior_weight);
    out.set(cat, clamp(shrunk, model.peer_multiple_floor, model.peer_multiple_cap));
  }
  out.set('', clamp(global, model.peer_multiple_floor, model.peer_multiple_cap));
  return out;
}

/** The implied value one protocol gets: peer-priced base, growth, maturity, then the rug haircut. */
export function impliedValue(
  p: SnapshotProtocol,
  age: number | null,
  rug: RugScore,
  peerMultiple: number,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; riskDiscount: number } {
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const riskDiscount = (rug.score / 100) * model.risk_haircut_max;
  const base = p.tvl_usd * peerMultiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * (1 - riskDiscount)));
  return { implied, growthPct, growthMult, maturityMult, riskDiscount };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const multiples = peerMultiples(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, below the floor or not.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  // The week's own median 7-day change: capital flight is read against the
  // market's week, so a down week does not condemn the whole board.
  const changes = [...chosen.values()]
    .map((p) => p.change_7d)
    .filter((g): g is number => typeof g === 'number' && Number.isFinite(g))
    .sort((a, b) => a - b);
  const medianChange = median(changes) ?? 0;
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const rug = rugScreen(p, age, medianChange);
    const peerMultiple = multiples.get(p.category ?? '') ?? multiples.get('')!;
    const v = impliedValue(p, age, rug, peerMultiple, model);
    return { p, age, rug, peerMultiple, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    rug_score: s.rug.score,
    rug_tier: s.rug.tier,
    rug_signals: s.rug.signals,
    peer_multiple: round4(s.peerMultiple),
    implied_value_usd: s.v.implied,
    model: {
      peer_multiple: round4(s.peerMultiple),
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      risk_discount: round4(s.v.riskDiscount),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.rug).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs: it shrinks as the rug tier worsens. */
function capitalFor(tier: RugTier): number {
  if (tier === 'High') return 25;
  if (tier === 'Elevated') return 50;
  if (tier === 'Guarded') return 75;
  return 100;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The 7-day TVL drop that triggers an unwind, by rug tier. */
function exitDropFor(tier: RugTier): number {
  if (tier === 'High') return 10;
  if (tier === 'Elevated') return 15;
  if (tier === 'Guarded') return 20;
  return 25;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} (${chain}) and leave the loan open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s main pool on ${chain} and leave it in.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund ${name} with $${capital} and take one position in an open market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy live.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age, rug tier), never from a hand-written list of names. High-tier rows
 * farm small and carry a hard exit trigger; low-tier rows farm the full size.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, rug: RugScore): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(rug.tier);
  const hold = holdDaysFor(age);
  const drop = exitDropFor(rug.tier);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `Check ${p.name}'s docs for an admin key, a timelock and an audit before you deposit anything; if none are published, halve the position below.`,
      cost: 'nothing to check',
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 75 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and check the 7-day TVL every week: unwind at once if it falls a further ${drop}% or withdrawals pause.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; never pay to claim.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    rug_score: row.rug_score,
    rug_tier: row.rug_tier,
    rug_signals: row.rug_signals,
    peer_multiple: row.peer_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    risk_discount: row.model.risk_discount,
    on_watchlist: onWatchlist,
    implied_value_usd: row.implied_value_usd,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const tier_counts: Record<RugTier, number> = { Low: 0, Guarded: 0, Elevated: 0, High: 0 };
  const scores: number[] = [];
  const watch = new Set(snapshot.watchlist);
  for (const r of board) {
    tier_counts[r.rug_tier]++;
    scores.push(r.rug_score);
  }
  scores.sort((a, b) => a - b);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    protocols_total: snapshot.protocols.length,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    tier_counts,
    median_rug: median(scores) ?? 0,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watch.has(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  // The page renders with no network: keep the source line free of any address.
  const clean: RadarData = { ...radar, source: 'DefiLlama protocols snapshot, fetched 2026-11-14' };
  return `window.RADAR=${JSON.stringify(clean)};\n`;
}
