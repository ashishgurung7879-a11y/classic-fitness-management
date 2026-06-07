import { useEffect } from 'react';

const DEFAULT_TITLE = 'Classic Fitness Park | Kakarvitta, Jhapa';
const DEFAULT_DESCRIPTION =
  'Classic Fitness Park in Kakarvitta, Jhapa offers memberships, classes, trainers, shop products, and member services in one website.';
const DEFAULT_ROBOTS = 'index,follow';
const DEFAULT_IMAGE = '/logo.jpg';
const DEFAULT_OG_TYPE = 'website';

function ensureMetaTag(key, attribute = 'name') {
  let tag = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  return tag;
}

function ensureCanonicalLink() {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  return link;
}

function resolveAbsoluteUrl(value) {
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return window.location.href;
  }
}

export default function SiteMeta({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  robots = DEFAULT_ROBOTS,
  image = DEFAULT_IMAGE,
  ogType = DEFAULT_OG_TYPE,
}) {
  useEffect(() => {
    const previousTitle = document.title;
    const absoluteUrl = window.location.href;
    const absoluteImage = resolveAbsoluteUrl(image);
    const canonicalLink = ensureCanonicalLink();
    const previousCanonical = canonicalLink.getAttribute('href') || '';
    const metaUpdates = [
      ['description', description, 'name'],
      ['robots', robots, 'name'],
      ['og:title', title, 'property'],
      ['og:description', description, 'property'],
      ['og:type', ogType, 'property'],
      ['og:url', absoluteUrl, 'property'],
      ['og:image', absoluteImage, 'property'],
      ['twitter:card', 'summary_large_image', 'name'],
      ['twitter:title', title, 'name'],
      ['twitter:description', description, 'name'],
      ['twitter:image', absoluteImage, 'name'],
    ];
    const previousMetaValues = metaUpdates.map(([key, _value, attribute]) => {
      const tag = ensureMetaTag(key, attribute);
      return {
        key,
        tag,
        previousContent: tag.getAttribute('content') || '',
      };
    });

    document.title = title;
    canonicalLink.setAttribute('href', absoluteUrl);
    metaUpdates.forEach(([key, value, attribute]) => {
      ensureMetaTag(key, attribute).setAttribute('content', value);
    });

    return () => {
      document.title = previousTitle || DEFAULT_TITLE;
      canonicalLink.setAttribute('href', previousCanonical || window.location.href);
      previousMetaValues.forEach(({ key, tag, previousContent }) => {
        const fallbackValue =
          key === 'description' ? DEFAULT_DESCRIPTION
            : key === 'robots' ? DEFAULT_ROBOTS
              : key === 'og:title' || key === 'twitter:title' ? DEFAULT_TITLE
                : key === 'og:description' || key === 'twitter:description' ? DEFAULT_DESCRIPTION
                  : key === 'og:type' ? DEFAULT_OG_TYPE
                    : key === 'og:url' ? window.location.href
                      : key === 'og:image' || key === 'twitter:image' ? resolveAbsoluteUrl(DEFAULT_IMAGE)
                        : key === 'twitter:card' ? 'summary_large_image'
                          : '';

        tag.setAttribute('content', previousContent || fallbackValue);
      });
    };
  }, [description, image, ogType, robots, title]);

  return null;
}
