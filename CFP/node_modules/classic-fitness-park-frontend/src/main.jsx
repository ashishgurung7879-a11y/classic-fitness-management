import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ScrollReveal from './components/ScrollReveal';
import ScrollToTop from './components/ScrollToTop';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import '../styles.css';

function getRouterBase() {
  const path = window.location.pathname.replace(/\\/g, '/');
  if (!path.endsWith('.html')) {
    return '';
  }

  const lastSlash = path.lastIndexOf('/');
  if (lastSlash <= 0) {
    return '';
  }

  return path.slice(0, lastSlash);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={getRouterBase()}>
      <ScrollReveal />
      <ScrollToTop />
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
