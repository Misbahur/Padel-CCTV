import React, { useState, useEffect } from 'react';
import LoginView from './components/LoginView.jsx';
import DashboardView from './components/DashboardView.jsx';
import CourtView from './components/CourtView.jsx';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (to) => {
    window.history.pushState({}, '', to);
    setCurrentPath(to);
  };

  // Route parser
  if (currentPath === '/dashboard') {
    return <DashboardView navigate={navigate} />;
  }

  const courtMatch = currentPath.match(/\/court\/(\d+)/);
  if (courtMatch) {
    const courtId = parseInt(courtMatch[1], 10);
    return <CourtView courtId={courtId} navigate={navigate} />;
  }

  // Default to Login
  return <LoginView navigate={navigate} />;
}
