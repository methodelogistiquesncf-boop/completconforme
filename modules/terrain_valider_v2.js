// ─────────────────────────────────────────────────────────────────────────────
// terrain.js — mise à jour de _valider() uniquement
//
// Imports à ajouter en tête du fichier :
// import { increment, setDoc, addDoc, getDoc, doc, collection } from "firebase-firestore.js";
// import { invaliderCacheStats } from "./stats.js";
// ─────────────────────────────────────────────────────────────────────────────

// ─── Variable module — données du kit en cours ────────────────────────────────
// Alimentée dans _afficherDetailKit(), consommée dans _valider().
// Évite le getDoc() inutile après le setDoc().
let _currentKitData = {};

function _afficherDetailKit(kitId, data, empId) {
    _currentKitData = data;   // ← mémoriser pour _valider()

    $('detail-loading-card').classList.add('hidden');

    $('detail-emp-badge').textContent = empId;
    $('detail-kit-badge').textContent = kitId;
    $('detail-nom').textContent       = data.nom_du_kit || kitId;
    $('detail-emp').textContent       = empId;

    const enginEl = $('detail-engin');
    if (enginEl) {
        const parts = [];
        if (data.engin)                     parts.push(`🚂 Engin : ${data.engin}`);
        if (data.code_kit)                  parts.push(`Code : ${data.code_kit}`);
        if (data.code_contenant)            parts.push(`📦 Contenant : ${data.code_contenant}`);
        if (data.emplacement_wms_remontage) parts.push(`🔧 WMS : ${data.emplacement_wms_remontage}`);
        if (data.date_debut_iso)            parts.push(`📅 Date : ${isoToDisplay(data.date_debut_iso)}`);
        enginEl.textContent = parts.join('  ·  ');
    }

    const compList = $('comp-list');
    compList.innerHTML = '';
    (data.composants || []).forEach(comp => {
        const item = document.createElement('div');
        item.className        = 'comp-item';
        item.dataset.required = comp.quantite_requise;
        item.dataset.codePiece = comp.code_piece || '';
        item.innerHTML = `
            <div class="comp-left">
                <div class="comp-status-icon">
                    <svg class="icon-ok" width="12" height="9" viewBox="0 0 12 9" fill="none">
                        <path d="M1 4L4.5 7.5L11 1" stroke="white" stroke-width="2"
                              stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <svg class="icon-ko" width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1L9 9M9 1L1 9" stroke="white" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                ${comp.code_piece ? `<span class="comp-code-piece">${comp.code_piece}</span>` : ''}
                <span class="comp-name">${comp.nom}</span>
            </div>
            <span class="comp-qty-required">${comp.quantite_requise}</span>
            <input type="number" class="qty-input" min="0" placeholder="—"
                   aria-label="Quantité comptée">
        `;
        const input = item.querySelector('.qty-input');
        input.addEventListener('input', () => _evaluerItem(item, input, comp.quantite_requise));
        compList.appendChild(item);
    });

    $('detail-kit-card').classList.remove('hidden');
}

// ─── Validation ───────────────────────────────────────────────────────────────
async function _valider(statut) {
    if (!currentEmpId || !currentKitId) return;

    const items = [...$('comp-list').querySelectorAll('.comp-item')];

    if (statut === "Conforme") {
        const nonConformes  = items.filter(i => i.classList.contains('non-conforme'));
        const nonRenseignes = items.filter(i =>
            !i.classList.contains('checked') && !i.classList.contains('non-conforme')
        );
        if (nonConformes.length > 0) {
            showToast(`❌ ${nonConformes.length} article(s) en quantité incorrecte.`, 'error');
            return;
        }
        if (nonRenseignes.length > 0) {
            if (!await showConfirmToast(`${nonRenseignes.length} article(s) non renseignés. Valider quand même ?`))
                return;
        }
    }

    const details = items.map(item => ({
        nom:              item.querySelector('.comp-name').textContent,
        code_piece:       item.dataset.codePiece || '',
        quantite_requise: parseInt(item.dataset.required, 10),
        quantite_comptee: item.querySelector('.qty-input').value !== ''
                              ? parseInt(item.querySelector('.qty-input').value, 10)
                              : null,
    }));

    try {
        const now   = new Date().toISOString();
        const user  = await getAuthUser().catch(() => null);
        const email = user?.email || "inconnu";

        // ── 1. Enregistrement du statut sur le kit ────────────────────────────
        await setDoc(
            doc(db, "emplacements", currentEmpId, "kits", currentKitId),
            {
                statut_conformite:     statut,
                derniere_verification: now,
                verificateur_email:    email,
                detail_verification:   details,
            },
            { merge: true }
        );

        // ── 2. Historique (données issues du cache, 0 getDoc supplémentaire) ──
        const kitData = _currentKitData;
        await addDoc(collection(db, "historique_controles"), {
            empId:               currentEmpId,
            kitId:               currentKitId,
            nom_du_kit:          kitData.nom_du_kit     || currentKitId,
            engin:               kitData.engin          || "",
            code_kit:            kitData.code_kit       || "",
            code_contenant:      kitData.code_contenant || "",
            statut,
            verificateur_email:  email,
            timestamp:           now,
            detail_verification: details,
        });

        // ── 3. Mise à jour du document de synthèse stats/kpi ──────────────────
        // Une seule écriture supplémentaire — mais les stats restent toujours
        // exactes peu importe la taille de la collection historique_controles.
        const engin    = kitData.engin || "—";
        const dateNow  = new Date();
        const semLabel = `${dateNow.getFullYear()}-W${String(numSemaine(dateNow)).padStart(2, '0')}`;

        await setDoc(
            doc(db, "stats", "kpi"),
            {
                total:                                          increment(1),
                conformes:                                      increment(statut === "Conforme"  ? 1 : 0),
                incomplets:                                     increment(statut === "Incomplet" ? 1 : 0),
                [`par_engin.${engin}.total`]:                   increment(1),
                [`par_engin.${engin}.conformes`]:               increment(statut === "Conforme"  ? 1 : 0),
                [`par_semaine.${semLabel}.total`]:              increment(1),
                [`par_semaine.${semLabel}.conformes`]:          increment(statut === "Conforme"  ? 1 : 0),
                [`par_semaine.${semLabel}.incomplets`]:         increment(statut === "Incomplet" ? 1 : 0),
            },
            { merge: true }
        );

        // ── 4. Invalide le cache stats côté client ────────────────────────────
        invaliderCacheStats();

        showToast(`✅ Statut « ${statut} » enregistré.`, 'success');
        setTimeout(() => {
            currentEmpId    = '';
            currentKitId    = '';
            _currentKitData = {};
            afficherVue('calendrier');
        }, 1500);

    } catch (err) {
        showToast("Erreur d'enregistrement : " + err.message, 'error');
    }
}
