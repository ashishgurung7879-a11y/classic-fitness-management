const authRouter = require('./auth');
const membersRouter = require('./members');
const bookingsRouter = require('./bookings');
const paymentsRouter = require('./payments');
const trainersRouter = require('./trainers');
const productsRouter = require('./products');
const galleryRouter = require('./gallery');
const classesRouter = require('./classes');
const manualPaymentsRouter = require('./manualPayments');
const contactRouter = require('./contact');
const noticesRouter = require('./notices');
const notificationsRouter = require('./notifications');
const dashboardRouter = require('./dashboard');
const paymentSettingsRouter = require('./paymentSettings');
const measurementsRouter = require('./measurements');
const membershipPlansRouter = require('./membershipPlans');
const { attendanceRouter } = require('./attendance');

const apiRoutes = [
  { path: '/api/auth', router: authRouter },
  { path: '/api/members', router: membersRouter },
  { path: '/api/bookings', router: bookingsRouter },
  { path: '/api/attendance', router: attendanceRouter },
  { path: '/api/payments', router: paymentsRouter },
  { path: '/api/notifications', router: notificationsRouter },
  { path: '/api/trainers', router: trainersRouter },
  { path: '/api/products', router: productsRouter },
  { path: '/api/gallery', router: galleryRouter },
  { path: '/api/classes', router: classesRouter },
  { path: '/api/manual-payments', router: manualPaymentsRouter },
  { path: '/api/dashboard', router: dashboardRouter },
  { path: '/api/contact', router: contactRouter },
  { path: '/api/notices', router: noticesRouter },
  { path: '/api/payment-settings', router: paymentSettingsRouter },
  { path: '/api/membership-plans', router: membershipPlansRouter },
  { path: '/api/measurements', router: measurementsRouter },
];

function wrapAsync(handler) {
  if (handler.length > 3) return handler;

  return function asyncRouteHandler(req, res, next) {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

function wrapRouter(router) {
  if (!router?.stack) return router;

  router.stack.forEach((layer) => {
    if (!layer.route?.stack) return;

    layer.route.stack.forEach((routeLayer) => {
      routeLayer.handle = wrapAsync(routeLayer.handle);
    });
  });

  return router;
}

function registerApiRoutes(app) {
  apiRoutes.forEach(({ path, router }) => {
    app.use(path, wrapRouter(router));
  });
}

module.exports = registerApiRoutes;
