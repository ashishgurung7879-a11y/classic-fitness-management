import React from 'react';
import FloatingActions from './FloatingActions';
import Footer from './Footer';
import Navbar from './Navbar';
import SiteMeta from './SiteMeta';

export default function PublicPageShell({ children, pageClass = '', title, description }) {
  return (
    <>
      <SiteMeta title={title} description={description} />
      <Navbar />
      <main className={`page-shell ${pageClass}`.trim()}>
        {children}
      </main>
      <Footer />
      <FloatingActions />
    </>
  );
}
