export const LEARNING_ROADMAP_VERSION = 1;

export const LEARNING_BRANCHES = [
  {
    id: 'money-basics',
    title: 'Money Basics',
    description: 'Understand where money comes from and where it goes.',
    accent: 'emerald',
  },
  {
    id: 'saving',
    title: 'Saving',
    description: 'Build a cushion before you take on market risk.',
    accent: 'blue',
  },
  {
    id: 'growing-money',
    title: 'Growing Money',
    description: 'Learn the maths and trade-offs behind returns.',
    accent: 'indigo',
  },
  {
    id: 'investing',
    title: 'Investing',
    description: 'Go from bank products to diversified market participation.',
    accent: 'amber',
  },
  {
    id: 'financial-safety',
    title: 'Financial Safety',
    description: 'Protect your money, identity and credit health.',
    accent: 'rose',
  },
];

export const LEARNING_CONCEPTS = [
  {
    id: 'income',
    title: 'Income',
    category: 'Money Basics',
    branchId: 'money-basics',
    prerequisites: [],
  },
  {
    id: 'expenses',
    title: 'Expenses',
    category: 'Money Basics',
    branchId: 'money-basics',
    prerequisites: ['income'],
  },
  {
    id: 'budgeting',
    title: 'Budgeting',
    category: 'Money Basics',
    branchId: 'money-basics',
    prerequisites: ['income', 'expenses'],
  },
  {
    id: 'saving-money',
    title: 'Saving money',
    category: 'Saving',
    branchId: 'saving',
    prerequisites: ['budgeting'],
  },
  {
    id: 'emergency-funds',
    title: 'Emergency funds',
    category: 'Saving',
    branchId: 'saving',
    prerequisites: ['saving-money', 'expenses'],
  },
  {
    id: 'inflation',
    title: 'Inflation',
    category: 'Saving',
    branchId: 'saving',
    prerequisites: ['saving-money'],
  },
  {
    id: 'simple-interest',
    title: 'Simple interest',
    category: 'Growing Money',
    branchId: 'growing-money',
    prerequisites: ['saving-money'],
  },
  {
    id: 'compound-interest',
    title: 'Compound interest',
    category: 'Growing Money',
    branchId: 'growing-money',
    prerequisites: ['simple-interest', 'inflation'],
  },
  {
    id: 'risk-and-return',
    title: 'Risk and return',
    category: 'Growing Money',
    branchId: 'growing-money',
    prerequisites: ['compound-interest'],
  },
  {
    id: 'bank-deposits',
    title: 'Bank deposits',
    category: 'Investing',
    branchId: 'investing',
    prerequisites: ['saving-money', 'simple-interest'],
  },
  {
    id: 'fixed-recurring-deposits',
    title: 'Fixed and recurring deposits',
    category: 'Investing',
    branchId: 'investing',
    prerequisites: ['bank-deposits', 'compound-interest'],
  },
  {
    id: 'stocks',
    title: 'Stocks',
    category: 'Investing',
    branchId: 'investing',
    prerequisites: ['risk-and-return'],
  },
  {
    id: 'mutual-funds',
    title: 'Mutual funds',
    category: 'Investing',
    branchId: 'investing',
    prerequisites: ['stocks'],
  },
  {
    id: 'index-funds',
    title: 'Index funds',
    category: 'Investing',
    branchId: 'investing',
    prerequisites: ['mutual-funds'],
  },
  {
    id: 'sips',
    title: 'SIPs',
    category: 'Investing',
    branchId: 'investing',
    prerequisites: ['mutual-funds', 'compound-interest'],
  },
  {
    id: 'diversification',
    title: 'Diversification',
    category: 'Investing',
    branchId: 'investing',
    prerequisites: ['mutual-funds', 'risk-and-return'],
  },
  {
    id: 'fees-expense-ratios',
    title: 'Fees and expense ratios',
    category: 'Investing',
    branchId: 'investing',
    prerequisites: ['mutual-funds', 'index-funds'],
  },
  {
    id: 'investment-time-horizon',
    title: 'Investment time horizon',
    category: 'Investing',
    branchId: 'investing',
    prerequisites: ['compound-interest', 'risk-and-return'],
  },
  {
    id: 'risk-tolerance',
    title: 'Risk tolerance',
    category: 'Investing',
    branchId: 'investing',
    prerequisites: ['investment-time-horizon', 'diversification'],
  },
  {
    id: 'upi-safety',
    title: 'UPI safety',
    category: 'Financial Safety',
    branchId: 'financial-safety',
    prerequisites: ['expenses'],
  },
  {
    id: 'digital-financial-fraud',
    title: 'Digital financial fraud',
    category: 'Financial Safety',
    branchId: 'financial-safety',
    prerequisites: ['upi-safety'],
  },
  {
    id: 'borrowing-interest',
    title: 'Borrowing and interest',
    category: 'Financial Safety',
    branchId: 'financial-safety',
    prerequisites: ['budgeting', 'simple-interest'],
  },
  {
    id: 'credit-scores',
    title: 'Credit scores',
    category: 'Financial Safety',
    branchId: 'financial-safety',
    prerequisites: ['borrowing-interest'],
  },
];

export const LEARNING_CONCEPTS_BY_ID = new Map(
  LEARNING_CONCEPTS.map((concept) => [concept.id, concept])
);

export function getLearningConcept(conceptId) {
  return LEARNING_CONCEPTS_BY_ID.get(conceptId) || null;
}

export function getLearningCurriculum() {
  return {
    version: LEARNING_ROADMAP_VERSION,
    conceptCount: LEARNING_CONCEPTS.length,
    branches: LEARNING_BRANCHES,
    concepts: LEARNING_CONCEPTS,
  };
}
