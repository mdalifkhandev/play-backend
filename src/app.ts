import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import os from 'node:os';

import { env } from './config/env.config.js';
import { globalErrorHandler } from './common/middleware/error.middleware.js';
import { notFoundMiddleware } from './common/middleware/not-found.middleware.js';
import { globalRateLimiter } from './common/middleware/rate-limit.middleware.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { requestLogMiddleware } from './common/middleware/request-log.middleware.js';
import { applySecurityMiddleware, verifyTrustedOrigin } from './common/middleware/security.middleware.js';
import { authenticate } from './common/middleware/auth.middleware.js';
import { validateRequest } from './common/middleware/validation.middleware.js';
import { conversationController } from './modules/conversations/conversation.controller.js';
import { searchConversationUsersQuerySchema } from './modules/conversations/conversation.validation.js';
import { notificationController } from './modules/notifications/notification.controller.js';
import {
  deletePushTokenBodySchema,
  registerPushTokenBodySchema,
} from './modules/notifications/notification.validation.js';
import { AccountStatus } from './common/enums/account-status.enum.js';
import { UserModel } from './modules/users/user.model.js';
import { apiRouter } from './routes/index.js';

export const app: Express = express();

const requestSamples: number[] = [];

app.use((request, _response, next) => {
  if (!request.path.startsWith('/api/v1/system/telemetry')) {
    const now = Date.now();
    requestSamples.push(now);
    pruneRequestSamples(now);
  }

  next();
});

app.get('/', (_request, response) => {
  response.status(200).type('html').send(renderTelemetryPage());
});

app.get('/api/v1/system/telemetry', async (_request, response, next) => {
  try {
    response.status(200).json({
      success: true,
      message: 'System telemetry retrieved successfully.',
      data: await getSystemTelemetry(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/payouts/stripe-connect/return', (_request, response) => {
  sendStripeConnectRedirectPage(response, {
    title: 'Payout setup complete',
    message: 'Returning you to Play...',
    appUrl: 'play://screens/menu/balance?stripeConnect=return',
  });
});

app.get('/payouts/stripe-connect/refresh', (_request, response) => {
  sendStripeConnectRedirectPage(response, {
    title: 'Continue payout setup',
    message: 'Opening Play so you can retry setup...',
    appUrl: 'play://screens/menu/balance?stripeConnect=refresh',
  });
});

app.use(requestIdMiddleware);
app.use(requestLogMiddleware);
applySecurityMiddleware(app);
app.use(globalRateLimiter);
app.use(
  '/api/v1/coins/stripe/webhook',
  express.raw({
    type: 'application/json',
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(verifyTrustedOrigin);

app.get(
  '/api/v1/users/search',
  authenticate,
  validateRequest({ query: searchConversationUsersQuerySchema }),
  conversationController.searchUsers,
);
app.post(
  '/api/v1/notifications/tokens',
  authenticate,
  validateRequest({ body: registerPushTokenBodySchema }),
  notificationController.registerToken,
);
app.delete(
  '/api/v1/notifications/tokens',
  authenticate,
  validateRequest({ body: deletePushTokenBodySchema }),
  notificationController.deleteToken,
);

app.use('/api/v1', apiRouter);

app.use(notFoundMiddleware);
app.use(globalErrorHandler);

function sendStripeConnectRedirectPage(
  response: express.Response,
  options: { title: string; message: string; appUrl: string },
) {
  const safeTitle = escapeHtml(options.title);
  const safeMessage = escapeHtml(options.message);
  const safeAppUrl = JSON.stringify(options.appUrl);

  response.status(200).type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0a0a0a; color: #fff; font-family: Arial, sans-serif; }
      main { width: min(420px, calc(100vw - 32px)); text-align: center; }
      h1 { font-size: 24px; margin: 0 0 10px; }
      p { color: #aaa; margin: 0 0 24px; line-height: 1.5; }
      a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 22px; border-radius: 12px; background: #a3e635; color: #000; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
      <a id="open-app" href=${safeAppUrl}>Open Play</a>
    </main>
    <script>
      const appUrl = ${safeAppUrl};
      setTimeout(() => {
        window.location.href = appUrl;
      }, 300);
    </script>
  </body>
</html>`);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function getSystemTelemetry() {
  const memory = process.memoryUsage();
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = Math.max(totalMemoryBytes - freeMemoryBytes, 0);
  const processMemoryBytes = memory.rss;
  const loadAverage = os.loadavg()[0] ?? 0;
  const cpuCount = Math.max(os.cpus().length, 1);
  const loadPercent = Math.min(Math.round((loadAverage / cpuCount) * 100), 100);
  const totalUsers = await UserModel.countDocuments({
    status: AccountStatus.ACTIVE,
    isEmailVerified: true,
  });
  const now = Date.now();

  pruneRequestSamples(now);

  return {
    service: env.SERVICE_NAME,
    environment: env.NODE_ENV,
    platform: os.platform(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      processUsedGb: roundGb(processMemoryBytes),
      systemUsedGb: roundGb(usedMemoryBytes),
      systemTotalGb: roundGb(totalMemoryBytes),
      percentUsed: Math.round((usedMemoryBytes / totalMemoryBytes) * 100),
    },
    disk: {
      usedGb: null,
      totalGb: null,
    },
    cpu: {
      loadAverage: roundNumber(loadAverage),
      loadPercent,
      model: os.cpus()[0]?.model ?? 'Unknown CPU',
    },
    users: {
      verifiedActive: totalUsers,
    },
    traffic: {
      requestsPerMinute: requestSamples.length,
    },
    health: {
      successRate: 100,
    },
    timestamp: new Date().toISOString(),
  };
}

function pruneRequestSamples(now: number): void {
  const oneMinuteAgo = now - 60_000;

  while (requestSamples.length > 0 && requestSamples[0] !== undefined && requestSamples[0] < oneMinuteAgo) {
    requestSamples.shift();
  }
}

function roundGb(bytes: number): number {
  return roundNumber(bytes / 1024 ** 3);
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function renderTelemetryPage(): string {
  const projectName = 'Play Platform';
  const refreshIntervalSeconds = 30;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${projectName} Telemetry</title>
    <style>
      :root { color-scheme: light; --ink: #071b3a; --muted: #627394; --line: #e7ebf2; --blue: #2f67e8; --orange: #f6a426; --green: #00a862; --purple: #7c2df2; --red: #e9124d; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #f8fafc; color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(1120px, calc(100vw - 40px)); margin: 0 auto; padding: 24px 0 44px; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid #dde3ed; }
      .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .mark { width: 26px; height: 39px; border-radius: 8px; display: grid; place-items: center; background: var(--blue); color: #fff; font-weight: 800; }
      .brand strong { font-size: 18px; }
      .brand span { color: var(--muted); border-left: 1px solid #b9c3d3; padding-left: 8px; }
      .live { border: 0; border-radius: 999px; padding: 7px 14px; background: #cff8e0; color: #007d4a; font-weight: 800; letter-spacing: .02em; }
      .title-row { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin: 24px 0 34px; }
      h1 { margin: 0 0 4px; font-size: clamp(28px, 4vw, 31px); line-height: 1.1; }
      p { margin: 0; color: var(--muted); }
      .sync { border: 0; border-radius: 8px; padding: 8px 12px; color: var(--muted); background: #f1f5fa; }
      .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
      .card { min-height: 173px; border: 1px solid var(--line); border-radius: 16px; background: #fff; box-shadow: 0 1px 2px rgba(13, 30, 58, .05); padding: 24px 20px; }
      .icon { height: 24px; margin-bottom: 16px; font-size: 18px; color: var(--blue); }
      .label { color: #8b9ab6; font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
      .value { margin-top: 6px; color: #061936; font-size: 25px; font-weight: 800; line-height: 1.15; }
      .sub { margin-top: 6px; color: #8190ad; font-size: 13px; }
      .bar { height: 5px; margin-top: 12px; border-radius: 99px; background: #eef2f7; overflow: hidden; }
      .bar span { display: block; height: 100%; width: 0%; border-radius: inherit; background: var(--blue); transition: width .25s ease; }
      .bar.orange span { background: var(--orange); }
      .wide { grid-column: span 2; }
      .load { background: var(--blue); color: #fff; border-color: transparent; }
      .load .label, .load .sub, .load .value { color: #fff; }
      .spec-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #dfe5ee; color: #50617f; }
      .spec-row:last-child { border-bottom: 0; }
      .spec-row strong { color: #061936; }
      .spec-row .ok { color: var(--green); }
      .spec-row .accent { color: var(--purple); }
      @media (max-width: 860px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .title-row { align-items: start; flex-direction: column; } }
      @media (max-width: 560px) { main { width: min(100% - 28px, 1120px); } header { align-items: flex-start; } .brand { align-items: flex-start; flex-direction: column; gap: 6px; } .brand span { border-left: 0; padding-left: 0; } .grid { grid-template-columns: 1fr; } .wide { grid-column: span 1; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="brand"><div class="mark">=</div><div><strong>${projectName}</strong> <span>System Telemetry</span></div></div>
        <div class="live">• LIVE</div>
      </header>
      <section class="title-row">
        <div><h1>Real-Time Diagnostics</h1><p>System health and performance • Auto refresh every ${refreshIntervalSeconds}s</p></div>
        <button class="sync" type="button" id="sync">Syncing metrics...</button>
      </section>
      <section class="grid">
        <article class="card"><div class="icon">▤</div><div class="label">RAM Used</div><div class="value" id="ramValue">--</div><div class="sub" id="ramSub">Loading...</div><div class="bar"><span id="ramBar"></span></div></article>
        <article class="card"><div class="icon" style="color:var(--orange)">▭</div><div class="label">Disk Used</div><div class="value" id="diskValue">N/A</div><div class="sub" id="diskSub">Not available</div><div class="bar orange"><span id="diskBar"></span></div></article>
        <article class="card"><div class="icon" style="color:#5b328c">♟</div><div class="label">Total Users</div><div class="value" id="usersValue">--</div><div class="sub">verified active</div></article>
        <article class="card"><div class="icon">↗</div><div class="label">Requests / Min</div><div class="value" style="color:var(--red)" id="rpmValue">--</div><div class="sub">live traffic rate</div></article>
        <article class="card wide load"><div class="label">Processor Load</div><div class="value" id="cpuValue">--</div><div class="sub" id="cpuSub">Loading CPU...</div></article>
        <article class="card wide"><div class="label">Server Specs</div><div class="spec-row"><span>OS Platform</span><strong id="platformValue">--</strong></div><div class="spec-row"><span>Uptime</span><strong style="color:var(--blue)" id="uptimeValue">--</strong></div></article>
        <article class="card wide"><div class="label">System Health</div><div class="spec-row"><span>Success Rate</span><strong class="ok" id="successValue">--</strong></div><div class="spec-row"><span>Environment</span><strong class="accent" id="envValue">--</strong></div></article>
      </section>
    </main>
    <script>
      const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
      const setText = (id, value) => { document.getElementById(id).textContent = value; };
      const setBar = (id, value) => { document.getElementById(id).style.width = Math.max(0, Math.min(value, 100)) + '%'; };
      const uptime = (seconds) => seconds >= 3600 ? fmt.format(seconds / 3600) + ' hrs' : fmt.format(seconds / 60) + ' mins';
      async function syncTelemetry() {
        try {
          const response = await fetch('/api/v1/system/telemetry', { cache: 'no-store' });
          const body = await response.json();
          const data = body.data;
          setText('ramValue', fmt.format(data.memory.processUsedGb));
          setText('ramSub', fmt.format(data.memory.systemUsedGb) + ' of ' + fmt.format(data.memory.systemTotalGb) + ' GB');
          setBar('ramBar', data.memory.percentUsed);
          setText('usersValue', fmt.format(data.users.verifiedActive));
          setText('rpmValue', fmt.format(data.traffic.requestsPerMinute));
          setText('cpuValue', fmt.format(data.cpu.loadAverage));
          setText('cpuSub', data.cpu.model);
          setText('platformValue', data.platform);
          setText('uptimeValue', uptime(data.uptimeSeconds));
          setText('successValue', data.health.successRate + '%');
          setText('envValue', data.environment === 'production' ? 'Production' : data.environment);
          setText('sync', 'Synced ' + new Date(data.timestamp).toLocaleTimeString() + ' • every ${refreshIntervalSeconds}s');
        } catch {
          setText('sync', 'Metrics unavailable');
        }
      }
      syncTelemetry();
      setInterval(syncTelemetry, ${refreshIntervalSeconds * 1000});
    </script>
  </body>
</html>`;
}
