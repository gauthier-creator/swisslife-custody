import { useState, useEffect, useRef } from 'react';
import { Badge, Button, Card, Spinner, inputCls, labelCls } from './shared';

/* ─────────────────────────────────────────────────────────
   ContractSigningPage — Linear-style client signing page
   ───────────────────────────────────────────────────────── */

const fmtDateFR = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function ContractSigningPage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signerName, setSignerName] = useState('');
  const contractRef = useRef(null);

  useEffect(() => { fetchContract(); }, [token]);

  const fetchContract = async () => {
    try {
      const res = await fetch(`/api/signing/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lien invalide ou expiré');
      }
      const json = await res.json();
      setData(json);
      if (json.status === 'signed') setSigned(true);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleSign = async () => {
    if (!signerName.trim()) return alert('Veuillez saisir votre nom complet pour signer.');
    setSigning(true);
    try {
      const res = await fetch(`/api/signing/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: signerName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la signature');
      }
      setSigned(true);
    } catch (err) { alert(err.message); }
    setSigning(false);
  };

  const handlePrint = () => {
    const content = contractRef.current;
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Contrat · ${data.client_name}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        body{font-family:'Inter',-apple-system,sans-serif;max-width:720px;margin:40px auto;padding:40px;color:#0A0A0A;line-height:1.6;font-size:13px;background:#fff}
        h1{font-size:22px;font-weight:600;margin:0 0 24px;letter-spacing:-0.015em}
        h2{font-size:13px;font-weight:600;margin:24px 0 8px;color:#0A0A0A}
        .label{font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6B6B6B;margin-bottom:4px}
        p{margin:6px 0}
        .signature{margin-top:48px;display:flex;justify-content:space-between;gap:32px}
        .signature div{flex:1;border-top:1px solid #0A0A0A;padding-top:8px}
        @media print{body{margin:0;padding:20px}}
      </style>
      </head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  // ── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex items-center justify-center">
        <div className="flex items-center gap-2 text-[#6B6B6B]">
          <Spinner />
          <span className="text-[13px]">Chargement du contrat…</span>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex items-center justify-center px-6">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-[#B91C1C]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-[15px] font-semibold text-[#0A0A0A]">Lien invalide</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-2 leading-relaxed">{error}</p>
          <p className="mt-6 pt-4 border-t border-[rgba(10,10,10,0.06)] text-[11px] text-[#9B9B9B] font-medium uppercase tracking-wider">
            SwissLife Banque Privée
          </p>
        </Card>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────
  if (signed) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex items-center justify-center px-6">
        <Card className="max-w-lg w-full p-10 text-center animate-fade">
          <div className="w-12 h-12 rounded-full bg-[#ECFDF5] flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[22px] font-semibold text-[#0A0A0A] tracking-tight">
            Merci, {data.client_name.split(' ')[0]}.
          </h1>
          <p className="mt-2 text-[13px] text-[#6B6B6B] leading-relaxed max-w-sm mx-auto">
            Votre contrat de conservation d'actifs numériques a été enregistré et versé à votre dossier. Votre banquier privé vous contactera pour les prochaines étapes.
          </p>
          <div className="mt-8 pt-5 border-t border-[rgba(10,10,10,0.06)]">
            <p className="text-[11px] text-[#9B9B9B] font-medium uppercase tracking-wider">
              SwissLife Banque Privée · Paris
            </p>
            <p className="text-[11px] text-[#9B9B9B] mt-1">
              Signature électronique · Art. 1367 C. civ.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ── Contract ──────────────────────────────────────────
  const clientName = data.client_name || '';
  const clientAddress = [data.client_street, data.client_postal_code, data.client_city, data.client_country].filter(Boolean).join(' · ') || 'Adresse non renseignée';
  const clientPhone = data.client_phone || 'Non renseigné';
  const currentDate = fmtDateFR();

  const articles = [
    { n: 1, title: 'Objet', body: 'Le présent contrat a pour objet de définir les conditions dans lesquelles La Banque assure, pour le compte du Client, la conservation d\'actifs numériques au sens de l\'article L.54-10-1 du Code Monétaire et Financier et du règlement (UE) 2023/1114 (MiCA).' },
    { n: 2, title: 'Services de conservation', body: 'La Banque assure la garde des clés cryptographiques privées nécessaires à la détention et au transfert des actifs numériques du Client, au moyen d\'une infrastructure de type MPC (Multi-Party Computation) conforme aux standards de sécurité de l\'industrie.' },
    { n: 3, title: 'Ségrégation des actifs', body: 'Conformément à l\'article 75(7) du règlement MiCA, les actifs numériques du Client sont conservés sur des adresses blockchain distinctes de celles de La Banque et des autres clients. Les actifs du Client ne font pas partie du bilan de La Banque.' },
    { n: 4, title: 'Responsabilité', body: 'La Banque est responsable de la perte d\'actifs numériques résultant d\'un incident imputable à La Banque ou à ses prestataires techniques, conformément à l\'article 75(8) du règlement MiCA. La valeur de restitution correspond à la valeur de marché des actifs au moment de la perte.' },
    { n: 5, title: 'Restitution', body: 'Le Client peut demander la restitution de tout ou partie de ses actifs numériques à tout moment. La Banque s\'engage à exécuter la restitution dans un délai raisonnable ne pouvant excéder cinq jours ouvrables.' },
    { n: 6, title: 'Frais', body: 'Les frais de conservation sont exprimés en points de base par an, calculés sur la valeur de marché moyenne des actifs conservés. Les frais de transaction sont facturés séparément selon le barème en vigueur.' },
    { n: 7, title: 'Lutte contre le blanchiment', body: 'Le Client s\'engage à respecter l\'ensemble des obligations relatives à la lutte contre le blanchiment et le financement du terrorisme. La Banque se réserve le droit de geler les actifs du Client sur instruction de Tracfin ou de toute autorité compétente (art. L.562-4 CMF).' },
    { n: 8, title: 'Durée et résiliation', body: 'Le présent contrat est conclu pour une durée indéterminée. Chaque partie peut le résilier moyennant un préavis de trente jours. En cas de résiliation, les actifs sont restitués au Client conformément à l\'article 5.' },
    { n: 9, title: 'Droit applicable', body: 'Le présent contrat est soumis au droit français. Tout litige sera soumis aux tribunaux compétents de Paris.' },
  ];

  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[#0A0A0A]">
      {/* ── Top nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[rgba(10,10,10,0.08)]">
        <div className="max-w-[760px] mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[#0A0A0A] rounded-md flex items-center justify-center">
              <span className="text-white text-[10px] font-bold tracking-tight">SL</span>
            </div>
            <span className="text-[13px] font-semibold text-[#0A0A0A] tracking-tight">SwissLife Custody</span>
            <Badge variant="info">Conservation</Badge>
          </div>
          <Button size="sm" variant="secondary" onClick={handlePrint}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimer
          </Button>
        </div>
      </header>

      <div className="max-w-[760px] mx-auto px-6 py-8">
        {/* ── Header ─────────────────────────────────── */}
        <div className="mb-5">
          <p className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wider mb-2">
            Document contractuel · {currentDate}
          </p>
          <h1 className="text-[26px] font-semibold text-[#0A0A0A] tracking-tight leading-tight">
            Contrat de conservation d'actifs numériques
          </h1>
          <p className="mt-3 text-[13px] text-[#6B6B6B] leading-relaxed max-w-xl">
            Veuillez prendre le temps de lire ce document en entier. Il décrit les conditions selon lesquelles SwissLife Banque Privée assure la garde de vos actifs numériques, conformément au règlement européen MiCA et au Code monétaire et financier.
          </p>
        </div>

        {/* ── Contract body card ─────────────────────── */}
        <div ref={contractRef} className="bg-white border border-[rgba(10,10,10,0.08)] rounded-lg p-8">
          {/* Parties */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-6 border-b border-[rgba(10,10,10,0.08)]">
            <div>
              <p className="label text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider mb-1.5">La Banque</p>
              <p className="text-[14px] font-semibold text-[#0A0A0A]">SwissLife Banque Privée</p>
              <div className="mt-1.5 text-[12px] text-[#6B6B6B] leading-relaxed">
                Société Anonyme · 7 rue Belgrand<br />
                92300 Levallois-Perret<br />
                RCS Nanterre<br />
                Prestataire de Services sur Actifs Numériques
              </div>
            </div>
            <div>
              <p className="label text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider mb-1.5">Le Client</p>
              <p className="text-[14px] font-semibold text-[#0A0A0A]">{clientName}</p>
              <div className="mt-1.5 text-[12px] text-[#6B6B6B] leading-relaxed">
                {clientAddress}<br />
                {clientPhone}
              </div>
            </div>
          </div>

          {/* Articles */}
          <div className="mt-6 space-y-5">
            {articles.map(a => (
              <section key={a.n} className="grid grid-cols-12 gap-4">
                <div className="col-span-12 sm:col-span-3">
                  <p className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider tabular-nums">
                    Article {String(a.n).padStart(2, '0')}
                  </p>
                </div>
                <div className="col-span-12 sm:col-span-9">
                  <h2 className="text-[13px] font-semibold text-[#0A0A0A] mb-1">{a.title}</h2>
                  <p className="text-[13px] text-[#4A4A4A] leading-relaxed">{a.body}</p>
                </div>
              </section>
            ))}
          </div>

          {/* Closing */}
          <div className="mt-8 pt-6 border-t border-[rgba(10,10,10,0.08)]">
            <p className="text-[13px] text-[#4A4A4A]">Fait à Paris, le {currentDate}.</p>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="border-t border-[#0A0A0A] pt-2">
                <p className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider mb-1">Le Client</p>
                <p className="text-[13px] font-medium text-[#0A0A0A]">{clientName}</p>
              </div>
              <div className="border-t border-[#0A0A0A] pt-2">
                <p className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider mb-1">La Banque</p>
                <p className="text-[13px] font-medium text-[#0A0A0A]">SwissLife Banque Privée</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Signature card ──────────────────────────── */}
        <Card className="mt-4 p-6">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[15px] font-semibold text-[#0A0A0A] tracking-tight">Signature électronique</h3>
            <Badge variant="default">Art. 1367 C. civ.</Badge>
          </div>
          <p className="text-[12px] text-[#6B6B6B] leading-relaxed max-w-xl">
            En signant, vous acceptez les conditions ci-dessus. Cette signature électronique a valeur contractuelle. L'horodatage et l'adresse IP sont enregistrés pour la conformité réglementaire.
          </p>

          <div className="mt-5 max-w-md">
            <label className={labelCls}>Votre nom complet</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={clientName}
              className={inputCls}
            />
          </div>

          <div className="mt-5 flex items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={handleSign}
              disabled={signing || !signerName.trim()}
            >
              {signing && <Spinner />}
              {signing ? 'Signature en cours…' : 'Signer le contrat'}
            </Button>
            <span className="text-[11px] text-[#9B9B9B]">Horodatage & IP enregistrés</span>
          </div>
        </Card>

        {/* ── Footer ──────────────────────────────────── */}
        <footer className="mt-8 pt-4 border-t border-[rgba(10,10,10,0.08)] flex items-center justify-between">
          <p className="text-[11px] text-[#9B9B9B] font-medium uppercase tracking-wider">
            SwissLife Banque Privée · Paris
          </p>
          <p className="text-[11px] text-[#9B9B9B] font-medium uppercase tracking-wider">
            AMF · ACPR · MiCA Art. 60
          </p>
        </footer>
      </div>
    </div>
  );
}
