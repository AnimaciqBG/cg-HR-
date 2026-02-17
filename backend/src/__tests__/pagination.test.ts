import { parsePagination, buildPaginatedResult } from '../common/utils/pagination';

describe('Pagination Utils', () => {
  describe('parsePagination', () => {
    it('should return defaults when no params', () => {
      const result = parsePagination({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.sortBy).toBe('createdAt');
      expect(result.sortOrder).toBe('desc');
    });

    it('should parse valid params', () => {
      const result = parsePagination({ page: '3', limit: '50', sortBy: 'name', sortOrder: 'asc' });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(50);
      expect(result.sortBy).toBe('name');
      expect(result.sortOrder).toBe('asc');
    });

    it('should enforce min page of 1', () => {
      const result = parsePagination({ page: '-5' });
      expect(result.page).toBe(1);
    });

    it('should enforce max limit of 100', () => {
      const result = parsePagination({ limit: '999' });
      expect(result.limit).toBe(100);
    });
  });

  describe('buildPaginatedResult', () => {
    it('should build correct meta', () => {
      const result = buildPaginatedResult(['a', 'b', 'c'], 10, { page: 1, limit: 3, sortBy: 'id', sortOrder: 'asc' });
      expect(result.data).toEqual(['a', 'b', 'c']);
      expect(result.meta.total).toBe(10);
      expect(result.meta.totalPages).toBe(4);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.hasPrev).toBe(false);
    });

    it('should indicate no next on last page', () => {
      const result = buildPaginatedResult(['x'], 5, { page: 5, limit: 1, sortBy: 'id', sortOrder: 'asc' });
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(true);
    });
  });
});
