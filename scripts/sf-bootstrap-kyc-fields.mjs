// ============================================================
// Salesforce — Bootstrap custom Custody/KYC fields on Account
// ============================================================
// Crée (ou met à jour) les custom fields nécessaires pour la
// gestion KYC du banquier depuis Salesforce. Idempotent : si
// le champ existe déjà, on le saute.
//
// Usage : node scripts/sf-bootstrap-kyc-fields.mjs
//
// Requis env : SF_CLIENT_ID · SF_CLIENT_SECRET · SF_USERNAME ·
//              SF_PASSWORD (+ SF_SECURITY_TOKEN si nécessaire) ·
//              SF_LOGIN_URL (défaut https://login.salesforce.com)
//
// Après création, il faut :
//   1. Ajouter les champs au page layout Account (manuel, Setup)
//   2. Grant FLS aux profils des banquiers (ce script le fait
//      pour le profil "System Administrator" — pour d'autres
//      profils, utiliser Permission Set Groups)
// ============================================================

import 'dotenv/config';

const LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

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

// Les 10 champs que l'app attend sur Account. Les 6 premiers sont
// déjà lus par src/services/salesforceApi.js · mapAccount(). Les 4
// derniers tracent la validation (qui/quand/ref/notes).
const FIELDS = [
  {
    fullName: 'Account.Custody_KYC_Status__c',
    label: 'Custody · Statut KYC',
    type: 'Picklist',
    description: 'Étape du parcours KYC pour la custody crypto',
    valueSet: {
      valueSetDefinition: {
        sorted: false,
        value: [
          { valueName: 'Non commencé', default: true },
          { valueName: 'En cours' },
          { valueName: 'À valider' },
          { valueName: 'Valide' },          // pas d'accent — matches CustodyEligibilityPanel
          { valueName: 'Rejeté' },
        ],
      },
    },
  },
  {
    fullName: 'Account.Custody_Risk_Level__c',
    label: 'Custody · Profil de risque',
    type: 'Picklist',
    description: 'Classification LCB-FT du client',
    valueSet: {
      valueSetDefinition: {
        sorted: false,
        value: [
          { valueName: 'Faible' },
          { valueName: 'Standard', default: true },
          { valueName: 'Élevé' },
          { valueName: 'Critique' },
        ],
      },
    },
  },
  {
    fullName: 'Account.Custody_Sanctions_Clear__c',
    label: 'Custody · Sanctions OK',
    type: 'Checkbox',
    description: 'Résultat du screening AML (Chainalysis + ComplyCube)',
    defaultValue: 'false',
  },
  {
    fullName: 'Account.Custody_Adequacy_Done__c',
    label: 'Custody · Adéquation MiFID',
    type: 'Checkbox',
    description: 'Test d\'adéquation MiFID II effectué',
    defaultValue: 'false',
  },
  {
    fullName: 'Account.Custody_Contract_Signed__c',
    label: 'Custody · Mandat signé',
    type: 'Checkbox',
    description: 'Mandat de conservation crypto-actifs signé',
    defaultValue: 'false',
  },
  {
    fullName: 'Account.Custody_Eligible__c',
    label: 'Custody · Éligible',
    type: 'Checkbox',
    description: 'Client éligible au service de custody (toutes les étapes OK)',
    defaultValue: 'false',
  },
  {
    fullName: 'Account.Custody_KYC_Validated_At__c',
    label: 'Custody · KYC validé le',
    type: 'DateTime',
    description: 'Horodatage de la validation KYC finale',
  },
  {
    fullName: 'Account.Custody_KYC_Validated_By__c',
    label: 'Custody · KYC validé par',
    type: 'Text',
    length: 120,
    description: 'Email du banquier ayant validé le dossier KYC',
  },
  {
    fullName: 'Account.Custody_KYC_Provider__c',
    label: 'Custody · Provider KYC',
    type: 'Text',
    length: 120,
    description: 'Référence de l\'outil de vérification (ComplyCube check ID)',
  },
  {
    fullName: 'Account.Custody_KYC_Notes__c',
    label: 'Custody · Notes KYC',
    type: 'LongTextArea',
    length: 32000,
    visibleLines: 5,
    description: 'Notes internes du banquier sur le dossier KYC',
  },
];

async function fieldExists(accessToken, instanceUrl, apiName) {
  // Tooling API query — look for CustomField where DeveloperName matches
  // (without the __c suffix).
  const devName = apiName.replace('Account.', '').replace('__c', '');
  const soql = encodeURIComponent(
    `SELECT Id, DeveloperName FROM CustomField WHERE TableEnumOrId = 'Account' AND DeveloperName = '${devName}'`
  );
  const r = await fetch(`${instanceUrl}/services/data/v59.0/tooling/query/?q=${soql}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await r.json();
  return !!(d.records && d.records.length);
}

async function createField(accessToken, instanceUrl, field) {
  const body = {
    FullName: field.fullName,
    Metadata: {
      label: field.label,
      type: field.type,
      description: field.description,
      inlineHelpText: field.description,
      required: false,
      ...(field.length != null ? { length: field.length } : {}),
      ...(field.visibleLines != null ? { visibleLines: field.visibleLines } : {}),
      ...(field.defaultValue != null ? { defaultValue: field.defaultValue } : {}),
      ...(field.valueSet ? { valueSet: field.valueSet } : {}),
    },
  };
  const r = await fetch(`${instanceUrl}/services/data/v59.0/tooling/sobjects/CustomField/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${field.fullName}: ${JSON.stringify(d)}`);
  return d;
}

async function grantFlsSystemAdmin(accessToken, instanceUrl, fields) {
  // Ajoute les permissions FieldPermissions sur le profil Admin.
  // Pour d'autres profils, créer un Permission Set Group dans Setup.
  const soql = encodeURIComponent(`SELECT Id FROM Profile WHERE Name = 'System Administrator'`);
  const r = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${soql}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await r.json();
  const profileId = d.records?.[0]?.Id;
  if (!profileId) {
    console.log('  ⚠ Profil System Administrator introuvable — skip FLS');
    return;
  }
  let granted = 0;
  for (const f of fields) {
    try {
      const rr = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/FieldPermissions/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ParentId: profileId,  // ignored for Profile — actually needs PermissionSet
          Field: f.fullName,
          PermissionsRead: true,
          PermissionsEdit: true,
          SobjectType: 'Account',
        }),
      });
      if (rr.ok) granted++;
    } catch {}
  }
  console.log(`  · FLS tenté sur ${granted}/${fields.length} champs`);
}

async function main() {
  console.log('→ Authentification Salesforce…');
  const { accessToken, instanceUrl } = await getToken();
  console.log(`  ✓ Connecté à ${instanceUrl}`);

  const created = [];
  const skipped = [];
  const failed = [];

  for (const field of FIELDS) {
    process.stdout.write(`  · ${field.fullName.padEnd(44)} `);
    try {
      if (await fieldExists(accessToken, instanceUrl, field.fullName)) {
        console.log('déjà présent');
        skipped.push(field.fullName);
        continue;
      }
      await createField(accessToken, instanceUrl, field);
      console.log('créé ✓');
      created.push(field.fullName);
    } catch (err) {
      console.log('ÉCHEC');
      console.log(`      → ${err.message}`);
      failed.push({ name: field.fullName, error: err.message });
    }
  }

  console.log('\n── Récapitulatif ──');
  console.log(`  créés         : ${created.length}`);
  console.log(`  déjà présents : ${skipped.length}`);
  console.log(`  en échec      : ${failed.length}`);

  if (failed.length) {
    console.log('\nÉchecs détaillés :');
    failed.forEach(f => console.log(`  · ${f.name}: ${f.error}`));
  }

  console.log('\n⚠ À faire manuellement dans Salesforce Setup :');
  console.log('  1. Object Manager → Account → Page Layouts → ajouter la section "Custody"');
  console.log('  2. Permission Sets → créer "Custody_Banquier" si ce n\'est pas fait');
  console.log('  3. FLS → Read/Edit sur Custody_* pour le profil banquier');
}

main().catch((err) => {
  console.error('Bootstrap échec :', err.message);
  process.exit(1);
});
