import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import EmployeeProfile from './pages/EmployeeProfile';
import Schedule from './pages/Schedule';
import TimeTracking from './pages/TimeTracking';
import Breaks from './pages/Breaks';
import Leaves from './pages/Leaves';
import Documents from './pages/Documents';
import Performance from './pages/Performance';
import Goals from './pages/Goals';
import Training from './pages/Training';
import Announcements from './pages/Announcements';
import Reports from './pages/Reports';
import Admin from './pages/Admin';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { fetchUser, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchUser();
    } else {
      useAuthStore.setState({ isLoading: false });
    }
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="employees/:id" element={<EmployeeProfile />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="time" element={<TimeTracking />} />
        <Route path="breaks" element={<Breaks />} />
        <Route path="leaves" element={<Leaves />} />
        <Route path="documents" element={<Documents />} />
        <Route path="performance" element={<Performance />} />
        <Route path="goals" element={<Goals />} />
        <Route path="training" element={<Training />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="reports" element={<Reports />} />
        <Route path="admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
