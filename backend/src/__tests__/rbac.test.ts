import { hasPermission, hasMinRole, ROLE_PERMISSIONS, ROLE_HIERARCHY } from '../common/guards/rbac.guard';
import { UserRole } from '@prisma/client';

describe('RBAC Guard', () => {
  describe('hasPermission', () => {
    it('EMPLOYEE should have employees:read', () => {
      expect(hasPermission('EMPLOYEE' as UserRole, 'employees:read')).toBe(true);
    });

    it('EMPLOYEE should NOT have employees:write_all', () => {
      expect(hasPermission('EMPLOYEE' as UserRole, 'employees:write_all')).toBe(false);
    });

    it('EMPLOYEE should NOT have admin:settings', () => {
      expect(hasPermission('EMPLOYEE' as UserRole, 'admin:settings')).toBe(false);
    });

    it('TEAM_LEAD should have leaves:approve_lead', () => {
      expect(hasPermission('TEAM_LEAD' as UserRole, 'leaves:approve_lead')).toBe(true);
    });

    it('TEAM_LEAD should NOT have leaves:approve_hr', () => {
      expect(hasPermission('TEAM_LEAD' as UserRole, 'leaves:approve_hr')).toBe(false);
    });

    it('HR should have employees:write_all', () => {
      expect(hasPermission('HR' as UserRole, 'employees:write_all')).toBe(true);
    });

    it('HR should NOT have salary:read', () => {
      expect(hasPermission('HR' as UserRole, 'salary:read')).toBe(false);
    });

    it('PAYROLL_ADMIN should have salary:read', () => {
      expect(hasPermission('PAYROLL_ADMIN' as UserRole, 'salary:read')).toBe(true);
    });

    it('ADMIN should have admin:settings', () => {
      expect(hasPermission('ADMIN' as UserRole, 'admin:settings')).toBe(true);
    });

    it('ADMIN should NOT have admin:backup', () => {
      expect(hasPermission('ADMIN' as UserRole, 'admin:backup')).toBe(false);
    });

    it('SUPER_ADMIN should have ALL permissions', () => {
      const allPermissions = ROLE_PERMISSIONS['SUPER_ADMIN'];
      expect(allPermissions).toContain('admin:backup');
      expect(allPermissions).toContain('admin:license');
      expect(allPermissions).toContain('salary:read');
      expect(allPermissions).toContain('salary:write');
      expect(allPermissions).toContain('employees:delete');
    });
  });

  describe('hasMinRole', () => {
    it('SUPER_ADMIN has min role of EMPLOYEE', () => {
      expect(hasMinRole('SUPER_ADMIN' as UserRole, 'EMPLOYEE' as UserRole)).toBe(true);
    });

    it('EMPLOYEE does NOT have min role of ADMIN', () => {
      expect(hasMinRole('EMPLOYEE' as UserRole, 'ADMIN' as UserRole)).toBe(false);
    });

    it('ADMIN has min role of HR', () => {
      expect(hasMinRole('ADMIN' as UserRole, 'HR' as UserRole)).toBe(true);
    });

    it('HR does NOT have min role of ADMIN', () => {
      expect(hasMinRole('HR' as UserRole, 'ADMIN' as UserRole)).toBe(false);
    });
  });

  describe('Role Hierarchy', () => {
    it('should have correct hierarchy order', () => {
      expect(ROLE_HIERARCHY['EMPLOYEE']).toBeLessThan(ROLE_HIERARCHY['TEAM_LEAD']);
      expect(ROLE_HIERARCHY['TEAM_LEAD']).toBeLessThan(ROLE_HIERARCHY['HR']);
      expect(ROLE_HIERARCHY['HR']).toBeLessThan(ROLE_HIERARCHY['ADMIN']);
      expect(ROLE_HIERARCHY['ADMIN']).toBeLessThan(ROLE_HIERARCHY['SUPER_ADMIN']);
    });
  });
});
