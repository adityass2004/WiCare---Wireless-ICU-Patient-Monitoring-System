import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FIRST_NAMES = [
  'Rajesh', 'Sunita', 'Vikram', 'Ananya', 'Amit', 'Priya', 'Suresh', 'Meera',
  'Deepa', 'Ramesh', 'Pooja', 'Rohan', 'Kavita', 'Sanjay', 'Neha', 'Arjun',
  'Divya', 'Manoj', 'Swati', 'Alok', 'Geeta', 'Rahul', 'Shreya', 'Harish',
  'Shalini', 'Ajay', 'Vandana', 'Deepak', 'Rashmi', 'Vivek', 'Rekha', 'Nitin',
  'Snehal', 'Pradeep', 'Ritu', 'Sandeep', 'Tanvi', 'Ashok', 'Pratibha', 'Gaurav',
  'Pallavi', 'Hemant', 'Madhuri', 'Sunil', 'Aparna', 'Vijay', 'Archana', 'Bharat',
  'Lata', 'Chetan'
];

const LAST_NAMES = [
  'Sharma', 'Patel', 'Verma', 'Iyer', 'Kumar', 'Nair', 'Rao', 'Joshi',
  'Gupta', 'Yadav', 'Deshmukh', 'Singhania', 'Kulkarni', 'Mishra', 'Reddy', 'Pillai',
  'Banerjee', 'Mukherjee', 'Sen', 'Bhat', 'Hegde', 'Chauhan', 'Agarwal', 'Pandey',
  'Gill', 'Trivedi', 'Nambiar', 'Saxena', 'Goswami', 'Mahajan', 'Bhatia', 'Mehra',
  'Das', 'Roy', 'Chatterjee', 'Bose', 'Shukla', 'Tiwari', 'Choudhary', 'Ghosh',
  'Menon', 'Srinivas', 'Balakrishnan', 'Sethi', 'Kapoor', 'Malhotra', 'Varma', 'Bhattacharya',
  'Dutta', 'Ahuja'
];

async function seed() {
  console.log('Seeding patient database...');

  for (let i = 1; i <= 50; i++) {
    const patientId = `P-${String(i).padStart(3, '0')}`;
    const deviceId = `DEV-${String(i).padStart(3, '0')}`;
    const bedId = `B-${i}`;
    const ward = 'ICU';

    const firstName = FIRST_NAMES[i - 1] ?? `Patient`;
    const lastName = LAST_NAMES[i - 1] ?? `${i}`;
    const name = `${firstName} ${lastName}`;
    const age = 30 + (i * 7) % 55;
    const gender = i % 2 === 0 ? 'Female' : 'Male';

    await prisma.patient.upsert({
      where: { id: patientId },
      update: { name, age, gender, ward, bedId },
      create: {
        id: patientId,
        name,
        age,
        gender,
        ward,
        bedId,
      },
    });

    await prisma.device.upsert({
      where: { id: deviceId },
      update: { ward, bedId, patientId, status: 'offline' },
      create: {
        id: deviceId,
        ward,
        bedId,
        patientId,
        status: 'offline',
      },
    });
  }

  console.log('Seeding default alert thresholds...');
  const defaultThresholds = [
    {
      measurement: 'heart_rate',
      minWarning: 55,
      maxWarning: 100,
      minCritical: 45,
      maxCritical: 130,
      unit: 'bpm',
    },
    {
      measurement: 'spo2',
      minWarning: 94,
      maxWarning: null,
      minCritical: 90,
      maxCritical: null,
      unit: '%',
    },
    {
      measurement: 'temperature',
      minWarning: 36.0,
      maxWarning: 37.8,
      minCritical: 35.0,
      maxCritical: 39.0,
      unit: '°C',
    },
    {
      measurement: 'respiratory_rate',
      minWarning: 12,
      maxWarning: 24,
      minCritical: 8,
      maxCritical: 30,
      unit: 'brpm',
    },
  ];

  for (const t of defaultThresholds) {
    await prisma.alertThreshold.upsert({
      where: { measurement: t.measurement },
      update: t,
      create: t,
    });
  }

  console.log('Seeding default system users...');
  // Password hashing helper (crypto scrypt)
  const crypto = await import('node:crypto');
  const hashPass = (pw: string) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  };

  const defaultUsers = [
    {
      email: 'admin@wicare.local',
      password: hashPass('AdminPass123!'),
      name: 'Dr. Alice Admin',
      role: 'admin',
    },
    {
      email: 'clinician@wicare.local',
      password: hashPass('ClinicianPass123!'),
      name: 'Nurse Bob Clinician',
      role: 'clinician',
    },
    {
      email: 'viewer@wicare.local',
      password: hashPass('ViewerPass123!'),
      name: 'Student Charlie Viewer',
      role: 'viewer',
    },
  ];

  for (const u of defaultUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: u,
    });
  }

  console.log('Seeding completed successfully!');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
