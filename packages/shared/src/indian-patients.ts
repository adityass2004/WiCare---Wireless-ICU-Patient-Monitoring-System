export interface IndianPatientProfile {
  id: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female';
  bloodGroup: string;
  uhid: string;
  ward: string;
  bedId: string;
  deviceId: string;
  primaryDiagnosis: string;
  attendingDoctor: string;
  admissionDate: string;
  allergies: string[];
  comorbidities: string[];
  baselineLabs: {
    bloodPressure: string;
    bloodGlucose: string;
    hemoglobin: string;
    serumCreatinine: string;
    arterialPh: string;
    serumLactate: string;
    sodium: string;
    potassium: string;
  };
  clinicalNotes: string[];
}

const INDIAN_FIRST_NAMES = [
  'Rajesh', 'Sunita', 'Vikram', 'Ananya', 'Amit', 'Priya', 'Suresh', 'Meera',
  'Deepa', 'Ramesh', 'Pooja', 'Rohan', 'Kavita', 'Sanjay', 'Neha', 'Arjun',
  'Divya', 'Manoj', 'Swati', 'Alok', 'Geeta', 'Rahul', 'Shreya', 'Harish',
  'Shalini', 'Ajay', 'Vandana', 'Deepak', 'Rashmi', 'Vivek', 'Rekha', 'Nitin',
  'Snehal', 'Pradeep', 'Ritu', 'Sandeep', 'Tanvi', 'Ashok', 'Pratibha', 'Gaurav',
  'Pallavi', 'Hemant', 'Madhuri', 'Sunil', 'Aparna', 'Vijay', 'Archana', 'Bharat',
  'Lata', 'Chetan'
];

const INDIAN_LAST_NAMES = [
  'Sharma', 'Patel', 'Verma', 'Iyer', 'Kumar', 'Nair', 'Rao', 'Joshi',
  'Gupta', 'Yadav', 'Deshmukh', 'Singhania', 'Kulkarni', 'Mishra', 'Reddy', 'Pillai',
  'Banerjee', 'Mukherjee', 'Sen', 'Bhat', 'Hegde', 'Chauhan', 'Agarwal', 'Pandey',
  'Gill', 'Trivedi', 'Nambiar', 'Saxena', 'Goswami', 'Mahajan', 'Bhatia', 'Mehra',
  'Das', 'Roy', 'Chatterjee', 'Bose', 'Shukla', 'Tiwari', 'Choudhary', 'Ghosh',
  'Menon', 'Srinivas', 'Balakrishnan', 'Sethi', 'Kapoor', 'Malhotra', 'Varma', 'Bhattacharya',
  'Dutta', 'Ahuja'
];

const DIAGNOSES = [
  'Acute Anterior Wall STEMI - Post Primary PCI',
  'Severe Pneumonia with Acute Respiratory Failure',
  'Exacerbation of COPD with Type 2 Respiratory Failure',
  'Septic Shock secondary to Urosepsis',
  'Post-Operative CABG Recovery (Day 2)',
  'Acute Decompensated Heart Failure (NYHA Class IV)',
  'Hypertensive Emergency with Acute Pulmonary Edema',
  'Diabetic Ketoacidosis with Metabolic Acidosis',
  'Acute Pancreatitis with Systemic Inflammatory Response',
  'Status Post Exploratory Laparotomy for Perforation',
  'Ischemic Cerebrovascular Stroke with Hemiparesis',
  'Severe Scrub Typhus with Multiorgan Dysfunction',
];

const DOCTORS = [
  'Dr. Arvind Mehta (MD, DM Cardiology)',
  'Dr. Sneha Kulkarni (MD, FNB Critical Care)',
  'Dr. Rajeshwari Sen (MD, DNB Pulmonology)',
  'Dr. Farhan Khan (MD Internal Medicine, ICU)',
  'Dr. Anupam Ghosh (MS, MCh CTVS)',
  'Dr. Malini Nambiar (MD Anesthesiology & ICU)',
];

const BLOOD_GROUPS = ['B+', 'O+', 'A+', 'AB+', 'O-', 'B-', 'A-'];

const COMORBIDITY_OPTIONS = [
  ['Type 2 Diabetes Mellitus', 'Essential Hypertension'],
  ['Coronary Artery Disease', 'Dyslipidemia', 'Former Smoker'],
  ['Chronic Kidney Disease Stage III', 'Hypertension'],
  ['Bronchial Asthma', 'Mild Pulmonary Hypertension'],
  ['Hypothyroidism', 'Morbid Obesity (BMI 34)'],
  ['No Significant Medical Comorbidities'],
];

export function getIndianPatientProfile(index: number): IndianPatientProfile {
  const i = Math.max(1, index);
  const patientId = `P-${String(i).padStart(3, '0')}`;
  const deviceId = `DEV-${String(i).padStart(3, '0')}`;
  const bedId = `B-${i}`;
  const ward = i <= 25 ? 'Apex ICU Wing A' : 'Critical Care Unit B';

  const firstName = INDIAN_FIRST_NAMES[(i - 1) % INDIAN_FIRST_NAMES.length] ?? 'Patient';
  const lastName = INDIAN_LAST_NAMES[(i - 1) % INDIAN_LAST_NAMES.length] ?? `${i}`;
  const name = `${firstName} ${lastName}`;
  const age = 32 + ((i * 7) % 52);
  const gender = i % 2 === 0 ? 'Female' : 'Male';
  const bloodGroup = BLOOD_GROUPS[(i - 1) % BLOOD_GROUPS.length] ?? 'O+';
  const uhid = `UHID-IND-2026-${String(1000 + i)}`;

  const diagnosis = DIAGNOSES[(i - 1) % DIAGNOSES.length] ?? 'Acute ICU Monitoring';
  const attendingDoctor = DOCTORS[(i - 1) % DOCTORS.length] ?? 'Dr. Arvind Mehta (MD)';
  const comorbidities = COMORBIDITY_OPTIONS[(i - 1) % COMORBIDITY_OPTIONS.length] ?? ['Hypertension'];
  const allergies = i % 3 === 0 ? ['Penicillin (Rash)'] : i % 5 === 0 ? ['Sulfa Antibiotics'] : ['None Known (NKDA)'];

  const admissionDate = `14 Oct 2026, 0${(i % 12) + 1}:30 IST`;

  return {
    id: patientId,
    name,
    age,
    gender,
    bloodGroup,
    uhid,
    ward,
    bedId,
    deviceId,
    primaryDiagnosis: diagnosis,
    attendingDoctor,
    admissionDate,
    allergies,
    comorbidities,
    baselineLabs: {
      bloodPressure: `${110 + (i % 30)}/${70 + (i % 20)} mmHg`,
      bloodGlucose: `${110 + ((i * 13) % 90)} mg/dL`,
      hemoglobin: `${(11.5 + (i % 4) * 0.8).toFixed(1)} g/dL`,
      serumCreatinine: `${(0.8 + (i % 3) * 0.4).toFixed(1)} mg/dL`,
      arterialPh: '7.38',
      serumLactate: `${(1.1 + (i % 3) * 0.5).toFixed(1)} mmol/L`,
      sodium: '138 mEq/L',
      potassium: '4.2 mEq/L',
    },
    clinicalNotes: [
      '14:00 - Continuous multi-parameter wireless telemetry streaming online via WiCare Hub.',
      '11:30 - Patient hemodynamically assessed during rounds. Airway patent, clear breath sounds bilaterally.',
      `08:30 - Morning ICU consultant evaluation conducted by ${attendingDoctor}. Telemetry threshold limits calibrated.`,
    ],
  };
}

export function getAllIndianPatientProfiles(count = 50): IndianPatientProfile[] {
  return Array.from({ length: count }, (_, idx) => getIndianPatientProfile(idx + 1));
}
