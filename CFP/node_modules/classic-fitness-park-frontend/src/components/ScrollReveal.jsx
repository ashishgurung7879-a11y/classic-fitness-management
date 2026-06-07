import { useEffect } from 'react';

const REVEAL_SELECTOR = [
  '.stat',
  '.about-grid',
  '.class-card',
  '.plan-card',
  '.trainer-card',
  '.product-card',
  '.product-card-3d',
  '.qr-card',
  '.testimonial-card',
].join(',');

export default function ScrollReveal() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const { body } = document;
    if (!body) {
      return undefined;
    }

    const revealImmediately = (element) => {
      element.classList.add('visible');
    };

    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll(REVEAL_SELECTOR).forEach(revealImmediately);
      return undefined;
    }

    const observed = new WeakSet();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        revealImmediately(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15 });

    const scan = () => {
      document.querySelectorAll(REVEAL_SELECTOR).forEach((element) => {
        if (observed.has(element)) return;
        observed.add(element);
        observer.observe(element);
      });
    };

    scan();

    const mutationObserver = new MutationObserver(() => {
      scan();
    });

    mutationObserver.observe(body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
    };
  }, []);

  return null;
}
