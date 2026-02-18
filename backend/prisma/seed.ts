import { PrismaClient, UserRole, UserStatus, ContractType, EmploymentStatus, ShiftType, LeaveType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // System Settings
  const settingsData = [
    { key: 'maxUsers', value: '40', type: 'number', group: 'license', description: 'Maximum active users allowed' },
    { key: 'maxAdmins', value: '3', type: 'number', group: 'license', description: 'Maximum admin users allowed' },
    { key: 'maxSuperAdmins', value: '1', type: 'number', group: 'license', description: 'Maximum super admin users' },
    { key: 'passwordMinLength', value: '12', type: 'number', group: 'security', description: 'Minimum password length' },
    { key: 'sessionTimeout', value: '15', type: 'number', group: 'security', description: 'Session timeout in minutes' },
    { key: 'defaultLeaveDays', value: '20', type: 'number', group: 'leave', description: 'Default annual leave days' },
    { key: 'maxBreaksPerDay', value: '5', type: 'number', group: 'break', description: 'Max breaks per day' },
    { key: 'maxBreakMinutes', value: '30', type: 'number', group: 'break', description: 'Max minutes per break' },
    { key: 'overtimeMultiplier', value: '1.5', type: 'number', group: 'overtime', description: 'Overtime pay multiplier' },
    { key: 'companyName', value: 'Cinegrand Cinema', type: 'string', group: 'general', description: 'Company name' },
    { key: 'companyTimezone', value: 'Europe/Sofia', type: 'string', group: 'general', description: 'Company timezone' },
  ];

  for (const s of settingsData) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log('System settings created');

  // Departments
  const departments = await Promise.all([
    prisma.department.upsert({ where: { code: 'OPS' }, update: {}, create: { name: 'Cinema Operations', code: 'OPS', description: 'Cinema operations department' } }),
  ]);
  console.log('Departments created');

  // Locations
  const locations = await Promise.all([
    prisma.location.upsert({ where: { code: 'CG1' }, update: {}, create: { name: 'Cinegrand Cinema', code: 'CG1', address: 'бул. Черни връх 100, Paradise Center', city: 'Sofia', country: 'Bulgaria', timezone: 'Europe/Sofia' } }),
  ]);
  console.log('Locations created');

  // Password hash (for demo: "Admin123!@#$")
  const passwordHash = await bcrypt.hash('Admin123!@#$', 12);

  // Super Admin
  await prisma.user.upsert({
    where: { email: 'admin@cinegrand.bg' },
    update: {},
    create: {
      email: 'admin@cinegrand.bg',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      employee: {
        create: {
          employeeNumber: 'EMP00001',
          firstName: 'Denis',
          lastName: 'Adminov',
          jobTitle: 'Cinema Manager',
          departmentId: departments[0].id,
          locationId: locations[0].id,
          hireDate: new Date('2024-01-01'),
          contractType: ContractType.FULL_TIME,
          employmentStatus: EmploymentStatus.ACTIVE,
        },
      },
    },
  });
  console.log('Super Admin created: admin@cinegrand.bg / Admin123!@#$');

  // HR Manager
  await prisma.user.upsert({
    where: { email: 'hr@cinegrand.bg' },
    update: {},
    create: {
      email: 'hr@cinegrand.bg',
      passwordHash,
      role: UserRole.HR,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      employee: {
        create: {
          employeeNumber: 'EMP00002',
          firstName: 'Maria',
          lastName: 'Hristova',
          jobTitle: 'Senior Assistant Seller',
          departmentId: departments[0].id,
          locationId: locations[0].id,
          hireDate: new Date('2024-02-01'),
          contractType: ContractType.FULL_TIME,
          employmentStatus: EmploymentStatus.ACTIVE,
        },
      },
    },
  });
  console.log('HR Manager created: hr@cinegrand.bg / Admin123!@#$');

  // Team Lead
  await prisma.user.upsert({
    where: { email: 'lead@cinegrand.bg' },
    update: {},
    create: {
      email: 'lead@cinegrand.bg',
      passwordHash,
      role: UserRole.TEAM_LEAD,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      employee: {
        create: {
          employeeNumber: 'EMP00003',
          firstName: 'Georgi',
          lastName: 'Petrov',
          jobTitle: 'Team Leader',
          departmentId: departments[0].id,
          locationId: locations[0].id,
          hireDate: new Date('2024-03-01'),
          contractType: ContractType.FULL_TIME,
          employmentStatus: EmploymentStatus.ACTIVE,
        },
      },
    },
  });
  console.log('Team Lead created: lead@cinegrand.bg / Admin123!@#$');

  // Get employee IDs for manager relations
  const leadEmployee = await prisma.employee.findFirst({ where: { user: { email: 'lead@cinegrand.bg' } } });

  // Regular Employees
  const employeeData = [
    { email: 'ivan@cinegrand.bg', first: 'Ivan', last: 'Dimitrov', title: 'Assistant Seller', dept: 0, loc: 0 },
    { email: 'elena@cinegrand.bg', first: 'Elena', last: 'Ivanova', title: 'Senior Assistant Seller', dept: 0, loc: 0 },
    { email: 'peter@cinegrand.bg', first: 'Peter', last: 'Stoyanov', title: 'Assistant Seller', dept: 0, loc: 0 },
    { email: 'anna@cinegrand.bg', first: 'Anna', last: 'Georgieva', title: 'Team Leader', dept: 0, loc: 0 },
    { email: 'dimitar@cinegrand.bg', first: 'Dimitar', last: 'Nikolov', title: 'Assistant Seller', dept: 0, loc: 0 },
    { email: 'sofia@cinegrand.bg', first: 'Sofia', last: 'Todorova', title: 'Senior Assistant Seller', dept: 0, loc: 0 },
    { email: 'alex@cinegrand.bg', first: 'Alexander', last: 'Vasilev', title: 'Assistant Seller', dept: 0, loc: 0 },
  ];

  for (let i = 0; i < employeeData.length; i++) {
    const e = employeeData[i];
    await prisma.user.upsert({
      where: { email: e.email },
      update: {},
      create: {
        email: e.email,
        passwordHash,
        role: UserRole.EMPLOYEE,
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        employee: {
          create: {
            employeeNumber: `EMP${String(i + 4).padStart(5, '0')}`,
            firstName: e.first,
            lastName: e.last,
            jobTitle: e.title,
            departmentId: departments[e.dept].id,
            locationId: locations[e.loc].id,
            hireDate: new Date(`2024-0${Math.min(i + 3, 9)}-15`),
            contractType: i === 6 ? ContractType.INTERN : ContractType.FULL_TIME,
            employmentStatus: EmploymentStatus.ACTIVE,
            managerId: [1, 4].includes(i) ? leadEmployee?.id : undefined,
          },
        },
      },
    });
  }
  console.log('Employees created');

  // Shift Templates (idempotent - check before creating)
  const shiftCount = await prisma.shiftTemplate.count();
  if (shiftCount === 0) {
    await Promise.all([
      prisma.shiftTemplate.create({ data: { name: 'Morning Shift', shiftType: ShiftType.MORNING, startTime: '09:00', endTime: '17:00', breakMinutes: 30, color: '#22C55E' } }),
      prisma.shiftTemplate.create({ data: { name: 'Afternoon Shift', shiftType: ShiftType.MORNING, startTime: '14:00', endTime: '22:00', breakMinutes: 30, color: '#3B82F6' } }),
      prisma.shiftTemplate.create({ data: { name: 'Evening Shift', shiftType: ShiftType.EVENING, startTime: '16:30', endTime: '01:00', breakMinutes: 30, color: '#F59E0B' } }),
      prisma.shiftTemplate.create({ data: { name: 'Night Shift', shiftType: ShiftType.NIGHT, startTime: '22:00', endTime: '06:00', breakMinutes: 30, color: '#6366F1' } }),
    ]);
    console.log('Shift templates created');
  }

  // Leave Policies (idempotent)
  const policyCount = await prisma.leavePolicy.count();
  if (policyCount === 0) {
    await Promise.all([
      prisma.leavePolicy.create({ data: { name: 'Annual Leave (Full-time)', leaveType: LeaveType.PAID, contractType: ContractType.FULL_TIME, daysPerYear: 20, maxCarryOver: 5 } }),
      prisma.leavePolicy.create({ data: { name: 'Annual Leave (Part-time)', leaveType: LeaveType.PAID, contractType: ContractType.PART_TIME, daysPerYear: 10, maxCarryOver: 2 } }),
      prisma.leavePolicy.create({ data: { name: 'Sick Leave', leaveType: LeaveType.SICK, daysPerYear: 30 } }),
      prisma.leavePolicy.create({ data: { name: 'Unpaid Leave', leaveType: LeaveType.UNPAID, daysPerYear: 30, requiresApproval: true } }),
      prisma.leavePolicy.create({ data: { name: 'Maternity Leave', leaveType: LeaveType.MATERNITY, daysPerYear: 410, minServiceMonths: 6 } }),
    ]);
    console.log('Leave policies created');
  }

  // Break Policy (idempotent)
  const breakPolicyCount = await prisma.breakPolicy.count();
  if (breakPolicyCount === 0) {
    await prisma.breakPolicy.create({
      data: { name: 'Standard Break Policy', maxBreaksPerDay: 5, maxMinutesPerBreak: 30, maxTotalMinutes: 45, alertOnExceed: true },
    });
    console.log('Break policy created');
  }

  // Overtime Policy (idempotent)
  const otPolicyCount = await prisma.overtimePolicy.count();
  if (otPolicyCount === 0) {
    await prisma.overtimePolicy.create({
      data: { name: 'Standard Overtime Policy', maxDailyHours: 10, maxWeeklyHours: 48, overtimeMultiplier: 1.5, weekendMultiplier: 2.0, holidayMultiplier: 2.5 },
    });
    console.log('Overtime policy created');
  }

  // Competencies (idempotent - upsert by name)
  const competencies = [
    { name: 'Communication', description: 'Verbal and written communication skills', category: 'Soft Skills' },
    { name: 'Teamwork', description: 'Ability to work effectively in a team', category: 'Soft Skills' },
    { name: 'Technical Skills', description: 'Domain-specific technical proficiency', category: 'Hard Skills' },
    { name: 'Problem Solving', description: 'Analytical and problem-solving abilities', category: 'Hard Skills' },
    { name: 'Leadership', description: 'Leadership and initiative', category: 'Management' },
    { name: 'Time Management', description: 'Efficiency and deadline management', category: 'Soft Skills' },
  ];
  for (const c of competencies) {
    await prisma.competency.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
  }
  console.log('Competencies created');

  // Leave balances for current year
  const allEmployees = await prisma.employee.findMany();
  const currentYear = new Date().getFullYear();
  for (const emp of allEmployees) {
    await prisma.leaveBalance.upsert({
      where: { employeeId_leaveType_year: { employeeId: emp.id, leaveType: LeaveType.PAID, year: currentYear } },
      update: {},
      create: { employeeId: emp.id, leaveType: LeaveType.PAID, year: currentYear, totalDays: 20 },
    });
    await prisma.leaveBalance.upsert({
      where: { employeeId_leaveType_year: { employeeId: emp.id, leaveType: LeaveType.SICK, year: currentYear } },
      update: {},
      create: { employeeId: emp.id, leaveType: LeaveType.SICK, year: currentYear, totalDays: 30 },
    });
  }
  console.log('Leave balances created');

  // Sample Announcement (idempotent)
  const announcementCount = await prisma.announcement.count();
  if (announcementCount === 0) {
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@cinegrand.bg' } });
    if (adminUser) {
      await prisma.announcement.create({
        data: {
          title: 'Welcome to the Cinegrand HR Platform!',
          content: 'We are excited to launch our new HR management system for Cinegrand Cinema. Please explore the features and update your profiles.',
          priority: 'high',
          isPinned: true,
          publishedAt: new Date(),
          createdBy: adminUser.id,
        },
      });
    }
    console.log('Sample announcement created');
  }

  console.log('\n✅ Database seeded successfully!');
  console.log('\nDemo accounts:');
  console.log('  Super Admin: admin@cinegrand.bg / Admin123!@#$');
  console.log('  HR Manager:  hr@cinegrand.bg / Admin123!@#$');
  console.log('  Team Lead:   lead@cinegrand.bg / Admin123!@#$');
  console.log('  Employee:    ivan@cinegrand.bg / Admin123!@#$');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
