import { Exam, Subject } from './types';

// Helper to generate chapters quickly for the demo
const generateChapters = (list: string[]) => list.map((name, idx) => ({ id: `ch-${idx}`, name }));

export const PHYSICS_CHAPTERS = generateChapters([
  "Electrostatics", "Current Electricity", "Magnetism", "EMI & AC", "Optics", "Modern Physics", "Semiconductors", "Kinematics", "Laws of Motion", "Work Power Energy", "Rotational Motion", "Thermodynamics"
]);

export const CHEMISTRY_CHAPTERS = generateChapters([
  "Solutions", "Electrochemistry", "Chemical Kinetics", "Surface Chemistry", "p-Block Elements", "d- and f-Block", "Coordination Compounds", "Haloalkanes & Haloarenes", "Alcohols, Phenols, Ethers", "Aldehydes, Ketones, Carboxylic Acids", "Amines", "Biomolecules"
]);

export const MATH_CHAPTERS = generateChapters([
  "Relations & Functions", "Inverse Trig Functions", "Matrices", "Determinants", "Continuity & Differentiability", "Applications of Derivatives", "Integrals", "Application of Integrals", "Differential Equations", "Vector Algebra", "3D Geometry", "Probability"
]);

export const ENGLISH_CHAPTERS = generateChapters([
  "Reading Comprehension", "Creative Writing Skills", "Literature: Flaming", "Literature: Vistas"
]);

export const IP_CHAPTERS = generateChapters([
  "Data Handling using Pandas", "Database Query using SQL", "Introduction to Computer Networks", "Societal Impacts"
]);

export const APTITUDE_CHAPTERS = generateChapters([
  "Data Interpretation", "Data Sufficiency", "Syllogism", "Number Series", "Coding-Decoding", "Clocks & Calendars"
]);

export const LOGICAL_REASONING_CHAPTERS = generateChapters([
  "Analogy", "Classification", "Series Completion", "Logical Deduction", "Chart Logic", "Pattern Perception"
]);

// --- COMMERCE SUBJECTS ---
export const ACCOUNTANCY_CHAPTERS = generateChapters([
  "Accounting for Partnership Firms", "Reconstitution of Partnership", "Dissolution of Partnership Firm", "Accounting for Share Capital", "Issue and Redemption of Debentures", "Financial Statements of a Company", "Analysis of Financial Statements", "Accounting Ratios", "Cash Flow Statement"
]);

export const BST_CHAPTERS = generateChapters([
  "Nature and Significance of Management", "Principles of Management", "Business Environment", "Planning", "Organising", "Staffing", "Directing", "Controlling", "Financial Management", "Financial Markets", "Marketing Management", "Consumer Protection"
]);

export const ECONOMICS_CHAPTERS = generateChapters([
  "National Income and Related Aggregates", "Money and Banking", "Determination of Income and Employment", "Government Budget and the Economy", "Balance of Payments", "Development Experience (1947-90)", "Economic Reforms since 1991", "Current Challenges facing Indian Economy", "Development Experience of India"
]);

export const APPLIED_MATH_CHAPTERS = generateChapters([
    "Numbers, Quantification and Numerical Applications", "Algebra", "Calculus", "Probability Distributions", "Inferential Statistics", "Index Numbers and Time-based Data", "Financial Mathematics", "Linear Programming"
]);

// -- EXPORTABLE SUBJECT LISTS FOR ONBOARDING --
export const COMMERCE_SUBJECT_OPTIONS = [
    { id: 'acc', name: 'Accountancy' },
    { id: 'bst', name: 'Business Studies' },
    { id: 'eco', name: 'Economics' },
    { id: 'eng', name: 'English' },
    { id: 'math', name: 'Mathematics' },
    { id: 'app_math', name: 'Applied Math' },
    { id: 'ip', name: 'IP / CS' }
];

export const EXAMS: Exam[] = [
  {
    id: 'boards',
    name: 'Class 12 Boards (Science)',
    date: '2026-02-20',
    subjects: [
      { id: 'phy', name: 'Physics', chapters: PHYSICS_CHAPTERS },
      { id: 'chem', name: 'Chemistry', chapters: CHEMISTRY_CHAPTERS },
      { id: 'math', name: 'Mathematics', chapters: MATH_CHAPTERS },
      { id: 'eng', name: 'English', chapters: ENGLISH_CHAPTERS },
      { id: 'ip', name: 'IP', chapters: IP_CHAPTERS },
    ]
  },
  {
    id: 'jee',
    name: 'JEE Mains',
    date: '2026-04-02',
    subjects: [
      { id: 'phy', name: 'Physics', chapters: PHYSICS_CHAPTERS },
      { id: 'chem', name: 'Chemistry', chapters: CHEMISTRY_CHAPTERS },
      { id: 'math', name: 'Mathematics', chapters: MATH_CHAPTERS },
    ]
  },
  {
    id: 'bitsat',
    name: 'BITSAT',
    date: null,
    sessions: [
      { label: 'Session 1', date: '2026-04-15' },
      { label: 'Session 2', date: '2026-05-24' }
    ],
    subjects: [
      { id: 'phy', name: 'Physics', chapters: PHYSICS_CHAPTERS },
      { id: 'chem', name: 'Chemistry', chapters: CHEMISTRY_CHAPTERS },
      { id: 'math', name: 'Mathematics', chapters: MATH_CHAPTERS },
      { id: 'eng', name: 'English', chapters: ENGLISH_CHAPTERS },
      { id: 'lr', name: 'Logical Reasoning', chapters: LOGICAL_REASONING_CHAPTERS },
    ]
  },
  {
    id: 'viteee',
    name: 'VITEEE',
    date: '2026-04-28',
    subjects: [
      { id: 'phy', name: 'Physics', chapters: PHYSICS_CHAPTERS },
      { id: 'chem', name: 'Chemistry', chapters: CHEMISTRY_CHAPTERS },
      { id: 'math', name: 'Mathematics', chapters: MATH_CHAPTERS },
      { id: 'apt', name: 'Aptitude', chapters: APTITUDE_CHAPTERS },
      { id: 'eng', name: 'English', chapters: ENGLISH_CHAPTERS },
    ]
  }
];

// Helper to get subjects by ID
export const getSubjectById = (id: string): Subject => {
    switch(id) {
        case 'acc': return { id, name: 'Accountancy', chapters: ACCOUNTANCY_CHAPTERS };
        case 'bst': return { id, name: 'Business Studies', chapters: BST_CHAPTERS };
        case 'eco': return { id, name: 'Economics', chapters: ECONOMICS_CHAPTERS };
        case 'eng': return { id, name: 'English', chapters: ENGLISH_CHAPTERS };
        case 'math': return { id, name: 'Mathematics', chapters: MATH_CHAPTERS };
        case 'app_math': return { id, name: 'Applied Math', chapters: APPLIED_MATH_CHAPTERS };
        case 'ip': return { id, name: 'IP / CS', chapters: IP_CHAPTERS };
        default: return { id, name: 'Unknown', chapters: [] };
    }
};