import * as React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import NotFound from './components/NotFound';
import MainPage from './pages/MainPage';
import PermissionsPage from './pages/PermissionsPage';
import AppsPage from './pages/AppsPage';

const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/main-view" replace />} />
    <Route path="/main-view/*" element={<MainPage />} />
    <Route path="/permissions/*" element={<PermissionsPage />} />
    <Route path="/data-hub/permissions/*" element={<PermissionsPage />} />
    <Route path="/apps/*" element={<AppsPage />} />
    <Route path="/data-hub/apps/*" element={<AppsPage />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default AppRoutes;
