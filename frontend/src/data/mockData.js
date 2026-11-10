/**
 * WealthGenie - Educational content data (Indian context)
 *
 * This file contains static educational content only (lesson summaries,
 * investment categories, and a daily insight). It intentionally does not
 * contain user profiles, account balances, goals, or notifications — those
 * are loaded from the authenticated user's Supabase account.
 */

export const MOCK_LESSONS = [
  {
    id: "lesson-1",
    title: "Demystifying Mutual Funds & SIPs for Beginners",
    category: "Investing Basics",
    readTime: "6 min read",
    difficulty: "Beginner",
    progress: 100,
    isCompleted: true,
    summary: "Discover how Systematic Investment Plans (SIP) allow you to invest small sums regularly, benefiting from rupee-cost averaging.",
    keyTakeaway: "Starting a ₹2,000 monthly SIP early leverages compound growth without trying to time the market.",
    modulesCount: 3,
  },
  {
    id: "lesson-2",
    title: "The 50/30/20 Budgeting Rule in Indian Metros",
    category: "Budgeting",
    readTime: "5 min read",
    difficulty: "Beginner",
    progress: 50,
    isCompleted: false,
    summary: "How to allocate your monthly take-home salary across Needs (rent, provisions, EMI), Wants, and Financial Investments.",
    keyTakeaway: "50% Needs, 30% Wants, and 20% dedicated to building emergency reserves and long-term wealth.",
    modulesCount: 4,
  },
  {
    id: "lesson-3",
    title: "Understanding Index Funds: Why Nifty 50 Matters",
    category: "Investing Basics",
    readTime: "7 min read",
    difficulty: "Beginner",
    progress: 0,
    isCompleted: false,
    summary: "Why low-cost passive index funds tracking the top 50 Indian companies provide instant diversification with minimal fund manager expense.",
    keyTakeaway: "Low expense ratios allow more of your returns to compound over decades.",
    modulesCount: 5,
  },
  {
    id: "lesson-4",
    title: "Emergency Fund: How Much & Where to Park It?",
    category: "Cash Management",
    readTime: "5 min read",
    difficulty: "Beginner",
    progress: 0,
    isCompleted: false,
    summary: "Why an emergency fund must prioritize capital preservation and instant liquidity over high returns.",
    keyTakeaway: "Keep 3–6 months of essential expenses in a sweep-in FD or liquid mutual fund.",
    modulesCount: 3,
  },
  {
    id: "lesson-5",
    title: "PPF vs. EPF vs. NPS: Indian Retirement Pillars",
    category: "Tax & Retirement",
    readTime: "8 min read",
    difficulty: "Intermediate",
    progress: 0,
    isCompleted: false,
    summary: "Comparing sovereign guarantees, tax benefits (Section 80C & 80CCD), and lock-in horizons across Indian long-term instruments.",
    keyTakeaway: "PPF offers tax-free sovereign security; NPS offers low-cost equity exposure with tier-based tax incentives.",
    modulesCount: 4,
  },
  {
    id: "lesson-6",
    title: "Digital Financial Safety & UPI Hygiene",
    category: "Financial Safety",
    readTime: "4 min read",
    difficulty: "Beginner",
    progress: 0,
    isCompleted: false,
    summary: "Critical digital hygiene guidelines: why you never enter a UPI PIN to receive money or cashbacks.",
    keyTakeaway: "UPI PIN is only for debiting/sending money. Treat your OTPs and PINs like your ATM card password.",
    modulesCount: 3,
  },
];

export const MOCK_INVESTMENT_BASICS = [
  {
    title: "Bank FDs & Liquid Funds",
    subtitle: "Capital Preservation & Cash Reserves",
    riskLevel: "Very Low",
    riskColor: "emerald",
    horizon: "0 - 1 Year",
    purpose: "Primary emergency liquidity. Bank deposits are DICGC-insured up to ₹5 Lakh per depositor per bank.",
    regulatoryNote: "Regulated by RBI / SEBI",
    iconName: "Shield",
  },
  {
    title: "G-Secs & Target Maturity Debt",
    subtitle: "Government Securities & Debt Funds",
    riskLevel: "Low to Moderate",
    riskColor: "blue",
    horizon: "2 - 5 Years",
    purpose: "Fixed income stability backed by sovereign or high-grade corporate debt instruments.",
    regulatoryNote: "Regulated by RBI / SEBI",
    iconName: "FileText",
  },
  {
    title: "Broad Market Index Funds",
    subtitle: "Nifty 50 & BSE Sensex Passives",
    riskLevel: "Moderate to High",
    riskColor: "indigo",
    horizon: "5+ Years",
    purpose: "Participates in the broader growth of leading Indian industries with ultra-low expense ratios.",
    regulatoryNote: "SEBI Registered Mutual Funds",
    iconName: "PieChart",
  },
  {
    title: "PPF & Sovereign Gold Bonds",
    subtitle: "Sovereign Long-Term Vehicles",
    riskLevel: "Low Market Risk",
    riskColor: "amber",
    horizon: "7 - 15 Years",
    purpose: "Government-backed long-term compounding with specific statutory lock-in periods.",
    regulatoryNote: "Sovereign instruments (Govt of India)",
    iconName: "TrendingUp",
  },
];

export const MOCK_DAILY_INSIGHT = {
  date: "Today's Financial Insight",
  title: "Automate Your SIP on Payday",
  summary: "Schedule your Systematic Investment Plan (SIP) or recurring deposit 2 to 3 days after your monthly salary credit. By paying your future self first before discretionary spending begins, saving becomes completely friction-free.",
  actionStep: "Align your mutual fund SIP debit date to the 3rd or 5th of every month.",
  tag: "Disciplined Investing",
};

export const SAMPLE_AI_PROMPTS = [
  "What is an index fund and how does it track the Nifty 50?",
  "How much should I keep in an emergency fund?",
  "What is the difference between PPF and EPF?",
  "When is entering a UPI PIN strictly required?",
];
