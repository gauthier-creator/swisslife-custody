// Ajoute "Rejete" à la picklist Custody_KYC_Status__c pour que
// l'endpoint /api/kyc/reject puisse écrire cette valeur sans erreur
// INVALID_PICKLIST_VALUE.
import 'dotenv/config';
import JSZip from 'jszip';

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
  if (!r.ok) throw new Error(JSON.stringify(d));
  return { accessToken: d.access_token, instanceUrl: d.instance_url };
}

function soap(accessToken, body) {
  return `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header><met:SessionHeader><met:sessionId>${accessToken}</met:sessionId></met:SessionHeader></soapenv:Header>
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`;
}

async function soapCall(instanceUrl, accessToken, action, body) {
  const r = await fetch(`${instanceUrl}/services/Soap/m/59.0`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=UTF-8', SOAPAction: `"${action}"` },
    body: soap(accessToken, body),
  });
  return { ok: r.ok, text: await r.text() };
}

const extractTag = (xml, t) => (xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1];

const { accessToken, instanceUrl } = await getToken();

// Build a Metadata zip with an UPDATED CustomField metadata for the picklist
const fieldXml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Custody_KYC_Status__c</fullName>
    <label>Custody · Statut KYC</label>
    <type>Picklist</type>
    <required>false</required>
    <valueSet>
        <restricted>true</restricted>
        <valueSetDefinition>
            <sorted>false</sorted>
            <value><fullName>Non verifie</fullName><default>true</default><label>Non vérifié</label></value>
            <value><fullName>En cours</fullName><default>false</default><label>En cours</label></value>
            <value><fullName>Valide</fullName><default>false</default><label>Validé</label></value>
            <value><fullName>Rejete</fullName><default>false</default><label>Rejeté</label></value>
            <value><fullName>Expire</fullName><default>false</default><label>Expiré</label></value>
        </valueSetDefinition>
    </valueSet>
</CustomField>`;

const zip = new JSZip();
zip.file('objects/Account/fields/Custody_KYC_Status__c.field-meta.xml', fieldXml);
zip.file('package.xml', `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Account.Custody_KYC_Status__c</members>
        <name>CustomField</name>
    </types>
    <version>59.0</version>
</Package>`);

// Actually MDAPI for CustomField uses 'fields/<name>.field' path (legacy)
// inside 'objects/' container. Let me use source format instead.
const zip2 = new JSZip();
zip2.file('fields/Custody_KYC_Status__c.field', fieldXml.replace(/<CustomField[^>]*>|<\/CustomField>/g, '').trim());
// Actually the canonical MDAPI path is: objects/Account.object with the field inside.
// Simplest: use a full Account.object file.

const objectXml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <fields>
        <fullName>Custody_KYC_Status__c</fullName>
        <label>Custody · Statut KYC</label>
        <type>Picklist</type>
        <required>false</required>
        <valueSet>
            <restricted>true</restricted>
            <valueSetDefinition>
                <sorted>false</sorted>
                <value><fullName>Non verifie</fullName><default>true</default><label>Non vérifié</label></value>
                <value><fullName>En cours</fullName><default>false</default><label>En cours</label></value>
                <value><fullName>Valide</fullName><default>false</default><label>Validé</label></value>
                <value><fullName>Rejete</fullName><default>false</default><label>Rejeté</label></value>
                <value><fullName>Expire</fullName><default>false</default><label>Expiré</label></value>
            </valueSetDefinition>
        </valueSet>
    </fields>
</CustomObject>`;

const zip3 = new JSZip();
zip3.file('objects/Account.object', objectXml);
zip3.file('package.xml', `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Account.Custody_KYC_Status__c</members>
        <name>CustomField</name>
    </types>
    <version>59.0</version>
</Package>`);

const buf = await zip3.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const base64 = buf.toString('base64');

console.log(`→ Deploy patch ZIP (${buf.length} bytes)…`);
const deployBody = `<met:deploy>
  <met:ZipFile>${base64}</met:ZipFile>
  <met:DeployOptions>
    <met:allowMissingFiles>false</met:allowMissingFiles>
    <met:autoUpdatePackage>false</met:autoUpdatePackage>
    <met:checkOnly>false</met:checkOnly>
    <met:ignoreWarnings>true</met:ignoreWarnings>
    <met:performRetrieve>false</met:performRetrieve>
    <met:purgeOnDelete>false</met:purgeOnDelete>
    <met:rollbackOnError>true</met:rollbackOnError>
    <met:runAllTests>false</met:runAllTests>
    <met:singlePackage>true</met:singlePackage>
  </met:DeployOptions>
</met:deploy>`;
const dep = await soapCall(instanceUrl, accessToken, 'deploy', deployBody);
if (!dep.ok) throw new Error(dep.text.slice(0, 500));
const depId = extractTag(dep.text, 'id');
console.log(`  async id : ${depId}`);

for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const s = await soapCall(instanceUrl, accessToken,
    'checkDeployStatus',
    `<met:checkDeployStatus><met:asyncProcessId>${depId}</met:asyncProcessId><met:includeDetails>true</met:includeDetails></met:checkDeployStatus>`
  );
  const done = extractTag(s.text, 'done') === 'true';
  process.stdout.write('.');
  if (done) {
    const success = extractTag(s.text, 'success') === 'true';
    console.log('');
    if (!success) {
      console.error(s.text.slice(0, 1500));
      throw new Error('Deploy failed');
    }
    console.log('✓ Picklist values patchées');
    break;
  }
}
