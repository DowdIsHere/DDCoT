// Only load .env in development (not on Railway)
if (!process.env.RAILWAY_ENVIRONMENT_NAME) {
    require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();

const JWT_SECRET = process.env.SESSION_SECRET || 'parser-profile-kids-change-me-in-production';
const JWT_EXPIRES = '30d';
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

// Stripe webhook needs raw body, so set it up before express.json()
app.post('/api/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// ============================================================================
// ACCOUNT STORAGE (file-based)
// ============================================================================

function loadAccounts() {
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading accounts:', e.message);
    }
    return { users: [] };
}

function saveAccounts(data) {
    try {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving accounts:', e.message);
    }
}

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================

function requireKidsAuth(req, res, next) {
    const token = req.cookies?.kidsAccessToken;
    if (!token) return res.redirect('/parent-login.html?reason=auth');
    try {
        jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.clearCookie('kidsAccessToken');
        return res.redirect('/parent-login.html?reason=expired');
    }
}

// ============================================================================
// PROTECTED KIDS ASSESSMENT ROUTE (must be before static middleware)
// ============================================================================

app.get('/kids-assessment.html', requireKidsAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'kids-assessment.html'));
});

// ============================================================================
// AUTH API ROUTES
// ============================================================================

app.get('/api/auth/status', (req, res) => {
    const token = req.cookies?.kidsAccessToken;
    if (!token) return res.json({ authenticated: false });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        res.json({ authenticated: true, user: { email: payload.email, role: payload.role, firstName: payload.firstName, lastName: payload.lastName } });
    } catch {
        res.json({ authenticated: false });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { email, password, firstName, lastName, role } = req.body;

    if (!email || !password || !firstName || !lastName || !role) {
        return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    if (!['parent', 'teacher'].includes(role)) {
        return res.status(400).json({ success: false, error: 'Role must be parent or teacher' });
    }
    if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const accounts = loadAccounts();
    const normalizedEmail = email.toLowerCase().trim();
    if (accounts.users.find(u => u.email === normalizedEmail)) {
        return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    accounts.users.push({ email: normalizedEmail, passwordHash, firstName: firstName.trim(), lastName: lastName.trim(), role, createdAt: new Date().toISOString() });
    saveAccounts(accounts);

    const token = jwt.sign({ email: normalizedEmail, role, firstName: firstName.trim(), lastName: lastName.trim() }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.cookie('kidsAccessToken', token, {
        httpOnly: true,
        secure: !!process.env.RAILWAY_ENVIRONMENT_NAME,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.json({ success: true, user: { email: normalizedEmail, role, firstName: firstName.trim(), lastName: lastName.trim() } });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const accounts = loadAccounts();
    const user = accounts.users.find(u => u.email === email.toLowerCase().trim());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign({ email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.cookie('kidsAccessToken', token, {
        httpOnly: true,
        secure: !!process.env.RAILWAY_ENVIRONMENT_NAME,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.json({ success: true, user: { email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName } });
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('kidsAccessToken');
    res.json({ success: true });
});

// Static files served AFTER the protected route above
app.use(express.static('.'));

// Initialize Stripe lazily (env vars not available during Railway build)
let stripe;
function getStripe() {
    if (!stripe) {
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripe;
}

// ============================================================================
// CUSTOMER ID GENERATION (sequential, file-persisted)
// ============================================================================

const COUNTER_FILE = path.join(__dirname, 'counter.json');

function generateCustomerId() {
    let next = 1;
    try {
        if (fs.existsSync(COUNTER_FILE)) {
            next = (JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8')).counter || 0) + 1;
        }
    } catch (e) { /* start at 1 */ }
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ counter: next }));
    return `CBI-${new Date().getFullYear()}-${String(next).padStart(5, '0')}`;
}

// ============================================================================
// EMAIL CONFIGURATION
// ============================================================================

// Create transporter — SiteGround SMTP
// Railway Variables required: SMTP_USER, SMTP_PASS
// Already set on Railway: SMTP_HOST, SMTP_SECURE, EMAIL_FROM
const createTransporter = () => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'mail.cognitionblocksllc.com',
        port: 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

// ============================================================================
// ROOT REDIRECT
// ============================================================================

app.get('/', (req, res) => {
    res.redirect('/assessment.html');
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/api/health', async (req, res) => {
    const transporter = createTransporter();
    let emailStatus = 'not configured';

    if (transporter) {
        try {
            await transporter.verify();
            emailStatus = 'connected';
        } catch (err) {
            emailStatus = `error: ${err.message}`;
        }
    }

    res.json({
        status: 'ok',
        environment: process.env.STRIPE_ENVIRONMENT || 'test',
        emailConfigured: !!transporter,
        emailStatus: emailStatus
    });
});

// Serve Stripe publishable key to frontend
app.get('/api/config', (req, res) => {
    res.json({
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
});

// ============================================================================
// COMPLETION LOGGING
// ============================================================================

// Log every assessment completion — generates the canonical customer ID and sends full notification
app.post('/api/log-completion', async (req, res) => {
    const { profileName, profileCode, scores, emailProvided, assessmentType, userEmail, userName,
            overview, phrase, strengths, howYouLearn, howYouCommunicate, primaryChallenge } = req.body;

    const customerId = generateCustomerId();
    const timestamp = new Date().toISOString();
    const spatial  = scores?.spatial  || 0;
    const temporal = scores?.temporal || 0;
    const reference = scores?.reference || 0;
    const spatialLabel   = spatial   >= 50 ? 'Abstract' : 'Concrete';
    const temporalLabel  = temporal  >= 50 ? 'Future'   : 'Past';
    const referenceLabel = reference >= 50 ? 'Self'     : 'Other';
    const assessmentLabel = assessmentType === 'kids' ? 'Kids Assessment' : 'Adult Assessment';
    const emailStatus = emailProvided ? 'Email Provided' : 'Email Skipped';

    console.log(`[COMPLETION] ${customerId} | ${timestamp} | ${assessmentLabel} | ${profileName} | ${spatial}% ${spatialLabel} / ${temporal}% ${temporalLabel} / ${reference}% ${referenceLabel} | Email: ${emailStatus}`);

    const transporter = createTransporter();
    if (transporter) {
        const statusBg    = emailProvided ? '#f0fdf4' : '#fff7ed';
        const statusColor = emailProvided ? '#15803d' : '#c2410c';
        const kidsBadge   = assessmentType === 'kids'
            ? '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 10px;border-radius:4px;font-size:12px;font-weight:700;margin-left:8px;">KIDS</span>'
            : '';

        const strengthsHtml = (strengths && strengths.length > 0)
            ? strengths.slice(0, 4).map(s => `
                <div style="margin-bottom:8px;padding:10px 12px;background:#f1f5f9;border-radius:6px;">
                    <strong style="color:#1a1a2e;font-size:13px;">${s.title || s}</strong>
                    ${s.description ? `<div style="color:#64748b;font-size:12px;margin-top:2px;">${s.description}</div>` : ''}
                </div>`).join('')
            : '';

        const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f7f8fa;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0C2340 0%,#1B3A5C 100%);padding:28px 32px;text-align:center;">
    <div style="color:rgba(255,255,255,0.7);font-size:11px;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:6px;">Parser Profile™ — New Completion ${kidsBadge}</div>
    <div style="color:rgba(255,255,255,0.5);font-size:12px;">${timestamp}</div>
  </div>

  <!-- Customer ID -->
  <div style="background:#2563EB;padding:18px 32px;text-align:center;">
    <div style="color:rgba(255,255,255,0.75);font-size:10px;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:4px;">Customer ID</div>
    <div style="color:#fff;font-size:26px;font-weight:700;letter-spacing:0.1em;font-family:monospace;">${customerId}</div>
  </div>

  <!-- Email status + user info -->
  <div style="background:${statusBg};padding:12px 32px;border-bottom:3px solid ${statusColor};text-align:center;">
    <span style="color:${statusColor};font-weight:700;font-size:14px;">${emailStatus}</span>
    ${userEmail ? `<span style="color:#555;font-size:13px;"> — ${userName ? userName + ' · ' : ''}${userEmail}</span>` : ''}
  </div>

  <div style="background:#fff;padding:28px 32px;">

    <!-- Profile -->
    <div style="text-align:center;padding-bottom:24px;margin-bottom:24px;border-bottom:1px solid #e2e8f0;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;margin-bottom:6px;">Profile</div>
      <div style="font-size:30px;font-weight:700;color:#0C2340;">${profileName}</div>
      ${profileCode ? `<div style="color:#64748b;font-size:13px;margin-top:4px;">${profileCode}</div>` : ''}
    </div>

    <!-- Scores -->
    <div style="padding-bottom:24px;margin-bottom:24px;border-bottom:1px solid #e2e8f0;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;margin-bottom:12px;">Dimension Scores</div>
      <div style="margin-bottom:6px;"><span style="background:#ecfdf5;color:#0d9488;padding:5px 14px;border-radius:5px;font-size:13px;font-weight:600;">Spatial: ${spatial}% ${spatialLabel}</span></div>
      <div style="margin-bottom:6px;"><span style="background:#fffbeb;color:#d97706;padding:5px 14px;border-radius:5px;font-size:13px;font-weight:600;">Temporal: ${temporal}% ${temporalLabel}</span></div>
      <div><span style="background:#eff6ff;color:#7c3aed;padding:5px 14px;border-radius:5px;font-size:13px;font-weight:600;">Reference: ${reference}% ${referenceLabel}</span></div>
    </div>

    ${overview ? `
    <!-- Overview -->
    <div style="padding-bottom:24px;margin-bottom:24px;border-bottom:1px solid #e2e8f0;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;margin-bottom:8px;">Overview</div>
      <p style="color:#334155;line-height:1.65;margin:0;font-size:14px;">${overview.replace(/\n\n/g, '<br><br>')}</p>
    </div>` : ''}

    ${phrase ? `
    <!-- Phrase -->
    <div style="padding:16px;background:#f8fafc;border-radius:8px;text-align:center;margin-bottom:24px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;margin-bottom:8px;">The Phrase That Hits Home</div>
      <p style="color:#1a1a2e;font-size:16px;font-style:italic;line-height:1.5;margin:0;">"${phrase}"</p>
    </div>` : ''}

    ${strengthsHtml ? `
    <!-- Strengths -->
    <div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;margin-bottom:10px;">Strengths</div>
      ${strengthsHtml}
    </div>` : ''}

  </div>
</div>`;

        try {
            await transporter.sendMail({
                from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@cognitionblocksllc.com',
                to: 'profile.library@cognitionblocksllc.com',
                subject: `[${customerId}] ${profileName} — ${assessmentLabel} (${emailStatus})`,
                html
            });
            console.log(`[COMPLETION-NOTIFY] Sent: ${customerId} ${profileName}`);
        } catch (err) {
            console.error(`[COMPLETION-NOTIFY] FAILED to send email for ${customerId}:`, err.message);
            console.error('[COMPLETION-NOTIFY] Check EMAIL_USER, EMAIL_PASS, and EMAIL_FROM env vars on Railway.');
        }
    }

    res.json({ success: true, customerId });
});

// ============================================================================
// EMAIL ENDPOINTS
// ============================================================================

// Send results email to the user
app.post('/api/send-results', async (req, res) => {
    const { email, name, profileName, profileCode, scores, overview, phrase, strengths, howYouLearn, howYouCommunicate, primaryChallenge, customerId: providedCustomerId } = req.body;
    const customerId = providedCustomerId || generateCustomerId();

    if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const transporter = createTransporter();

    // Build the email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f7;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0a0a0f 0%, #1a1a24 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: #00d4aa; font-size: 28px; margin: 0 0 8px 0;">Parser Profile™</h1>
            <p style="color: #a0a0b0; font-size: 14px; margin: 0;">Developed by J.D. Mercer</p>
        </div>

        <!-- Customer ID -->
        <div style="background-color: #f0f0f5; padding: 16px 30px; text-align: center; border-bottom: 1px solid #e0e0e5;">
            <p style="margin: 0; color: #6a6a7a; font-size: 12px;">Your Customer ID</p>
            <p style="margin: 4px 0 0 0; color: #1a1a24; font-size: 16px; font-weight: bold; letter-spacing: 0.05em;">${customerId}</p>
        </div>

        <!-- Profile Name -->
        <div style="padding: 40px 30px; text-align: center; border-bottom: 1px solid #e0e0e5;">
            ${name ? `<p style="color: #6a6a7a; font-size: 14px; margin: 0 0 8px 0;">Hi ${name},</p>` : ''}
            <p style="color: #6a6a7a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 12px 0;">Your Parser Profile™</p>
            <h2 style="color: #00d4aa; font-size: 42px; margin: 0 0 8px 0;">${profileName}</h2>
            <p style="color: #6a6a7a; font-size: 14px; margin: 0;">${profileCode}</p>
        </div>

        <!-- Dimension Scores -->
        <div style="padding: 30px; border-bottom: 1px solid #e0e0e5;">
            <h3 style="color: #1a1a24; font-size: 16px; margin: 0 0 20px 0;">📊 Your Cognitive Coordinates</h3>
            <div style="margin-bottom: 16px;">
                <p style="margin: 0 0 4px 0; color: #1a1a24;"><strong>Spatial Processing:</strong></p>
                <p style="margin: 0; color: #00d4aa;">${scores.spatial >= 50 ? scores.spatial : 100 - scores.spatial}% ${scores.spatial >= 50 ? 'Abstract' : 'Concrete'}</p>
            </div>
            <div style="margin-bottom: 16px;">
                <p style="margin: 0 0 4px 0; color: #1a1a24;"><strong>Temporal Processing:</strong></p>
                <p style="margin: 0; color: #ffc857;">${scores.temporal >= 50 ? scores.temporal : 100 - scores.temporal}% ${scores.temporal >= 50 ? 'Future' : 'Past'}</p>
            </div>
            <div>
                <p style="margin: 0 0 4px 0; color: #1a1a24;"><strong>Reference Processing:</strong></p>
                <p style="margin: 0; color: #a855f7;">${scores.reference >= 50 ? scores.reference : 100 - scores.reference}% ${scores.reference >= 50 ? 'Self' : 'Other'}</p>
            </div>
        </div>

        <!-- Profile Overview -->
        ${overview ? `
        <div style="padding: 30px; border-bottom: 1px solid #e0e0e5;">
            <h3 style="color: #1a1a24; font-size: 16px; margin: 0 0 16px 0;">🔮 Your Profile</h3>
            <p style="color: #4a4a5a; line-height: 1.6; margin: 0;">${overview.replace(/\n\n/g, '</p><p style="color: #4a4a5a; line-height: 1.6; margin: 16px 0 0 0;">')}</p>
        </div>
        ` : ''}

        <!-- The Phrase -->
        ${phrase ? `
        <div style="padding: 30px; border-bottom: 1px solid #e0e0e5; background-color: #f8f8fa;">
            <h3 style="color: #1a1a24; font-size: 16px; margin: 0 0 16px 0;">💡 The Phrase That Hits Home</h3>
            <p style="color: #1a1a24; font-size: 18px; font-style: italic; line-height: 1.5; margin: 0; text-align: center;">"${phrase}"</p>
        </div>
        ` : ''}

        <!-- Strengths -->
        ${strengths && strengths.length > 0 ? `
        <div style="padding: 30px; border-bottom: 1px solid #e0e0e5;">
            <h3 style="color: #1a1a24; font-size: 16px; margin: 0 0 20px 0;">⚡ Your Cognitive Strengths</h3>
            ${strengths.slice(0, 6).map(s => `
                <div style="margin-bottom: 16px; padding: 16px; background-color: #f5f5f7; border-radius: 8px;">
                    <p style="margin: 0 0 4px 0; color: #1a1a24; font-weight: bold;">${s.title}</p>
                    <p style="margin: 0; color: #4a4a5a; font-size: 14px;">${s.description}</p>
                </div>
            `).join('')}
        </div>
        ` : ''}

        <!-- How You Learn -->
        ${howYouLearn ? `
        <div style="padding: 30px; border-bottom: 1px solid #e0e0e5;">
            <h3 style="color: #1a1a24; font-size: 16px; margin: 0 0 16px 0;">📚 How You Learn Best</h3>
            <p style="color: #4a4a5a; line-height: 1.6; margin: 0;">${howYouLearn.replace(/\n\n/g, '</p><p style="color: #4a4a5a; line-height: 1.6; margin: 16px 0 0 0;">')}</p>
        </div>
        ` : ''}

        <!-- How You Communicate -->
        ${howYouCommunicate ? `
        <div style="padding: 30px; border-bottom: 1px solid #e0e0e5;">
            <h3 style="color: #1a1a24; font-size: 16px; margin: 0 0 16px 0;">💬 How You Communicate</h3>
            <p style="color: #4a4a5a; line-height: 1.6; margin: 0;">${howYouCommunicate.replace(/\n\n/g, '</p><p style="color: #4a4a5a; line-height: 1.6; margin: 16px 0 0 0;">')}</p>
        </div>
        ` : ''}

        <!-- Primary Challenge -->
        ${primaryChallenge ? `
        <div style="padding: 30px; border-bottom: 1px solid #e0e0e5;">
            <h3 style="color: #1a1a24; font-size: 16px; margin: 0 0 16px 0;">🎯 Your Primary Challenge</h3>
            <div style="padding: 20px; background-color: #fff8f0; border-left: 4px solid #ffc857; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; color: #1a1a24; font-weight: bold;">${primaryChallenge.title}</p>
                <p style="margin: 0 0 12px 0; color: #4a4a5a; font-size: 14px;">${primaryChallenge.challenge}</p>
                <p style="margin: 0; color: #00d4aa; font-size: 14px;"><strong>Remedy:</strong> ${primaryChallenge.remedy}</p>
            </div>
        </div>
        ` : ''}

        <!-- Learn More CTA -->
        <div style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, rgba(0, 212, 170, 0.1), rgba(168, 85, 247, 0.1));">
            <h3 style="color: #1a1a24; font-size: 20px; margin: 0 0 12px 0;">Want to Learn More?</h3>
            <p style="color: #4a4a5a; font-size: 14px; margin: 0 0 24px 0;">Discover the framework behind your Parser Profile™ and explore the full CBI model.</p>
            <a href="https://cognitionblocksllc.com/cbi_overview" style="display: inline-block; background: linear-gradient(135deg, #00d4aa, #00b894); color: #0a0a0f; padding: 14px 32px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px;">Explore the CBI Framework</a>
        </div>

        <!-- Footer -->
        <div style="padding: 30px; text-align: center; background-color: #0a0a0f;">
            <a href="https://cognitionblocksllc.com/cbi_overview" style="display: inline-block; color: #00d4aa; border: 2px solid #00d4aa; padding: 12px 28px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 14px; margin-bottom: 20px;">Explore CBI</a>
            <p style="color: #a0a0b0; font-size: 12px; margin: 16px 0 0 0;">Parser Profile™ developed by J.D. Mercer</p>
            <p style="color: #6a6a7a; font-size: 11px; margin: 4px 0 0 0;">Based on the Cognition Blocks Intelligence (CBI) Framework</p>
            <p style="color: #6a6a7a; font-size: 11px; margin: 12px 0 0 0;">© 2026 Cognition Blocks LLC. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;

    // If email is configured, send it
    if (transporter) {
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@cognitionblocksllc.com',
                to: email,
                bcc: 'profile.library@cognitionblocksllc.com',
                subject: `Your Parser Profile™ Results: ${profileName}`,
                html: emailHtml
            });

            console.log(`Results email sent to ${email}, Customer ID: ${customerId}`);

            res.json({
                success: true,
                customerId,
                message: 'Results sent to your email!'
            });
        } catch (error) {
            console.error('Email error:', error);
            // Still return success with customer ID even if email fails
            res.json({
                success: true,
                customerId,
                emailSent: false,
                message: 'Results saved! Email delivery pending.'
            });
        }
    } else {
        // No email config - just generate customer ID
        console.log(`No email config. Customer ID generated: ${customerId} for ${email}`);
        res.json({
            success: true,
            customerId,
            emailSent: false,
            message: 'Results saved!'
        });
    }
});

// Notification endpoint - for admin notifications
app.post('/api/notify-completion', async (req, res) => {
    const { customerId, profileName, email, name, tier } = req.body;

    const transporter = createTransporter();
    if (!transporter) {
        return res.json({ success: true, message: 'Notifications not configured' });
    }

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@cognitionblocksllc.com',
            to: 'profile.library@cognitionblocksllc.com',
            subject: `New Parser Profile™ Completion: ${profileName} (${tier})`,
            html: `
                <h2>New Assessment Completed</h2>
                <p><strong>Customer ID:</strong> ${customerId}</p>
                <p><strong>Profile:</strong> ${profileName}</p>
                <p><strong>Name:</strong> ${name || 'Not provided'}</p>
                <p><strong>Email:</strong> ${email || 'Not provided'}</p>
                <p><strong>Tier:</strong> ${tier}</p>
                <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            `
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Notification error:', error);
        res.json({ success: true, message: 'Notification queued' });
    }
});

// ============================================================================
// PROMO CODE VALIDATION
// ============================================================================

app.post('/api/validate-promo', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, error: 'No promo code provided' });
    }

    const promoFree = process.env.PROMO_FREE || '';
    const promoDiscount = process.env.PROMO_DISCOUNT || '';
    const upperCode = code.trim().toUpperCase();

    if (promoFree && upperCode === promoFree.toUpperCase()) {
        return res.json({ success: true, type: 'free', discount: 100, newAmount: 0 });
    }

    if (promoDiscount && upperCode === promoDiscount.toUpperCase()) {
        const newAmount = Math.round(1999 * 0.85); // 15% off $19.99
        return res.json({ success: true, type: 'discount', discount: 15, newAmount });
    }

    res.json({ success: false, error: 'Invalid promo code' });
});

// ============================================================================
// PAYMENT ENDPOINTS (Stripe)
// ============================================================================

// Create Stripe PaymentIntent
app.post('/api/create-payment-intent', async (req, res) => {
    const { email, profileName, promoCode } = req.body;

    try {
        // Validate promo code if provided
        let amount = 1999; // $19.99 in cents
        if (promoCode) {
            const promoFree = process.env.PROMO_FREE || '';
            const promoDiscount = process.env.PROMO_DISCOUNT || '';
            const upperCode = promoCode.trim().toUpperCase();

            if (promoFree && upperCode === promoFree.toUpperCase()) {
                // Free promo should not create a payment intent
                return res.json({ success: true, free: true });
            }

            if (promoDiscount && upperCode === promoDiscount.toUpperCase()) {
                amount = Math.round(1999 * 0.85); // 15% off
            }
        }

        const paymentIntent = await getStripe().paymentIntents.create({
            amount,
            currency: 'usd',
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                profileName: profileName || 'Unknown',
                email: email || '',
                promoCode: promoCode || ''
            },
            receipt_email: email || undefined,
            description: `Parser Profile™ Full Report - ${profileName || 'Assessment'}`
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret
        });
    } catch (error) {
        console.error('Payment intent error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Stripe webhook handler
async function handleStripeWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // If no webhook secret configured, skip validation (for development)
    if (!webhookSecret) {
        console.log('Stripe webhook received (no signature validation)');
        return res.json({ received: true });
    }

    try {
        const event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);

        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                console.log('Payment succeeded:', paymentIntent.id, paymentIntent.metadata);
                break;
            case 'payment_intent.payment_failed':
                const failedPayment = event.data.object;
                console.log('Payment failed:', failedPayment.id, failedPayment.last_payment_error?.message);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error.message);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
}

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT}`);
    const transporter = createTransporter();
    if (!transporter) {
        console.error('[EMAIL] NOT CONFIGURED — set EMAIL_USER and EMAIL_PASS in Railway Variables. Notifications will NOT be sent.');
    } else {
        try {
            await transporter.verify();
            console.log(`[EMAIL] Connected OK — notifications will go to profile.library@cognitionblocksllc.com`);
        } catch (err) {
            console.error(`[EMAIL] Config found but connection FAILED: ${err.message}`);
            console.error('[EMAIL] Check EMAIL_USER and EMAIL_PASS. Gmail requires an App Password (not your regular password).');
        }
    }
});
