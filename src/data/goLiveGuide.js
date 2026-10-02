/**
 * Go-live guide — ordered steps for printable PDF (Print → Save as PDF).
 */

/** @typedef {{ id: string, title: string, lines: string[], commands?: string[] }} GoLiveStep */

/** @typedef {{ id: string, part: string, title: string, intro: string, steps: GoLiveStep[] }} GoLivePart */

/** @type {GoLivePart[]} */
export const GO_LIVE_PARTS = [
  {
    id: 'a',
    part: 'Part A',
    title: 'Finish building on your computer (Cursor)',
    intro: 'Do this before you rent a server or open the site to real students.',
    steps: [
      {
        id: 'a1',
        title: 'Make sure the app works locally',
        lines: [
          'Press F5 in Cursor (or Ctrl+Shift+B).',
          'Keep the bottom panel open until the server is ready.',
          'Open http://127.0.0.1:5173/question-bank in Cursor’s browser only.',
        ],
      },
      {
        id: 'a2',
        title: 'Upload and tag your questions',
        lines: [
          'Upload questions (single, PDF crop, bulk, etc.).',
          'Open Review & publish → fix Untagged items.',
          'Official PYQ: import NTA / Advanced / NEET PDFs under Approve official papers — do not use fake dated catalog.',
          'Publish questions when they show Ready.',
        ],
      },
      {
        id: 'a3',
        title: 'Create at least one test paper',
        lines: [
          'Go to Create test → pick questions → save the paper.',
          'Open Publish review → check every question → publish the paper.',
        ],
      },
      {
        id: 'a4',
        title: 'Run one full student test yourself',
        lines: [
          'Take the test as a student (mock or official).',
          'Submit and open Result → Question-wise → Your vs correct.',
          'Confirm score, solutions, and analysis look correct.',
        ],
      },
      {
        id: 'a5',
        title: 'Export a backup (safety copy)',
        lines: [
          'Go to Question Bank → Export JSON or Full backup.',
          'Save the file somewhere safe (OneDrive, USB, etc.).',
        ],
      },
    ],
  },
  {
    id: 'b',
    part: 'Part B',
    title: 'Get a server on the internet',
    intro: 'You need a cloud computer that students can reach 24/7.',
    steps: [
      {
        id: 'b6',
        title: 'Rent a cloud computer (VPS)',
        lines: [
          'Use DigitalOcean Droplet with the Docker Marketplace image (4 GB RAM). Pix2Text needs the extra memory.',
          'Do not run npm run live:deploy on this slow OneDrive laptop — run it on the droplet.',
          'Note the droplet’s public IP address.',
        ],
      },
      {
        id: 'b7',
        title: 'Point your domain to the server',
        lines: [
          'You already own testvantages.com at Cloudflare. Keep DNS in Cloudflare.',
          'Add an A record for @ (and www if you use it) pointing to the droplet IP.',
          'Wait 15–60 minutes for DNS to update. Do not change nameservers.',
        ],
      },
      {
        id: 'b8',
        title: 'Install tools on the server',
        lines: [
          'Install Docker and Docker Compose.',
          'Install Node.js (for building the app).',
          'Install Git (to copy your project).',
        ],
      },
    ],
  },
  {
    id: 'c',
    part: 'Part C',
    title: 'Put TestVantage on the server',
    intro: 'Copy your project and start the production stack.',
    steps: [
      {
        id: 'c9',
        title: 'Copy the project to the server',
        lines: [
          'Upload the TestVantage/onlinetest folder to the server (Git, ZIP, or FTP).',
          'Open a terminal in the onlinetest folder on the server.',
        ],
      },
      {
        id: 'c10',
        title: 'Set production passwords (important)',
        lines: [
          'Change every CHANGE_ME password in .env.production before students use the live site.',
          'Copy .env.production.example → rename to .env.production (if you do not have one yet).',
          'Change POSTGRES_PASSWORD and TESTVANTAGE_ADMIN_PASSWORD to strong secrets.',
          'Set TESTVANTAGE_CORS_ORIGIN to your public site (https://testvantages.com).',
          'Optional: add GEMINI_API_KEY for cloud OCR and AI solutions (server only).',
        ],
      },
      {
        id: 'c11',
        title: 'Build and start the live stack',
        lines: [
          'In the onlinetest folder on the server, run the deploy command below.',
          'This builds the website and starts database + API + web server on port 8080.',
        ],
        commands: ['npm run live:deploy'],
      },
      {
        id: 'c12',
        title: 'Check it works on the server',
        lines: [
          'Open http://YOUR_SERVER_IP:8080 in a browser.',
          'You should see TestVantage (not “cannot connect”).',
          'Check health: http://YOUR_SERVER_IP:8080/api/health (ok should be true).',
          'Log in as admin with the email/password from .env.production.',
        ],
      },
    ],
  },
  {
    id: 'd',
    part: 'Part D',
    title: 'Add HTTPS (required for real students)',
    intro: 'Schools and browsers expect https://, not plain http://.',
    steps: [
      {
        id: 'd13',
        title: 'Turn on SSL',
        lines: [
          'On the server, use Let’s Encrypt (often via certbot) for your domain.',
          'Use deploy/nginx-ssl.conf.example — replace yourdomain.com with your real domain.',
          'Point nginx to your SSL certificate files.',
          'Restart the Docker stack.',
        ],
      },
      {
        id: 'd14',
        title: 'Open your real website',
        lines: [
          'Students use: https://yourdomain.com (not 127.0.0.1).',
          'Teachers use the same URL for Question Bank and admin.',
        ],
      },
    ],
  },
  {
    id: 'e',
    part: 'Part E',
    title: 'Move your data to the live site',
    intro: 'Bring your question bank and enable server-wide student data.',
    steps: [
      {
        id: 'e15',
        title: 'Import question bank on live server',
        lines: [
          'Log in as teacher/admin on https://yourdomain.com.',
          'Go to Merge banks or Import backup JSON on Question Bank.',
          'Upload the backup you exported in Step 5.',
          'Open Review & publish and confirm questions are there.',
        ],
      },
      {
        id: 'e16',
        title: 'Confirm production mode is active',
        lines: [
          'Production build sets VITE_PLATFORM_SCALE=1 automatically.',
          'Logins use the server; attempts save to the database.',
          'Peer comparison uses all students on the server.',
          'In Admin → Live platform, check: API online, PostgreSQL OK, Redis OK.',
        ],
      },
    ],
  },
  {
    id: 'f',
    part: 'Part F',
    title: 'Pilot before everyone uses it',
    intro: 'Test with a small group before opening to all students.',
    steps: [
      {
        id: 'f17',
        title: 'Set up one school (pilot)',
        lines: [
          'Admin → Schools → create school and class.',
          'Add a few test student accounts.',
          'Assign one published test to that class.',
        ],
      },
      {
        id: 'f18',
        title: 'Pilot test with 5–10 real people',
        lines: [
          'One teacher confirms questions are ready.',
          '5–10 students log in on https://yourdomain.com (not Cursor).',
          'Each takes the test and submits.',
          'Teacher opens Student results.',
          'Students check Result → Question-wise → Your vs correct.',
        ],
      },
      {
        id: 'f19',
        title: 'Download a live backup',
        lines: [
          'Admin → Live platform → Download live backup.',
          'Enter admin password.',
          'Store the JSON file safely.',
        ],
      },
      {
        id: 'f20',
        title: 'Check go-live readiness in the app',
        lines: [
          'Open https://yourdomain.com/admin.',
          'Scroll to Go-live readiness.',
          'Most items should show Ready or only Partial on HTTPS/backup.',
        ],
      },
    ],
  },
  {
    id: 'g',
    part: 'Part G',
    title: 'Open to all students',
    intro: 'When the pilot works, share the site widely.',
    steps: [
      {
        id: 'g21',
        title: 'Tell users the one correct URL',
        lines: [
          'Share only: https://yourdomain.com',
          'Do not send 127.0.0.1 or localhost to students.',
        ],
      },
      {
        id: 'g22',
        title: 'Plan daily backups',
        lines: [
          'Download live backup from Admin at least once per day.',
          'Or set up automatic database backups on your host.',
        ],
      },
      {
        id: 'g23',
        title: 'Monitor health',
        lines: [
          'Set a monitor to check /api/health and /api/ready every few minutes.',
          'Fix alerts quickly if the API goes offline.',
        ],
      },
    ],
  },
]

export const GO_LIVE_SUMMARY_LINE =
  'Build in Cursor → Copy to server → HTTPS domain → Import bank → Pilot → Open to all'

export const GO_LIVE_READINESS_URL = '/admin'

export const GO_LIVE_ALL_STEP_IDS = GO_LIVE_PARTS.flatMap((p) => p.steps.map((s) => s.id))
