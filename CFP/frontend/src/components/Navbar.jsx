import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PUBLIC_NAV_LINKS } from '../constants/publicNavigation';

const PUBLIC_SITE_PATHS = new Set([
  '/',
  '/about',
  '/classes',
  '/membership',
  '/trainers',
  '/shop',
  '/contact',
]);

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isMarketingPage = PUBLIC_SITE_PATHS.has(location.pathname);
  const showSolidNav = !isMarketingPage || location.pathname !== '/' || scrolled;
  const dashboardPath = user?.role === 'admin' ? '/admin' : user?.role === 'trainer' ? '/trainer' : '/member';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  function goTo(path) {
    closeMenu();
    navigate(path);
  }

  function handleLogout() {
    logout();
    showToast('Logged out');
    navigate('/');
  }

  return (
    <>
      <nav className={`navbar${showSolidNav ? ' scrolled' : ''}`} id="navbar">
        <div className="nav-container">
          <Link to="/" className="nav-logo" onClick={closeMenu}>
            <img src="/logo.jpg" alt="CFP" className="nav-logo-img" />
            <div><span className="logo-main">CLASSIC FITNESS PARK</span></div>
          </Link>

          <ul className="nav-links" id="navLinks">
            {PUBLIC_NAV_LINKS.map(({ to, label }) => (
              <li key={to}>
                <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="nav-actions">
            {user ? (
              <>
                <span style={{ color: 'var(--gold)', fontSize: '0.82rem', fontWeight: 700 }}>
                  {user.firstName}
                </span>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                  onClick={() => goTo(dashboardPath)}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  className="btn-red"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', border: 'none', cursor: 'pointer' }}
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                  onClick={() => goTo('/membership')}
                >
                  Membership
                </button>
                <button
                  type="button"
                  className="btn-red"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', border: 'none', cursor: 'pointer' }}
                  onClick={() => goTo('/contact')}
                >
                  Join Now
                </button>
              </>
            )}
          </div>

          <button
            className={`hamburger${menuOpen ? ' open' : ''}`}
            id="hamburger"
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      <div className={`mobile-menu${menuOpen ? ' open' : ''}`} onClick={closeMenu}>
        {PUBLIC_NAV_LINKS.map(({ to, label }) => (
          <NavLink key={to} to={to} className="m-link" onClick={closeMenu}>
            {label}
          </NavLink>
        ))}
        <div className="m-actions" onClick={(event) => event.stopPropagation()}>
          {user ? (
            <>
              <button type="button" className="btn-outline" onClick={() => goTo(dashboardPath)}>Dashboard</button>
              <button type="button" className="btn-red" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <button type="button" className="btn-outline" onClick={() => goTo('/membership')}>Join</button>
              <button type="button" className="btn-red" onClick={() => goTo('/member')}>Member</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
