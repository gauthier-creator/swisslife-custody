// ============================================================
// Seed Salesforce — comptes démo SwissLife Banque Privée
// ============================================================
// Crée 3 profils clients complémentaires à G0T1 pour couvrir les
// principaux use-cases de la démo custody :
//
//   1. Jean-Marc DUPONT              — particulier clean, HNWI 2.5 M€
//      Cas : happy-path screening "person" + éligibilité rapide
//
//   2. Maison Lefebvre Finance SA    — corporate clean, AUM 35 M€
//      4 contacts (Président, DG, UBO 45 %, Directeur financier)
//      Cas : screening "company" + iteration sur tous les contacts
//
//   3. Kamchatka Holdings Ltd        — corporate Russie, AUM 120 M€
//      Basé à Moscou → auto risk_level critique (FATF high-risk)
//      2 contacts : CEO + ayant-droit
//      Cas : detection automatique zone haut risque + blocage
//
// Toutes les données sont fictives ou inspirées de sources publiques.
// Pour ne pas salir l'org SFDC, les Accounts créés ont un préfixe
// "DEMO " visible et peuvent être supprimés avec le script complémentaire.
// ============================================================

import 'dotenv/config';

const LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

const DEMO_ACCOUNTS = [
  // ──────────────────────────────────────────────────────────
  // 1. Particulier happy path — HNWI français
  // ──────────────────────────────────────────────────────────
  {
    narrative: 'Particulier clean · HNWI · happy path',
    account: {
      Name: 'DEMO Jean-Marc Dupont',
      Type: 'Customer - Direct',
      BillingStreet: '142 avenue des Champs-Élysées',
      BillingCity: 'Paris',
      BillingPostalCode: '75008',
      BillingCountry: 'France',
      Phone: '+33 1 42 00 00 00',
      Industry: 'Wealth Management',
      Description: 'Particulier HNWI · profil dynamique · allocation crypto 5 %',
      AnnualRevenue: 2_500_000,
      Custody_KYC_Status__c: 'Valide',
      Custody_Risk_Level__c: 'Faible',
      Custody_Sanctions_Clear__c: true,
    },
    contacts: [
      // Pour un particulier, un Contact miroir facilite le screening
      {
        FirstName: 'Jean-Marc',
        LastName: 'DUPONT',
        Email: 'jm.dupont@example.com',
        Title: 'Titulaire',
        Birthdate: '1968-03-15',
        Custody_Nationality__c: 'FR',
        MailingCountry: 'France',
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // 2. Corporate multi-contacts — SA française clean
  // ──────────────────────────────────────────────────────────
  {
    narrative: 'Corporate SA · 4 contacts · screening personne morale AMLD5',
    account: {
      Name: 'DEMO Maison Lefebvre Finance',
      Type: 'Institutional',
      BillingStreet: '7 place Vendôme',
      BillingCity: 'Paris',
      BillingPostalCode: '75001',
      BillingCountry: 'France',
      Phone: '+33 1 44 00 00 00',
      Industry: 'Financial Services',
      Description: 'Société de gestion familiale · allocation crypto diversification 8 %',
      AnnualRevenue: 35_000_000,
      Custody_SIREN__c: '552144503',              // exemple fictif format valide (9 chiffres)
      Custody_LEI__c: null,
      Custody_Incorporation_Country__c: 'FR',
      Custody_Entity_Type__c: 'SA',
      Custody_KYC_Status__c: 'Valide',
      Custody_Risk_Level__c: 'Moyen',
      Custody_Sanctions_Clear__c: true,
    },
    contacts: [
      {
        FirstName: 'Henri',
        LastName: 'LEFEBVRE',
        Email: 'h.lefebvre@maison-lefebvre.fr',
        Title: 'Président du directoire',
        Birthdate: '1952-11-04',
        Custody_Nationality__c: 'FR',
        MailingCountry: 'France',
      },
      {
        FirstName: 'Claire',
        LastName: 'LEFEBVRE',
        Email: 'c.lefebvre@maison-lefebvre.fr',
        Title: 'Directrice générale · UBO 45 %',
        Birthdate: '1978-06-22',
        Custody_Nationality__c: 'FR',
        MailingCountry: 'France',
      },
      {
        FirstName: 'Thomas',
        LastName: 'MORIN',
        Email: 't.morin@maison-lefebvre.fr',
        Title: 'Directeur financier',
        Birthdate: '1981-02-09',
        Custody_Nationality__c: 'FR',
        MailingCountry: 'France',
      },
      {
        FirstName: 'Nicolas',
        LastName: 'BRUN',
        Email: 'n.brun@maison-lefebvre.fr',
        Title: 'Secrétaire général · Compliance',
        Birthdate: '1975-09-30',
        Custody_Nationality__c: 'FR',
        MailingCountry: 'France',
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // 3. Corporate high-risk — basé en Russie (FATF grey-list)
  // ──────────────────────────────────────────────────────────
  {
    narrative: 'Corporate Russie · auto risk_level critique · déclenche whitelist obligatoire',
    account: {
      Name: 'DEMO Kamchatka Holdings Ltd',
      Type: 'Institutional',
      BillingStreet: '24 Tverskaya Street',
      BillingCity: 'Moscow',
      BillingPostalCode: '125009',
      // SFDC state/country picklist rejette 'Russia' dans l'org dev. On
      // laisse le BillingCountry vide et la source de vérité devient
      // Custody_Incorporation_Country__c (lu prioritairement par le
      // risk scoring). Pour une org avec picklist ouverte, remettre 'Russia'.
      BillingCountry: null,
      Phone: null,
      Industry: 'Investment Holding',
      Description: 'Holding d\'investissement · actifs mixtes equity + crypto · juridiction RU',
      AnnualRevenue: 120_000_000,
      Custody_SIREN__c: null,                     // entité étrangère
      Custody_LEI__c: '213800QRMHEDPXJWTK42',     // placeholder ISO 17442
      Custody_Incorporation_Country__c: 'RU',
      Custody_Entity_Type__c: 'Ltd',
      Custody_KYC_Status__c: 'En cours',
      Custody_Risk_Level__c: 'Tres eleve',         // sera auto-défini mais on pré-remplit pour cohérence
      Custody_Sanctions_Clear__c: false,
    },
    contacts: [
      {
        FirstName: 'Andrei',
        LastName: 'VOLKOV',
        Email: 'a.volkov@kamchatka-holdings.ru',
        Title: 'Chief Executive Officer',
        Birthdate: '1965-07-18',
        Custody_Nationality__c: 'RU',
        MailingCountry: null,                   // idem, picklist restreinte
      },
      {
        FirstName: 'Natalia',
        LastName: 'IVANOVA',
        Email: 'n.ivanova@kamchatka-holdings.ru',
        Title: 'UBO 62 % · Bénéficiaire effectif principal',
        Birthdate: '1972-02-11',
        Custody_Nationality__c: 'RU',
        MailingCountry: null,
      },
      // UBO indirect — nom connu (sanctions OFAC/EU/UK HMT depuis mars 2022).
      // Le screening va détecter ce contact et déclencher l'alerte Tracfin.
      // En sandbox ComplyCube, un trigger côté serveur simule le match ;
      // en prod avec clé live_, Dow Jones + OFAC SDN renverraient le vrai hit.
      {
        FirstName: 'Roman',
        LastName: 'Abramovich',
        Email: 'r.abramovich@kamchatka-holdings.ru',
        Title: 'UBO indirect 18 % · via Millhouse Capital',
        Birthdate: '1966-10-24',
        Custody_Nationality__c: 'RU',
        MailingCountry: null,
      },
    ],
  },
];

async function getToken() {
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
    username: process.env.SF_USERNAME,
    password: `${process.env.SF_PASSWORD}${process.env.SF_SECURITY_TOKEN || ''}`,
  });
  const r = await fetch(`${LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Auth: ${JSON.stringify(d)}`);
  return { accessToken: d.access_token, instanceUrl: d.instance_url };
}

async function sfQuery(accessToken, instanceUrl, soql) {
  const r = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  return d.records || [];
}

async function sfInsert(accessToken, instanceUrl, obj, payload) {
  const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/${obj}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`INSERT ${obj}: ${JSON.stringify(d)}`);
  return d;
}

async function sfPatch(accessToken, instanceUrl, obj, id, payload) {
  const r = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/${obj}/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok && r.status !== 204) {
    const d = await r.text();
    throw new Error(`PATCH ${obj} ${id}: ${r.status} ${d.slice(0, 200)}`);
  }
}

async function upsertAccount(accessToken, instanceUrl, acc) {
  const existing = await sfQuery(accessToken, instanceUrl,
    `SELECT Id FROM Account WHERE Name = '${acc.Name.replace(/'/g, "\\'")}' LIMIT 1`
  );
  if (existing.length) {
    await sfPatch(accessToken, instanceUrl, 'Account', existing[0].Id, acc);
    return { id: existing[0].Id, updated: true };
  }
  const r = await sfInsert(accessToken, instanceUrl, 'Account', acc);
  return { id: r.id, updated: false };
}

async function upsertContact(accessToken, instanceUrl, accountId, contact) {
  const existing = await sfQuery(accessToken, instanceUrl,
    `SELECT Id FROM Contact WHERE AccountId = '${accountId}' AND LastName = '${contact.LastName.replace(/'/g, "\\'")}' AND FirstName = '${contact.FirstName.replace(/'/g, "\\'")}' LIMIT 1`
  );
  const payload = { ...contact, AccountId: accountId };
  if (existing.length) {
    await sfPatch(accessToken, instanceUrl, 'Contact', existing[0].Id, payload);
    return { id: existing[0].Id, updated: true };
  }
  const r = await sfInsert(accessToken, instanceUrl, 'Contact', payload);
  return { id: r.id, updated: false };
}

async function main() {
  console.log('→ Auth Salesforce…');
  const { accessToken, instanceUrl } = await getToken();
  console.log(`  ✓ Connecté à ${instanceUrl.replace(/https:\/\/(.*?)\/.*/, '$1')}\n`);

  for (const profile of DEMO_ACCOUNTS) {
    console.log(`┌─ ${profile.account.Name}`);
    console.log(`│  ${profile.narrative}`);
    const { id: accountId, updated } = await upsertAccount(accessToken, instanceUrl, profile.account);
    console.log(`│  Account ${updated ? 'mis à jour' : 'créé'} : ${accountId}`);
    for (const c of profile.contacts) {
      const { id: cId, updated: cUp } = await upsertContact(accessToken, instanceUrl, accountId, c);
      const name = `${c.FirstName} ${c.LastName}`;
      console.log(`│    · ${(cUp ? '↻' : '+')} ${name.padEnd(28)} ${c.Title}`);
    }
    console.log(`└─ https://orgfarm-1ab2feb35a-dev-ed.develop.lightning.force.com/lightning/r/Account/${accountId}/view\n`);
  }

  console.log('✓ Seed démo terminé');
}

main().catch(err => { console.error('Échec :', err.message); process.exit(1); });
