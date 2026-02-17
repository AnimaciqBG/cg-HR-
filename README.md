# Enterprise HRIS Platform

A full-featured Human Resource Information System (HRIS) with enterprise-grade security, RBAC/ABAC access control, audit logging, and configurable user limits.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                   │
│  Vite + TypeScript + Tailwind CSS + TanStack Query   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Dashboard │ │Employees │ │ Schedule │ ...         │
│  └──────────┘ └──────────┘ └──────────┘            │
│                    ↕ API calls                       │
├─────────────────────────────────────────────────────┤
│                  Backend (Express)                    │
│  TypeScript + Prisma ORM + JWT Auth + TOTP 2FA      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│  │ Auth │ │ RBAC │ │Audit │ │ Rate │               │
│  │Guard │ │Guard │ │ Log  │ │Limit │               │
│  └──────┘ └──────┘ └──────┘ └──────┘              │
│  ┌─────────────────────────────────┐               │
│  │         API Modules             │               │
│  │ users│employees│shifts│time│    │               │
│  │ breaks│leaves│documents│perf│   │               │
│  │ goals│training│reports│admin│   │               │
│  └─────────────────────────────────┘               │
│                    ↕ Prisma                          │
├─────────────────────────────────────────────────────┤
│              PostgreSQL Database                     │
│  30+ tables with soft delete, audit trails          │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, Zustand, React Router |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL |
| Auth | JWT (access + refresh tokens), TOTP 2FA (Google Authenticator) |
| Security | Helmet, CORS, Rate Limiting, bcrypt, Audit Logging |

## Features

### Core Modules
- **Employee Directory** - Search, filter, org chart, profiles
- **Scheduling / Shifts** - Calendar view, shift templates, open shifts, shift swaps
- **Time & Attendance** - Clock in/out, geo-fencing ready, manual corrections
- **Break Tracking** - Categories (lunch/smoking/personal), time limits, alerts
- **Leave Management** - Multi-step approval workflow, balance tracking, absence calendar
- **Documents** - Upload, categorize, version control, expiry alerts, e-sign ready
- **Performance Reviews** - Quarterly/annual reviews, competency scoring, 360 feedback ready
- **Goals & OKRs** - Personal/team/company goals, check-ins, progress tracking
- **Training / LMS** - Course catalog, enrollment, mandatory training, certificates
- **Announcements** - Targeted messages, read receipts, pinning
- **Analytics & Reports** - Headcount, absence, overtime, break analysis, export

### Security & Access Control
- **RBAC** - 6 roles: Employee, Team Lead, HR, Payroll Admin, Admin, Super Admin
- **ABAC** - Department, location, manager-based access filtering
- **License Management** - Configurable limits (maxUsers, maxAdmins, maxSuperAdmins)
- **Audit Logging** - Every action logged with actor, action, before/after, IP, timestamp
- **2FA** - TOTP with recovery codes
- **Rate Limiting** - Global + stricter on auth endpoints
- **Password Policy** - 12+ chars, complexity, common password blacklist

### User Roles & Permissions

| Permission | Employee | Team Lead | HR | Payroll | Admin | Super Admin |
|-----------|----------|-----------|-----|---------|-------|-------------|
| View own profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View team | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all employees | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage employees | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| View salary | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Approve leaves (L1) | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Approve leaves (HR) | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Manage documents | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Performance reviews | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| View reports | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export data | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| System settings | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Audit logs | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| License management | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Backup | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## Database Schema

30+ tables covering:
- `users`, `sessions` - Authentication & sessions
- `employees`, `departments`, `locations` - Organization structure
- `shifts`, `shift_templates`, `shift_swaps` - Scheduling
- `time_entries` - Clock in/out
- `breaks` - Break tracking
- `leave_requests`, `leave_balances`, `leave_policies` - Leave management
- `approvals` - Universal approval engine
- `documents`, `document_templates` - Document management
- `performance_reviews`, `competencies`, `competency_scores` - Performance
- `goals`, `goal_check_ins` - Goals & OKRs
- `trainings`, `employee_trainings` - Training / LMS
- `onboarding_templates`, `onboarding_tasks` - Onboarding/Offboarding
- `compensation_history` - Salary history
- `announcements`, `announcement_reads` - Internal comms
- `notifications` - Notification engine
- `audit_logs` - Complete audit trail
- `system_settings`, `break_policies`, `overtime_policies` - Configuration

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/verify-2fa` | Verify TOTP code |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/logout-all` | Terminate all sessions |
| POST | `/api/auth/change-password` | Change password |
| POST | `/api/auth/2fa/setup` | Setup 2FA |
| POST | `/api/auth/2fa/confirm` | Confirm 2FA |
| GET | `/api/auth/me` | Current user info |

### Employees
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employees` | List (with ABAC filtering) |
| GET | `/api/employees/org-chart` | Organization chart |
| GET | `/api/employees/:id` | Profile detail |
| PUT | `/api/employees/:id` | Update profile |

### Users (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users |
| POST | `/api/users` | Create/invite user |
| PUT | `/api/users/:id` | Update user |
| POST | `/api/users/:id/deactivate` | Deactivate |
| POST | `/api/users/:id/activate` | Reactivate |

### Shifts, Time, Breaks, Leaves, Documents, Performance, Goals, Training, Announcements, Reports, Admin
Full CRUD endpoints with role-based access control on every endpoint.

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Backend Setup
```bash
cd backend
cp .env.example .env   # Edit DATABASE_URL and secrets
npm install
npx prisma migrate dev
npx prisma db seed     # Creates demo data
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Demo Accounts
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@hrplatform.bg | Admin123!@#$ |
| HR Manager | hr@hrplatform.bg | Admin123!@#$ |
| Team Lead | lead@hrplatform.bg | Admin123!@#$ |
| Employee | ivan@hrplatform.bg | Admin123!@#$ |

## Security Checklist

- [x] No public registration - invite only
- [x] RBAC with 6 role levels
- [x] ABAC - department/location/manager filtering
- [x] Configurable user/admin limits
- [x] Password policy (12+ chars, complexity, blacklist)
- [x] Rate limiting (global + auth-specific)
- [x] Brute-force protection (lockout after 5 attempts)
- [x] JWT with short-lived access tokens + refresh tokens
- [x] 2FA via TOTP with recovery codes
- [x] Audit logging on all sensitive operations
- [x] Soft delete (no data permanently lost)
- [x] Salary data masking (only Payroll/Super Admin)
- [x] CORS protection
- [x] Helmet security headers
- [x] Input validation via Zod schemas

## License

Private / Internal use only.
