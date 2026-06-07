(function () {
  return;

  const h = window.React.createElement;
  const useEffect = window.React.useEffect;
  const useState = window.React.useState;

  const hostname = window.location.hostname;
  const isLocalDev =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '' ||
    window.location.protocol === 'file:';
  const API_URL = window.CFPAppConfig?.getApiBaseUrl?.()
    || (isLocalDev ? 'http://localhost:5000/api' : `${window.location.origin}/api`);

  function formatDay(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function StatCard(props) {
    return h(
      'div',
      { className: 'react-status-pill' },
      h('span', { className: 'react-status-pill-label' }, props.label),
      h('strong', { className: 'react-status-pill-value' }, props.value)
    );
  }

  function GymPulse() {
    const [now, setNow] = useState(new Date());
    const [stats, setStats] = useState({ members: '--', trainers: '--' });

    useEffect(function () {
      const timer = window.setInterval(function () {
        setNow(new Date());
      }, 60000);

      return function () {
        window.clearInterval(timer);
      };
    }, []);

    useEffect(function () {
      let cancelled = false;

      fetch(API_URL + '/dashboard/public')
        .then(function (response) {
          return response.json();
        })
        .then(function (data) {
          if (cancelled || !data || !data.stats) {
            return;
          }

          setStats({
            members: String(data.stats.members ?? '--'),
            trainers: String(data.stats.trainers ?? '--')
          });
        })
        .catch(function () {
          // Keep graceful fallback values if the backend is unavailable.
        });

      return function () {
        cancelled = true;
      };
    }, []);

    const currentDay = formatDay(now);
    const isClosedDay = currentDay === 'Saturday';
    const badgeClass = isClosedDay
      ? 'react-status-badge is-closed'
      : 'react-status-badge is-open';
    const badgeText = isClosedDay ? 'Closed Today' : 'Open Today';
    const hoursText = isClosedDay ? 'Closed on Saturday' : '5AM - 9PM';
    const noteText = isClosedDay
      ? 'We reopen Sunday at 5:00 AM.'
      : 'Mid-day break runs from 11:00 AM to 2:00 PM.';

    return h(
      'div',
      { className: 'react-status-card' },
      h(
        'div',
        { className: 'react-status-copy' },
        h('span', { className: badgeClass }, badgeText),
        h('h2', { className: 'react-status-title' }, 'Gym Pulse'),
        h(
          'p',
          { className: 'react-status-text' },
          'This strip is rendered with React and pulls live public stats from the CFP backend.'
        ),
        h('p', { className: 'react-status-note' }, noteText)
      ),
      h(
        'div',
        { className: 'react-status-grid' },
        h(StatCard, { label: 'Date', value: formatDate(now) }),
        h(StatCard, { label: 'Day', value: currentDay }),
        h(StatCard, { label: 'Members', value: stats.members }),
        h(StatCard, { label: 'Trainers', value: stats.trainers }),
        h(StatCard, { label: 'Hours', value: hoursText }),
        h(StatCard, { label: 'Location', value: 'Kakarvitta' })
      )
    );
  }

  window.ReactDOM.createRoot(mountNode).render(h(GymPulse));
})();
