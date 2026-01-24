import { Exam } from './types';

// Helper to generate chapters quickly for the demo
const generateChapters = (list: string[]) => list.map((name, idx) => ({ id: `ch-${idx}`, name }));

const PHYSICS_CHAPTERS = generateChapters([
  "Electrostatics", "Current Electricity", "Magnetism", "EMI & AC", "Optics", "Modern Physics", "Semiconductors", "Kinematics", "Laws of Motion", "Work Power Energy", "Rotational Motion", "Thermodynamics"
]);

const CHEMISTRY_CHAPTERS = generateChapters([
  "Solutions", "Electrochemistry", "Chemical Kinetics", "Surface Chemistry", "p-Block Elements", "d- and f-Block", "Coordination Compounds", "Haloalkanes & Haloarenes", "Alcohols, Phenols, Ethers", "Aldehydes, Ketones, Carboxylic Acids", "Amines", "Biomolecules"
]);

const MATH_CHAPTERS = generateChapters([
  "Relations & Functions", "Inverse Trig Functions", "Matrices", "Determinants", "Continuity & Differentiability", "Applications of Derivatives", "Integrals", "Application of Integrals", "Differential Equations", "Vector Algebra", "3D Geometry", "Probability"
]);

const ENGLISH_CHAPTERS = generateChapters([
  "Reading Comprehension", "Creative Writing Skills", "Literature: Flaming", "Literature: Vistas"
]);

const IP_CHAPTERS = generateChapters([
  "Data Handling using Pandas", "Database Query using SQL", "Introduction to Computer Networks", "Societal Impacts"
]);

const APTITUDE_CHAPTERS = generateChapters([
  "Data Interpretation", "Data Sufficiency", "Syllogism", "Number Series", "Coding-Decoding", "Clocks & Calendars"
]);

const LOGICAL_REASONING_CHAPTERS = generateChapters([
  "Analogy", "Classification", "Series Completion", "Logical Deduction", "Chart Logic", "Pattern Perception"
]);

export const EXAMS: Exam[] = [
  {
    id: 'boards',
    name: 'Class 12 Boards',
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
    name: 'JEE Mains (2nd)',
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