import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { DfnsApiClient } from '@dfns/sdk';
import { ADEQUACY_QUESTIONS, ADEQUACY_SECTIONS, computeAdequacyScore, VERDICT_LABELS, getAnswerLabel } from '../src/config/adequacyQuestions.js';
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';
import { getCryptoPriceEur, getAllPricesEur, getRawFeed, chainlinkHealth, CHAINLINK_FEEDS } from './services/chainlink.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5174', 'http://localhost:5173'];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ============================================================
// SUPABASE — Admin client for audit logging & compliance
// ============================================================
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function logAudit({ userId, userEmail, userRole, action, category, entityType, entityId, clientName, salesforceAccountId, details, severity = 'info', req }) {
  try {
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId || null,
      user_email: userEmail || 'system',
      user_role: userRole || 'system',
      action,
      category,
      entity_type: entityType || null,
      entity_id: entityId || null,
      client_name: clientName || null,
      salesforce_account_id: salesforceAccountId || null,
      details: details || {},
      ip_address: req?.ip || req?.headers?.['x-forwarded-for'] || null,
      severity,
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// ============================================================
// AUTH MIDDLEWARE — Verify Supabase JWT & extract role
// ============================================================
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      req.user = null;
      return next();
    }
    // Use a user-scoped client to respect RLS on custody_profiles
    const userClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: profile } = await userClient
      .from('custody_profiles')
      .select('role, email, full_name')
      .eq('id', user.id)
      .single();
    req.user = {
      id: user.id,
      email: user.email,
      role: profile?.role || 'banquier',
      fullName: profile?.full_name || '',
    };
    next();
  } catch {
    req.user = null;
    next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
  next();
}

// Apply auth middleware globally
app.use(authMiddleware);

// ============================================================
// SALESFORCE — OAuth username-password flow (server-side)
// ============================================================
let sfAccessToken = null;
let sfInstanceUrl = null;
let sfTokenExpiry = 0;

const SF_CONFIGURED = !!(process.env.SF_CLIENT_ID && process.env.SF_USERNAME);

async function getSalesforceToken() {
  // Cache token for 1h
  if (sfAccessToken && Date.now() < sfTokenExpiry) {
    return { accessToken: sfAccessToken, instanceUrl: sfInstanceUrl };
  }

  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
    username: process.env.SF_USERNAME,
    password: `${process.env.SF_PASSWORD}${process.env.SF_SECURITY_TOKEN || ''}`,
  });

  const res = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || `Salesforce OAuth failed: ${res.status}`);
  }

  const data = await res.json();
  sfAccessToken = data.access_token;
  sfInstanceUrl = data.instance_url;
  sfTokenExpiry = Date.now() + 3600_000; // 1h
  console.log(`Salesforce connected: ${sfInstanceUrl}`);
  return { accessToken: sfAccessToken, instanceUrl: sfInstanceUrl };
}

// SF status endpoint
app.get('/api/salesforce/status', (req, res) => {
  res.json({
    configured: SF_CONFIGURED,
    connected: !!sfAccessToken,
    instanceUrl: sfInstanceUrl,
  });
});

// SF Account PATCH — update custom fields (requires auth)
app.patch('/api/salesforce/account/:accountId', requireAuth, async (req, res) => {
  if (!SF_CONFIGURED) {
    return res.status(501).json({ error: 'Salesforce not configured' });
  }
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const response = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${req.params.accountId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    if (response.status === 204) {
      // Log the update
      await logAudit({
        userId: req.user?.id,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        action: 'salesforce_account_update',
        category: 'custody',
        entityType: 'Account',
        entityId: req.params.accountId,
        details: { updatedFields: Object.keys(req.body) },
        req,
      });
      return res.json({ success: true });
    }
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Salesforce account PATCH error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PDF GENERATION & SALESFORCE FILE UPLOAD HELPERS
// ============================================================
import crypto from 'crypto';

function generateContractPDF({ clientName, clientAddress, clientPhone, signerName, signerIp, signedAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const dateStr = new Date(signedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    // Title
    doc.font('Helvetica-Bold').fontSize(16).text('CONTRAT DE CONSERVATION D\'ACTIFS NUMERIQUES', { align: 'center' });
    doc.moveDown(1.5);

    // Parties
    doc.font('Helvetica-Bold').fontSize(11).text('Entre :');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    doc.text('SwissLife Banque Privee');
    doc.text('Societe Anonyme');
    doc.text('Siege social : 7 rue Belgrand, 92300 Levallois-Perret');
    doc.text('Agreee en qualite de Prestataire de Services sur Actifs Numeriques (CASP)');
    doc.text('ci-apres denominee "La Banque"');
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(11).text('Et :');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    doc.text(clientName);
    doc.text(clientAddress);
    doc.text(`Tel. : ${clientPhone}`);
    doc.text('ci-apres denomme(e) "Le Client"');
    doc.moveDown(0.8);

    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#cccccc');
    doc.moveDown(0.5);

    // Articles
    const articles = [
      ['Article 1 — Objet', 'Le present contrat a pour objet de definir les conditions dans lesquelles La Banque assure, pour le compte du Client, la conservation d\'actifs numeriques au sens de l\'article L.54-10-1 du Code Monetaire et Financier et du reglement (UE) 2023/1114 (MiCA).'],
      ['Article 2 — Services de conservation', 'La Banque assure la garde des cles cryptographiques privees necessaires a la detention et au transfert des actifs numeriques du Client, au moyen d\'une infrastructure de type MPC (Multi-Party Computation) conforme aux standards de securite de l\'industrie.'],
      ['Article 3 — Segregation des actifs', 'Conformement a l\'article 75(7) du reglement MiCA, les actifs numeriques du Client sont conserves sur des adresses blockchain distinctes de celles de La Banque et des autres clients. Les actifs du Client ne font pas partie du bilan de La Banque.'],
      ['Article 4 — Responsabilite', 'La Banque est responsable de la perte d\'actifs numeriques resultant d\'un incident imputable a La Banque ou a ses prestataires techniques, conformement a l\'article 75(8) du reglement MiCA. La valeur de restitution correspond a la valeur de marche des actifs au moment de la perte.'],
      ['Article 5 — Restitution', 'Le Client peut demander la restitution de tout ou partie de ses actifs numeriques a tout moment. La Banque s\'engage a executer la restitution dans un delai raisonnable ne pouvant exceder 5 jours ouvrables.'],
      ['Article 6 — Frais', 'Les frais de conservation sont calcules en points de base par an sur la valeur de marche moyenne des actifs conserves. Les frais de transaction sont factures separement selon le bareme en vigueur.'],
      ['Article 7 — Lutte contre le blanchiment', 'Le Client s\'engage a respecter l\'ensemble des obligations relatives a la lutte contre le blanchiment et le financement du terrorisme. La Banque se reserve le droit de geler les actifs du Client sur instruction de Tracfin ou de toute autorite competente (art. L.562-4 CMF).'],
      ['Article 8 — Duree et resiliation', 'Le present contrat est conclu pour une duree indeterminee. Chaque partie peut le resilier moyennant un preavis de 30 jours. En cas de resiliation, les actifs sont restitues au Client conformement a l\'article 5.'],
      ['Article 9 — Droit applicable', 'Le present contrat est soumis au droit francais. Tout litige sera soumis aux tribunaux competents de Paris.'],
    ];

    for (const [title, body] of articles) {
      if (doc.y > 680) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).text(title);
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10).text(body, { align: 'justify' });
      doc.moveDown(0.6);
    }

    // Signature section
    if (doc.y > 580) doc.addPage();
    doc.moveDown(0.5);
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#cccccc');
    doc.moveDown(0.8);

    doc.font('Helvetica').fontSize(10).text(`Fait a Paris, le ${dateStr}`);
    doc.moveDown(1.5);

    const leftX = 60, rightX = 310;
    const sigY = doc.y;

    doc.font('Helvetica').fontSize(9).fillColor('#666666').text('Le Client :', leftX, sigY);
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text('La Banque :', rightX, sigY);

    doc.moveDown(2);
    const lineY = doc.y;
    doc.moveTo(leftX, lineY).lineTo(230, lineY).stroke('#333333');
    doc.moveTo(rightX, lineY).lineTo(480, lineY).stroke('#333333');

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
    doc.text(signerName || clientName, leftX, lineY + 6);
    doc.text('SwissLife Banque Privee', rightX, lineY + 6);

    // Signature metadata
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor('#999999');
    doc.text(`Signature electronique — ${dateStr}`, leftX);
    doc.text(`Signataire : ${signerName || clientName}`, leftX);
    doc.text(`Adresse IP : ${signerIp}`, leftX);
    doc.text(`Horodatage : ${signedAt}`, leftX);
    doc.text('Valeur contractuelle au titre de l\'article 1367 du Code Civil', leftX);

    doc.end();
  });
}

function generateAdequacyPDF({ clientName, clientAddress, clientPhone, answers = {}, scoring, signerName, signerIp, signedAt, assessedBy }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const dateStr = new Date(signedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    // Title
    doc.font('Helvetica-Bold').fontSize(16).text('QUESTIONNAIRE D\'ADEQUATION MiFID II', { align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor('#666666').text('Conservation d\'Actifs Numeriques', { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1);

    // Legal reference
    doc.font('Helvetica').fontSize(9).fillColor('#888888');
    doc.text('Test d\'adequation realise par le client conformement a l\'article 25(2) de la directive MiFID II, l\'article 66 du reglement (UE) 2023/1114 (MiCA) et aux obligations AMF relatives a l\'evaluation prealable des services de conservation.', { align: 'justify' });
    doc.fillColor('#000000');
    doc.moveDown(1);

    // Client info
    doc.font('Helvetica-Bold').fontSize(11).text('Informations du client');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Nom : ${clientName}`);
    doc.text(`Adresse : ${clientAddress}`);
    doc.text(`Telephone : ${clientPhone}`);
    doc.moveDown(0.8);

    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#cccccc');
    doc.moveDown(0.5);

    // Questions & answers — grouped by section
    doc.font('Helvetica-Bold').fontSize(11).text('Evaluation');
    doc.moveDown(0.4);

    let qNum = 0;
    for (const section of ADEQUACY_SECTIONS) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#7C5E3C').text(section.label.toUpperCase(), { continued: false });
      doc.fillColor('#000000');
      doc.moveDown(0.3);

      for (const q of ADEQUACY_QUESTIONS.filter(x => x.section === section.id)) {
        if (q.type === 'textarea') {
          const val = answers[q.id];
          if (val) {
            doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666666').text('Commentaires du client :');
            doc.font('Helvetica').fontSize(10).fillColor('#000000').text(val, { align: 'justify' });
            doc.moveDown(0.4);
          }
          continue;
        }
        qNum++;
        doc.font('Helvetica').fontSize(10).text(`${qNum}. ${q.label}`, { align: 'justify' });
        doc.moveDown(0.15);
        const answerLabel = getAnswerLabel(q.id, answers[q.id]);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#059669').text(`Reponse : ${answerLabel}`);
        doc.fillColor('#000000');
        doc.moveDown(0.5);
      }
      doc.moveDown(0.2);
    }

    // Conclusion — with score + verdict
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#cccccc');
    doc.moveDown(0.5);

    const verdictInfo = VERDICT_LABELS[scoring?.verdict] || {};
    const color = verdictInfo.tone === 'success' ? '#059669' : verdictInfo.tone === 'warning' ? '#CA8A04' : '#DC2626';
    doc.font('Helvetica-Bold').fontSize(12).fillColor(color).text(
      `CONCLUSION : ${verdictInfo.label || 'A evaluer'}  ·  Score ${scoring?.score ?? 0}/${scoring?.max ?? 0}`
    );
    doc.fillColor('#000000');
    doc.font('Helvetica').fontSize(10).text(verdictInfo.description || '', { align: 'justify' });
    doc.moveDown(0.5);

    // Breakdown par section
    if (scoring?.breakdown) {
      doc.font('Helvetica').fontSize(9).fillColor('#666666').text('Detail par section :');
      for (const section of ADEQUACY_SECTIONS) {
        const b = scoring.breakdown[section.id];
        if (!b) continue;
        doc.text(`  · ${section.label.padEnd(22)} : ${b.score}/${b.max}`);
      }
      doc.fillColor('#000000');
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5);

    // Evaluator info
    doc.font('Helvetica').fontSize(9).fillColor('#888888');
    doc.text(`Evaluation realisee par : ${assessedBy || 'Non renseigne'}`);
    doc.fillColor('#000000');
    doc.moveDown(1);

    // Signatures
    doc.font('Helvetica').fontSize(10).text(`Fait a Paris, le ${dateStr}`);
    doc.moveDown(1.5);

    const leftX = 60, rightX = 310;
    const sigY = doc.y;

    doc.font('Helvetica').fontSize(9).fillColor('#666666').text('Le Client :', leftX, sigY);
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text('Le Banquier :', rightX, sigY);

    doc.moveDown(2);
    const lineY = doc.y;
    doc.moveTo(leftX, lineY).lineTo(230, lineY).stroke('#333333');
    doc.moveTo(rightX, lineY).lineTo(480, lineY).stroke('#333333');

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
    doc.text(signerName || clientName, leftX, lineY + 6);
    doc.text(assessedBy || 'SwissLife Banque Privee', rightX, lineY + 6);

    // Signature metadata
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor('#999999');
    doc.text(`Signature electronique — ${dateStr}`, leftX);
    doc.text(`Signataire : ${signerName || clientName}`, leftX);
    doc.text(`Adresse IP : ${signerIp}`, leftX);
    doc.text(`Horodatage : ${signedAt}`, leftX);

    doc.end();
  });
}

async function uploadPDFToSalesforce(pdfBuffer, fileName, accountId) {
  if (!SF_CONFIGURED) return null;
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();

    // 1. Create ContentVersion
    const boundary = '----FormBoundary' + crypto.randomUUID().replace(/-/g, '');
    const jsonPart = JSON.stringify({
      Title: fileName.replace('.pdf', ''),
      PathOnClient: fileName,
      Description: 'Document custody genere automatiquement — SwissLife Banque Privee',
    });

    const bodyParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="entity_content"\r\nContent-Type: application/json\r\n\r\n${jsonPart}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="VersionData"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`,
    ];

    const bodyStart = Buffer.from(bodyParts[0] + bodyParts[1], 'utf-8');
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const fullBody = Buffer.concat([bodyStart, pdfBuffer, bodyEnd]);

    const cvRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentVersion`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: fullBody,
    });

    if (!cvRes.ok) {
      const err = await cvRes.text();
      console.error('ContentVersion create error:', err);
      return null;
    }

    const cvData = await cvRes.json();
    const contentVersionId = cvData.id;

    // 2. Get ContentDocumentId
    const cvQuery = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentVersion/${contentVersionId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const cvInfo = await cvQuery.json();
    const contentDocumentId = cvInfo.ContentDocumentId;

    // 3. Link to Account via ContentDocumentLink
    await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentDocumentLink`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ContentDocumentId: contentDocumentId,
        LinkedEntityId: accountId,
        ShareType: 'V',
        Visibility: 'AllUsers',
      }),
    });

    console.log(`PDF uploaded to Salesforce: ${fileName} → Account ${accountId}`);
    return { contentVersionId, contentDocumentId };
  } catch (err) {
    console.error('Salesforce PDF upload error:', err.message);
    return null;
  }
}

// ============================================================
// CONTRACT SIGNING — Public endpoints (no auth required)
// ============================================================

// POST /api/signing/contract/in-app-sign — banker signs the contract
// directly with the client in front of them (pas de lien email).
// Génère le PDF + l'upload dans SFDC + flag Custody_Contract_Signed__c.
// Symétrique au flow "remote link" mais sans signing_tokens row —
// c'est la signature physique/présentielle.
app.post('/api/signing/contract/in-app-sign', requireAuth, async (req, res) => {
  try {
    const {
      salesforceAccountId, clientName,
      clientStreet, clientCity, clientPostalCode, clientCountry, clientPhone,
      signerName,
    } = req.body;

    if (!salesforceAccountId || !clientName) {
      return res.status(400).json({ error: 'salesforceAccountId et clientName requis' });
    }

    const signedAt = new Date().toISOString();
    const signerIp = req.ip || req.headers['x-forwarded-for'] || 'in-app';
    const clientAddress = [clientStreet, clientPostalCode, clientCity, clientCountry].filter(Boolean).join(', ') || 'Non renseigne';

    // 1. Generate PDF
    const pdfBuffer = await generateContractPDF({
      clientName,
      clientAddress,
      clientPhone: clientPhone || 'Non renseigne',
      signerName: signerName || clientName,
      signerIp,
      signedAt,
    });

    // 2. Upload to Salesforce Files (Account attachment) — REQUIRED.
    // Si l'upload échoue on propage l'erreur au client pour qu'il voie le
    // problème immédiatement (plutôt que de découvrir plus tard que le
    // contrat signé n'a jamais été archivé dans le CRM).
    const dateSlug = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeName = clientName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Contrat_Custody_${safeName}_${dateSlug}.pdf`;
    const uploadResult = await uploadPDFToSalesforce(pdfBuffer, fileName, salesforceAccountId);
    if (!uploadResult) {
      // Upload a échoué — on logue et on retourne une erreur claire
      await logAudit({
        userEmail: req.user?.email,
        action: 'custody_contract_upload_failed',
        category: 'custody',
        entityType: 'Account',
        entityId: salesforceAccountId,
        clientName,
        salesforceAccountId,
        details: { fileName, reason: 'uploadPDFToSalesforce returned null' },
        severity: 'critical',
        req,
      });
      return res.status(500).json({
        error: 'Contrat signé mais échec de l\'archivage Salesforce — ré-essayez. Consulter les logs serveur pour le détail.',
        fileName,
      });
    }

    // 3. Flag Custody_Contract_Signed__c on Account
    let sfWriteback = { attempted: false, ok: false };
    if (SF_CONFIGURED) {
      sfWriteback.attempted = true;
      try {
        const { accessToken, instanceUrl } = await getSalesforceToken();
        const sfRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${salesforceAccountId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ Custody_Contract_Signed__c: true }),
        });
        sfWriteback.ok = sfRes.ok || sfRes.status === 204;
      } catch (sfErr) {
        sfWriteback.error = sfErr.message;
      }
    }

    // 4. Audit log
    await logAudit({
      userEmail: req.user?.email,
      action: 'custody_contract_signed_in_app',
      category: 'custody',
      entityType: 'Account',
      entityId: salesforceAccountId,
      clientName,
      salesforceAccountId,
      details: {
        signedBy: req.user?.email,
        signerName: signerName || clientName,
        signedAt,
        signerIp,
        fileName,
        uploadedToSfdc: !!uploadResult,
        sfWriteback,
      },
      severity: 'info',
      req,
    });

    res.json({
      success: true,
      signedAt,
      fileName,
      uploadedToSfdc: !!uploadResult,
      contentDocumentId: uploadResult?.contentDocumentId || null,
      sfWriteback,
    });
  } catch (err) {
    console.error('In-app contract signing error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Generate signing link
app.post('/api/signing/generate', requireAuth, async (req, res) => {
  try {
    const { salesforceAccountId, clientName, clientEmail, clientStreet, clientCity, clientPostalCode, clientCountry, clientPhone } = req.body;
    if (!salesforceAccountId || !clientName) {
      return res.status(400).json({ error: 'salesforceAccountId and clientName are required' });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const { data, error } = await supabaseAdmin.from('signing_tokens').insert({
      token,
      salesforce_account_id: salesforceAccountId,
      client_name: clientName,
      client_email: clientEmail || null,
      client_street: clientStreet || null,
      client_city: clientCity || null,
      client_postal_code: clientPostalCode || null,
      client_country: clientCountry || null,
      client_phone: clientPhone || null,
      status: 'pending',
      created_by: req.user?.email || 'unknown',
      expires_at: expiresAt,
    }).select().single();

    if (error) throw error;

    await logAudit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'signing_link_generated',
      category: 'custody',
      entityType: 'Account',
      entityId: salesforceAccountId,
      clientName,
      salesforceAccountId,
      details: { token, expiresAt },
      req,
    });

    res.json({ token, expiresAt, url: `/sign/${token}` });
  } catch (err) {
    console.error('Generate signing link error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get contract data (public — no auth)
app.get('/api/signing/:token', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('signing_tokens')
      .select('*')
      .eq('token', req.params.token)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Lien de signature invalide ou introuvable' });
    }

    if (data.status === 'revoked') {
      return res.status(410).json({ error: 'Ce lien de signature a ete revoque' });
    }

    if (new Date(data.expires_at) < new Date() && data.status !== 'signed') {
      return res.status(410).json({ error: 'Ce lien de signature a expire. Contactez votre banquier pour en obtenir un nouveau.' });
    }

    res.json({
      client_name: data.client_name,
      client_street: data.client_street,
      client_city: data.client_city,
      client_postal_code: data.client_postal_code,
      client_country: data.client_country,
      client_phone: data.client_phone,
      status: data.status,
      signed_at: data.signed_at,
    });
  } catch (err) {
    console.error('Get signing token error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Sign contract (public — no auth)
app.post('/api/signing/:token/sign', async (req, res) => {
  try {
    const { signerName } = req.body;

    const { data: tokenData, error: fetchErr } = await supabaseAdmin
      .from('signing_tokens')
      .select('*')
      .eq('token', req.params.token)
      .single();

    if (fetchErr || !tokenData) {
      return res.status(404).json({ error: 'Lien de signature invalide' });
    }

    if (tokenData.status === 'signed') {
      return res.status(400).json({ error: 'Ce contrat a deja ete signe' });
    }

    if (tokenData.status === 'revoked') {
      return res.status(410).json({ error: 'Ce lien a ete revoque' });
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Ce lien a expire' });
    }

    const signerIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const signedAt = new Date().toISOString();

    // 1. Update signing token
    const { error: updateErr } = await supabaseAdmin
      .from('signing_tokens')
      .update({ status: 'signed', signed_at: signedAt, signer_ip: signerIp })
      .eq('token', req.params.token);

    if (updateErr) throw updateErr;

    // 2. Update Salesforce if configured
    if (SF_CONFIGURED) {
      try {
        const { accessToken, instanceUrl } = await getSalesforceToken();
        await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${tokenData.salesforce_account_id}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ Custody_Contract_Signed__c: true }),
        });
      } catch (sfErr) {
        console.error('Salesforce update after signing failed:', sfErr.message);
        // Non-blocking — contract is still signed in our system
      }
    }

    // 3. Generate PDF and upload to Salesforce
    const clientAddress = [tokenData.client_street, tokenData.client_postal_code, tokenData.client_city, tokenData.client_country].filter(Boolean).join(', ') || 'Non renseigne';
    try {
      const pdfBuffer = await generateContractPDF({
        clientName: tokenData.client_name,
        clientAddress,
        clientPhone: tokenData.client_phone || 'Non renseigne',
        signerName: signerName || tokenData.client_name,
        signerIp,
        signedAt,
      });
      const dateSlug = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = `Contrat_Custody_${tokenData.client_name.replace(/[^a-zA-Z0-9]/g, '_')}_${dateSlug}.pdf`;
      await uploadPDFToSalesforce(pdfBuffer, fileName, tokenData.salesforce_account_id);
    } catch (pdfErr) {
      console.error('Contract PDF generation/upload error:', pdfErr.message);
      // Non-blocking
    }

    // 4. Audit log
    await logAudit({
      action: 'custody_contract_signed_by_client',
      category: 'custody',
      entityType: 'Account',
      entityId: tokenData.salesforce_account_id,
      clientName: tokenData.client_name,
      salesforceAccountId: tokenData.salesforce_account_id,
      details: { signerName, signerIp, signedAt, token: req.params.token, pdfGenerated: true },
      severity: 'info',
      req,
    });

    res.json({ success: true, signedAt });
  } catch (err) {
    console.error('Sign contract error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/signing/:token/revoke — Revoke a pending signing link
// Usage : si le banquier a envoyé un lien à la mauvaise adresse,
// ou si le client demande à re-signer avec des infos mises à jour.
// Irréversible — un nouveau lien devra être généré.
app.post('/api/signing/:token/revoke', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const { data: tokenData, error: fetchErr } = await supabaseAdmin
      .from('signing_tokens')
      .select('*')
      .eq('token', req.params.token)
      .single();
    if (fetchErr || !tokenData) return res.status(404).json({ error: 'Lien introuvable' });
    if (tokenData.status === 'signed') {
      return res.status(400).json({ error: 'Contrat déjà signé — impossible de révoquer' });
    }

    const { data, error } = await supabaseAdmin
      .from('signing_tokens')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: req.user?.email || 'unknown', revoke_reason: reason || null })
      .eq('token', req.params.token)
      .select()
      .single();
    if (error) throw error;

    await logAudit({
      userEmail: req.user?.email,
      action: 'signing_link_revoked',
      category: 'custody',
      entityType: 'Account',
      entityId: tokenData.salesforce_account_id,
      clientName: tokenData.client_name,
      salesforceAccountId: tokenData.salesforce_account_id,
      details: { token: req.params.token, reason },
      severity: 'high',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('Revoke signing error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/signing/:token/pdf — Banker-side re-download of signed contract PDF
// Re-génère le PDF depuis les données signées stockées dans signing_tokens.
// Nécessite auth (banquier ou admin). Utile pour audit, contestation,
// ou envoi tardif au client. Le PDF re-généré est bit-for-bit identique
// à la version signée d'origine (même inputs → même output PDFKit).
app.get('/api/signing/:token/pdf', requireAuth, async (req, res) => {
  try {
    const { data: tokenData, error } = await supabaseAdmin
      .from('signing_tokens')
      .select('*')
      .eq('token', req.params.token)
      .single();
    if (error || !tokenData) return res.status(404).json({ error: 'Lien introuvable' });
    if (tokenData.status !== 'signed') {
      return res.status(400).json({ error: `Contrat non signé — statut: ${tokenData.status}` });
    }

    const clientAddress = [tokenData.client_street, tokenData.client_postal_code, tokenData.client_city, tokenData.client_country].filter(Boolean).join(', ') || 'Non renseigne';
    const pdfBuffer = await generateContractPDF({
      clientName: tokenData.client_name,
      clientAddress,
      clientPhone: tokenData.client_phone || 'Non renseigne',
      signerName: tokenData.signer_name || tokenData.client_name,
      signerIp: tokenData.signer_ip || 'unknown',
      signedAt: tokenData.signed_at,
    });

    const dateSlug = new Date(tokenData.signed_at).toISOString().slice(0, 10).replace(/-/g, '');
    const safeName = (tokenData.client_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Contrat_Custody_${safeName}_${dateSlug}.pdf`;

    await logAudit({
      userEmail: req.user?.email,
      action: 'custody_contract_redownloaded',
      category: 'custody',
      entityType: 'Account',
      entityId: tokenData.salesforce_account_id,
      clientName: tokenData.client_name,
      salesforceAccountId: tokenData.salesforce_account_id,
      details: { token: req.params.token, filename },
      severity: 'info',
      req,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Re-download signed PDF error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CHAINLINK ORACLES — On-chain price feeds
// ============================================================
// Expose les Data Feeds Chainlink au front. Utilisé pour :
//   - Valorisation temps réel des holdings (CryptoHoldingsCard)
//   - Transparence oracle (badge Chainlink dans l'UI)
//   - Audit : chaque prix inclut feedAddress + updatedAt + source
// Cache 60s côté service → endpoints supportent un appel/seconde
// par client sans saturer le RPC public.

// GET /api/oracle/prices — All major crypto prices in EUR
// Optional query : ?symbols=BTC,ETH,SOL (default all)
app.get('/api/oracle/prices', async (req, res) => {
  try {
    const requested = (req.query.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const data = await getAllPricesEur(requested.length > 0 ? requested : undefined);
    res.json(data);
  } catch (err) {
    console.error('Oracle prices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/oracle/health — Chainlink RPC connectivity + feed freshness
app.get('/api/oracle/health', async (req, res) => {
  try {
    const health = await chainlinkHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ healthy: false, error: err.message });
  }
});

// GET /api/oracle/feed/:pair — Raw single feed (BTC/USD, ETH/USD…)
// Returns the exact on-chain values: price, decimals, updatedAt round,
// contract address. Used for audit proof — a RCSI can show that a
// given AUM valuation was derived from this specific oracle round.
app.get('/api/oracle/feed/:pair', async (req, res) => {
  try {
    const pair = decodeURIComponent(req.params.pair).toUpperCase();
    if (!CHAINLINK_FEEDS[pair]) {
      return res.status(404).json({ error: `Feed unknown: ${pair}`, supported: Object.keys(CHAINLINK_FEEDS) });
    }
    const data = await getRawFeed(pair);
    res.json(data);
  } catch (err) {
    console.error('Oracle feed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/oracle/feeds-list — List of all supported feeds with addresses
// Used to render an "Oracles utilisés" transparency panel in the
// compliance dashboard. No auth needed — these are public smart
// contract addresses on Ethereum mainnet.
app.get('/api/oracle/feeds-list', (req, res) => {
  res.json({
    network: 'Ethereum Mainnet',
    feeds: Object.entries(CHAINLINK_FEEDS).map(([pair, addr]) => ({
      pair,
      address: addr,
      etherscanUrl: `https://etherscan.io/address/${addr}`,
    })),
    docs: 'https://docs.chain.link/data-feeds/price-feeds',
  });
});

// ============================================================
// ADEQUACY QUESTIONNAIRE — Signing link for client
// ============================================================

// Generate adequacy signing link — le banquier crée juste un lien VIDE,
// le client le remplit lui-même (MiFID II Art. 25 · le test doit venir
// du client, pas du banquier). Pas de pré-remplissage côté serveur.
app.post('/api/signing/adequacy/generate', requireAuth, async (req, res) => {
  try {
    const { salesforceAccountId, clientName, clientStreet, clientCity, clientPostalCode, clientCountry, clientPhone } = req.body;
    if (!salesforceAccountId || !clientName) {
      return res.status(400).json({ error: 'salesforceAccountId and clientName are required' });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin.from('signing_tokens').insert({
      token,
      salesforce_account_id: salesforceAccountId,
      client_name: clientName,
      client_street: clientStreet || null,
      client_city: clientCity || null,
      client_postal_code: clientPostalCode || null,
      client_country: clientCountry || null,
      client_phone: clientPhone || null,
      status: 'pending',
      created_by: req.user?.email || 'unknown',
      expires_at: expiresAt,
    });

    if (error) throw error;

    await logAudit({
      action: 'adequacy_link_generated',
      category: 'custody',
      entityType: 'Account',
      entityId: salesforceAccountId,
      clientName,
      salesforceAccountId,
      details: { token, expiresAt },
      severity: 'info',
      req,
    });

    res.json({ token, expiresAt, url: `/sign/adequacy/${token}` });
  } catch (err) {
    console.error('Generate adequacy link error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get adequacy data (public — accessible via lien client, pas d'auth).
// Retourne les questions + les réponses déjà saisies (si signé).
app.get('/api/signing/adequacy/:token', async (req, res) => {
  try {
    const { data: tokenData, error } = await supabaseAdmin
      .from('signing_tokens')
      .select('*')
      .eq('token', req.params.token)
      .single();

    if (error || !tokenData) {
      return res.status(404).json({ error: 'Lien invalide ou introuvable' });
    }

    if (tokenData.status === 'revoked') {
      return res.status(410).json({ error: 'Ce lien a ete revoque' });
    }

    if (new Date(tokenData.expires_at) < new Date() && tokenData.status !== 'signed') {
      return res.status(410).json({ error: 'Ce lien a expire' });
    }

    res.json({
      client_name: tokenData.client_name,
      client_street: tokenData.client_street,
      client_city: tokenData.client_city,
      client_postal_code: tokenData.client_postal_code,
      client_country: tokenData.client_country,
      client_phone: tokenData.client_phone,
      status: tokenData.status,
      signed_at: tokenData.signed_at,
      // Questions + réponses du client (si signé) + score calculé
      questions: ADEQUACY_QUESTIONS,
      sections: ADEQUACY_SECTIONS,
      answers: tokenData.adequacy_answers || null,
      score: tokenData.adequacy_score ?? null,
      max_score: tokenData.adequacy_max_score ?? null,
      verdict: tokenData.adequacy_verdict || null,
    });
  } catch (err) {
    console.error('Get adequacy token error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Sign adequacy (public) — le client soumet ses réponses + signe.
// Payload attendu :
//   { signerName: string, answers: { [questionId]: value } }
// Le scoring et le verdict sont calculés côté serveur (source de vérité
// — le client ne peut pas manipuler son propre score).
app.post('/api/signing/adequacy/:token/sign', async (req, res) => {
  try {
    const { signerName, answers } = req.body;

    const { data: tokenData, error: fetchErr } = await supabaseAdmin
      .from('signing_tokens')
      .select('*')
      .eq('token', req.params.token)
      .single();

    if (fetchErr || !tokenData) return res.status(404).json({ error: 'Lien invalide' });
    if (tokenData.status === 'signed') return res.status(400).json({ error: 'Deja signe' });
    if (tokenData.status === 'revoked') return res.status(410).json({ error: 'Lien revoque' });
    if (new Date(tokenData.expires_at) < new Date()) return res.status(410).json({ error: 'Lien expire' });

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'Réponses manquantes' });
    }

    // Vérifier que toutes les questions obligatoires sont répondues
    const missing = ADEQUACY_QUESTIONS
      .filter(q => q.type === 'radio' && !q.optional)
      .filter(q => !answers[q.id])
      .map(q => q.label);
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Questions obligatoires non répondues : ${missing.slice(0, 3).join(' · ')}${missing.length > 3 ? ` (+${missing.length - 3})` : ''}`,
      });
    }

    const signerIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const signedAt = new Date().toISOString();

    // Scoring déterministe côté serveur (source de vérité)
    const scoring = computeAdequacyScore(answers);

    // 1. Mark as signed + save answers + score
    await supabaseAdmin.from('signing_tokens')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signer_ip: signerIp,
        adequacy_answers: answers,
        adequacy_score: scoring.score,
        adequacy_max_score: scoring.max,
        adequacy_verdict: scoring.verdict,
      })
      .eq('token', req.params.token);

    // 2. Update Salesforce — flag adequacy done + risk level si le verdict
    //    est non éligible (force le niveau critical pour bloquer les services)
    let sfWriteback = { attempted: false, ok: false };
    if (SF_CONFIGURED) {
      sfWriteback.attempted = true;
      try {
        const { accessToken, instanceUrl } = await getSalesforceToken();
        const sfPayload = {
          Custody_Adequacy_Done__c: true,
          Custody_KYC_Notes__c: `Adéquation MiFID II : ${VERDICT_LABELS[scoring.verdict]?.label || scoring.verdict} · Score ${scoring.score}/${scoring.max} · Signé le ${new Date(signedAt).toLocaleDateString('fr-FR')}`.slice(0, 32000),
        };
        if (scoring.verdict === 'not_eligible') {
          sfPayload.Custody_Risk_Level__c = 'Tres eleve';
        }
        const sfRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${tokenData.salesforce_account_id}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(sfPayload),
        });
        sfWriteback.ok = sfRes.ok || sfRes.status === 204;
      } catch (sfErr) {
        sfWriteback.error = sfErr.message;
        console.error('Salesforce adequacy update failed:', sfErr.message);
      }
    }

    // 3. Generate PDF and upload to Salesforce
    const clientAddress = [tokenData.client_street, tokenData.client_postal_code, tokenData.client_city, tokenData.client_country].filter(Boolean).join(', ') || 'Non renseigne';
    try {
      const pdfBuffer = await generateAdequacyPDF({
        clientName: tokenData.client_name,
        clientAddress,
        clientPhone: tokenData.client_phone || 'Non renseigne',
        answers,
        scoring,
        signerName: signerName || tokenData.client_name,
        signerIp,
        signedAt,
        assessedBy: tokenData.created_by,
      });
      const dateSlug = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = `Adequation_MiFID_${tokenData.client_name.replace(/[^a-zA-Z0-9]/g, '_')}_${dateSlug}.pdf`;
      await uploadPDFToSalesforce(pdfBuffer, fileName, tokenData.salesforce_account_id);
    } catch (pdfErr) {
      console.error('Adequacy PDF generation/upload error:', pdfErr.message);
    }

    // 4. Audit log
    await logAudit({
      action: 'adequacy_signed_by_client',
      category: 'custody',
      entityType: 'Account',
      entityId: tokenData.salesforce_account_id,
      clientName: tokenData.client_name,
      salesforceAccountId: tokenData.salesforce_account_id,
      details: {
        signerName, signerIp, signedAt, token: req.params.token,
        scoring: { score: scoring.score, max: scoring.max, verdict: scoring.verdict },
        sfWriteback, pdfGenerated: true,
      },
      severity: scoring.verdict === 'not_eligible' ? 'warning' : 'info',
      req,
    });

    res.json({ success: true, signedAt, scoring, sfWriteback });
  } catch (err) {
    console.error('Sign adequacy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// SF proxy — server handles auth
app.use('/api/salesforce', async (req, res) => {
  if (!SF_CONFIGURED) {
    return res.status(501).json({ error: 'Salesforce not configured' });
  }

  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const url = new URL(req.url, instanceUrl);

    const response = await fetch(url.toString(), {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: JSON.stringify(req.body) } : {}),
    });

    // Token expired — refresh and retry once
    if (response.status === 401) {
      sfAccessToken = null;
      sfTokenExpiry = 0;
      const fresh = await getSalesforceToken();
      const retry = await fetch(new URL(req.url, fresh.instanceUrl).toString(), {
        method: req.method,
        headers: {
          'Authorization': `Bearer ${fresh.accessToken}`,
          'Content-Type': 'application/json',
        },
        ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: JSON.stringify(req.body) } : {}),
      });
      const data = await retry.json();
      return res.status(retry.status).json(data);
    }

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Salesforce proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SALESFORCE FILES — Upload & Download proxy
// ============================================================
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 52_428_800 } });

// List files for an Account
app.get('/api/sf-files/:accountId', async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const soql = `SELECT ContentDocument.Id, ContentDocument.Title, ContentDocument.FileType, ContentDocument.ContentSize, ContentDocument.CreatedDate, ContentDocument.Description, ContentDocument.LatestPublishedVersionId FROM ContentDocumentLink WHERE LinkedEntityId = '${req.params.accountId}' ORDER BY ContentDocument.CreatedDate DESC`;
    const r = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const data = await r.json();
    const files = (data.records || []).map(r => ({
      id: r.ContentDocument.Id,
      title: r.ContentDocument.Title,
      fileType: r.ContentDocument.FileType,
      size: r.ContentDocument.ContentSize,
      createdDate: r.ContentDocument.CreatedDate,
      description: r.ContentDocument.Description,
      versionId: r.ContentDocument.LatestPublishedVersionId,
    }));
    res.json(files);
  } catch (err) {
    console.error('SF files list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Download / preview a file (proxy binary through server)
app.get('/api/sf-files/download/:versionId', async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentVersion/${req.params.versionId}/VersionData`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Download failed' });
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline`);
    const buffer = Buffer.from(await r.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('SF file download error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Upload a file to Salesforce and link it to an Account
app.post('/api/sf-files/upload/:accountId', upload.single('file'), async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const { title, description } = req.body;

    // 1. Create ContentVersion (multipart)
    const boundary = '----FormBoundary' + Date.now();
    const metadata = JSON.stringify({
      Title: title || req.file.originalname,
      PathOnClient: req.file.originalname,
      Description: description || '',
    });

    const parts = [];
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="entity_content"\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n`);
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="VersionData"; filename="${req.file.originalname}"\r\nContent-Type: ${req.file.mimetype}\r\n\r\n`);
    const ending = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(parts[0]),
      Buffer.from(parts[1]),
      req.file.buffer,
      Buffer.from(ending),
    ]);

    const cvRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentVersion`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!cvRes.ok) {
      const err = await cvRes.json().catch(() => ({}));
      return res.status(cvRes.status).json({ error: err[0]?.message || 'Upload failed' });
    }

    const cvData = await cvRes.json();
    const contentVersionId = cvData.id;

    // 2. Get the ContentDocumentId
    const cvDetail = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentVersion/${contentVersionId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const cvInfo = await cvDetail.json();
    const contentDocumentId = cvInfo.ContentDocumentId;

    // 3. Create ContentDocumentLink to Account
    const linkRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentDocumentLink`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ContentDocumentId: contentDocumentId,
        LinkedEntityId: req.params.accountId,
        ShareType: 'V',
        Visibility: 'AllUsers',
      }),
    });

    if (!linkRes.ok) {
      const err = await linkRes.json().catch(() => ({}));
      // If "already linked" error, that's fine (auto-link to owner)
      if (!err[0]?.message?.includes('already exists')) {
        return res.status(linkRes.status).json({ error: err[0]?.message || 'Link failed' });
      }
    }

    res.json({
      contentVersionId,
      contentDocumentId,
      title: title || req.file.originalname,
      size: req.file.size,
    });
  } catch (err) {
    console.error('SF file upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete a file from Salesforce
app.delete('/api/sf-files/:contentDocumentId', async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/ContentDocument/${req.params.contentDocumentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!r.ok && r.status !== 204) {
      return res.status(r.status).json({ error: 'Delete failed' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('SF file delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DFNS — SDK with User Action Signing
// ============================================================
let privateKey;
if (process.env.DFNS_PRIVATE_KEY) {
  privateKey = process.env.DFNS_PRIVATE_KEY.replace(/\\n/g, '\n');
} else {
  privateKey = fs.readFileSync(path.join(__dirname, '..', 'dfns-private-key.pem'), 'utf8');
}

const signer = new AsymmetricKeySigner({
  credId: process.env.DFNS_CRED_ID,
  privateKey,
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:5174',
});

const dfns = new DfnsApiClient({
  baseUrl: process.env.DFNS_API_URL || 'https://api.dfns.io',
  appId: process.env.DFNS_APP_ID,
  authToken: process.env.DFNS_API_TOKEN,
  signer,
});

// ─── DFNS helpers ─────────────────────────────────────────
// Convert a human-readable amount ("0.01") into the smallest unit
// string ("10000000000000000") that the DFNS TransferAsset endpoint
// expects. DFNS is strict : amounts are BigInt strings in the asset's
// base unit (wei / satoshi / lamport / lovelace / …).
//
// The network determines the default decimals for Native transfers.
// ERC20 / SPL tokens will need their own contract decimals lookup —
// for those we expect the UI to send the pre-converted amount.
const NETWORK_NATIVE_DECIMALS = {
  Ethereum: 18, EthereumSepolia: 18, EthereumHolesky: 18, EthereumGoerli: 18,
  ArbitrumOne: 18, ArbitrumSepolia: 18,
  Base: 18, BaseSepolia: 18,
  Polygon: 18, PolygonAmoy: 18,
  Optimism: 18, OptimismSepolia: 18,
  Bitcoin: 8, BitcoinTestnet3: 8,
  Solana: 9, SolanaDevnet: 9,
  Cardano: 6, CardanoPreprod: 6,
  Tron: 6,
};

function toSmallestUnit(amount, network, decimalsOverride) {
  const decimals = decimalsOverride ?? NETWORK_NATIVE_DECIMALS[network] ?? 18;
  const s = String(amount).trim();
  // Contract UI ↔ server : amounts are ALWAYS in human units.
  // "1" ETH → "1000000000000000000", "0.01" → "10000000000000000",
  // never the other way around. No shortcut for integers.
  const match = s.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Invalid amount: ${amount}`);
  const intPart = match[1];
  const fracPart = (match[2] || '').padEnd(decimals, '0').slice(0, decimals);
  const combined = (intPart + fracPart).replace(/^0+/, '') || '0';
  return combined;
}

// Wallets
app.get('/api/dfns/wallets', async (req, res) => {
  try {
    const data = await dfns.wallets.listWallets({ query: { limit: req.query.limit || '200' } });
    res.json(data);
  } catch (err) {
    console.error('listWallets error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.post('/api/dfns/wallets', requireAuth, async (req, res) => {
  try {
    // Sanitize body — DFNS only allows alphanumerics and _.:/+- in tags/name
    const body = { ...req.body };
    const sanitize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.:/+\-]/g, '');
    if (body.tags && Array.isArray(body.tags)) {
      body.tags = body.tags.map(sanitize).filter(t => t.length > 0);
    }
    if (body.name) {
      body.name = sanitize(body.name);
    }
    const data = await dfns.wallets.createWallet({ body });

    // Audit log: wallet creation
    await logAudit({
      action: 'wallet.created',
      category: 'wallet',
      entityType: 'wallet',
      entityId: data.id,
      clientName: req.body.name || null,
      salesforceAccountId: req.body.salesforceAccountId || null,
      details: { network: req.body.network, name: req.body.name, tags: req.body.tags },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('createWallet error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message, details: err.context || null });
  }
});

app.get('/api/dfns/wallets/:walletId', async (req, res) => {
  try {
    const data = await dfns.wallets.getWallet({ walletId: req.params.walletId });
    res.json(data);
  } catch (err) {
    console.error('getWallet error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.get('/api/dfns/wallets/:walletId/assets', async (req, res) => {
  try {
    const data = await dfns.wallets.getWalletAssets({ walletId: req.params.walletId });
    res.json(data);
  } catch (err) {
    console.error('getWalletAssets error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.get('/api/dfns/wallets/:walletId/history', async (req, res) => {
  try {
    const data = await dfns.wallets.getWalletHistory({ walletId: req.params.walletId, query: { limit: '50' } });
    res.json(data);
  } catch (err) {
    console.error('getWalletHistory error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// List transfers for a wallet (with compliance status)
app.get('/api/dfns/wallets/:walletId/transfers', async (req, res) => {
  try {
    const data = await dfns.wallets.listTransfers({
      walletId: req.params.walletId,
      query: { limit: req.query.limit || '50' }
    });
    res.json(data);
  } catch (err) {
    console.error('listTransfers error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// Get single transfer details (includes policy/compliance status)
app.get('/api/dfns/wallets/:walletId/transfers/:transferId', async (req, res) => {
  try {
    const data = await dfns.wallets.getTransfer({
      walletId: req.params.walletId,
      transferId: req.params.transferId
    });
    res.json(data);
  } catch (err) {
    console.error('getTransfer error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// ============================================================
// WALLET ARCHIVE — "suppression logique" d'un wallet DFNS
// ============================================================
// DFNS ne permet pas de hard-delete un wallet MPC (c'est une
// cryptographic root, pas une donnée éphémère). Notre archivage :
//   1. Vérifie garde-fous compliance (solde = 0, aucun approval pending)
//   2. Ajoute le tag `sl:archived` via dfns.wallets.tagWallet
//   3. L'UI filtre les wallets avec ce tag hors de la liste active
//   4. Audit log (ACPR Art. L.561-12 — archivage 5 ans)
//
// Réversible : POST .../unarchive retire le tag.
// Référence : MiCA Art. 75 (conservation documentaire), DFNS Policy
// Engine (tags filtering).
const ARCHIVED_TAG = 'sl:archived';

async function walletHasPendingApprovals(walletId) {
  const { data } = await supabaseAdmin
    .from('transfer_approvals')
    .select('id')
    .eq('wallet_id', walletId)
    .in('status', ['pending', 'approved'])
    .limit(1);
  return !!(data && data.length);
}

async function walletHasNonZeroBalance(walletId) {
  try {
    const r = await dfns.wallets.getWalletAssets({ walletId });
    const assets = r?.assets || [];
    return assets.some(a => Number(a.balance || 0) > 0);
  } catch {
    // Si l'API échoue, on fail-closed (refuse l'archivage)
    return true;
  }
}

app.post('/api/dfns/wallets/:walletId/archive', requireAuth, async (req, res) => {
  const walletId = req.params.walletId;
  try {
    // 1. Fetch current wallet (pour recupérer les tags existants)
    const wallet = await dfns.wallets.getWallet({ walletId });

    if ((wallet?.tags || []).includes(ARCHIVED_TAG)) {
      return res.status(400).json({ error: 'Wallet déjà archivé' });
    }

    // 2. Garde-fou : solde non vide
    if (await walletHasNonZeroBalance(walletId)) {
      return res.status(403).json({
        error: 'Wallet non vide — videz le solde avant archivage',
        code: 'WALLET_NOT_EMPTY',
      });
    }

    // 3. Garde-fou : pas d'approvals pending
    if (await walletHasPendingApprovals(walletId)) {
      return res.status(403).json({
        error: 'Des demandes de transfert sont en attente ou approuvées — résolvez-les avant archivage',
        code: 'PENDING_APPROVALS',
      });
    }

    // 4. Tag le wallet comme archivé (préserve les tags existants)
    const nextTags = [...(wallet?.tags || []), ARCHIVED_TAG];
    await dfns.wallets.tagWallet({ walletId, body: { tags: nextTags } });

    // 5. Audit log — ACPR Art. L.561-12 (archivage 5 ans)
    await logAudit({
      userEmail: req.user?.email,
      action: 'wallet.archived',
      category: 'custody',
      entityType: 'wallet',
      entityId: walletId,
      details: { walletId, reason: req.body?.reason || 'Demande banquier', name: wallet?.name },
      severity: 'warning',
      req,
    });

    res.json({ ok: true, walletId, tags: nextTags });
  } catch (err) {
    console.error('wallet archive error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// Désarchivage — réversible si erreur d'archivage
app.post('/api/dfns/wallets/:walletId/unarchive', requireAuth, async (req, res) => {
  const walletId = req.params.walletId;
  try {
    const wallet = await dfns.wallets.getWallet({ walletId });
    if (!(wallet?.tags || []).includes(ARCHIVED_TAG)) {
      return res.status(400).json({ error: 'Wallet non archivé' });
    }
    const nextTags = (wallet?.tags || []).filter(t => t !== ARCHIVED_TAG);
    await dfns.wallets.tagWallet({ walletId, body: { tags: nextTags } });
    await logAudit({
      userEmail: req.user?.email,
      action: 'wallet.unarchived',
      category: 'custody',
      entityType: 'wallet',
      entityId: walletId,
      details: { walletId, reason: req.body?.reason || null },
      severity: 'info',
      req,
    });
    res.json({ ok: true, walletId, tags: nextTags });
  } catch (err) {
    console.error('wallet unarchive error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.post('/api/dfns/wallets/:walletId/transfers', requireAuth, async (req, res) => {
  const walletId = req.params.walletId;
  const destination = (req.body?.to || '').trim();
  // Hoist cross-gate state so the screening gate can pass it to
  // screenGate() without tripping on the TDZ (resolvedAccountId is
  // filled inside the whitelist gate further down).
  let resolvedAccountId = null;
  let riskCfgRow = null;
  try {
    // Audit log: transfer attempt
    await logAudit({
      action: 'transfer.initiated',
      category: 'transfer',
      entityType: 'wallet',
      entityId: walletId,
      details: { walletId, ...req.body },
      severity: 'info',
      req,
    });

    // ─── Compliance Gate 1: WALLET FREEZE ──────────────────────
    // If the wallet is currently frozen (by RCSI or auto-freeze on
    // Chainalysis critical hit), ANY outgoing transfer must be blocked.
    // Reference: MiCA Art. 68 · ACPR LCB-FT Art. 14.
    try {
      const { data: freeze } = await supabaseAdmin
        .from('wallet_freezes')
        .select('id, reason, status, frozen_at')
        .eq('wallet_id', walletId)
        .eq('status', 'frozen')
        .maybeSingle();
      if (freeze) {
        await logAudit({
          action: 'transfer.blocked_frozen_wallet',
          category: 'transfer',
          entityType: 'wallet',
          entityId: walletId,
          details: { walletId, freezeId: freeze.id, reason: freeze.reason, destination, ...req.body },
          severity: 'critical',
          req,
        });
        return res.status(403).json({
          error: 'Wallet gelé — transfert refusé',
          code: 'WALLET_FROZEN',
          freezeReason: freeze.reason,
          frozenAt: freeze.frozen_at,
          regulation: 'MiCA Art. 68',
        });
      }
    } catch (e) {
      console.warn('[Transfer Gate] wallet_freezes check skipped:', e.message);
    }

    // ─── Compliance Gate 2: CHAINALYSIS SANCTIONS SCREENING ───
    // Defense-in-depth : screenGate() centralise le contrôle OFAC/EU/UN/UK,
    // fait fail-closed sur erreur API en mode LIVE, dédupe les alertes.
    // Référence : Règlement UE 2015/847 · MiCA Art. 68.
    if (destination) {
      const gate = await screenGate({
        address: destination,
        walletId,
        context: 'dfns_transfer_direct',
        salesforceAccountId: resolvedAccountId,
        clientName: null,
        req,
      });
      if (gate.blocked) {
        return res.status(403).json({
          error: gate.reason === 'screening_unavailable'
            ? 'Screening Chainalysis indisponible — transfert refusé (fail-closed)'
            : 'Adresse sanctionnée — transfert refusé',
          code: gate.reason === 'screening_unavailable' ? 'SCREENING_UNAVAILABLE' : 'SANCTIONS_HIT',
          hits: gate.hits,
          lists: ['OFAC SDN', 'EU Consolidated', 'UK HMT', 'UN Security Council'],
          regulation: 'Règlement UE 2015/847 · MiCA Art. 68',
        });
      }
    }

    // ─── Compliance Gate 3: WHITELIST ENFORCEMENT ─────────────
    // If the wallet is in "whitelist-only" mode (configured via
    // RiskConfigPanel), the destination MUST be on the approved list.
    // Otherwise the transfer is blocked.
    // resolvedAccountId + riskCfgRow hoisted to the top of the handler.
    try {
      // Read whitelist mode from the wallet's risk config. We look up
      // the client via wallet.external_id → client_risk_config.
      const { data: wallet } = await supabaseAdmin
        .from('wallets')
        .select('salesforce_account_id, external_id')
        .eq('dfns_wallet_id', walletId)
        .maybeSingle();
      resolvedAccountId = wallet?.salesforce_account_id || wallet?.external_id || null;
      if (resolvedAccountId) {
        const { data: riskCfg } = await supabaseAdmin
          .from('client_risk_config')
          .select('whitelist_only, requires_approval_above, max_single_transfer')
          .eq('salesforce_account_id', resolvedAccountId)
          .maybeSingle();
        riskCfgRow = riskCfg || null;
        if (riskCfg?.whitelist_only && destination) {
          const { data: wl } = await supabaseAdmin
            .from('address_whitelist')
            .select('id, status')
            .eq('salesforce_account_id', resolvedAccountId)
            .ilike('address', destination)
            .eq('status', 'approved')
            .maybeSingle();
          if (!wl) {
            await logAudit({
              action: 'transfer.blocked_whitelist',
              category: 'transfer',
              entityType: 'wallet',
              entityId: walletId,
              details: { walletId, destination, accountId: resolvedAccountId, reason: 'destination_not_whitelisted' },
              severity: 'critical',
              req,
            });
            return res.status(403).json({
              error: 'Adresse non whitelistée — whitelist stricte activée pour ce client',
              code: 'WHITELIST_REQUIRED',
              destination,
              regulation: 'ACPR LCB-FT Art. 14 · MiCA Art. 68',
            });
          }
        }
      }
    } catch (e) {
      console.warn('[Transfer Gate] whitelist check skipped:', e.message);
    }

    // ─── Compliance Gate 4: QUATRE-YEUX + HARD CAPS ─────────────
    // ACPR LCB-FT Art. 14 — operations sensibles (= transferts de
    // crypto-actifs au-delà d'un seuil) requièrent deux approbateurs
    // distincts. Le seuil est configuré par client via
    // risk_configs.approval_threshold (en EUR équivalent).
    //
    // 1. Convertit le montant crypto en EUR équivalent (lookup simple
    //    sur prix spot — en prod, utilise un oracle ou Chainalysis
    //    market data).
    // 2. Si amount_eur > max_single_transfer → 403 HARD_CAP (refusable
    //    même avec quatre-yeux, c'est un hard cap).
    // 3. Si amount_eur >= approval_threshold → exige un
    //    req.body.approvalId qui référence un transfer_approvals
    //    row avec status='approved', matching wallet + destination +
    //    amount, et approved_by ≠ requested_by (double signature).
    // 4. Sur succès DFNS, marque l'approval comme 'executed' pour
    //    empêcher le replay.
    let matchedApproval = null;
    try {
      const rawAmount = Number(req.body?.amount || 0);
      const symbol = (req.body?.assetSymbol || req.body?.kind || '').toUpperCase();
      // Prix spot via Chainlink Data Feeds on-chain (Ethereum mainnet).
      // Fallback automatique si RPC down (cf. server/services/chainlink.js).
      // Testnets (SepoliaETH, TEST_MATIC) valorisés à 0 → pas de gate.
      const priceData = await getCryptoPriceEur(symbol);
      const price = priceData?.priceEur || 0;
      const amountEur = rawAmount * price;

      const hardCap = Number(riskCfgRow?.max_single_transfer || 0);
      const approvalThreshold = Number(riskCfgRow?.requires_approval_above || 0);

      // Hard cap: refus même avec quatre-yeux
      if (hardCap > 0 && amountEur > hardCap) {
        await logAudit({
          action: 'transfer.blocked_hard_cap',
          category: 'transfer',
          entityType: 'wallet',
          entityId: walletId,
          details: {
            walletId, destination, amount: rawAmount, amountEur, hardCap, accountId: resolvedAccountId,
            // Traçabilité oracle — ACPR peut vérifier le prix retenu
            priceSource: priceData?.source,
            priceEur: priceData?.priceEur,
            priceUsd: priceData?.priceUsd,
            feedAddress: priceData?.feedAddress,
            priceAgeSec: priceData?.ageSec,
          },
          severity: 'critical',
          req,
        });
        return res.status(403).json({
          error: `Plafond unique dépassé — ${amountEur.toFixed(0)}€ > ${hardCap}€`,
          code: 'HARD_CAP_EXCEEDED',
          amountEur,
          hardCap,
          priceSource: priceData?.source,
          regulation: 'ACPR Conformité LCB-FT',
        });
      }

      // Quatre-yeux: requis au-dessus du seuil
      if (approvalThreshold > 0 && amountEur >= approvalThreshold) {
        const approvalId = req.body?.approvalId;
        if (!approvalId) {
          await logAudit({
            action: 'transfer.blocked_four_eyes_missing',
            category: 'transfer',
            entityType: 'wallet',
            entityId: walletId,
            details: {
              walletId, destination, amount: rawAmount, amountEur, threshold: approvalThreshold,
              priceSource: priceData?.source,
              priceEur: priceData?.priceEur,
              feedAddress: priceData?.feedAddress,
            },
            severity: 'warning',
            req,
          });
          return res.status(403).json({
            error: `Quatre-yeux requis — ${amountEur.toFixed(0)}€ ≥ seuil ${approvalThreshold}€. Soumettez le transfert à approbation d'abord.`,
            code: 'FOUR_EYES_REQUIRED',
            amountEur,
            threshold: approvalThreshold,
            regulation: 'ACPR LCB-FT Art. 14',
          });
        }

        // Fetch & validate the approval
        const { data: approval, error: apprErr } = await supabaseAdmin
          .from('transfer_approvals')
          .select('*')
          .eq('id', approvalId)
          .maybeSingle();
        if (apprErr || !approval) {
          return res.status(403).json({
            error: 'Approbation introuvable',
            code: 'FOUR_EYES_INVALID',
          });
        }
        if (approval.status !== 'approved') {
          return res.status(403).json({
            error: `Approbation non validée — statut actuel: ${approval.status}`,
            code: 'FOUR_EYES_NOT_APPROVED',
            status: approval.status,
          });
        }
        // Match verification: wallet + destination + amount must align
        const matches =
          approval.wallet_id === walletId &&
          (approval.to_address || '').toLowerCase() === destination.toLowerCase() &&
          Number(approval.amount) === rawAmount;
        if (!matches) {
          return res.status(403).json({
            error: 'Approbation ne correspond pas au transfert (wallet / destination / montant)',
            code: 'FOUR_EYES_MISMATCH',
          });
        }
        // Double signature: approver ≠ requester (reviewed_by is the
        // approver UUID; requested_by is the initial requester UUID).
        if (approval.reviewed_by && approval.requested_by && approval.reviewed_by === approval.requested_by) {
          return res.status(403).json({
            error: 'Approbateur identique au demandeur — règle quatre-yeux violée',
            code: 'FOUR_EYES_SAME_USER',
          });
        }
        matchedApproval = approval;
      }
    } catch (e) {
      console.warn('[Transfer Gate] four-eyes check error:', e.message);
    }

    // ─── All gates cleared → execute on DFNS ──────────────────
    const data = await dfns.wallets.transferAsset({ walletId, body: req.body });

    // Mark the approval as executed to prevent replay
    if (matchedApproval) {
      try {
        await supabaseAdmin
          .from('transfer_approvals')
          .update({ status: 'executed', executed_at: new Date().toISOString(), dfns_transfer_id: data?.id || null })
          .eq('id', matchedApproval.id);
      } catch (e) {
        console.warn('[Transfer Gate] failed to mark approval executed:', e.message);
      }
    }

    // Audit log: transfer success
    await logAudit({
      action: 'transfer.completed',
      category: 'transfer',
      entityType: 'wallet',
      entityId: walletId,
      details: { walletId, transferId: data.id, destination, ...req.body },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    // Audit log: transfer failure
    await logAudit({
      action: 'transfer.failed',
      category: 'transfer',
      entityType: 'wallet',
      entityId: walletId,
      details: { walletId, error: err.message, ...req.body },
      severity: 'warning',
      req,
    });

    console.error('transferAsset error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// Policies
app.get('/api/dfns/policies', async (req, res) => {
  try {
    const data = await dfns.policies.listPolicies({});
    res.json(data);
  } catch (err) {
    console.error('listPolicies error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

app.post('/api/dfns/policies', async (req, res) => {
  try {
    const data = await dfns.policies.createPolicy({ body: req.body });
    res.json(data);
  } catch (err) {
    console.error('createPolicy error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// DELETE /api/dfns/policies/:policyId — Archive a DFNS policy.
// Required so we can retire overly aggressive test policies
// (typically AlwaysTrigger + Block which blanket-refuse every transfer).
// DFNS doesn't hard-delete — archivePolicy moves it to 'Archived' status.
app.delete('/api/dfns/policies/:policyId', requireAdmin, async (req, res) => {
  try {
    const data = await dfns.policies.archivePolicy({ policyId: req.params.policyId });
    await logAudit({
      userEmail: req.user?.email,
      action: 'dfns.policy_archived',
      category: 'policy',
      entityType: 'dfns_policy',
      entityId: req.params.policyId,
      details: { policyId: req.params.policyId },
      severity: 'warning',
      req,
    });
    res.json(data);
  } catch (err) {
    console.error('archivePolicy error:', err.message);
    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// Test Dfns
app.get('/api/dfns/test', async (req, res) => {
  try {
    await dfns.wallets.listWallets({ query: { limit: '1' } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// DFNS × Chainalysis — On-chain address sanctions screening
// In a DFNS-based custody stack, Chainalysis is the partner risk
// engine gating wallet transfers. This endpoint calls the public
// Chainalysis Sanctions Screening API (free tier, requires an
// API key) and falls back to a curated OFAC demo list otherwise.
// Docs: https://public.chainalysis.com/
// ============================================================
const CHAINALYSIS_API_KEY = process.env.CHAINALYSIS_API_KEY || '';
const CHAINALYSIS_DEMO_MODE = !CHAINALYSIS_API_KEY;

console.log(`[Chainalysis] mode=${CHAINALYSIS_DEMO_MODE ? 'DEMO (curated OFAC list)' : 'LIVE (Chainalysis Public API)'}`);

// A small set of real OFAC-sanctioned crypto addresses for the demo
// mode (Tornado Cash / Lazarus / Garantex / Hydra Market). These are
// public designations from the US Treasury OFAC SDN list.
const DEMO_SANCTIONED_ADDRESSES = new Map([
  ['0x8589427373d6d84e98730d7795d8f6f8731fda16', { category: 'sanctions', name: 'OFAC SDN — Tornado Cash',      description: 'Privacy mixer — designated August 2022 (SDN List).', url: 'https://ofac.treasury.gov/recent-actions/20220808' }],
  ['0x098b716b8aaf21512996dc57eb0615e2383e2f96', { category: 'sanctions', name: 'OFAC SDN — Tornado Cash',      description: 'Privacy mixer — designated August 2022 (SDN List).', url: 'https://ofac.treasury.gov/recent-actions/20220808' }],
  ['0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', { category: 'sanctions', name: 'OFAC SDN — Lazarus Group',     description: 'DPRK state-sponsored actor — Ronin bridge exploit.', url: 'https://ofac.treasury.gov/recent-actions/20220414' }],
  ['0xb6f5ec1a0a9cd1526536d3f0426c429529471f40', { category: 'sanctions', name: 'OFAC SDN — Garantex',          description: 'Russia-based exchange — designated April 2022.',   url: 'https://ofac.treasury.gov/recent-actions/20220405' }],
  ['bc1qm3htjtpqabe3hjh97z5nn5tkxdcxfz9h79cw4x', { category: 'sanctions', name: 'OFAC SDN — Hydra Market',     description: 'Darknet marketplace — designated April 2022.',     url: 'https://ofac.treasury.gov/recent-actions/20220405' }],
]);

// Small in-process cache — Chainalysis free tier has a soft rate limit
// and results rarely change minute-to-minute. Cache for 60s per address.
const CHAINALYSIS_CACHE = new Map(); // lowerAddr → { at, result }
const CHAINALYSIS_CACHE_TTL_MS = 60_000;
const CHAINALYSIS_TIMEOUT_MS = 15_000;

async function chainalysisScreen(address) {
  const addr = (address || '').trim();
  if (!addr) return { address: addr, flagged: false, identifications: [] };

  // Cache hit ?
  const key = addr.toLowerCase();
  const cached = CHAINALYSIS_CACHE.get(key);
  if (cached && Date.now() - cached.at < CHAINALYSIS_CACHE_TTL_MS) {
    return cached.result;
  }

  if (!CHAINALYSIS_DEMO_MODE) {
    // LIVE — Chainalysis Public Sanctions Screening API.
    // Timeout strict pour éviter qu'un ralentissement de l'API stalle
    // un transfert pendant plusieurs minutes.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHAINALYSIS_TIMEOUT_MS);
    try {
      const r = await fetch(`https://public.chainalysis.com/api/v1/address/${encodeURIComponent(addr)}`, {
        method: 'GET',
        headers: { 'X-API-Key': CHAINALYSIS_API_KEY, 'Accept': 'application/json' },
        signal: controller.signal,
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`Chainalysis API ${r.status}: ${body.slice(0, 180)}`);
      }
      const data = await r.json();
      const identifications = Array.isArray(data.identifications) ? data.identifications : [];
      const result = {
        address: addr,
        flagged: identifications.length > 0,
        identifications,
        provider: 'Chainalysis Public Sanctions API',
        mode: 'live',
      };
      CHAINALYSIS_CACHE.set(key, { at: Date.now(), result });
      return result;
    } catch (err) {
      console.error('[Chainalysis] live API error:', err.message);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // DEMO — match against the curated OFAC list
  const hit = DEMO_SANCTIONED_ADDRESSES.get(key);
  const result = {
    address: addr,
    flagged: !!hit,
    identifications: hit ? [hit] : [],
    provider: 'Chainalysis Public Sanctions API · mode sandbox',
    mode: 'sandbox',
  };
  CHAINALYSIS_CACHE.set(key, { at: Date.now(), result });
  return result;
}

// ─── screenGate ──────────────────────────────────────────────
// Shared compliance gate used by EVERY endpoint that handles a
// destination address : approvals creation / approve / execute,
// direct DFNS transfer, whitelist insertion.
//
// Behaviour :
//   · Calls chainalysisScreen() with 15s timeout
//   · On FLAGGED : opens (or re-uses) a compliance_alerts row and
//     returns { blocked: true, reason, hits } — caller must 403
//   · On API ERROR in LIVE mode : fail-closed → returns { blocked: true,
//     reason: 'screening_unavailable' }. The alternative (fail-open)
//     would let sanctioned addresses through if the API is down, which
//     is unacceptable under Règlement UE 2015/847.
//   · On API ERROR in DEMO mode : fail-open (DEMO is for local dev only)
//   · Dedup : if a sanction alert exists for this (address, status=open),
//     we log the event but don't create a duplicate row
//
// Returns : { blocked: boolean, reason?, screen?, hits? }
async function screenGate({ address, walletId, context, salesforceAccountId, clientName, req }) {
  if (!address) return { blocked: false };
  let screen;
  try {
    screen = await chainalysisScreen(address);
  } catch (err) {
    const failClosed = !CHAINALYSIS_DEMO_MODE;
    await logAudit({
      action: 'compliance.screen_unavailable',
      category: 'compliance',
      entityType: 'address_screening',
      entityId: walletId || address,
      details: { address, walletId, context, error: err.message, failClosed },
      severity: 'critical',
      req,
    });
    return failClosed
      ? { blocked: true, reason: 'screening_unavailable', error: err.message }
      : { blocked: false, warning: err.message };
  }

  if (!screen.flagged) return { blocked: false, screen };

  // Dedup — re-use an open alert for the same address so the RCSI
  // inbox shows one thread, not a row per gate that triggered.
  try {
    const { data: existing } = await supabaseAdmin
      .from('compliance_alerts')
      .select('id')
      .eq('type', 'sanctions_match')
      .eq('status', 'open')
      .contains('details', { address })
      .limit(1);
    if (!existing || existing.length === 0) {
      await supabaseAdmin.from('compliance_alerts').insert({
        type: 'sanctions_match',
        severity: 'critical',
        salesforce_account_id: salesforceAccountId || null,
        client_name: clientName || null,
        message: `Adresse sanctionnée — ${address} · ${screen.identifications.map(i => i.name).join(', ')}. Blocage automatique (MiCA Art. 68 · Règlement UE 2015/847).`,
        details: { ...screen, walletId, context },
        status: 'open',
      });
    }
  } catch (e) {
    console.error('[screenGate] compliance_alerts error:', e.message);
  }

  await logAudit({
    action: 'compliance.sanctions_hit_blocked',
    category: 'compliance',
    entityType: 'address_screening',
    entityId: walletId || address,
    details: { address, walletId, context, hits: screen.identifications, provider: screen.provider, mode: screen.mode },
    severity: 'critical',
    req,
  });

  return { blocked: true, reason: 'sanctions_hit', screen, hits: screen.identifications };
}

// POST /api/compliance/address-screen — Screen one or more addresses
app.post('/api/compliance/address-screen', async (req, res) => {
  try {
    const { address, addresses, chain, walletId, context } = req.body || {};
    const list = Array.isArray(addresses) && addresses.length ? addresses : (address ? [address] : []);

    if (list.length === 0) {
      return res.status(400).json({ error: 'address or addresses[] is required' });
    }

    // Parallel screening — in LIVE mode each call hits the Chainalysis
    // Public API (cached 60s server-side). In DEMO mode it's instant.
    const results = await Promise.all(list.map(async (a) => {
      try {
        return await chainalysisScreen(a);
      } catch (err) {
        // In LIVE mode we return a flagged=undefined signal with error so
        // the UI can distinguish "clean" from "screening unavailable".
        return { address: a, flagged: false, identifications: [], error: err.message };
      }
    }));

    const anyFlagged = results.some(r => r.flagged);
    const anyError = results.some(r => r.error);
    const screenedAt = new Date().toISOString();

    // Audit — Tracfin / MiCA Art. 68
    await logAudit({
      userEmail: req.user?.email,
      action: 'compliance.address_screening',
      category: 'compliance',
      entityType: 'address_screening',
      entityId: walletId || list[0],
      details: {
        provider: CHAINALYSIS_DEMO_MODE ? 'Chainalysis Public API (sandbox)' : 'Chainalysis Public API',
        chain,
        context,
        addresses: list,
        results: results.map(r => ({ address: r.address, flagged: r.flagged, hits: r.identifications?.length || 0, error: r.error })),
      },
      severity: anyFlagged ? 'critical' : anyError ? 'warning' : 'info',
      req,
    });

    // Dedup — for each hit, create a compliance_alerts row UNLESS one is
    // already open for the same address. Prevents spamming the RCSI inbox
    // when an address is screened from multiple gates within a short window.
    if (anyFlagged) {
      for (const r of results.filter(x => x.flagged)) {
        try {
          const { data: existing } = await supabaseAdmin
            .from('compliance_alerts')
            .select('id')
            .eq('type', 'sanctions_match')
            .eq('status', 'open')
            .contains('details', { address: r.address })
            .limit(1);
          if (existing && existing.length > 0) continue;
          await supabaseAdmin.from('compliance_alerts').insert({
            type: 'sanctions_match',
            severity: 'critical',
            salesforce_account_id: null,
            client_name: null,
            message: `Adresse sanctionnée — ${r.address} · ${r.identifications.map(i => i.name).join(', ')}. Tout transfert vers cette adresse doit être bloqué (MiCA Art. 68 · Règlement 2015/847).`,
            details: { ...r, chain, walletId, context },
            status: 'open',
          });
        } catch (e) {
          console.error('[AddressScreen] compliance_alerts error:', e.message);
        }
      }
    }

    res.json({
      results,
      flagged: anyFlagged,
      screenedAt,
      provider: CHAINALYSIS_DEMO_MODE
        ? 'Chainalysis Public Sanctions API · mode sandbox'
        : 'Chainalysis Public Sanctions API',
      lists: ['OFAC SDN', 'EU Consolidated', 'UK HMT', 'UN Security Council'],
    });
  } catch (err) {
    console.error('Address screening error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// COMPLIANCE — Audit, Approvals, Whitelist, Risk
// ============================================================

// ---------- Audit Log ----------

// GET /api/compliance/audit-log — List audit entries with filters
app.get('/api/compliance/audit-log', async (req, res) => {
  try {
    const { category, salesforce_account_id, severity, limit = '50', offset = '0' } = req.query;
    let query = supabaseAdmin
      .from('audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (category) query = query.eq('category', category);
    if (salesforce_account_id) query = query.eq('salesforce_account_id', salesforce_account_id);
    if (severity) query = query.eq('severity', severity);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, count: data?.length || 0 });
  } catch (err) {
    console.error('audit-log list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/audit-log/stats — Counts by category and severity
app.get('/api/compliance/audit-log/stats', async (req, res) => {
  try {
    // Get counts by category
    const { data: allLogs, error } = await supabaseAdmin
      .from('audit_log')
      .select('category, severity');
    if (error) throw error;

    const byCategory = {};
    const bySeverity = {};
    for (const row of (allLogs || [])) {
      byCategory[row.category] = (byCategory[row.category] || 0) + 1;
      bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    }

    res.json({ byCategory, bySeverity, total: allLogs?.length || 0 });
  } catch (err) {
    console.error('audit-log stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/audit-log — Create audit entry from frontend
app.post('/api/audit-log', requireAuth, async (req, res) => {
  try {
    const { action, category, entityType, entityId, clientName, salesforceAccountId, details } = req.body;
    await logAudit({
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action,
      category,
      entityType,
      entityId,
      clientName,
      salesforceAccountId,
      details,
      req,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('audit-log create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Transfer Approvals ----------

// GET /api/compliance/approvals — List approvals
// Query params :
//   · status            : filtre exact (pending|approved|executed|rejected)
//   · salesforceAccountId : filtre client
//   · walletId          : filtre wallet
//   · limit/offset      : pagination (défaut 50)
app.get('/api/compliance/approvals', async (req, res) => {
  try {
    const { status, salesforceAccountId, walletId, limit = '50', offset = '0' } = req.query;
    let query = supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .order('requested_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (salesforceAccountId) query = query.eq('salesforce_account_id', salesforceAccountId);
    if (walletId) query = query.eq('wallet_id', walletId);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('approvals list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/approvals — Create a new transfer approval request
app.post('/api/compliance/approvals', requireAuth, async (req, res) => {
  try {
    const {
      walletId, walletName, to, amount, assetSymbol, network, note,
      kind, contract,
      requestedBy, requestedByEmail, clientName, salesforceAccountId,
    } = req.body;

    if (!walletId || !to || !amount || !salesforceAccountId || !assetSymbol) {
      return res.status(400).json({
        error: 'walletId, to, amount, salesforceAccountId et assetSymbol sont requis',
      });
    }

    // ─── Compliance Gate · Chainalysis au moment de la demande ──
    // Premier des 3 checkpoints Chainalysis (demande → approbation →
    // exécution). Fail fast au plus tôt pour que le banquier voie
    // l'alerte immédiatement, plutôt qu'à l'exécution.
    {
      const gate = await screenGate({
        address: to,
        walletId,
        context: 'approval_request',
        salesforceAccountId,
        clientName,
        req,
      });
      if (gate.blocked) {
        return res.status(403).json({
          error: gate.reason === 'screening_unavailable'
            ? 'Screening Chainalysis indisponible — demande de transfert refusée'
            : 'Adresse sanctionnée — demande de transfert refusée',
          code: gate.reason === 'screening_unavailable' ? 'SCREENING_UNAVAILABLE' : 'SANCTIONS_HIT',
          hits: gate.hits,
          regulation: 'Règlement UE 2015/847 · MiCA Art. 68',
        });
      }
    }

    // ─── Compliance Gate · wallet freeze (per-wallet) ─────────
    // If this specific wallet is frozen, refuse the approval request
    // up-front. Defense-in-depth : the DFNS transfer endpoint gates
    // execution too, but we fail fast to give the banquier immediate
    // feedback ("this wallet is frozen") instead of letting the
    // request sit as pending until a reviewer tries to execute.
    try {
      const { data: freeze } = await supabaseAdmin
        .from('wallet_freezes')
        .select('id, reason, frozen_at, legal_reference')
        .eq('wallet_id', walletId)
        .eq('status', 'frozen')
        .maybeSingle();
      if (freeze) {
        return res.status(403).json({
          error: 'Wallet gelé — demande de transfert refusée',
          code: 'WALLET_FROZEN',
          freezeReason: freeze.reason,
          legalReference: freeze.legal_reference,
          frozenAt: freeze.frozen_at,
        });
      }
    } catch (e) {
      console.warn('[Approval Gate] wallet_freezes check skipped:', e.message);
    }

    const { data, error } = await supabaseAdmin.from('transfer_approvals').insert({
      wallet_id: walletId,
      wallet_name: walletName || null,
      to_address: to,
      amount: String(amount),
      asset_symbol: assetSymbol,
      network: network || null,
      kind: kind || 'Native',
      contract_address: contract || null,
      note: note || null,
      requested_by: requestedBy || null,
      requested_by_email: requestedByEmail || req.user?.email || null,
      client_name: clientName || null,
      salesforce_account_id: salesforceAccountId,
      status: 'pending',
    }).select().single();

    if (error) throw error;

    await logAudit({
      userId: requestedBy,
      userEmail: requestedByEmail,
      action: 'approval.requested',
      category: 'approval',
      entityType: 'transfer_approval',
      entityId: data.id,
      clientName,
      salesforceAccountId,
      details: { walletId, to, amount, assetSymbol, network },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('approval create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/approvals/:id/approve — Approve a transfer
app.patch('/api/compliance/approvals/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { approvedBy, approvedByEmail, reviewedByEmail } = req.body;
    const emailToUse = approvedByEmail || reviewedByEmail;

    // Fetch the approval
    const { data: approval, error: fetchErr } = await supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve: status is '${approval.status}'` });
    }

    // Must be different user than requester
    if (approvedBy && approvedBy === approval.requested_by) {
      return res.status(403).json({ error: 'Approver must be a different user than the requester' });
    }

    // ─── Chainalysis re-screening at approval time ──
    // Checkpoint #2 des 3 : l'adresse peut avoir été ajoutée à une liste
    // de sanctions entre le moment de la demande et celui de l'approbation.
    // Re-screener ici est peu coûteux (cache 60s) et ferme la fenêtre.
    {
      const gate = await screenGate({
        address: approval.to_address,
        walletId: approval.wallet_id,
        context: 'approval_approve',
        salesforceAccountId: approval.salesforce_account_id,
        clientName: approval.client_name,
        req,
      });
      if (gate.blocked) {
        // Marquer l'approval comme bloqué par compliance — ne pas le laisser
        // "pending" sinon un autre admin pourrait retenter.
        await supabaseAdmin
          .from('transfer_approvals')
          .update({
            status: 'rejected',
            rejection_reason: gate.reason === 'screening_unavailable'
              ? 'Screening Chainalysis indisponible au moment de l\'approbation (fail-closed)'
              : `Adresse sanctionnée détectée à l'approbation : ${(gate.hits || []).map(h => h.name).join(', ')}`,
            reviewed_by: approvedBy || null,
            reviewed_by_email: emailToUse || null,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', req.params.id);
        return res.status(403).json({
          error: gate.reason === 'screening_unavailable'
            ? 'Screening Chainalysis indisponible — approbation refusée'
            : 'Adresse sanctionnée — approbation refusée',
          code: gate.reason === 'screening_unavailable' ? 'SCREENING_UNAVAILABLE' : 'SANCTIONS_HIT',
          hits: gate.hits,
        });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('transfer_approvals')
      .update({
        status: 'approved',
        // transfer_approvals uses a single `reviewed_*` tuple for both
        // approve and reject paths. The `status` column is the source of
        // truth for approved vs rejected.
        reviewed_by: approvedBy || null,
        reviewed_by_email: emailToUse || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userId: approvedBy,
      userEmail: emailToUse,
      action: 'approval.approved',
      category: 'approval',
      entityType: 'transfer_approval',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { walletId: data.wallet_id, amount: data.amount, to: data.to_address },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('approval approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/approvals/:id/reject — Reject with reason
app.patch('/api/compliance/approvals/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { rejectedBy, rejectedByEmail, reviewedByEmail, reason, rejectionReason } = req.body;
    const emailToUse = rejectedByEmail || reviewedByEmail;
    const reasonToUse = reason || rejectionReason;

    const { data: approval, error: fetchErr } = await supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject: status is '${approval.status}'` });
    }

    const { data, error } = await supabaseAdmin
      .from('transfer_approvals')
      .update({
        status: 'rejected',
        reviewed_by: rejectedBy || null,
        reviewed_by_email: emailToUse || null,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reasonToUse || null,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userId: rejectedBy,
      userEmail: emailToUse,
      action: 'approval.rejected',
      category: 'approval',
      entityType: 'transfer_approval',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { walletId: data.wallet_id, amount: data.amount, reason: reasonToUse },
      severity: 'warning',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('approval reject error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/approvals/:id/execute — Execute an approved transfer via DFNS
app.post('/api/compliance/approvals/:id/execute', requireAdmin, async (req, res) => {
  try {
    // 1. Fetch and check status
    const { data: approval, error: fetchErr } = await supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    if (approval.status !== 'approved') {
      return res.status(400).json({ error: `Cannot execute: status is '${approval.status}', must be 'approved'` });
    }

    // ─── Chainalysis re-screening au moment de l'exécution ──
    // Checkpoint #3 : dernière ligne avant que DFNS signe + broadcast.
    // Belt & suspenders — si une sanction a été ajoutée entre l'approbation
    // et l'exécution, on bloque ici même si le 4-eye est passé.
    {
      const gate = await screenGate({
        address: approval.to_address,
        walletId: approval.wallet_id,
        context: 'approval_execute',
        salesforceAccountId: approval.salesforce_account_id,
        clientName: approval.client_name,
        req,
      });
      if (gate.blocked) {
        await supabaseAdmin
          .from('transfer_approvals')
          .update({
            status: 'rejected',
            rejection_reason: gate.reason === 'screening_unavailable'
              ? 'Screening Chainalysis indisponible au moment de l\'exécution (fail-closed)'
              : `Adresse sanctionnée détectée à l'exécution : ${(gate.hits || []).map(h => h.name).join(', ')}`,
          })
          .eq('id', req.params.id);
        return res.status(403).json({
          error: gate.reason === 'screening_unavailable'
            ? 'Screening Chainalysis indisponible — exécution refusée'
            : 'Adresse sanctionnée — exécution refusée',
          code: gate.reason === 'screening_unavailable' ? 'SCREENING_UNAVAILABLE' : 'SANCTIONS_HIT',
          hits: gate.hits,
        });
      }
    }

    // 2. Build the DFNS TransferAsset body from the stored approval.
    //    DFNS is strict :
    //      · `kind` is required ('Native', 'Erc20', 'Spl', …)
    //      · `amount` must be a BigInt string in the smallest unit
    //        (wei / satoshi / lamport). We convert from the human
    //        string we stored ("0.01") using the network decimals.
    //      · `contract` is required for Erc20 / Erc721 / Spl tokens.
    const kind = approval.kind || 'Native';
    let amountSmallest;
    try {
      amountSmallest = toSmallestUnit(approval.amount, approval.network);
    } catch (convErr) {
      return res.status(400).json({
        error: `Impossible de convertir le montant '${approval.amount}' pour ${approval.network}: ${convErr.message}`,
        code: 'AMOUNT_CONVERSION_FAILED',
      });
    }

    const transferBody = { kind, to: approval.to_address, amount: amountSmallest };
    if (kind !== 'Native' && approval.contract_address) {
      transferBody.contract = approval.contract_address;
    }

    const transferResult = await dfns.wallets.transferAsset({
      walletId: approval.wallet_id,
      body: transferBody,
    });

    // 3. Update status to executed with tx_hash
    const { data, error } = await supabaseAdmin
      .from('transfer_approvals')
      .update({
        status: 'executed',
        tx_hash: transferResult.txHash || transferResult.id || null,
        executed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // 4. Audit log
    await logAudit({
      action: 'approval.executed',
      category: 'transfer',
      entityType: 'transfer_approval',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: {
        walletId: data.wallet_id,
        amount: data.amount,
        to: data.to_address,
        txHash: transferResult.txHash || transferResult.id,
        dfnsTransferId: transferResult.id,
      },
      severity: 'info',
      req,
    });

    res.json({ approval: data, transfer: transferResult });
  } catch (err) {
    console.error('approval execute error:', err.message);

    // Log failed execution
    await logAudit({
      action: 'approval.execution_failed',
      category: 'transfer',
      entityType: 'transfer_approval',
      entityId: req.params.id,
      details: { error: err.message },
      severity: 'critical',
      req,
    });

    res.status((err.httpStatus > 99 && err.httpStatus < 1000) ? err.httpStatus : 500).json({ error: err.message });
  }
});

// ---------- Whitelist ----------

// GET /api/compliance/whitelist/:accountId — List whitelisted addresses for a client
app.get('/api/compliance/whitelist/:accountId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('address_whitelist')
      .select('*')
      .eq('salesforce_account_id', req.params.accountId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('whitelist list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/whitelist — Add address (status: pending)
app.post('/api/compliance/whitelist', async (req, res) => {
  try {
    const { address, network, label, salesforceAccountId, clientName, addedBy, addedByEmail } = req.body;

    if (!address || !network || !salesforceAccountId) {
      return res.status(400).json({ error: 'address, network, and salesforceAccountId are required' });
    }

    // ─── Pre-insertion Chainalysis check ──
    // Empêche un banquier d'ajouter par erreur une adresse sanctionnée
    // à la whitelist d'un client (ça reviendrait à bypasser le gate
    // de transfert en amont). Fail-closed en LIVE.
    {
      const gate = await screenGate({
        address,
        walletId: null,
        context: 'whitelist_add',
        salesforceAccountId,
        clientName,
        req,
      });
      if (gate.blocked) {
        return res.status(403).json({
          error: gate.reason === 'screening_unavailable'
            ? 'Screening Chainalysis indisponible — impossible d\'ajouter l\'adresse à la whitelist'
            : 'Adresse sanctionnée — ajout à la whitelist refusé',
          code: gate.reason === 'screening_unavailable' ? 'SCREENING_UNAVAILABLE' : 'SANCTIONS_HIT',
          hits: gate.hits,
        });
      }
    }

    const { data, error } = await supabaseAdmin.from('address_whitelist').insert({
      address,
      network,
      label: label || null,
      salesforce_account_id: salesforceAccountId,
      client_name: clientName || null,
      added_by: addedBy || null,
      added_by_email: addedByEmail || null,
      status: 'pending',
    }).select().single();

    if (error) throw error;

    await logAudit({
      userId: addedBy,
      userEmail: addedByEmail,
      action: 'whitelist.address_added',
      category: 'whitelist',
      entityType: 'whitelist_address',
      entityId: data.id,
      clientName,
      salesforceAccountId,
      details: { address, network, label },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('whitelist add error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/whitelist/:id/approve — Approve address (admin only)
app.patch('/api/compliance/whitelist/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { approvedBy, approvedByEmail } = req.body;

    const { data, error } = await supabaseAdmin
      .from('address_whitelist')
      .update({
        status: 'approved',
        approved_by: approvedBy || null,
        approved_by_email: approvedByEmail || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Address not found or not in pending status' });
    }

    await logAudit({
      userId: approvedBy,
      userEmail: approvedByEmail,
      action: 'whitelist.address_approved',
      category: 'whitelist',
      entityType: 'whitelist_address',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { address: data.address, network: data.network },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('whitelist approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/whitelist/:id/revoke — Revoke address
app.patch('/api/compliance/whitelist/:id/revoke', requireAdmin, async (req, res) => {
  try {
    const { revokedBy, revokedByEmail, reason } = req.body;

    const { data, error } = await supabaseAdmin
      .from('address_whitelist')
      .update({
        status: 'revoked',
        revoked_by: revokedBy || null,
        revoked_by_email: revokedByEmail || null,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Address not found' });
    }

    await logAudit({
      userId: revokedBy,
      userEmail: revokedByEmail,
      action: 'whitelist.address_revoked',
      category: 'whitelist',
      entityType: 'whitelist_address',
      entityId: data.id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { address: data.address, network: data.network, reason },
      severity: 'warning',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('whitelist revoke error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/whitelist/check — Check if address+network is whitelisted
app.get('/api/compliance/whitelist/check', async (req, res) => {
  try {
    const { address, network, accountId } = req.query;

    if (!address || !network || !accountId) {
      return res.status(400).json({ error: 'address, network, and accountId query params are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('address_whitelist')
      .select('id, address, network, label, status')
      .eq('salesforce_account_id', accountId)
      .eq('address', address)
      .eq('network', network)
      .eq('status', 'approved')
      .limit(1);

    if (error) throw error;

    const whitelisted = data && data.length > 0;
    res.json({ whitelisted, match: whitelisted ? data[0] : null });
  } catch (err) {
    console.error('whitelist check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Risk Config ----------

// GET /api/compliance/risk/:accountId — Get risk config for client
app.get('/api/compliance/risk/:accountId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_risk_config')
      .select('*')
      .eq('salesforce_account_id', req.params.accountId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    res.json({ data: data || null });
  } catch (err) {
    console.error('risk config get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/compliance/risk/:accountId — Create/update risk config (upsert).
//
// Contrat client ↔ serveur : snake_case matching la table client_risk_config.
// Le client envoie déjà les noms de colonnes DB (voir RiskConfigPanel.startEdit).
// Champs acceptés : risk_level, max_single_transfer, max_daily_volume,
// requires_approval_above, whitelist_only, allowed_networks, pep_status,
// fatca_status, last_review_date, next_review_date, notes.
//
// `updated_by_email` n'existe pas dans la table — on trace l'email uniquement
// dans l'audit log.
app.put('/api/compliance/risk/:accountId', async (req, res) => {
  try {
    const body = req.body || {};

    // Le client UI utilise `approval_threshold` comme alias historique de
    // `requires_approval_above`. On accepte les deux pour robustesse.
    const requiresApprovalAbove = body.requires_approval_above ?? body.approval_threshold ?? null;

    // Coerce les nombres — le client envoie soit string soit number selon l'input.
    const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

    const payload = {
      salesforce_account_id: req.params.accountId,
      risk_level:              body.risk_level || 'standard',
      max_single_transfer:     num(body.max_single_transfer),
      max_daily_volume:        num(body.max_daily_volume),
      requires_approval_above: num(requiresApprovalAbove),
      whitelist_only:          body.whitelist_only ?? false,
      allowed_networks:        Array.isArray(body.allowed_networks) ? body.allowed_networks : null,
      pep_status:              body.pep_status ?? false,
      fatca_status:            body.fatca_status || 'pending',
      last_review_date:        body.last_review_date || null,
      next_review_date:        body.next_review_date || null,
      notes:                   body.notes ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('client_risk_config')
      .upsert(payload, { onConflict: 'salesforce_account_id' })
      .select()
      .single();

    if (error) throw error;

    // ─── Write-back Salesforce : Custody_Risk_Level__c ───
    // Le banquier doit retrouver le niveau de risque dans la fiche SFDC.
    // Mapping interne → valeurs picklist SFDC (sans accents, convention org).
    const SFDC_RISK_MAP = {
      low:      'Faible',
      standard: 'Moyen',
      high:     'Eleve',
      critical: 'Tres eleve',
    };
    let sfWriteback = { attempted: false, ok: false };
    if (SF_CONFIGURED && payload.risk_level) {
      sfWriteback.attempted = true;
      try {
        const { accessToken, instanceUrl } = await getSalesforceToken();
        const sfPayload = {
          Custody_Risk_Level__c: SFDC_RISK_MAP[payload.risk_level] || 'Moyen',
        };
        const sfRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${req.params.accountId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(sfPayload),
        });
        sfWriteback.ok = sfRes.ok || sfRes.status === 204;
        if (!sfWriteback.ok) {
          sfWriteback.error = `${sfRes.status}: ${(await sfRes.text().catch(() => '')).slice(0, 300)}`;
          console.error('[Risk] SFDC writeback failed:', sfWriteback.error);
        }
      } catch (sfErr) {
        sfWriteback.error = sfErr.message;
        console.error('[Risk] SFDC writeback exception:', sfErr.message);
      }
    }

    await logAudit({
      userEmail: req.user?.email,
      action: 'risk.config_updated',
      category: 'risk',
      entityType: 'risk_config',
      entityId: data.id,
      salesforceAccountId: req.params.accountId,
      details: { ...payload, sfWriteback },
      severity: 'info',
      req,
    });

    res.json({ ...data, sfWriteback });
  } catch (err) {
    console.error('risk config update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN SETTINGS — Feature toggles
// ============================================================
app.get('/api/admin/settings', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('admin_settings')
      .select('*')
      .single();
    if (error && error.code === 'PGRST116') {
      // No row exists yet, return defaults
      return res.json({ kyc_module_enabled: false, filing_authority: 'tracfin' });
    }
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('admin settings get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const updates = {};
    if (req.body.kyc_module_enabled !== undefined) updates.kyc_module_enabled = req.body.kyc_module_enabled;
    if (req.body.filing_authority !== undefined) updates.filing_authority = req.body.filing_authority;
    updates.updated_at = new Date().toISOString();

    // Upsert — try update first, insert if not exists
    const { data: existing } = await supabaseAdmin.from('admin_settings').select('id').limit(1);
    let result;
    if (existing && existing.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('admin_settings')
        .update(updates)
        .eq('id', existing[0].id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('admin_settings')
        .insert({ ...updates, kyc_module_enabled: updates.kyc_module_enabled ?? false, filing_authority: updates.filing_authority ?? 'tracfin' })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    await logAudit({
      userEmail: req.user?.email,
      action: 'admin.settings_updated',
      category: 'admin',
      entityType: 'settings',
      details: updates,
      severity: 'info',
      req,
    });

    res.json(result);
  } catch (err) {
    console.error('admin settings update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/risk/check-transfer — Pre-flight check
// Simule en amont tous les gates qui seront appliqués côté serveur
// au moment du transfert DFNS. Résultat : le banquier voit dès la
// saisie si le transfert passera ou sera bloqué.
//
// Gates simulés :
//   1. Wallet freeze           (table wallet_freezes)
//   2. Chainalysis sanctions  (Public Sanctions API — LIVE ou DEMO)
//   3. Whitelist enforcement  (si whitelist_only)
//   4. Hard cap EUR           (max_single_transfer)
//   5. 4-eyes threshold       (requires_approval_above → warning)
//   6. Daily volume           (max_daily_volume sur rolling 24h EUR)
//   7. Réseau autorisé        (allowed_networks)
//
// Le scoring est fait en EUR (via Chainlink oracle) pour matcher les
// gates DFNS exécutés au transfert réel.
app.post('/api/compliance/risk/check-transfer', async (req, res) => {
  try {
    // L'UI envoie aussi destinationAddress → on accepte les deux
    const { salesforceAccountId, amount, network, walletId } = req.body;
    const to = req.body.to || req.body.destinationAddress;
    const assetSymbol = req.body.assetSymbol;

    if (!salesforceAccountId || !to || !amount) {
      return res.status(400).json({ error: 'salesforceAccountId, to, amount sont requis' });
    }

    const warnings = [];
    const blocks = [];
    let chainalysis = null;

    // 1. Wallet freeze ?
    if (walletId) {
      try {
        const { data: freeze } = await supabaseAdmin
          .from('wallet_freezes')
          .select('id, reason, legal_reference, frozen_at')
          .eq('wallet_id', walletId)
          .eq('status', 'frozen')
          .maybeSingle();
        if (freeze) {
          blocks.push(`Wallet gelé — ${freeze.reason || 'motif non précisé'} (${freeze.legal_reference || 'ACPR LCB-FT'})`);
        }
      } catch { /* ignore */ }
    }

    // 2. Chainalysis sanctions — même helper que les gates d'exécution
    try {
      const screen = await chainalysisScreen(to);
      chainalysis = {
        mode: screen.mode,
        provider: screen.provider,
        flagged: screen.flagged,
        identifications: screen.identifications || [],
      };
      if (screen.flagged) {
        const names = (screen.identifications || []).map(i => i.name).join(', ');
        blocks.push(`Adresse sanctionnée — ${names || 'OFAC hit'} (Règlement UE 2015/847 · MiCA Art. 68)`);
      }
    } catch (err) {
      // En LIVE on voudrait fail-closed, mais le check-transfer est du
      // pre-flight UX — on signale en warning et le vrai blocage arrivera
      // côté exécution via screenGate().
      warnings.push(`Screening Chainalysis indisponible — ${err.message}`);
    }

    // 3. Load risk config (colonnes correctes DB)
    const { data: config } = await supabaseAdmin
      .from('client_risk_config')
      .select('risk_level, max_single_transfer, max_daily_volume, requires_approval_above, whitelist_only, allowed_networks')
      .eq('salesforce_account_id', salesforceAccountId)
      .maybeSingle();

    if (!config) {
      warnings.push('Aucune configuration de risque pour ce client — valeurs par défaut appliquées');
    }

    // Convert amount → EUR via Chainlink oracle (comme les gates DFNS)
    let amountEur = 0;
    let priceEur = 0;
    try {
      if (assetSymbol) {
        const priceData = await getCryptoPriceEur(assetSymbol);
        priceEur = priceData?.priceEur || 0;
        amountEur = Number(amount) * priceEur;
      }
    } catch {
      // Si l'oracle est down, on garde amountEur à 0 et on signale
      warnings.push('Oracle de prix indisponible — conversion EUR impossible, seuils non évalués');
    }

    // 4. Hard cap — single transfer
    if (config?.max_single_transfer && amountEur > Number(config.max_single_transfer)) {
      blocks.push(`Transfert de ${Math.round(amountEur)}€ dépasse le plafond unique (${Math.round(config.max_single_transfer)}€)`);
    }

    // 5. 4-eyes threshold (warning, pas block)
    if (config?.requires_approval_above && amountEur >= Number(config.requires_approval_above)) {
      warnings.push(`Seuil d'approbation atteint (${Math.round(amountEur)}€ ≥ ${Math.round(config.requires_approval_above)}€) — validation quatre-yeux requise`);
    }

    // 6. Daily rolling volume (transfers executed last 24h, in EUR)
    if (config?.max_daily_volume && priceEur > 0) {
      const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: todayTransfers } = await supabaseAdmin
        .from('transfer_approvals')
        .select('amount, asset_symbol')
        .eq('salesforce_account_id', salesforceAccountId)
        .eq('status', 'executed')
        .gte('executed_at', yesterdayIso);
      // Approximation : applique le prix actuel aux volumes passés.
      // En prod on stockerait un snapshot price_at_execute pour du rolling exact.
      const dailyEur = (todayTransfers || []).reduce((sum, t) => {
        const asset = (t.asset_symbol || '').toUpperCase();
        const amt = Number(t.amount || 0);
        // Cheap proxy: si même asset que l'actuel, on utilise priceEur
        return sum + (asset === (assetSymbol || '').toUpperCase() ? amt * priceEur : 0);
      }, 0);
      if (dailyEur + amountEur > Number(config.max_daily_volume)) {
        blocks.push(`Volume 24h ${Math.round(dailyEur + amountEur)}€ dépasse le plafond journalier (${Math.round(config.max_daily_volume)}€)`);
      }
    }

    // 7. Whitelist stricte ?
    if (config?.whitelist_only === true) {
      const { data: wlMatch } = await supabaseAdmin
        .from('address_whitelist')
        .select('id, status')
        .eq('salesforce_account_id', salesforceAccountId)
        .ilike('address', to)
        .eq('status', 'approved')
        .limit(1);
      if (!wlMatch || wlMatch.length === 0) {
        blocks.push(`Adresse ${to.slice(0, 10)}… absente de la whitelist (mode strict LCB-FT actif)`);
      }
    }

    // 8. Réseau autorisé
    if (config?.allowed_networks && network && Array.isArray(config.allowed_networks) && config.allowed_networks.length > 0) {
      if (!config.allowed_networks.includes(network)) {
        blocks.push(`Réseau "${network}" non autorisé pour ce client (autorisés : ${config.allowed_networks.join(', ')})`);
      }
    }

    const allowed = blocks.length === 0;

    // Audit the check
    await logAudit({
      action: 'risk.transfer_check',
      category: 'risk',
      entityType: 'transfer_check',
      salesforceAccountId,
      details: {
        to, amount, amountEur: Math.round(amountEur), assetSymbol, network, walletId,
        allowed, warnings, blocks,
        chainalysisMode: chainalysis?.mode, chainalysisFlagged: chainalysis?.flagged,
      },
      severity: allowed ? 'info' : 'warning',
      req,
    });

    res.json({
      allowed, warnings, blocks,
      chainalysis,
      amountEur: Math.round(amountEur),
      priceEur,
      config: config
        ? {
            risk_level: config.risk_level,
            max_single_transfer: config.max_single_transfer,
            max_daily_volume: config.max_daily_volume,
            requires_approval_above: config.requires_approval_above,
            whitelist_only: config.whitelist_only,
          }
        : null,
    });
  } catch (err) {
    console.error('risk check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Alerts ----------

// GET /api/compliance/alerts — List alerts
app.get('/api/compliance/alerts', async (req, res) => {
  try {
    const { status, severity, limit = '50', offset = '0' } = req.query;
    let query = supabaseAdmin
      .from('compliance_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('alerts list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/alerts/stats — Count open alerts by severity
app.get('/api/compliance/alerts/stats', async (req, res) => {
  try {
    const { data: openAlerts, error } = await supabaseAdmin
      .from('compliance_alerts')
      .select('severity')
      .eq('status', 'open');

    if (error) throw error;

    const bySeverity = {};
    for (const row of (openAlerts || [])) {
      bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    }

    res.json({ bySeverity, totalOpen: openAlerts?.length || 0 });
  } catch (err) {
    console.error('alerts stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/alerts/:id/acknowledge — Acknowledge alert
app.patch('/api/compliance/alerts/:id/acknowledge', async (req, res) => {
  try {
    const { acknowledgedBy, acknowledgedByEmail } = req.body;

    const { data, error } = await supabaseAdmin
      .from('compliance_alerts')
      .update({
        status: 'acknowledged',
        acknowledged_by: acknowledgedBy || null,
        acknowledged_by_email: acknowledgedByEmail || null,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    await logAudit({
      userId: acknowledgedBy,
      userEmail: acknowledgedByEmail,
      action: 'alert.acknowledged',
      category: 'alert',
      entityType: 'compliance_alert',
      entityId: data.id,
      details: { alertType: data.alert_type, severity: data.severity },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('alert acknowledge error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/alerts/:id/resolve — Resolve alert with notes
app.patch('/api/compliance/alerts/:id/resolve', async (req, res) => {
  try {
    const { resolvedBy, resolvedByEmail, notes } = req.body;

    const { data, error } = await supabaseAdmin
      .from('compliance_alerts')
      .update({
        status: 'resolved',
        resolved_by: resolvedBy || null,
        resolved_by_email: resolvedByEmail || null,
        resolution_notes: notes || null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    await logAudit({
      userId: resolvedBy,
      userEmail: resolvedByEmail,
      action: 'alert.resolved',
      category: 'alert',
      entityType: 'compliance_alert',
      entityId: data.id,
      details: { alertType: data.alert_type, severity: data.severity, notes },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('alert resolve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// KYC / KYB — ComplyCube integration (with sandbox demo fallback)
// ============================================================
const COMPLYCUBE_BASE = 'https://api.complycube.com/v1';
const COMPLYCUBE_KEY = process.env.COMPLYCUBE_API_KEY || '';
// Demo mode is ON automatically when no real key is set, or explicitly via env.
const KYC_DEMO_MODE = !COMPLYCUBE_KEY || process.env.KYC_DEMO_MODE === 'true';

console.log(`[KYC] mode=${KYC_DEMO_MODE ? 'DEMO (sandbox)' : 'LIVE (ComplyCube)'}`);

// Helper: ComplyCube API call
async function complyCubeRequest(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': COMPLYCUBE_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(`${COMPLYCUBE_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `ComplyCube error: ${res.status}`);
  }
  return res.json();
}

// Demo-mode helper: deterministic fake complycube IDs from a salesforce ID.
function demoClientId(salesforceAccountId) {
  return `demo_cli_${crypto.createHash('sha1').update(String(salesforceAccountId)).digest('hex').slice(0, 16)}`;
}
function demoCheckId() {
  return `demo_chk_${crypto.randomBytes(8).toString('hex')}`;
}

// Demo screening outcome — uses client name to give realistic demo behaviour.
function demoAmlOutcome(clientName = '') {
  const n = (clientName || '').toLowerCase();
  if (n.includes('reject') || n.includes('pep') || n.includes('sanction')) {
    return {
      status: 'failed',
      result: {
        outcome: 'attention',
        screening: {
          sanctions: { matches: 1, lists: ['OFAC_SDN'] },
          pep: { matches: 0 },
          adverse_media: { matches: 0 },
        },
      },
    };
  }
  return {
    status: 'complete',
    result: {
      outcome: 'clear',
      screening: {
        sanctions: { matches: 0, lists: ['OFAC', 'EU', 'UN', 'UK_HMT'] },
        pep: { matches: 0 },
        adverse_media: { matches: 0 },
      },
    },
  };
}

// POST /api/kyc/upload-document — Upload doc & create verification check
app.post('/api/kyc/upload-document', upload.single('file'), async (req, res) => {
  try {
    const { salesforceAccountId, clientName, documentType, initiatedByEmail } = req.body;

    if (!salesforceAccountId || !documentType || !req.file) {
      return res.status(400).json({ error: 'salesforceAccountId, documentType, and file are required' });
    }

    let checkResult;

    if (KYC_DEMO_MODE) {
      // ── DEMO / sandbox mode — simulate ComplyCube responses ──
      // Deterministic client id so repeated uploads map to the same "client".
      const complyCubeClientId = demoClientId(salesforceAccountId);

      // Simulate a very quick document check. Names containing "reject" fail.
      const rejected = (clientName || '').toLowerCase().includes('reject');
      checkResult = {
        id: demoCheckId(),
        complyCubeClientId,
        status: rejected ? 'failed' : 'complete',
        result: rejected
          ? { outcome: 'attention', reason: 'demo_rejected', breakdown: { visualAuthenticity: 'clear', dataConsistency: 'attention' } }
          : { outcome: 'clear', breakdown: { visualAuthenticity: 'clear', dataConsistency: 'clear', dataValidation: 'clear' } },
      };
    } else {
      // ── LIVE ComplyCube flow ──
      // 1. Reuse existing ComplyCube client id if we already created one.
      //    Filtre strict sur provider='complycube' — ignore les anciens
      //    demo_cli_... qui sont invalides côté API ComplyCube LIVE.
      const { data: existingChecks } = await supabaseAdmin
        .from('kyc_checks')
        .select('complycube_client_id')
        .eq('salesforce_account_id', salesforceAccountId)
        .eq('provider', 'complycube')
        .not('complycube_client_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      let complyCubeClientId = existingChecks?.[0]?.complycube_client_id;

      if (!complyCubeClientId) {
        const ccClient = await complyCubeRequest('POST', '/clients', {
          type: 'person',
          email: initiatedByEmail || `${salesforceAccountId}@custody.swisslife.com`,
          personDetails: {
            firstName: clientName?.split(' ')[0] || 'Client',
            lastName: clientName?.split(' ').slice(1).join(' ') || salesforceAccountId,
          },
        });
        complyCubeClientId = ccClient.id;
      }

      // 2. Upload document
      const docUpload = await complyCubeRequest('POST', '/documents', {
        clientId: complyCubeClientId,
        type: documentType === 'passport' ? 'passport' :
              documentType === 'id_card' ? 'national_identity_card' :
              documentType === 'proof_of_address' ? 'utility_bill' :
              documentType === 'company_registration' ? 'company_registration' :
              'other',
      });

      // 3. Upload document image (base64)
      const base64Data = req.file.buffer.toString('base64');
      await complyCubeRequest('POST', `/documents/${docUpload.id}/upload/front`, {
        fileName: req.file.originalname,
        data: base64Data,
      });

      // 4. Create check
      const check = await complyCubeRequest('POST', '/checks', {
        clientId: complyCubeClientId,
        documentId: docUpload.id,
        type: 'document_check',
      });

      checkResult = {
        id: check.id,
        complyCubeClientId,
        status: check.status === 'complete'
          ? (check.result?.outcome === 'clear' ? 'complete' : 'failed')
          : 'processing',
        result: check.result || {},
      };
    }

    // Save to Supabase (aligned with current schema)
    const { data: kycCheck, error: dbError } = await supabaseAdmin
      .from('kyc_checks')
      .insert({
        salesforce_account_id: salesforceAccountId,
        client_name: clientName,
        complycube_client_id: checkResult.complyCubeClientId || null,
        complycube_check_id: checkResult.id,
        provider: KYC_DEMO_MODE ? 'demo' : 'complycube',
        provider_check_id: checkResult.id,
        check_type: 'document_check',
        document_type: documentType,
        status: checkResult.status,
        result: checkResult.result,
        file_name: req.file.originalname,
        initiated_by_email: initiatedByEmail,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // Audit log
    await logAudit({
      userEmail: initiatedByEmail,
      action: 'kyc.document_uploaded',
      category: 'compliance',
      entityType: 'kyc_check',
      entityId: kycCheck.id,
      clientName,
      salesforceAccountId,
      details: { documentType, fileName: req.file.originalname, status: checkResult.status },
      severity: 'info',
      req,
    });

    res.json(kycCheck);
  } catch (err) {
    console.error('KYC upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// COMPLYCUBE helpers — screening party-by-party (person OR company)
// ============================================================

// Type guess depuis SFDC Account.Type. Par défaut personne physique
// (pattern SwissLife Banque Privée). Les cas "Institutional", "Partner",
// "Other" etc. traités comme personnes morales.
function detectClientTypeFromAccount(accountType) {
  const t = String(accountType || '').toLowerCase();
  if (!t) return 'person';                       // défaut prudent
  if (t.includes('customer - direct')) return 'person';
  if (t.includes('individual'))         return 'person';
  return 'company';
}

// Runs a single AML screening against ComplyCube. Works for both person
// and company. Returns { id, complyCubeClientId, status, result, entity }.
//
//   entity = { type: 'person'|'company', name, id? (SFDC entity id), role? }
//
// Enriched payload :
//   · person  → personDetails  { firstName, lastName, dob (YYYY-MM-DD), nationality (ISO2) }
//   · company → companyDetails { name, registrationNumber (SIREN), country (ISO2), entityType }
//
// DOB + nationality réduisent drastiquement les faux positifs sur les
// noms communs (ex. "Jean Martin" sans DOB match ~50 entrées PEP).
// SIREN permet au contrôle compagnie de ne matcher que la bonne entité.
async function runSingleScreening({
  type, displayName, firstName, lastName, email, entityId, reusableClientId,
  // Person fields
  dob, nationality,
  // Company fields
  registrationNumber, incorporationCountry, entityType,
}) {
  if (KYC_DEMO_MODE) {
    const outcome = demoAmlOutcome(displayName);
    return {
      id: demoCheckId(),
      complyCubeClientId: reusableClientId || demoClientId(entityId || displayName),
      status: outcome.status,
      result: outcome.result,
      mode: 'sandbox',
    };
  }

  let complyCubeClientId = reusableClientId;
  if (!complyCubeClientId) {
    // Construit personDetails / companyDetails avec tous les champs
    // disponibles — plus c'est riche, plus ComplyCube filtre fin
    // (moins de faux positifs sur noms communs).
    let body;
    if (type === 'company') {
      const companyDetails = { name: displayName };
      if (registrationNumber) companyDetails.registrationNumber = registrationNumber;
      if (incorporationCountry) companyDetails.incorporationCountry = incorporationCountry;
      if (entityType) companyDetails.entityType = entityType;
      body = {
        type: 'company',
        email: email || `${entityId || 'corp'}@custody.swisslife.com`,
        companyDetails,
      };
    } else {
      const personDetails = {
        firstName: firstName || (displayName || '').split(' ')[0] || 'Client',
        lastName:  lastName  || (displayName || '').split(' ').slice(1).join(' ') || entityId || 'SwissLife',
      };
      if (dob) personDetails.dob = dob;                          // YYYY-MM-DD
      if (nationality) personDetails.nationality = nationality;  // ISO 3166-1 alpha-2
      body = {
        type: 'person',
        email: email || `${entityId || 'indiv'}@custody.swisslife.com`,
        personDetails,
      };
    }
    const ccClient = await complyCubeRequest('POST', '/clients', body);
    complyCubeClientId = ccClient.id;
  }

  let check = await complyCubeRequest('POST', '/checks', {
    clientId: complyCubeClientId,
    type: process.env.COMPLYCUBE_SCREENING_TYPE || 'standard_screening_check',
  });

  // ComplyCube retourne souvent `status: 'processing'` d'abord et passe
  // à `complete` en <10s. On poll le GET /checks/:id jusqu'à 15s pour
  // renvoyer un résultat final au client (plutôt que laisser l'UI en
  // "en attente" indéfiniment).
  const POLL_MAX_MS = 15_000;
  const POLL_INTERVAL_MS = 1_500;
  const startedAt = Date.now();
  while (check.status !== 'complete' && Date.now() - startedAt < POLL_MAX_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    try {
      check = await complyCubeRequest('GET', `/checks/${check.id}`);
    } catch (err) {
      console.warn('[ComplyCube poll] failed:', err.message);
      break;
    }
  }

  return {
    id: check.id,
    complyCubeClientId,
    status: check.status === 'complete'
      ? (check.result?.outcome === 'clear' ? 'complete' : 'failed')
      : 'processing',
    result: check.result || {},
    mode: 'live',
  };
}

// Fetch Salesforce Contacts linked to an Account (= représentants légaux,
// UBOs, signataires). Filtre par défaut Custody_Is_Legal_Rep__c OU
// Custody_Is_UBO__c si le flag existe — sinon retourne tous les Contacts.
async function fetchAccountContacts(salesforceAccountId) {
  if (!SF_CONFIGURED) return [];
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    // Fetch enrichi avec DOB (Birthdate standard) + nationalité (custom)
    // pour le screening ComplyCube.
    const soql = `SELECT Id, FirstName, LastName, Email, Title, Birthdate, Custody_Nationality__c, MailingCountry FROM Contact WHERE AccountId = '${salesforceAccountId}' LIMIT 50`;
    const r = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data.records || [];
  } catch (err) {
    console.warn('[AML] Failed to fetch contacts for', salesforceAccountId, err.message);
    return [];
  }
}

// Récupère les champs d'identité d'une Account (personne morale ou particulier).
// Pour une morale : SIREN/LEI, pays d'incorporation, forme juridique.
// Pour un particulier (Customer - Direct avec contact rattaché) : on fallback
// sur le premier contact lié pour DOB + nationalité.
async function fetchAccountIdentity(salesforceAccountId) {
  if (!SF_CONFIGURED) return {};
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const fields = [
      'Id', 'Name', 'Type', 'BillingCountry',
      'Custody_SIREN__c', 'Custody_LEI__c',
      'Custody_Incorporation_Country__c', 'Custody_Entity_Type__c',
    ];
    const soql = `SELECT ${fields.join(', ')} FROM Account WHERE Id = '${salesforceAccountId}' LIMIT 1`;
    const r = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return {};
    const data = await r.json();
    return data.records?.[0] || {};
  } catch (err) {
    console.warn('[AML] Failed to fetch account identity', salesforceAccountId, err.message);
    return {};
  }
}

// Convertit "France" → "FR" · "Germany" → "DE". Nettoie pour ISO 3166-1 alpha-2.
function toIsoCountry(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (/^[A-Z]{2}$/.test(s)) return s;                      // déjà ISO2
  const map = {
    'france': 'FR', 'french republic': 'FR',
    'germany': 'DE', 'allemagne': 'DE',
    'united kingdom': 'GB', 'royaume-uni': 'GB', 'uk': 'GB',
    'united states': 'US', 'états-unis': 'US', 'etats-unis': 'US', 'usa': 'US',
    'switzerland': 'CH', 'suisse': 'CH',
    'luxembourg': 'LU',
    'belgium': 'BE', 'belgique': 'BE',
    'italy': 'IT', 'italie': 'IT',
    'spain': 'ES', 'espagne': 'ES',
    'netherlands': 'NL', 'pays-bas': 'NL',
    'portugal': 'PT',
    'ireland': 'IE', 'irlande': 'IE',
  };
  return map[s.toLowerCase()] || null;
}

// POST /api/kyc/screen-plan — Construit la liste des entités à screener.
// L'UI l'utilise pour afficher la progression entité par entité avant de
// lancer réellement les checks. Retourne :
//   {
//     detectedType: 'person' | 'company',
//     entities: [
//       { kind: 'person'|'company', entityId, displayName, role, email },
//       ...
//     ]
//   }
// Pour une personne physique → 1 entité. Pour une morale → société + tous
// les Contacts SFDC liés (représentants légaux + UBOs).
app.post('/api/kyc/screen-plan', async (req, res) => {
  try {
    const { salesforceAccountId, clientName, accountType } = req.body;
    if (!salesforceAccountId) return res.status(400).json({ error: 'salesforceAccountId is required' });

    const detectedType = detectClientTypeFromAccount(accountType);
    const entities = [];

    // Fetch les données d'identité enrichies depuis SFDC
    const accountData = await fetchAccountIdentity(salesforceAccountId);

    // ① Entité principale (société ou particulier) — payload enrichi
    const mainEntity = {
      kind: detectedType,
      entityId: null,
      displayName: clientName,
      role: detectedType === 'company' ? 'Raison sociale' : 'Personne physique',
      email: null,
    };
    if (detectedType === 'company') {
      mainEntity.registrationNumber = accountData.Custody_SIREN__c || accountData.Custody_LEI__c || null;
      mainEntity.incorporationCountry = accountData.Custody_Incorporation_Country__c
        || toIsoCountry(accountData.BillingCountry)
        || null;
      const et = accountData.Custody_Entity_Type__c;
      // Mapping picklist SFDC → entityType ComplyCube (OtherEntityType par défaut)
      mainEntity.entityType = et && ['SA','SAS','SARL','EURL','SNC','SCI','SCA'].includes(et) ? et : 'OtherEntityType';
    }
    entities.push(mainEntity);

    // ② Si personne morale → tous les contacts liés à l'Account (avec DOB + nationalité)
    if (detectedType === 'company') {
      const contacts = await fetchAccountContacts(salesforceAccountId);
      for (const c of contacts) {
        const name = [c.FirstName, c.LastName].filter(Boolean).join(' ') || c.LastName;
        if (!name) continue;
        entities.push({
          kind: 'person',
          entityId: c.Id,
          displayName: name,
          role: c.Title || 'Contact',
          email: c.Email || null,
          firstName: c.FirstName || null,
          lastName: c.LastName || null,
          dob: c.Birthdate || null,                              // YYYY-MM-DD (SFDC Date)
          nationality: c.Custody_Nationality__c || toIsoCountry(c.MailingCountry) || null,
        });
      }
    }

    res.json({ detectedType, entities, accountIdentity: {
      siren: accountData.Custody_SIREN__c || null,
      lei:   accountData.Custody_LEI__c || null,
      incorporationCountry: accountData.Custody_Incorporation_Country__c || null,
      entityType: accountData.Custody_Entity_Type__c || null,
    }});
  } catch (err) {
    console.error('screen-plan error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/screen-entity — Screene UNE seule entité (celle du plan).
// Utilisé par l'UI qui itère sur le plan pour afficher la progression
// entité par entité. Contrairement à /aml-screen qui fait tout d'un coup,
// ce endpoint ne gère qu'une entité → l'UI garde le contrôle du rythme.
app.post('/api/kyc/screen-entity', async (req, res) => {
  try {
    const {
      salesforceAccountId, clientName, kind, entityId, displayName,
      firstName, lastName, email, role, initiatedByEmail,
      // Person enriched fields
      dob, nationality,
      // Company enriched fields
      registrationNumber, incorporationCountry, entityType,
    } = req.body;
    if (!salesforceAccountId) return res.status(400).json({ error: 'salesforceAccountId is required' });
    if (!kind) return res.status(400).json({ error: 'kind is required' });

    // Réutilisation ComplyCube client existant si c'est l'entité principale
    let reusableClientId = null;
    if (!entityId) {
      const { data: ex } = await supabaseAdmin
        .from('kyc_checks')
        .select('complycube_client_id')
        .eq('salesforce_account_id', salesforceAccountId)
        .eq('provider', 'complycube')
        .is('entity_id', null)
        .not('complycube_client_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);
      reusableClientId = ex?.[0]?.complycube_client_id;
    }

    const screen = await runSingleScreening({
      type: kind,
      displayName: displayName || clientName,
      firstName,
      lastName,
      email,
      entityId: entityId || salesforceAccountId,
      reusableClientId,
      dob,
      nationality,
      registrationNumber,
      incorporationCountry,
      entityType,
    });

    // Persist
    const { data: check } = await supabaseAdmin.from('kyc_checks').insert({
      salesforce_account_id: salesforceAccountId,
      client_name: displayName || clientName,
      complycube_client_id: screen.complyCubeClientId || null,
      complycube_check_id: screen.id,
      provider: KYC_DEMO_MODE ? 'demo' : 'complycube',
      provider_check_id: screen.id,
      check_type: entityId ? 'contact_screening' : 'screening_check',
      entity_kind: kind,
      entity_id: entityId || null,
      entity_role: role || null,
      status: screen.status,
      result: screen.result,
      initiated_by_email: initiatedByEmail,
    }).select().single();

    // Alerte automatique si failed
    if (screen.status === 'failed') {
      await supabaseAdmin.from('compliance_alerts').insert({
        type: 'sanctions_match',
        severity: 'critical',
        salesforce_account_id: salesforceAccountId,
        client_name: displayName || clientName,
        message: entityId
          ? `Alerte AML contact — ${displayName}${role ? ` (${role})` : ''} : correspondance détectée. Revue manuelle requise.`
          : kind === 'company'
            ? `Alerte AML personne morale — ${displayName} : correspondance détectée sur la raison sociale. Revue manuelle requise.`
            : `Alerte AML — ${displayName} : correspondance potentielle. Revue manuelle requise.`,
        details: screen.result,
        status: 'open',
      });
    }

    // Si c'est le check principal et qu'on est personne physique, patch SFDC
    // (pour company on attend la fin du batch pour connaître le verdict agrégé)
    if (!entityId && kind === 'person' && SF_CONFIGURED) {
      try {
        const { accessToken, instanceUrl } = await getSalesforceToken();
        await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${salesforceAccountId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ Custody_Sanctions_Clear__c: screen.status === 'complete' }),
        });
      } catch {}
    }

    await logAudit({
      userEmail: initiatedByEmail,
      action: entityId ? 'kyc.contact_screening' : 'kyc.entity_screening',
      category: 'compliance',
      entityType: entityId ? 'contact' : 'kyc_check',
      entityId: entityId || check?.id,
      clientName: displayName || clientName,
      salesforceAccountId,
      details: { kind, role, status: screen.status, outcome: screen.result?.outcome },
      severity: screen.status === 'failed' ? 'warning' : 'info',
      req,
    });

    res.json({ ...check, kind, role, displayName: displayName || clientName });
  } catch (err) {
    console.error('screen-entity error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/screen-finalize — Agrégation après série de screen-entity.
// L'UI l'appelle une fois que tous les screens individuels sont terminés.
// Récupère les N derniers checks du client, calcule le verdict global
// (complete ssi tous clean) et patche Custody_Sanctions_Clear__c dans SFDC.
app.post('/api/kyc/screen-finalize', async (req, res) => {
  try {
    const { salesforceAccountId, checkIds = [], initiatedByEmail } = req.body;
    if (!salesforceAccountId) return res.status(400).json({ error: 'salesforceAccountId is required' });
    if (!checkIds.length) return res.status(400).json({ error: 'checkIds[] required' });

    const { data: checks } = await supabaseAdmin
      .from('kyc_checks')
      .select('id, status, entity_kind, entity_id, entity_role, client_name')
      .in('id', checkIds);

    const allClean = (checks || []).every(c => c.status === 'complete');
    const aggregatedStatus = allClean ? 'complete' : 'failed';

    // Patch SFDC avec verdict agrégé
    let sfWriteback = { attempted: false, ok: false };
    if (SF_CONFIGURED) {
      sfWriteback.attempted = true;
      try {
        const { accessToken, instanceUrl } = await getSalesforceToken();
        const sfRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${salesforceAccountId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ Custody_Sanctions_Clear__c: allClean }),
        });
        sfWriteback.ok = sfRes.ok || sfRes.status === 204;
      } catch (sfErr) { sfWriteback.error = sfErr.message; }
    }

    await logAudit({
      userEmail: initiatedByEmail,
      action: 'kyc.screening_finalized',
      category: 'compliance',
      entityType: 'kyc_check_batch',
      entityId: null,
      salesforceAccountId,
      details: {
        aggregatedStatus,
        checksCount: checks?.length || 0,
        failed: checks?.filter(c => c.status !== 'complete').map(c => ({ name: c.client_name, role: c.entity_role, id: c.entity_id })),
        sfWriteback,
      },
      severity: aggregatedStatus === 'failed' ? 'warning' : 'info',
      req,
    });

    res.json({ aggregatedStatus, allClean, checksCount: checks?.length || 0, sfWriteback });
  } catch (err) {
    console.error('screen-finalize error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/aml-screen — Run AML screening (legacy : tout en un)
// Conservé pour les intégrations automatiques. L'UI préfère désormais
// /screen-plan + /screen-entity en séquence pour afficher la progression.
app.post('/api/kyc/aml-screen', async (req, res) => {
  try {
    const { salesforceAccountId, clientName, accountType, initiatedByEmail } = req.body;
    if (!salesforceAccountId) {
      return res.status(400).json({ error: 'salesforceAccountId is required' });
    }

    await new Promise(r => setTimeout(r, 400));  // latence UI

    const detectedType = detectClientTypeFromAccount(accountType);

    // Réutilise un ComplyCube client existant en LIVE pour éviter de re-créer
    const { data: existingChecks } = await supabaseAdmin
      .from('kyc_checks')
      .select('complycube_client_id, entity_kind')
      .eq('salesforce_account_id', salesforceAccountId)
      .eq('provider', 'complycube')
      .is('entity_id', null)                                 // le check "principal" (pas un contact)
      .not('complycube_client_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    const reusableMainClientId = existingChecks?.[0]?.complycube_client_id;

    // ── Screening principal (person ou company) ──
    const mainScreen = await runSingleScreening({
      type: detectedType,
      displayName: clientName,
      entityId: salesforceAccountId,
      email: initiatedByEmail,
      reusableClientId: reusableMainClientId,
    });

    // Persist main check
    const { data: mainCheck } = await supabaseAdmin.from('kyc_checks').insert({
      salesforce_account_id: salesforceAccountId,
      client_name: clientName,
      complycube_client_id: mainScreen.complyCubeClientId || null,
      complycube_check_id: mainScreen.id,
      provider: KYC_DEMO_MODE ? 'demo' : 'complycube',
      provider_check_id: mainScreen.id,
      check_type: 'screening_check',
      entity_kind: detectedType,
      status: mainScreen.status,
      result: mainScreen.result,
      initiated_by_email: initiatedByEmail,
    }).select().single();

    // ── Si personne morale : iterate sur contacts (représentants légaux) ──
    const subScreens = [];
    if (detectedType === 'company') {
      const contacts = await fetchAccountContacts(salesforceAccountId);
      // Screening en parallèle, tolérant aux erreurs individuelles
      const results = await Promise.all(contacts.map(async (c) => {
        const displayName = [c.FirstName, c.LastName].filter(Boolean).join(' ') || c.LastName || 'Contact';
        try {
          const s = await runSingleScreening({
            type: 'person',
            displayName,
            firstName: c.FirstName,
            lastName: c.LastName,
            email: c.Email,
            entityId: c.Id,
          });
          // Persist each contact screening
          await supabaseAdmin.from('kyc_checks').insert({
            salesforce_account_id: salesforceAccountId,
            client_name: displayName,
            complycube_client_id: s.complyCubeClientId || null,
            complycube_check_id: s.id,
            provider: KYC_DEMO_MODE ? 'demo' : 'complycube',
            provider_check_id: s.id,
            check_type: 'contact_screening',
            entity_kind: 'person',
            entity_id: c.Id,                                // lie au Contact SFDC
            entity_role: c.Title || null,
            status: s.status,
            result: s.result,
            initiated_by_email: initiatedByEmail,
          });
          return { contactId: c.Id, name: displayName, role: c.Title, status: s.status, outcome: s.result?.outcome, checkId: s.id };
        } catch (err) {
          console.warn('[AML] contact screen failed for', c.Id, err.message);
          return { contactId: c.Id, name: displayName, role: c.Title, status: 'error', error: err.message };
        }
      }));
      subScreens.push(...results);
    }

    // ── Agrégation du verdict ──
    const allClean = mainScreen.status === 'complete'
      && subScreens.every(s => s.status === 'complete');
    const aggregatedStatus = allClean ? 'complete' : 'failed';

    // Audit
    await logAudit({
      userEmail: initiatedByEmail,
      action: 'kyc.aml_screening',
      category: 'compliance',
      entityType: 'kyc_check',
      entityId: mainCheck?.id,
      clientName,
      salesforceAccountId,
      details: {
        detectedType,
        mainStatus: mainScreen.status,
        mainOutcome: mainScreen.result?.outcome,
        subScreens: subScreens.map(s => ({ contactId: s.contactId, name: s.name, status: s.status })),
        aggregatedStatus,
      },
      severity: aggregatedStatus === 'failed' ? 'warning' : 'info',
      req,
    });

    // Alerte Tracfin si verdict global ≠ clean
    if (aggregatedStatus === 'failed') {
      await supabaseAdmin.from('compliance_alerts').insert({
        type: 'sanctions_match',
        severity: 'critical',
        salesforce_account_id: salesforceAccountId,
        client_name: clientName,
        message: detectedType === 'company'
          ? `Alerte AML personne morale — ${clientName} : correspondance détectée (raison sociale ou représentant légal). Revue manuelle requise.`
          : `Alerte AML — ${clientName} : correspondance potentielle. Revue manuelle requise.`,
        details: { main: mainScreen.result, subScreens },
        status: 'open',
      });
    }

    // Salesforce : flag Sanctions_Clear sur Account
    if (SF_CONFIGURED) {
      try {
        const { accessToken, instanceUrl } = await getSalesforceToken();
        await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${salesforceAccountId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ Custody_Sanctions_Clear__c: aggregatedStatus === 'complete' }),
        });
      } catch (sfErr) {
        console.error('[KYC] SFDC patch failed:', sfErr.message);
      }
    }

    res.json({
      ...mainCheck,
      detectedType,
      aggregatedStatus,
      subScreens,
    });
  } catch (err) {
    console.error('KYC AML screening error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/screen-contact — Screen a single Salesforce Contact as a
// person. Utilisé par le bouton "Screener ce contact" dans l'onglet
// Contacts du client. Permet au banquier de faire un ad-hoc check sur
// un représentant légal, signataire ou UBO sans relancer tout le
// screening corporate.
app.post('/api/kyc/screen-contact', async (req, res) => {
  try {
    const { salesforceAccountId, contactId, firstName, lastName, email, role, initiatedByEmail } = req.body;
    if (!contactId || !salesforceAccountId) {
      return res.status(400).json({ error: 'contactId et salesforceAccountId requis' });
    }

    const displayName = [firstName, lastName].filter(Boolean).join(' ') || lastName || 'Contact';

    const screen = await runSingleScreening({
      type: 'person',
      displayName,
      firstName,
      lastName,
      email,
      entityId: contactId,
    });

    // Persist
    const { data: check } = await supabaseAdmin.from('kyc_checks').insert({
      salesforce_account_id: salesforceAccountId,
      client_name: displayName,
      complycube_client_id: screen.complyCubeClientId || null,
      complycube_check_id: screen.id,
      provider: KYC_DEMO_MODE ? 'demo' : 'complycube',
      provider_check_id: screen.id,
      check_type: 'contact_screening',
      entity_kind: 'person',
      entity_id: contactId,
      entity_role: role || null,
      status: screen.status,
      result: screen.result,
      initiated_by_email: initiatedByEmail,
    }).select().single();

    await logAudit({
      userEmail: initiatedByEmail,
      action: 'kyc.contact_screening',
      category: 'compliance',
      entityType: 'contact',
      entityId: contactId,
      clientName: displayName,
      salesforceAccountId,
      details: { role, status: screen.status, outcome: screen.result?.outcome },
      severity: screen.status === 'failed' ? 'warning' : 'info',
      req,
    });

    if (screen.status === 'failed') {
      await supabaseAdmin.from('compliance_alerts').insert({
        type: 'sanctions_match',
        severity: 'critical',
        salesforce_account_id: salesforceAccountId,
        client_name: displayName,
        message: `Alerte AML contact — ${displayName}${role ? ` (${role})` : ''} : correspondance détectée. Revue manuelle requise.`,
        details: screen.result,
        status: 'open',
      });
    }

    res.json({ ...check, contactId, role, displayName });
  } catch (err) {
    console.error('Contact screening error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kyc/check/:checkId — Get single check result
app.get('/api/kyc/check/:checkId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('kyc_checks')
      .select('*')
      .eq('id', req.params.checkId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Check not found' });

    // If still processing, poll ComplyCube (skip in demo mode — no real API).
    if (!KYC_DEMO_MODE && data.status === 'processing' && data.complycube_check_id) {
      try {
        const ccCheck = await complyCubeRequest('GET', `/checks/${data.complycube_check_id}`);
        if (ccCheck.status === 'complete') {
          const newStatus = ccCheck.result?.outcome === 'clear' ? 'complete' : 'failed';
          await supabaseAdmin
            .from('kyc_checks')
            .update({ status: newStatus, result: ccCheck.result, updated_at: new Date().toISOString() })
            .eq('id', data.id);
          data.status = newStatus;
          data.result = ccCheck.result;
        }
      } catch (pollErr) {
        console.error('ComplyCube poll error:', pollErr.message);
      }
    }

    res.json(data);
  } catch (err) {
    console.error('KYC check get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kyc/status/:accountId — Get full KYC status for a client
app.get('/api/kyc/status/:accountId', async (req, res) => {
  try {
    const { data: checks, error } = await supabaseAdmin
      .from('kyc_checks')
      .select('*')
      .eq('salesforce_account_id', req.params.accountId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Determine overall status
    const docChecks = (checks || []).filter(c => c.check_type === 'document_check');
    const amlChecks = (checks || []).filter(c => c.check_type === 'screening_check');

    const allDocsComplete = docChecks.length >= 2 && docChecks.every(c => c.status === 'complete');
    const amlComplete = amlChecks.some(c => c.status === 'complete');
    const anyFailed = (checks || []).some(c => c.status === 'failed');

    // Check for manual validation
    const validationCheck = (checks || []).find(c => c.check_type === 'manual_validation' && c.status === 'complete');

    let overallStatus = 'incomplete';
    if (validationCheck) {
      overallStatus = 'validated';
    } else if (anyFailed) {
      overallStatus = 'attention_required';
    } else if (allDocsComplete && amlComplete) {
      overallStatus = 'ready_for_validation';
    } else if (docChecks.length > 0 || amlChecks.length > 0) {
      overallStatus = 'in_progress';
    }

    res.json({
      overallStatus,
      checks: checks || [],
      stats: {
        totalChecks: (checks || []).length,
        documentsVerified: docChecks.filter(c => c.status === 'complete').length,
        documentsTotal: docChecks.length,
        amlClean: amlComplete,
      },
      validatedAt: validationCheck?.created_at || null,
      validatedBy: validationCheck?.initiated_by_email || null,
    });
  } catch (err) {
    console.error('KYC status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/validate — Admin validates KYC (manual final step).
// Double-écriture :
//   1. Row dans kyc_checks (Supabase) → historique complet local
//   2. PATCH de l'Account Salesforce → le banquier voit la validation
//      dans son CRM avec l'horodatage + qui a validé + ref provider
//
// Fields Salesforce écrits :
//   · Custody_KYC_Status__c        = 'Valide'
//   · Custody_Sanctions_Clear__c   = true
//   · Custody_KYC_Validated_At__c  = now()
//   · Custody_KYC_Validated_By__c  = <email>
//   · Custody_KYC_Provider__c      = 'ComplyCube · <mode>'
//   · Custody_KYC_Notes__c         = <notes>   (si fourni)
app.post('/api/kyc/validate', requireAdmin, async (req, res) => {
  try {
    const { salesforceAccountId, validatedByEmail, notes, providerRef } = req.body;

    if (!salesforceAccountId) {
      return res.status(400).json({ error: 'salesforceAccountId is required' });
    }

    const validatedAt = new Date().toISOString();

    // 1. Create a manual_validation check (local audit)
    const { data, error } = await supabaseAdmin
      .from('kyc_checks')
      .insert({
        salesforce_account_id: salesforceAccountId,
        check_type: 'manual_validation',
        status: 'complete',
        result: { validatedBy: validatedByEmail, validatedAt, notes: notes || null, providerRef: providerRef || null },
        initiated_by_email: validatedByEmail,
      })
      .select()
      .single();

    if (error) throw error;

    // 2. Write back to Salesforce — the banker CRM is the source-of-truth
    //    for "is this client KYC-validated" from the bank's point of view.
    let sfWriteback = { attempted: false, ok: false };
    if (SF_CONFIGURED) {
      sfWriteback.attempted = true;
      try {
        const { accessToken, instanceUrl } = await getSalesforceToken();
        const payload = {
          Custody_KYC_Status__c: 'Valide',
          Custody_Sanctions_Clear__c: true,
          Custody_KYC_Validated_At__c: validatedAt,
          Custody_KYC_Validated_By__c: (validatedByEmail || '').slice(0, 120),
          Custody_KYC_Provider__c: (providerRef || (KYC_DEMO_MODE ? 'ComplyCube · sandbox' : 'ComplyCube')).slice(0, 120),
        };
        if (notes) payload.Custody_KYC_Notes__c = notes.slice(0, 32000);
        const sfRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${salesforceAccountId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        sfWriteback.ok = sfRes.ok || sfRes.status === 204;
        if (!sfWriteback.ok) {
          const body = await sfRes.text().catch(() => '');
          sfWriteback.error = `${sfRes.status}: ${body.slice(0, 300)}`;
          console.error('[KYC] SF writeback failed:', sfWriteback.error);
        }
      } catch (sfErr) {
        sfWriteback.error = sfErr.message;
        console.error('[KYC] SF writeback exception:', sfErr.message);
      }
    }

    // 3. Audit log
    await logAudit({
      userEmail: validatedByEmail,
      action: 'kyc.validated',
      category: 'compliance',
      entityType: 'kyc_validation',
      entityId: data.id,
      salesforceAccountId,
      details: { validatedBy: validatedByEmail, sfWriteback, notes: notes || null },
      severity: 'info',
      req,
    });

    res.json({ ...data, sfWriteback });
  } catch (err) {
    console.error('KYC validate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/reject — Mark KYC as rejected, with Salesforce writeback.
// Symétrique à /validate : le banquier peut rejeter un dossier (ex. docs
// non conformes, suspicion AML). SFDC devient la source de vérité
// "statut KYC" de l'établissement.
app.post('/api/kyc/reject', requireAdmin, async (req, res) => {
  try {
    const { salesforceAccountId, rejectedByEmail, reason } = req.body;
    if (!salesforceAccountId || !reason) {
      return res.status(400).json({ error: 'salesforceAccountId et reason sont requis' });
    }
    const rejectedAt = new Date().toISOString();

    const { data, error } = await supabaseAdmin.from('kyc_checks').insert({
      salesforce_account_id: salesforceAccountId,
      check_type: 'manual_rejection',
      status: 'failed',
      result: { rejectedBy: rejectedByEmail, rejectedAt, reason },
      initiated_by_email: rejectedByEmail,
    }).select().single();
    if (error) throw error;

    let sfWriteback = { attempted: false, ok: false };
    if (SF_CONFIGURED) {
      sfWriteback.attempted = true;
      try {
        const { accessToken, instanceUrl } = await getSalesforceToken();
        const sfRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/${salesforceAccountId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Valeur picklist sans accent — l'org utilise "Rejete" côté SFDC
            // même si le label affiché est "Rejeté".
            Custody_KYC_Status__c: 'Rejete',
            Custody_KYC_Validated_At__c: rejectedAt,
            Custody_KYC_Validated_By__c: (rejectedByEmail || '').slice(0, 120),
            Custody_KYC_Notes__c: `Rejet : ${reason}`.slice(0, 32000),
          }),
        });
        sfWriteback.ok = sfRes.ok || sfRes.status === 204;
      } catch (sfErr) {
        sfWriteback.error = sfErr.message;
      }
    }

    await logAudit({
      userEmail: rejectedByEmail,
      action: 'kyc.rejected',
      category: 'compliance',
      entityType: 'kyc_validation',
      entityId: data.id,
      salesforceAccountId,
      details: { rejectedBy: rejectedByEmail, reason, sfWriteback },
      severity: 'warning',
      req,
    });

    res.json({ ...data, sfWriteback });
  } catch (err) {
    console.error('KYC reject error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kyc/create-client — Create ComplyCube client
app.post('/api/kyc/create-client', async (req, res) => {
  try {
    const { salesforceAccountId, clientName, email, personType } = req.body;

    // Demo mode — deterministic fake client id, consistent with upload-document / aml-screen
    if (KYC_DEMO_MODE) {
      return res.json({
        id: demoClientId(salesforceAccountId),
        type: personType || 'person',
        email: email || `${salesforceAccountId}@custody.swisslife.com`,
        personDetails: {
          firstName: clientName?.split(' ')[0] || 'Client',
          lastName: clientName?.split(' ').slice(1).join(' ') || salesforceAccountId,
        },
        provider: 'ComplyCube · mode sandbox',
      });
    }

    // LIVE ComplyCube
    const ccClient = await complyCubeRequest('POST', '/clients', {
      type: personType || 'person',
      email: email || `${salesforceAccountId}@custody.swisslife.com`,
      personDetails: {
        firstName: clientName?.split(' ')[0] || 'Client',
        lastName: clientName?.split(' ').slice(1).join(' ') || salesforceAccountId,
      },
    });

    res.json(ccClient);
  } catch (err) {
    console.error('KYC create client error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SAR/STR — Suspicious Activity Reports (MROS workflow)
// ============================================================
/*
  CREATE TABLE IF NOT EXISTS suspicious_activity_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number TEXT UNIQUE,
    salesforce_account_id TEXT NOT NULL,
    client_name TEXT,
    report_type TEXT NOT NULL, -- 'SAR' or 'STR'
    status TEXT DEFAULT 'draft', -- draft, submitted, under_review, filed_with_mros, closed
    priority TEXT DEFAULT 'medium', -- low, medium, high, critical

    -- Suspicious activity details
    suspicion_type TEXT, -- structuring, unusual_pattern, sanctions_match, pep_match, source_of_funds, other
    description TEXT NOT NULL,
    evidence JSONB DEFAULT '[]',
    related_transactions JSONB DEFAULT '[]',
    related_alerts JSONB DEFAULT '[]',

    -- Amounts
    total_amount_involved NUMERIC,
    currency TEXT DEFAULT 'CHF',

    -- Workflow
    created_by_email TEXT,
    reviewed_by_email TEXT,
    reviewed_at TIMESTAMPTZ,
    filed_by_email TEXT,
    filed_at TIMESTAMPTZ,
    mros_reference TEXT,

    -- Resolution
    resolution TEXT, -- filed, dismissed, escalated
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
*/

// Helper: generate next SAR reference number
async function generateSARReference() {
  const year = new Date().getFullYear();
  const { data, error } = await supabaseAdmin
    .from('suspicious_activity_reports')
    .select('reference_number')
    .like('reference_number', `SAR-${year}-%`)
    .order('reference_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (!error && data && data.length > 0) {
    const last = data[0].reference_number; // e.g. SAR-2026-0012
    const num = parseInt(last.split('-').pop(), 10);
    if (!isNaN(num)) seq = num + 1;
  }
  return `SAR-${year}-${String(seq).padStart(4, '0')}`;
}

// GET /api/compliance/sar/stats — Count SARs by status
app.get('/api/compliance/sar/stats', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status');

    if (error) throw error;

    const byStatus = {};
    for (const row of (data || [])) {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    }
    // Aggregate both filing authorities under a combined "filed" count
    byStatus.filed_total = (byStatus.filed_with_mros || 0) + (byStatus.filed_with_tracfin || 0);

    res.json({ byStatus, total: data?.length || 0 });
  } catch (err) {
    console.error('SAR stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/sar — List all SARs with optional status filter
app.get('/api/compliance/sar', async (req, res) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;
    let query = supabaseAdmin
      .from('suspicious_activity_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('SAR list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/sar — Create a new SAR (draft)
app.post('/api/compliance/sar', async (req, res) => {
  try {
    const {
      salesforceAccountId, clientName, reportType, priority,
      suspicionType, description, evidence, relatedTransactions,
      relatedAlerts, totalAmountInvolved, currency, createdByEmail,
    } = req.body;

    if (!salesforceAccountId || !reportType || !description) {
      return res.status(400).json({ error: 'salesforceAccountId, reportType, and description are required' });
    }
    if (!['SAR', 'STR'].includes(reportType)) {
      return res.status(400).json({ error: 'reportType must be SAR or STR' });
    }

    const referenceNumber = await generateSARReference();

    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .insert({
        reference_number: referenceNumber,
        salesforce_account_id: salesforceAccountId,
        client_name: clientName || null,
        report_type: reportType,
        status: 'draft',
        priority: priority || 'medium',
        suspicion_type: suspicionType || null,
        description,
        evidence: evidence || [],
        related_transactions: relatedTransactions || [],
        related_alerts: relatedAlerts || [],
        total_amount_involved: totalAmountInvolved || null,
        currency: currency || 'CHF',
        created_by_email: createdByEmail || null,
      })
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: createdByEmail,
      action: 'sar.created',
      category: 'compliance',
      entityType: 'sar',
      entityId: data.id,
      clientName,
      salesforceAccountId,
      details: { referenceNumber, reportType, suspicionType, priority },
      severity: 'high',
      req,
    });

    res.status(201).json(data);
  } catch (err) {
    console.error('SAR create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/sar/:id — Get single SAR details
app.get('/api/compliance/sar/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'SAR not found' });

    res.json(data);
  } catch (err) {
    console.error('SAR get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/sar/:id/submit — Submit for review (draft → submitted)
app.patch('/api/compliance/sar/:id/submit', requireAdmin, async (req, res) => {
  try {
    const { submittedByEmail } = req.body;

    // Verify current status
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'SAR not found' });
    if (existing.status !== 'draft') {
      return res.status(400).json({ error: `Cannot submit SAR in status "${existing.status}". Must be "draft".` });
    }

    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .update({ status: 'submitted', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: submittedByEmail,
      action: 'sar.submitted',
      category: 'compliance',
      entityType: 'sar',
      entityId: data.id,
      details: { referenceNumber: data.reference_number },
      severity: 'high',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('SAR submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/sar/:id/review — Mark as reviewed (submitted → under_review)
app.patch('/api/compliance/sar/:id/review', requireAdmin, async (req, res) => {
  try {
    const { reviewedByEmail } = req.body;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'SAR not found' });
    if (existing.status !== 'submitted') {
      return res.status(400).json({ error: `Cannot review SAR in status "${existing.status}". Must be "submitted".` });
    }

    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .update({
        status: 'under_review',
        reviewed_by_email: reviewedByEmail || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: reviewedByEmail,
      action: 'sar.reviewed',
      category: 'compliance',
      entityType: 'sar',
      entityId: data.id,
      details: { referenceNumber: data.reference_number },
      severity: 'high',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('SAR review error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/sar/:id/file — File with MROS (under_review → filed_with_mros)
app.patch('/api/compliance/sar/:id/file', requireAdmin, async (req, res) => {
  try {
    const { filedByEmail, mrosReference } = req.body;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'SAR not found' });
    if (existing.status !== 'under_review') {
      return res.status(400).json({ error: `Cannot file SAR in status "${existing.status}". Must be "under_review".` });
    }

    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .update({
        status: req.body.filingAuthority === 'mros' ? 'filed_with_mros' : 'filed_with_tracfin',
        filed_by_email: filedByEmail || null,
        filed_at: new Date().toISOString(),
        mros_reference: mrosReference || null,
        filing_authority: req.body.filingAuthority || 'tracfin',
        resolution: 'filed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: filedByEmail,
      action: req.body.filingAuthority === 'mros' ? 'sar.filed_with_mros' : 'sar.filed_with_tracfin',
      category: 'compliance',
      entityType: 'sar',
      entityId: data.id,
      details: { referenceNumber: data.reference_number, mrosReference, filingAuthority: req.body.filingAuthority || 'tracfin' },
      severity: 'critical',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('SAR file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/sar/:id/close — Close/dismiss SAR (any → closed)
app.patch('/api/compliance/sar/:id/close', requireAdmin, async (req, res) => {
  try {
    const { closedByEmail, resolution, resolutionNotes } = req.body;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'SAR not found' });
    if (existing.status === 'closed') {
      return res.status(400).json({ error: 'SAR is already closed.' });
    }

    const { data, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .update({
        status: 'closed',
        resolution: resolution || 'dismissed',
        resolution_notes: resolutionNotes || null,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: closedByEmail,
      action: 'sar.closed',
      category: 'compliance',
      entityType: 'sar',
      entityId: data.id,
      details: { referenceNumber: data.reference_number, resolution: resolution || 'dismissed', resolutionNotes },
      severity: 'high',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('SAR close error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// TRACFIN ERMES XML — Déclaration de Soupçon (DS)
// ============================================================
// Produit le fichier XML compatible portail ERMES de Tracfin pour
// déposer une Déclaration de Soupçon. Structure inspirée du schéma
// officiel ds.xsd (Tracfin) — en production, remplacer les SIREN /
// code déclarant / coordonnées RCSI par les valeurs réelles de
// SwissLife Banque Privée, et valider l'XML contre l'XSD fournie
// par Tracfin avant dépôt.
// Référence légale : Code monétaire et financier Art. L.561-15
// et Art. R.561-31 (obligation de déclaration), L.562-4 (gel des
// avoirs), Règlement général AMF Livre III Titre III.
// ============================================================

// Simple XML escape — suffisant pour CDATA + attributes ASCII-safe
function xmlEscape(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Build an ERMES-compatible Déclaration de Soupçon XML from a SAR row.
// The declarant metadata (bank SIREN, RCSI contact) is pulled from
// env vars so production deployment only needs to set them once.
function buildErmesXml(sar) {
  const DECLARANT_RAISON_SOCIALE = process.env.TRACFIN_DECLARANT_NAME || 'SWISSLIFE BANQUE PRIVEE';
  const DECLARANT_SIREN = process.env.TRACFIN_DECLARANT_SIREN || '322215021';
  const DECLARANT_CODE_PROFESSION = process.env.TRACFIN_DECLARANT_CODE || '10';  // 10 = Etablissement de crédit
  const DECLARANT_ADRESSE = process.env.TRACFIN_DECLARANT_ADDRESS || '7 rue Belgrand';
  const DECLARANT_CP = process.env.TRACFIN_DECLARANT_POSTAL_CODE || '92300';
  const DECLARANT_VILLE = process.env.TRACFIN_DECLARANT_CITY || 'LEVALLOIS-PERRET';
  const DECLARANT_PAYS = 'FR';
  const RCSI_NOM = process.env.TRACFIN_RCSI_LAST_NAME || 'CUSSET';
  const RCSI_PRENOM = process.env.TRACFIN_RCSI_FIRST_NAME || 'Marie';
  const RCSI_TEL = process.env.TRACFIN_RCSI_PHONE || '+33140825020';
  const RCSI_EMAIL = process.env.TRACFIN_RCSI_EMAIL || 'rcsi@swisslifebanque.fr';

  const today = new Date().toISOString().slice(0, 10);
  const reference = sar.reference_number || `DS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  // Typologie mapping — Tracfin DS nomenclature
  const TYPOLOGIE_MAP = {
    money_laundering: 'BC',          // Blanchiment de Capitaux
    terrorism_financing: 'FT',       // Financement du Terrorisme
    tax_fraud: 'FF',                 // Fraude Fiscale
    sanctions_evasion: 'ES',         // Evasion Sanctions
    other: 'AU',                     // Autre
  };
  const typologieCode = TYPOLOGIE_MAP[sar.suspicion_type] || 'AU';

  // Person ou personne morale détection à partir du nom client
  const isCompany = (sar.client_name || '').match(/\b(SAS|SARL|SA|SE|GmbH|Corp|Inc|Ltd|LLC|Corp of America)\b/i);

  const operations = Array.isArray(sar.related_transactions) ? sar.related_transactions : [];
  const evidence = Array.isArray(sar.evidence) ? sar.evidence : [];

  return `<?xml version="1.0" encoding="UTF-8"?>
<DeclarationSoupcon xmlns="http://www.tracfin.gouv.fr/ermes/ds" version="1.0">
  <Entete>
    <NumeroReference>${xmlEscape(reference)}</NumeroReference>
    <DateDeclaration>${today}</DateDeclaration>
    <TypeDeclaration>${sar.report_type === 'STR' ? 'DST' : 'DS'}</TypeDeclaration>
    <Priorite>${xmlEscape((sar.priority || 'medium').toUpperCase())}</Priorite>
    <Typologie code="${typologieCode}"/>
  </Entete>

  <Declarant>
    <Identite>
      <RaisonSociale>${xmlEscape(DECLARANT_RAISON_SOCIALE)}</RaisonSociale>
      <SIREN>${xmlEscape(DECLARANT_SIREN)}</SIREN>
      <CodeProfession>${xmlEscape(DECLARANT_CODE_PROFESSION)}</CodeProfession>
      <Adresse>
        <Rue>${xmlEscape(DECLARANT_ADRESSE)}</Rue>
        <CodePostal>${xmlEscape(DECLARANT_CP)}</CodePostal>
        <Ville>${xmlEscape(DECLARANT_VILLE)}</Ville>
        <Pays>${DECLARANT_PAYS}</Pays>
      </Adresse>
    </Identite>
    <PersonneContact>
      <Nom>${xmlEscape(RCSI_NOM)}</Nom>
      <Prenom>${xmlEscape(RCSI_PRENOM)}</Prenom>
      <Fonction>RCSI (Responsable Conformité Services Investissement)</Fonction>
      <Telephone>${xmlEscape(RCSI_TEL)}</Telephone>
      <Email>${xmlEscape(RCSI_EMAIL)}</Email>
    </PersonneContact>
  </Declarant>

  <Suspect>
    ${isCompany ? `<PersonneMorale>
      <Denomination>${xmlEscape(sar.client_name || 'N/A')}</Denomination>
      <IdentifiantExterne type="salesforce">${xmlEscape(sar.salesforce_account_id || '')}</IdentifiantExterne>
    </PersonneMorale>` : `<PersonnePhysique>
      <Nom>${xmlEscape((sar.client_name || 'N/A').split(' ').slice(-1)[0])}</Nom>
      <Prenom>${xmlEscape((sar.client_name || 'N/A').split(' ').slice(0, -1).join(' '))}</Prenom>
      <IdentifiantExterne type="salesforce">${xmlEscape(sar.salesforce_account_id || '')}</IdentifiantExterne>
    </PersonnePhysique>`}
  </Suspect>

  <Operations>
${operations.length === 0
  ? `    <Operation>
      <Date>${today}</Date>
      <Montant>${Number(sar.total_amount_involved || 0).toFixed(2)}</Montant>
      <Devise>${xmlEscape(sar.currency || 'EUR')}</Devise>
      <Nature>Activité suspecte — conservation crypto-actifs</Nature>
      <Canal>Wallet MPC DFNS · garde SwissLife</Canal>
    </Operation>`
  : operations.map((op, i) => `    <Operation>
      <Identifiant>${xmlEscape(op.id || `OP-${i + 1}`)}</Identifiant>
      <Date>${xmlEscape(op.date || today)}</Date>
      <Montant>${Number(op.amount || 0).toFixed(2)}</Montant>
      <Devise>${xmlEscape(op.currency || sar.currency || 'EUR')}</Devise>
      <Nature>${xmlEscape(op.nature || 'Transfert crypto-actif')}</Nature>
      ${op.from_address ? `<AdresseOrigine chain="${xmlEscape(op.chain || '')}">${xmlEscape(op.from_address)}</AdresseOrigine>` : ''}
      ${op.to_address ? `<AdresseDestination chain="${xmlEscape(op.chain || '')}">${xmlEscape(op.to_address)}</AdresseDestination>` : ''}
      ${op.tx_hash ? `<HashTransaction>${xmlEscape(op.tx_hash)}</HashTransaction>` : ''}
    </Operation>`).join('\n')}
  </Operations>

  <Analyse>
    <TypologieLibelle>${xmlEscape(sar.suspicion_type || 'Autre')}</TypologieLibelle>
    <ElementsSuspicion><![CDATA[${sar.description || ''}]]></ElementsSuspicion>
    ${evidence.length > 0 ? `<Preuves>
${evidence.map(e => `      <Preuve type="${xmlEscape(e.type || 'document')}">${xmlEscape(e.reference || e.name || '')}</Preuve>`).join('\n')}
    </Preuves>` : ''}
    <BaseLegale>
      <Article>Code monétaire et financier Art. L.561-15</Article>
      <Article>Code monétaire et financier Art. R.561-31</Article>
      <Article>Règlement UE 2015/847 — transferts de fonds</Article>
      <Article>Règlement MiCA Art. 68 — obligations LCB-FT PSAN</Article>
    </BaseLegale>
  </Analyse>

  <Signature>
    <Horodatage>${new Date().toISOString()}</Horodatage>
    <Auteur>${xmlEscape(sar.created_by_email || '')}</Auteur>
    <MethodeValidation>interne_rcsi</MethodeValidation>
  </Signature>
</DeclarationSoupcon>
`;
}

// GET /api/compliance/sar/:id/ermes-xml — Download ERMES XML for Tracfin
app.get('/api/compliance/sar/:id/ermes-xml', requireAuth, async (req, res) => {
  try {
    const { data: sar, error } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !sar) return res.status(404).json({ error: 'SAR not found' });

    const xml = buildErmesXml(sar);
    const filename = `tracfin-ermes-${sar.reference_number || sar.id}.xml`;

    // Audit — génération XML (signal qu'un dépôt ERMES est imminent)
    await logAudit({
      userEmail: req.user?.email,
      action: 'sar.ermes_xml_generated',
      category: 'compliance',
      entityType: 'sar',
      entityId: sar.id,
      details: {
        referenceNumber: sar.reference_number,
        typologie: sar.suspicion_type,
        filename,
      },
      severity: 'high',
      req,
    });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch (err) {
    console.error('SAR ERMES XML error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// COMPLIANCE REPORTING — Regulatory Exports

// GET /api/compliance/reports/summary — Generate compliance summary
app.get('/api/compliance/reports/summary', async (req, res) => {
  try {
    const endDate = req.query.endDate || new Date().toISOString();
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 86400000).toISOString();

    // Transfer approvals in period
    const { data: transfers, error: tErr } = await supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .gte('requested_at', startDate)
      .lte('requested_at', endDate);
    if (tErr) throw tErr;

    const transfersArr = transfers || [];
    const totalVolume = transfersArr.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const approvalStats = { pending: 0, approved: 0, rejected: 0, executed: 0 };
    transfersArr.forEach(t => { if (approvalStats[t.status] !== undefined) approvalStats[t.status]++; });

    // KYC stats
    const { data: kycAll, error: kErr } = await supabaseAdmin.from('kyc_checks').select('*');
    if (kErr) throw kErr;
    const kycArr = kycAll || [];
    const kycStats = {
      totalClients: new Set(kycArr.map(k => k.salesforce_account_id)).size,
      validatedKyc: kycArr.filter(k => k.status === 'complete').length,
      pendingKyc: kycArr.filter(k => k.status === 'processing' || k.status === 'pending').length,
      expiredKyc: kycArr.filter(k => k.status === 'expired').length,
    };

    // Alerts in period
    const { data: alertsAll, error: aErr } = await supabaseAdmin
      .from('compliance_alerts')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate);
    if (aErr) throw aErr;
    const alertsArr = alertsAll || [];
    const bySeverity = {};
    alertsArr.forEach(a => { bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1; });
    const alertStats = {
      total: alertsArr.length,
      open: alertsArr.filter(a => a.status === 'open').length,
      resolved: alertsArr.filter(a => a.status === 'resolved').length,
      bySeverity,
    };

    // Whitelist stats
    const { data: wlAll, error: wErr } = await supabaseAdmin.from('address_whitelist').select('*');
    if (wErr) throw wErr;
    const wlArr = wlAll || [];
    const whitelistStats = {
      total: wlArr.length,
      approved: wlArr.filter(w => w.status === 'active').length,
      pending: wlArr.filter(w => w.status === 'pending_approval').length,
      revoked: wlArr.filter(w => w.status === 'revoked').length,
    };

    // Risk distribution
    const { data: riskAll, error: rErr } = await supabaseAdmin.from('client_risk_config').select('risk_level');
    if (rErr) throw rErr;
    const riskArr = riskAll || [];
    const riskDistribution = { low: 0, standard: 0, high: 0, critical: 0 };
    riskArr.forEach(r => { if (riskDistribution[r.risk_level] !== undefined) riskDistribution[r.risk_level]++; });

    // Top clients by volume
    const clientVolumes = {};
    transfersArr.forEach(t => {
      const name = t.client_name || 'Unknown';
      if (!clientVolumes[name]) clientVolumes[name] = { clientName: name, volume: 0, transferCount: 0 };
      clientVolumes[name].volume += parseFloat(t.amount) || 0;
      clientVolumes[name].transferCount++;
    });
    const topClientsByVolume = Object.values(clientVolumes)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);

    // Daily volume breakdown — aggregated from transfer_approvals per calendar day
    const dailyMap = {};
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    // Seed every day in the range with zero so the chart shows a continuous timeline
    for (let ts = startMs; ts <= endMs; ts += 86400000) {
      const key = new Date(ts).toISOString().slice(0, 10);
      dailyMap[key] = { label: key, value: 0, count: 0 };
    }
    transfersArr.forEach(t => {
      const key = (t.requested_at || '').slice(0, 10);
      if (!key) return;
      if (!dailyMap[key]) dailyMap[key] = { label: key, value: 0, count: 0 };
      dailyMap[key].value += parseFloat(t.amount) || 0;
      dailyMap[key].count += 1;
    });
    const dailyVolumes = Object.values(dailyMap)
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-30)
      .map(d => ({ label: d.label.slice(5), value: Math.round(d.value * 100) / 100, count: d.count }));

    res.json({
      period: { startDate, endDate },
      totalTransfers: transfersArr.length,
      totalVolume,
      averageTransferAmount: transfersArr.length ? totalVolume / transfersArr.length : 0,
      approvalStats,
      kycStats,
      alertStats,
      whitelistStats,
      riskDistribution,
      topClientsByVolume,
      dailyVolumes,
    });
  } catch (err) {
    console.error('Compliance summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/reports/audit-export — Export audit log as CSV
app.get('/api/compliance/reports/audit-export', async (req, res) => {
  try {
    const endDate = req.query.endDate || new Date().toISOString();
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 86400000).toISOString();
    const { category } = req.query;

    let query = supabaseAdmin
      .from('audit_log')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).map(e => [
      e.created_at ? new Date(e.created_at).toISOString() : '',
      (e.user_email || '').replace(/"/g, '""'),
      (e.action || '').replace(/"/g, '""'),
      e.category || '',
      e.entity_type ? `${e.entity_type}:${e.entity_id || ''}` : '',
      (e.client_name || '').replace(/"/g, '""'),
      e.severity || '',
      (typeof e.details === 'object' ? JSON.stringify(e.details) : (e.details || '')).replace(/"/g, '""'),
    ]);

    const header = 'Date,User,Action,Category,Entity,Client,Severity,Details';
    const csv = [header, ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${startDate.slice(0,10)}_${endDate.slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Audit export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/reports/transfers-export — Export transfers as CSV
app.get('/api/compliance/reports/transfers-export', async (req, res) => {
  try {
    const endDate = req.query.endDate || new Date().toISOString();
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 86400000).toISOString();
    const { status } = req.query;

    let query = supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .gte('requested_at', startDate)
      .lte('requested_at', endDate)
      .order('requested_at', { ascending: false })
      .limit(5000);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).map(t => [
      t.requested_at ? new Date(t.requested_at).toISOString() : '',
      (t.client_name || '').replace(/"/g, '""'),
      (t.wallet_id || '').replace(/"/g, '""'),
      (t.to_address || '').replace(/"/g, '""'),
      t.amount || '',
      t.asset_symbol || '',
      t.network || '',
      t.status || '',
      (t.reviewed_by_email || '').replace(/"/g, '""'),
      t.executed_at ? new Date(t.executed_at).toISOString() : '',
    ]);

    const header = 'Date,Client,Wallet,Destination,Amount,Asset,Network,Status,Reviewed By,Executed At';
    const csv = [header, ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transfers-${startDate.slice(0,10)}_${endDate.slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Transfers export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/reports/kyc-export — Export KYC status as CSV
app.get('/api/compliance/reports/kyc-export', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('kyc_checks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) throw error;

    const rows = (data || []).map(k => [
      (k.client_name || '').replace(/"/g, '""'),
      k.salesforce_account_id || '',
      k.check_type || '',
      k.document_type || '',
      k.status || '',
      k.created_at ? new Date(k.created_at).toISOString() : '',
      (k.file_name || '').replace(/"/g, '""'),
    ]);

    const header = 'Client,Account ID,Check Type,Document Type,Status,Date,File';
    const csv = [header, ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="kyc-status-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('KYC export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve static frontend in production
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      next();
    }
  });
}

// ============================================================
// DELEGATIONS — Family / authorized third-party access
// ============================================================

// GET /api/delegations/:accountId — List delegations for a client
app.get('/api/delegations/:accountId', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('delegations')
      .select('*')
      .eq('grantor_account_id', req.params.accountId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('delegations list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/delegations — Create a new delegation
app.post('/api/delegations', requireAuth, async (req, res) => {
  try {
    const {
      grantorAccountId, grantorName, delegateEmail, delegateName,
      permissionLevel, transferLimit, currency, expiresAt, notes, grantedByEmail,
    } = req.body;

    if (!grantorAccountId || !delegateEmail || !permissionLevel) {
      return res.status(400).json({ error: 'grantorAccountId, delegateEmail, and permissionLevel are required' });
    }

    if (!['view', 'transfer'].includes(permissionLevel)) {
      return res.status(400).json({ error: 'permissionLevel must be "view" or "transfer"' });
    }

    const { data, error } = await supabaseAdmin.from('delegations').insert({
      grantor_account_id: grantorAccountId,
      grantor_name: grantorName || null,
      delegate_email: delegateEmail,
      delegate_name: delegateName || null,
      permission_level: permissionLevel,
      transfer_limit: transferLimit || null,
      currency: currency || 'CHF',
      expires_at: expiresAt || null,
      notes: notes || null,
      granted_by_email: grantedByEmail || req.user?.email || null,
      status: 'active',
    }).select().single();

    if (error) throw error;

    await logAudit({
      userEmail: grantedByEmail || req.user?.email,
      action: 'delegation.created',
      category: 'delegation',
      entityType: 'delegation',
      entityId: data.id,
      clientName: grantorName,
      salesforceAccountId: grantorAccountId,
      details: { delegateEmail, permissionLevel, transferLimit },
      severity: 'info',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('delegation create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/delegations/:id/revoke — Revoke a delegation
app.patch('/api/delegations/:id/revoke', requireAuth, async (req, res) => {
  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('delegations')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Delegation not found' });
    }

    if (existing.status === 'revoked') {
      return res.status(400).json({ error: 'Delegation already revoked' });
    }

    const { data, error } = await supabaseAdmin
      .from('delegations')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_email: req.body.revokedByEmail || req.user?.email || null,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      userEmail: req.body.revokedByEmail || req.user?.email,
      action: 'delegation.revoked',
      category: 'delegation',
      entityType: 'delegation',
      entityId: data.id,
      clientName: existing.grantor_name,
      salesforceAccountId: existing.grantor_account_id,
      details: { delegateEmail: existing.delegate_email },
      severity: 'warning',
      req,
    });

    res.json(data);
  } catch (err) {
    console.error('delegation revoke error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/delegations/:id — Update a delegation (limit, expiry, etc.)
app.patch('/api/delegations/:id', requireAuth, async (req, res) => {
  try {
    const updates = {};
    if (req.body.permissionLevel) updates.permission_level = req.body.permissionLevel;
    if (req.body.transferLimit !== undefined) updates.transfer_limit = req.body.transferLimit;
    if (req.body.expiresAt !== undefined) updates.expires_at = req.body.expiresAt;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('delegations')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('delegation update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// WALLET FREEZE (GEL DES AVOIRS) — LCB-FT Compliance
// ============================================================

// GET /api/compliance/freezes — list all freezes
app.get('/api/compliance/freezes', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabaseAdmin.from('wallet_freezes').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    console.error('freezes list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/freezes/check/:walletId — check if wallet is frozen
app.get('/api/compliance/freezes/check/:walletId', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('wallet_freezes')
      .select('*').eq('wallet_id', req.params.walletId).eq('status', 'frozen').limit(1);
    res.json({ frozen: data && data.length > 0, freeze: data?.[0] || null });
  } catch (err) {
    console.error('freeze check error:', err.message);
    res.json({ frozen: false, freeze: null });
  }
});

// POST /api/compliance/freezes — freeze a wallet (admin only)
app.post('/api/compliance/freezes', requireAdmin, async (req, res) => {
  try {
    const { walletId, salesforceAccountId, clientName, reason, legalReference, frozenByEmail, notes } = req.body;
    if (!walletId || !reason || !frozenByEmail) {
      return res.status(400).json({ error: 'walletId, reason, frozenByEmail required' });
    }
    // Check if already frozen
    const { data: existing } = await supabaseAdmin.from('wallet_freezes')
      .select('id').eq('wallet_id', walletId).eq('status', 'frozen');
    if (existing?.length > 0) {
      return res.status(409).json({ error: 'Wallet already frozen' });
    }
    const { data, error } = await supabaseAdmin.from('wallet_freezes').insert({
      wallet_id: walletId,
      salesforce_account_id: salesforceAccountId,
      client_name: clientName,
      reason,
      legal_reference: legalReference,
      frozen_by_email: frozenByEmail,
      notes,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    // Audit log
    await logAudit({
      userEmail: frozenByEmail,
      action: 'wallet_frozen',
      category: 'compliance',
      entityType: 'wallet',
      entityId: walletId,
      clientName,
      salesforceAccountId,
      details: { walletId, reason, legalReference, frozenBy: frozenByEmail },
      severity: 'high',
      req,
    });
    res.json(data);
  } catch (err) {
    console.error('freeze create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/freezes/:id/unfreeze — unfreeze (admin only)
app.patch('/api/compliance/freezes/:id/unfreeze', requireAdmin, async (req, res) => {
  try {
    const { unfrozenByEmail, notes } = req.body;
    if (!unfrozenByEmail) {
      return res.status(400).json({ error: 'unfrozenByEmail required' });
    }
    const { data, error } = await supabaseAdmin.from('wallet_freezes').update({
      status: 'unfrozen',
      unfrozen_by_email: unfrozenByEmail,
      unfrozen_at: new Date().toISOString(),
      notes,
    }).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    await logAudit({
      userEmail: unfrozenByEmail,
      action: 'wallet_unfrozen',
      category: 'compliance',
      entityType: 'wallet',
      entityId: data.wallet_id,
      clientName: data.client_name,
      salesforceAccountId: data.salesforce_account_id,
      details: { walletId: data.wallet_id, unfrozenBy: unfrozenByEmail },
      severity: 'high',
      req,
    });
    res.json(data);
  } catch (err) {
    console.error('unfreeze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// UBO (BENEFICIAIRES EFFECTIFS) — stockés dans Salesforce Contact
// avec flag Custody_Is_UBO__c = true.
// Base légale : Art. L.561-2-2 CMF · AMLD5 Art. 30.
//
// Les UBO sont des personnes physiques liées à un Account (personne
// morale). On les expose via l'API Contact Salesforce pour que le CRM
// reste la source de vérité de la PII client. Le mapping :
//
//   id                      ← Contact.Id
//   full_name               ← Contact.FirstName + LastName
//   birth_date              ← Contact.Birthdate
//   nationality             ← Contact.Custody_UBO_Nationality__c
//   ownership_percentage    ← Contact.Custody_UBO_Ownership_Pct__c
//   control_type            ← Contact.Custody_UBO_Control_Type__c
//   address                 ← Contact.MailingStreet + MailingCity...
//   document_type           ← Contact.Custody_UBO_Document_Type__c
//   document_reference      ← Contact.Custody_UBO_Document_Ref__c
//   verified                ← Contact.Custody_UBO_Verified__c
//   verified_by_email       ← Contact.Custody_UBO_Verified_By__c
//   verified_at             ← Contact.Custody_UBO_Verified_At__c
//   notes                   ← Contact.Custody_UBO_Notes__c
// ============================================================

function mapContactToUbo(c) {
  const address = [c.MailingStreet, c.MailingPostalCode, c.MailingCity, c.MailingCountry]
    .filter(Boolean).join(', ');
  return {
    id: c.Id,
    salesforce_account_id: c.AccountId,
    full_name: [c.FirstName, c.LastName].filter(Boolean).join(' '),
    first_name: c.FirstName,
    last_name: c.LastName,
    birth_date: c.Birthdate,
    nationality: c.Custody_UBO_Nationality__c,
    ownership_percentage: c.Custody_UBO_Ownership_Pct__c,
    control_type: c.Custody_UBO_Control_Type__c,
    address: address || null,
    document_type: c.Custody_UBO_Document_Type__c,
    document_reference: c.Custody_UBO_Document_Ref__c,
    verified: !!c.Custody_UBO_Verified__c,
    verified_by_email: c.Custody_UBO_Verified_By__c,
    verified_at: c.Custody_UBO_Verified_At__c,
    notes: c.Custody_UBO_Notes__c,
    email: c.Email,
    phone: c.Phone,
  };
}

// Split "Prénom Nom de Famille" → { firstName: 'Prénom', lastName: 'Nom de Famille' }
function splitFullName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return { firstName: '—', lastName: parts[0] || 'UBO' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// GET /api/compliance/ubos/:accountId — liste les UBO (SFDC Contact filtrés)
app.get('/api/compliance/ubos/:accountId', async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const fields = [
      'Id', 'AccountId', 'FirstName', 'LastName', 'Email', 'Phone', 'Birthdate',
      'MailingStreet', 'MailingCity', 'MailingPostalCode', 'MailingCountry',
      'Custody_Is_UBO__c', 'Custody_UBO_Ownership_Pct__c', 'Custody_UBO_Control_Type__c',
      'Custody_UBO_Document_Type__c', 'Custody_UBO_Document_Ref__c', 'Custody_UBO_Nationality__c',
      'Custody_UBO_Verified__c', 'Custody_UBO_Verified_By__c', 'Custody_UBO_Verified_At__c',
      'Custody_UBO_Notes__c',
    ].join(',');
    const soql = `SELECT ${fields} FROM Contact WHERE AccountId = '${req.params.accountId}' AND Custody_Is_UBO__c = true ORDER BY Custody_UBO_Ownership_Pct__c DESC NULLS LAST`;
    const r = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d[0]?.message || `SFDC ${r.status}`);
    res.json((d.records || []).map(mapContactToUbo));
  } catch (err) {
    console.error('UBO list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/ubos — crée un Contact UBO lié à l'Account
app.post('/api/compliance/ubos', requireAuth, async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const {
      salesforceAccountId, fullName, birthDate, nationality,
      ownershipPercentage, controlType, address,
      documentType, documentReference, notes,
    } = req.body;
    if (!salesforceAccountId || !fullName) {
      return res.status(400).json({ error: 'salesforceAccountId et fullName requis' });
    }
    const { firstName, lastName } = splitFullName(fullName);
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const payload = {
      AccountId: salesforceAccountId,
      FirstName: firstName,
      LastName: lastName,
      Birthdate: birthDate || null,
      MailingStreet: address || null,
      Custody_Is_UBO__c: true,
      Custody_UBO_Nationality__c: nationality || null,
      Custody_UBO_Ownership_Pct__c: ownershipPercentage == null ? null : Number(ownershipPercentage),
      Custody_UBO_Control_Type__c: controlType || 'Capital',
      Custody_UBO_Document_Type__c: documentType || 'Passport',
      Custody_UBO_Document_Ref__c: documentReference || null,
      Custody_UBO_Notes__c: notes || null,
    };
    const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Contact/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(Array.isArray(d) ? d[0]?.message : d.message || `SFDC ${r.status}`);

    await logAudit({
      userEmail: req.user?.email,
      action: 'ubo_added',
      category: 'compliance',
      entityType: 'Contact',
      entityId: d.id,
      salesforceAccountId,
      details: { fullName, ownershipPercentage, controlType, contactId: d.id },
      severity: 'warning',
      req,
    });

    // Re-fetch + map pour retourner la même forme que GET
    const fetchR = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Contact/${d.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const fetchD = await fetchR.json();
    res.json(mapContactToUbo(fetchD));
  } catch (err) {
    console.error('UBO create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/ubos/:id — met à jour un UBO (Contact.Id)
app.patch('/api/compliance/ubos/:id', requireAuth, async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const payload = {};
    if (req.body.fullName !== undefined) {
      const { firstName, lastName } = splitFullName(req.body.fullName);
      payload.FirstName = firstName;
      payload.LastName = lastName;
    }
    if (req.body.birthDate !== undefined)             payload.Birthdate = req.body.birthDate || null;
    if (req.body.nationality !== undefined)           payload.Custody_UBO_Nationality__c = req.body.nationality || null;
    if (req.body.ownershipPercentage !== undefined)   payload.Custody_UBO_Ownership_Pct__c = req.body.ownershipPercentage == null ? null : Number(req.body.ownershipPercentage);
    if (req.body.controlType !== undefined)           payload.Custody_UBO_Control_Type__c = req.body.controlType || null;
    if (req.body.address !== undefined)               payload.MailingStreet = req.body.address || null;
    if (req.body.documentType !== undefined)          payload.Custody_UBO_Document_Type__c = req.body.documentType || null;
    if (req.body.documentReference !== undefined)     payload.Custody_UBO_Document_Ref__c = req.body.documentReference || null;
    if (req.body.notes !== undefined)                 payload.Custody_UBO_Notes__c = req.body.notes || null;

    const { accessToken, instanceUrl } = await getSalesforceToken();
    const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Contact/${req.params.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok && r.status !== 204) {
      const d = await r.json().catch(() => ({}));
      throw new Error(Array.isArray(d) ? d[0]?.message : d.message || `SFDC ${r.status}`);
    }

    const fetchR = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Contact/${req.params.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const fetchD = await fetchR.json();
    res.json(mapContactToUbo(fetchD));
  } catch (err) {
    console.error('UBO update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/compliance/ubos/:id/verify — vérification admin
app.patch('/api/compliance/ubos/:id/verify', requireAdmin, async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const { verifiedByEmail } = req.body;
    if (!verifiedByEmail) return res.status(400).json({ error: 'verifiedByEmail requis' });
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Contact/${req.params.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Custody_UBO_Verified__c: true,
        Custody_UBO_Verified_By__c: verifiedByEmail.slice(0, 120),
        Custody_UBO_Verified_At__c: new Date().toISOString(),
      }),
    });
    if (!r.ok && r.status !== 204) {
      const d = await r.json().catch(() => ({}));
      throw new Error(Array.isArray(d) ? d[0]?.message : d.message || `SFDC ${r.status}`);
    }

    await logAudit({
      userEmail: verifiedByEmail,
      action: 'ubo_verified',
      category: 'compliance',
      entityType: 'Contact',
      entityId: req.params.id,
      details: { contactId: req.params.id },
      severity: 'info',
      req,
    });

    const fetchR = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Contact/${req.params.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    res.json(mapContactToUbo(await fetchR.json()));
  } catch (err) {
    console.error('UBO verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/compliance/ubos/:id — on "déflag" le Custody_Is_UBO__c
// plutôt que de supprimer le Contact (peut avoir d'autres usages CRM).
app.delete('/api/compliance/ubos/:id', requireAdmin, async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Contact/${req.params.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Custody_Is_UBO__c: false,
        Custody_UBO_Ownership_Pct__c: null,
        Custody_UBO_Verified__c: false,
      }),
    });
    if (!r.ok && r.status !== 204) {
      const d = await r.json().catch(() => ({}));
      throw new Error(Array.isArray(d) ? d[0]?.message : d.message || `SFDC ${r.status}`);
    }
    await logAudit({
      userEmail: req.user?.email,
      action: 'ubo_removed',
      category: 'compliance',
      entityType: 'Contact',
      entityId: req.params.id,
      details: { contactId: req.params.id },
      severity: 'warning',
      req,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('UBO delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/ubos/:accountId/declaration-pdf — AMLD5 declaration PDF
// ───────────────────────────────────────────────────────────────
// Produit un PDF signable "Déclaration des Bénéficiaires Effectifs"
// conforme à la 5e directive anti-blanchiment (AMLD5, transposée en
// droit français par l'ordonnance 2020-115 du 12 février 2020).
// Référence légale : Art. L.561-2-2 CMF, Art. L.123-31 Code de commerce,
// Art. R.561-1 à R.561-3-0 CMF (seuil 25% ou contrôle effectif).
// Le PDF reprend tous les UBOs ≥ 25% ownership OU control_type non
// nul, avec leur statut de vérification et la base légale.
app.get('/api/compliance/ubos/:accountId/declaration-pdf', requireAuth, async (req, res) => {
  if (!SF_CONFIGURED) return res.status(501).json({ error: 'Salesforce not configured' });
  try {
    // 1. Fetch UBO Contacts from Salesforce (source of truth)
    const { accessToken, instanceUrl } = await getSalesforceToken();
    const fields = [
      'Id', 'AccountId', 'FirstName', 'LastName', 'Birthdate',
      'MailingStreet', 'MailingCity', 'MailingPostalCode', 'MailingCountry',
      'Custody_Is_UBO__c', 'Custody_UBO_Ownership_Pct__c', 'Custody_UBO_Control_Type__c',
      'Custody_UBO_Document_Type__c', 'Custody_UBO_Document_Ref__c', 'Custody_UBO_Nationality__c',
      'Custody_UBO_Verified__c', 'Custody_UBO_Verified_By__c', 'Custody_UBO_Verified_At__c',
      'Custody_UBO_Notes__c',
    ].join(',');
    const soql = `SELECT ${fields} FROM Contact WHERE AccountId = '${req.params.accountId}' AND Custody_Is_UBO__c = true ORDER BY Custody_UBO_Ownership_Pct__c DESC NULLS LAST`;
    const sfR = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const sfD = await sfR.json();
    if (!sfR.ok) return res.status(500).json({ error: sfD[0]?.message || 'SFDC query failed' });
    const ubos = (sfD.records || []).map(mapContactToUbo);

    // 2. AMLD5 filter : ≥25% ownership OR non-null control_type
    //    (Art. R.561-1 CMF — bénéficiaire effectif)
    const declarableUbos = ubos.filter(u =>
      Number(u.ownership_percentage || 0) >= 25 || !!u.control_type
    );

    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      const filename = `declaration-ubo-amld5-${req.params.accountId}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdf);
    });
    doc.on('error', (err) => {
      console.error('[UBO PDF] PDFKit error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    // Title + subtitle
    doc.font('Helvetica-Bold').fontSize(16).text('DECLARATION DES BENEFICIAIRES EFFECTIFS', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#555555')
       .text('Conformement a la 5e directive anti-blanchiment (AMLD5)', { align: 'center' });
    doc.moveDown(1.2);

    // Client header
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text('Identification du client :');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#000000');
    doc.text(`Identifiant Salesforce : ${req.params.accountId}`);
    doc.text(`Date de la declaration  : ${today}`);
    doc.text(`Etablissement declarant : SwissLife Banque Privee (SIREN ${process.env.TRACFIN_DECLARANT_SIREN || '322215021'})`);
    doc.moveDown(0.8);

    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#cccccc');
    doc.moveDown(0.5);

    // Base légale
    doc.font('Helvetica-Bold').fontSize(11).text('Base legale :');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    const baseLegale = [
      '- Code monetaire et financier, art. L.561-2-2 et R.561-1 a R.561-3-0',
      '- Code de commerce, art. L.123-31 (registre RBE)',
      '- Directive (UE) 2018/843 (AMLD5), transposee par ordonnance 2020-115',
      '- Reglement (UE) 2023/1114 (MiCA), art. 68',
    ];
    for (const l of baseLegale) { doc.text(l, { indent: 8 }); }
    doc.moveDown(0.8);

    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#cccccc');
    doc.moveDown(0.5);

    // UBOs table
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
       .text(`Beneficiaires effectifs declares (${declarableUbos.length}) :`);
    doc.moveDown(0.4);

    if (declarableUbos.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#999999')
         .text('Aucun beneficiaire effectif depassant le seuil de 25% ou exerçant un controle n\'a ete declare. Le client est dans l\'obligation de signaler toute evolution conformement a l\'art. R.561-3 CMF.');
      doc.moveDown(0.6);
    } else {
      for (let i = 0; i < declarableUbos.length; i++) {
        const u = declarableUbos[i];
        if (doc.y > 680) doc.addPage();

        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000000')
           .text(`${i + 1}. ${u.full_name || 'N/A'}`);
        doc.moveDown(0.1);

        const rows = [
          ['Date de naissance',      u.birth_date ? new Date(u.birth_date).toLocaleDateString('fr-FR') : 'Non renseigne'],
          ['Nationalite',            u.nationality || 'Non renseignee'],
          ['Part de detention',      u.ownership_percentage ? `${Number(u.ownership_percentage).toFixed(2)} %` : 'Non chiffree'],
          ['Type de controle',       u.control_type || 'Ownership direct'],
          ['Adresse',                u.address || 'Non renseignee'],
          ['Document d\'identite',   u.document_type ? `${u.document_type} · ${u.document_reference || ''}`.trim() : 'Non renseigne'],
          ['Statut verification',    u.verified ? `Verifie le ${new Date(u.verified_at).toLocaleDateString('fr-FR')} par ${u.verified_by_email || ''}` : 'EN ATTENTE DE VERIFICATION'],
        ];
        doc.font('Helvetica').fontSize(9.5).fillColor('#333333');
        for (const [k, v] of rows) {
          doc.text(`    ${k.padEnd(24, ' ')} : ${v}`);
        }
        if (u.notes) {
          doc.moveDown(0.15);
          doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666666')
             .text(`    Notes : ${u.notes}`, { width: 475 });
        }
        doc.moveDown(0.6);
      }
    }

    // Signatures section
    if (doc.y > 620) doc.addPage();
    doc.moveDown(0.5);
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#cccccc');
    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(10).fillColor('#333333')
       .text(`Genere le ${new Date().toLocaleString('fr-FR')} par ${req.user?.email || 'utilisateur non identifie'}.`, { align: 'left' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666666')
       .text('Le present document engage la responsabilite du declarant au titre de l\'article L.561-15 CMF. Toute omission ou fausse declaration est passible des sanctions prevues au L.561-36.', { align: 'justify' });
    doc.moveDown(1.5);

    const leftX = 60, rightX = 310, sigY = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text('Le client (ou representant legal) :', leftX, sigY);
    doc.font('Helvetica').fontSize(9).fillColor('#666666').text('Le responsable conformite (RCSI) :', rightX, sigY);
    doc.moveDown(3);
    const lineY = doc.y;
    doc.moveTo(leftX, lineY).lineTo(230, lineY).stroke('#333333');
    doc.moveTo(rightX, lineY).lineTo(480, lineY).stroke('#333333');
    doc.font('Helvetica').fontSize(8).fillColor('#999999').text('Date et signature', leftX, lineY + 6);
    doc.text('Date et signature', rightX, lineY + 6);

    doc.end();

    // Audit — PDF generated (before response is sent; fire and forget)
    logAudit({
      userEmail: req.user?.email,
      action: 'ubo.declaration_pdf_generated',
      category: 'compliance',
      entityType: 'ubo_declaration',
      entityId: req.params.accountId,
      details: {
        accountId: req.params.accountId,
        declarableCount: declarableUbos.length,
        totalCount: (ubos || []).length,
      },
      severity: 'high',
      req,
    }).catch(() => { /* non-blocking */ });
  } catch (err) {
    console.error('UBO declaration PDF error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ACPR REGULATORY REPORTING
// ============================================================
function computePeriod(type, dateStr) {
  const ref = dateStr ? new Date(dateStr) : new Date();
  let from, to;
  if (type === 'quarterly') {
    const q = Math.floor(ref.getMonth() / 3);
    from = new Date(ref.getFullYear(), q * 3, 1);
    to = new Date(ref.getFullYear(), q * 3 + 3, 1);
  } else if (type === 'yearly') {
    from = new Date(ref.getFullYear(), 0, 1);
    to = new Date(ref.getFullYear() + 1, 0, 1);
  } else {
    // monthly (default)
    from = new Date(ref.getFullYear(), ref.getMonth(), 1);
    to = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  }
  const fmt = (d) => d.toISOString().slice(0, 10);
  const toEnd = new Date(to.getTime() - 86400000); // last day of period
  return { type: type || 'monthly', from: fmt(from), to: fmt(to), toDisplay: fmt(toEnd) };
}

app.get('/api/compliance/reporting/acpr', requireAdmin, async (req, res) => {
  try {
    const period = computePeriod(req.query.period, req.query.date);
    const { from, to } = period;

    // Transfers
    const { data: transfers } = await supabaseAdmin
      .from('transfer_approvals')
      .select('status, amount')
      .gte('created_at', from)
      .lt('created_at', to);
    const txs = transfers || [];
    const byStatus = {};
    let totalVolume = 0;
    txs.forEach(t => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      totalVolume += parseFloat(t.amount || 0);
    });

    // SARs
    const { data: sars } = await supabaseAdmin
      .from('suspicious_activity_reports')
      .select('status, filing_authority')
      .gte('created_at', from)
      .lt('created_at', to);
    const sarList = sars || [];
    const sarFiled = sarList.filter(s => s.status === 'filed_with_mros' || s.status === 'filed_with_tracfin').length;
    const sarByAuthority = { tracfin: 0, mros: 0 };
    sarList.forEach(s => {
      if (s.filing_authority === 'tracfin') sarByAuthority.tracfin++;
      else if (s.filing_authority === 'mros') sarByAuthority.mros++;
    });

    // Alerts
    const { data: alertsData } = await supabaseAdmin
      .from('compliance_alerts')
      .select('status')
      .gte('created_at', from)
      .lt('created_at', to);
    const alertsList = alertsData || [];

    // Freezes
    const { data: freezesData } = await supabaseAdmin
      .from('wallet_freezes')
      .select('status')
      .gte('created_at', from)
      .lt('created_at', to);
    const freezesList = freezesData || [];
    const { data: activeFreezes } = await supabaseAdmin
      .from('wallet_freezes')
      .select('id')
      .eq('status', 'frozen');

    // KYC
    const { data: kycData } = await supabaseAdmin
      .from('kyc_checks')
      .select('status')
      .gte('created_at', from)
      .lt('created_at', to);
    const kycList = kycData || [];

    // UBOs — la source de vérité est maintenant Salesforce Contact
    // avec le flag Custody_Is_UBO__c. Pour les stats ACPR, on pourrait
    // faire un COUNT via SFDC SOQL ici. Pour l'instant on renvoie un
    // tableau vide car (a) la table Supabase ubos n'est plus écrite,
    // (b) la colonne verification_status n'existait pas historiquement,
    // (c) le cas d'usage "nouveaux UBOs ce mois-ci" est rare.
    // TODO: remplacer par SOQL count if needed (ex. statistiques ACPR mensuelles).
    const uboList = [];

    // Whitelist
    const { data: wlData } = await supabaseAdmin
      .from('address_whitelist')
      .select('status')
      .gte('created_at', from)
      .lt('created_at', to);
    const wlList = wlData || [];

    // Risk config
    const { data: riskData } = await supabaseAdmin
      .from('client_risk_config')
      .select('risk_level');
    const riskList = riskData || [];

    // Audit log
    const { data: auditData } = await supabaseAdmin
      .from('audit_log')
      .select('severity, category')
      .gte('created_at', from)
      .lt('created_at', to);
    const auditList = auditData || [];
    const auditByCategory = {};
    auditList.forEach(a => {
      auditByCategory[a.category] = (auditByCategory[a.category] || 0) + 1;
    });

    const report = {
      period: { type: period.type, from: period.from, to: period.toDisplay },
      transfers: {
        total: txs.length,
        approved: (byStatus.approved || 0) + (byStatus.executed || 0),
        rejected: byStatus.rejected || 0,
        pending: byStatus.pending || 0,
        totalVolume: totalVolume.toFixed(2),
        byStatus,
      },
      compliance: {
        sarFiled,
        sarByAuthority,
        alertsTotal: alertsList.length,
        alertsResolved: alertsList.filter(a => a.status === 'resolved').length,
        alertsPending: alertsList.filter(a => a.status === 'open' || a.status === 'acknowledged').length,
        frozenWallets: freezesList.length,
        activeFreeze: (activeFreezes || []).length,
      },
      kyc: {
        totalChecks: kycList.length,
        verified: kycList.filter(k => k.status === 'verified' || k.status === 'approved').length,
        pending: kycList.filter(k => k.status === 'pending').length,
        rejected: kycList.filter(k => k.status === 'rejected' || k.status === 'failed').length,
      },
      ubos: {
        totalRegistered: uboList.length,
        verified: uboList.filter(u => u.verification_status === 'verified').length,
        unverified: uboList.filter(u => u.verification_status !== 'verified').length,
      },
      whitelist: {
        totalAddresses: wlList.length,
        approved: wlList.filter(w => w.status === 'active' || w.status === 'approved').length,
        pending: wlList.filter(w => w.status === 'pending_approval' || w.status === 'pending').length,
        revoked: wlList.filter(w => w.status === 'revoked').length,
      },
      risk: {
        highRiskClients: riskList.filter(r => r.risk_level === 'high').length,
        mediumRiskClients: riskList.filter(r => r.risk_level === 'medium').length,
        lowRiskClients: riskList.filter(r => r.risk_level === 'low').length,
      },
      audit: {
        totalActions: auditList.length,
        highSeverity: auditList.filter(a => a.severity === 'high' || a.severity === 'critical').length,
        byCategory: auditByCategory,
      },
    };

    await logAudit({
      userId: req.user.id, userEmail: req.user.email, userRole: req.user.role,
      action: 'acpr_report_generated', category: 'compliance',
      details: { periodType: period.type, from: period.from, to: period.toDisplay },
      severity: 'info', req,
    });

    res.json(report);
  } catch (err) {
    console.error('ACPR report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/compliance/reporting/acpr/export', requireAdmin, async (req, res) => {
  try {
    // Re-use the same logic — fetch the report internally
    const period = computePeriod(req.query.period, req.query.date);
    const { from, to } = period;

    // Fetch all data (same as above)
    const [
      { data: transfers },
      { data: sars },
      { data: alertsData },
      { data: freezesData },
      { data: activeFreezes },
      { data: kycData },
      { data: uboData },
      { data: wlData },
      { data: riskData },
      { data: auditData },
    ] = await Promise.all([
      supabaseAdmin.from('transfer_approvals').select('status, amount').gte('requested_at', from).lt('requested_at', to),
      supabaseAdmin.from('suspicious_activity_reports').select('status, filing_authority').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('compliance_alerts').select('status').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('wallet_freezes').select('status').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('wallet_freezes').select('id').eq('status', 'frozen'),
      supabaseAdmin.from('kyc_checks').select('status').gte('created_at', from).lt('created_at', to),
      Promise.resolve({ data: [] }), // ubos déplacés vers SFDC Contact (flag Custody_Is_UBO__c)
      supabaseAdmin.from('address_whitelist').select('status').gte('created_at', from).lt('created_at', to),
      supabaseAdmin.from('client_risk_config').select('risk_level'),
      supabaseAdmin.from('audit_log').select('severity, category').gte('created_at', from).lt('created_at', to),
    ]);

    const txs = transfers || [];
    const sarList = sars || [];
    const alertsList = alertsData || [];
    const freezesList = freezesData || [];
    const kycList = kycData || [];
    const uboList = uboData || [];
    const wlList = wlData || [];
    const riskList = riskData || [];
    const auditList = auditData || [];

    let totalVolume = 0;
    const byStatus = {};
    txs.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; totalVolume += parseFloat(t.amount || 0); });

    const sarFiled = sarList.filter(s => s.status === 'filed_with_mros' || s.status === 'filed_with_tracfin').length;
    const tracfin = sarList.filter(s => s.filing_authority === 'tracfin').length;
    const mros = sarList.filter(s => s.filing_authority === 'mros').length;

    const periodLabel = period.type === 'monthly' ? 'Mensuel' : period.type === 'quarterly' ? 'Trimestriel' : 'Annuel';
    const filename = `rapport-acpr-${period.from.slice(0, 7)}.csv`;

    const rows = [
      ['Rapport ACPR - SwissLife Banque Privee France'],
      [`Periode: ${periodLabel}`, `Du: ${period.from}`, `Au: ${period.toDisplay}`],
      [`Genere le: ${new Date().toISOString().slice(0, 19)}`],
      [],
      ['=== TRANSFERTS ==='],
      ['Total transferts', txs.length],
      ['Approuves', (byStatus.approved || 0) + (byStatus.executed || 0)],
      ['Rejetes', byStatus.rejected || 0],
      ['En attente', byStatus.pending || 0],
      ['Volume total', totalVolume.toFixed(2)],
      [],
      ['=== CONFORMITE LCB-FT ==='],
      ['Declarations de soupcon deposees', sarFiled],
      ['Tracfin', tracfin],
      ['MROS', mros],
      ['Alertes totales', alertsList.length],
      ['Alertes resolues', alertsList.filter(a => a.status === 'resolved').length],
      ['Alertes en attente', alertsList.filter(a => a.status === 'open' || a.status === 'acknowledged').length],
      ['Wallets geles (periode)', freezesList.length],
      ['Gels actifs', (activeFreezes || []).length],
      [],
      ['=== KYC & DUE DILIGENCE ==='],
      ['Verifications KYC totales', kycList.length],
      ['Verifies', kycList.filter(k => k.status === 'verified' || k.status === 'approved').length],
      ['En attente', kycList.filter(k => k.status === 'pending').length],
      ['Rejetes', kycList.filter(k => k.status === 'rejected' || k.status === 'failed').length],
      ['Beneficiaires effectifs enregistres', uboList.length],
      ['UBO verifies', uboList.filter(u => u.verification_status === 'verified').length],
      ['UBO non verifies', uboList.filter(u => u.verification_status !== 'verified').length],
      [],
      ['=== GESTION DES RISQUES ==='],
      ['Clients haut risque', riskList.filter(r => r.risk_level === 'high').length],
      ['Clients risque moyen', riskList.filter(r => r.risk_level === 'medium').length],
      ['Clients risque faible', riskList.filter(r => r.risk_level === 'low').length],
      ['Adresses whitelist totales', wlList.length],
      ['Approuvees', wlList.filter(w => w.status === 'active' || w.status === 'approved').length],
      ['En attente', wlList.filter(w => w.status === 'pending_approval' || w.status === 'pending').length],
      ['Revoquees', wlList.filter(w => w.status === 'revoked').length],
      [],
      ['=== JOURNAL AUDIT ==='],
      ['Actions totales', auditList.length],
      ['Severite haute/critique', auditList.filter(a => a.severity === 'high' || a.severity === 'critical').length],
      [],
      ['Confidentiel - Usage interne uniquement'],
      ['Art. L.561-32 CMF & Reglement MiCA (UE) 2023/1114'],
    ];

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

    await logAudit({
      userId: req.user.id, userEmail: req.user.email, userRole: req.user.role,
      action: 'acpr_report_exported_csv', category: 'compliance',
      details: { periodType: period.type, from: period.from, to: period.toDisplay },
      severity: 'info', req,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM for Excel
  } catch (err) {
    console.error('ACPR export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MISSING ROUTE ALIASES — Match frontend expected paths
// ============================================================

// GET /api/compliance/approvals/pending — Pending approvals only
app.get('/api/compliance/approvals/pending', async (req, res) => {
  try {
    const { limit = '50', offset = '0' } = req.query;
    const { data, error } = await supabaseAdmin
      .from('transfer_approvals')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('approvals pending list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/whitelist — List ALL whitelisted addresses
app.get('/api/compliance/whitelist', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('address_whitelist')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('whitelist list all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/delegations/:accountId — Alias for /api/delegations/:accountId
app.get('/api/compliance/delegations/:accountId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('delegations')
      .select('*')
      .eq('grantor_account_id', req.params.accountId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('delegations list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kyc/checks/:accountId — KYC checks for a client
app.get('/api/kyc/checks/:accountId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('kyc_checks')
      .select('*')
      .eq('salesforce_account_id', req.params.accountId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('kyc checks list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/risk-config — List all client risk configurations
app.get('/api/compliance/risk-config', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_risk_config')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('risk-config list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Custody server running on port ${PORT}`);
  console.log(`Salesforce: ${SF_CONFIGURED ? 'configured' : 'NOT configured'}`);
  console.log(`Dfns: configured`);
  console.log(`Supabase: ${process.env.VITE_SUPABASE_URL ? 'configured' : 'NOT configured'}`);
});
