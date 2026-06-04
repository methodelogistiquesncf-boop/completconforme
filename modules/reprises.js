// ─────────────────────────────────────────────────────────────────────────────
// modules/reprises.js
// ─────────────────────────────────────────────────────────────────────────────
import {
    collection, query, where, orderBy, limit,
    getDocs, doc, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db }                              from "./firebase.js";
import { $, showToast, showConfirmToast }  from "./utils.js";

let _onOpenKit   = null;
let _cache       = null;
let _filterActif = "tous";

export function setReprisesOnOpenKit(fn) { _onOpenKit = fn; }

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initReprises() {
    $("reprises-filter-tous"   )?.addEventListener("click", () => _setFilter("tous"));
    $("reprises-filter-urgent" )?.addEventListener("click", () => _setFilter("urgent"));
    $("reprises-filter-recents")?.addEventListener("click", () => _setFilter("recents"));
    $("reprises-filter-clos"   )?.addEventListener("click", () => _setFilter("clos"));
    $("reprises-search")?.addEventListener("input", () => _renderListe());
}

// ─── Chargement ───────────────────────────────────────────────────────────────
export async function chargerReprises() {
    _cache       = null;
    _filterActif = "tous";
    _syncFilterBtns();
    _setLoading(true);

    try {
        const qIncomplets = query(
            collection(db, "historique_controles"),
            where("statut", "==", "Incomplet"),
            orderBy("timestamp", "desc"),
            limit(100)
        );
        const qClos = query(
            collection(db, "historique_controles"),
            where("statut",        "==", "Incomplet"),
            where("reprise_close", "==", true),
            orderBy("timestamp", "desc"),
            limit(30)
        );

        const [snapIncomplets, snapClos] = await Promise.all([
            getDocs(qIncomplets),
            getDocs(qClos),
        ]);

        const docsMap = new Map();
        snapIncomplets.docs.forEach(d => docsMap.set(d.id, { id: d.id, ...d.data() }));
        snapClos.docs.forEach(d => {
            if (!docsMap.has(d.id)) docsMap.set(d.id, { id: d.id, ...d.data() });
        });

        _cache = [...docsMap.values()];
        _renderKPIs(_cache);
        _renderListe();
        _setLoading(false);

    } catch (err) {
        _setLoading(false);
        _showError("⚠️ Erreur de chargement : " + err.message);
        console.error("[Reprises]", err);
    }
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function _renderKPIs(docs) {
    const now      = Date.now();
    const SEUIL7J  = 7 * 24 * 60 * 60 * 1000;
    const ouverts  = docs.filter(d => !d.reprise_close);
    const urgents  = ouverts.filter(d => d.timestamp && (now - new Date(d.timestamp).getTime()) > SEUIL7J);
    const recents  = ouverts.filter(d => d.timestamp && (now - new Date(d.timestamp).getTime()) <= SEUIL7J);
    const clos     = docs.filter(d => d.reprise_close);

    _setText("reprises-kpi-total",   ouverts.length);
    _setText("reprises-kpi-semaine", recents.length);
    _setText("reprises-kpi-urgents", urgents.length);
    _setText("reprises-kpi-clos",    clos.length);
}

// ─── Filtrage & rendu ─────────────────────────────────────────────────────────
function _renderListe() {
    if (!_cache) return;

    const recherche = ($("reprises-search")?.value || "").trim().toLowerCase();
    const now       = Date.now();
    const SEUIL7J   = 7 * 24 * 60 * 60 * 1000;

    let docs = _cache;

    switch (_filterActif) {
        case "urgent":
            docs = docs.filter(d => !d.reprise_close && d.timestamp &&
                (now - new Date(d.timestamp).getTime()) > SEUIL7J);
            break;
        case "recents":
            docs = docs.filter(d => !d.reprise_close && d.timestamp &&
                (now - new Date(d.timestamp).getTime()) <= SEUIL7J);
            break;
        case "clos":
            docs = docs.filter(d => d.reprise_close);
            break;
        default:
            docs = docs.filter(d => !d.reprise_close);
            break;
    }

    if (recherche) {
        docs = docs.filter(d =>
            (d.empId          || "").toLowerCase().includes(recherche) ||
            (d.engin          || "").toLowerCase().includes(recherche) ||
            (d.nom_du_kit     || "").toLowerCase().includes(recherche) ||
            (d.code_kit       || "").toLowerCase().includes(recherche) ||
            (d.code_contenant || "").toLowerCase().includes(recherche)
        );
    }

    const listEl  = $("reprises-list");
    const emptyEl = $("reprises-empty");
    const cntEl   = $("reprises-count");
    if (!listEl) return;

    listEl.innerHTML = "";

    if (!docs.length) {
        if (emptyEl) {
            emptyEl.textContent = recherche
                ? "Aucun résultat pour cette recherche."
                : _filterActif === "clos"
                    ? "Aucune reprise close enregistrée."
                    : "Aucun kit non conforme en attente. 🎉";
            emptyEl.classList.remove("hidden");
        }
        if (cntEl) cntEl.textContent = "";
        return;
    }

    if (emptyEl) emptyEl.classList.add("hidden");
    if (cntEl)   cntEl.textContent = `${docs.length} kit${docs.length > 1 ? "s" : ""}`;

    docs.forEach(d => listEl.appendChild(_buildCard(d)));
}

// ─── Construction carte (DOM pur — pas de innerHTML pour les boutons) ──────────
function _buildCard(entry) {
    const now     = Date.now();
    const SEUIL7J = 7 * 24 * 60 * 60 * 1000;
    const ts      = entry.timestamp ? new Date(entry.timestamp) : null;
    const age     = ts ? now - ts.getTime() : 0;
    const estClos   = !!entry.reprise_close;
    const estUrgent = age > SEUIL7J && !estClos;

    const delaiClass = estClos      ? "delai-clos"
                     : age > SEUIL7J                    ? "delai-urgent"
                     : age > 3 * 24 * 60 * 60 * 1000   ? "delai-moyen"
                     : "delai-recent";

    const dateStr = ts ? ts.toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }) : "—";

    const ecarts   = (entry.detail_verification || []).filter(c =>
        c.quantite_comptee != null && c.quantite_comptee !== c.quantite_requise);
    const conformes = (entry.detail_verification || []).filter(c =>
        c.quantite_comptee != null && c.quantite_comptee === c.quantite_requise);

    // ── Carte ────────────────────────────────────────────────────────────────
    const card = document.createElement("div");
    card.className = "reprise-card"
        + (estClos   ? " reprise-card--clos"   : "")
        + (estUrgent ? " reprise-card--urgent" : "");

    // Header
    const header = document.createElement("div");
    header.className = "reprise-card__header";

    const badges = document.createElement("div");
    badges.className = "reprise-card__badges";
    badges.innerHTML =
        `<span class="reprise-badge reprise-badge--emp">${entry.empId || "—"}</span>`
        + (entry.engin          ? `<span class="reprise-badge reprise-badge--engin">${entry.engin}</span>` : "")
        + (entry.code_contenant ? `<span class="reprise-badge reprise-badge--cnt">📦 ${entry.code_contenant}</span>` : "");

    const meta = document.createElement("div");
    meta.className = "reprise-card__meta";
    meta.innerHTML =
        `<span class="reprise-delai ${delaiClass}">${estClos ? "✓ Repris" : "⏱ " + _formatDelai(age)}</span>`
        + `<span class="reprise-date">${dateStr}</span>`;

    header.appendChild(badges);
    header.appendChild(meta);

    // Body
    const body = document.createElement("div");
    body.className = "reprise-card__body";

    const nom  = document.createElement("p"); nom.className  = "reprise-kit-nom";  nom.textContent  = entry.nom_du_kit || entry.kitId || "—";
    const code = document.createElement("p"); code.className = "reprise-kit-code"; code.textContent = entry.code_kit  || entry.kitId || "";
    body.appendChild(nom);
    body.appendChild(code);

    if (ecarts.length || conformes.length) {
        const ecartDiv = document.createElement("div");
        ecartDiv.className = "reprise-ecarts";
        ecarts.forEach(c => {
            const s = document.createElement("span");
            s.className = "reprise-ecart-badge reprise-ecart-badge--ko";
            s.title     = c.nom || "";
            s.innerHTML = `${c.code_piece || c.nom || "?"} : <strong>${c.quantite_comptee}</strong>/${c.quantite_requise}`;
            ecartDiv.appendChild(s);
        });
        conformes.forEach(c => {
            const s = document.createElement("span");
            s.className = "reprise-ecart-badge reprise-ecart-badge--ok";
            s.title     = c.nom || "";
            s.textContent = `${c.code_piece || c.nom || "?"} : ✓`;
            ecartDiv.appendChild(s);
        });
        body.appendChild(ecartDiv);
    } else {
        const nd = document.createElement("p");
        nd.className   = "reprise-no-detail";
        nd.textContent = "Aucun détail de vérification enregistré.";
        body.appendChild(nd);
    }

    if (entry.observation) {
        const obs = document.createElement("div");
        obs.className = "reprise-obs";
        obs.innerHTML = `<span class="reprise-obs-icon">💬</span><em>${entry.observation}</em>`;
        body.appendChild(obs);
    }

    const agent = document.createElement("p");
    agent.className   = "reprise-agent";
    agent.textContent = "👤 " + (entry.verificateur_email || "—");
    body.appendChild(agent);

    // Actions
    const actions = document.createElement("div");
    actions.className = "reprise-card__actions" + (estClos ? " reprise-card__actions--clos" : "");

    if (!estClos) {
        const btnOuvrir = document.createElement("button");
        btnOuvrir.className   = "reprise-btn reprise-btn--ouvrir";
        btnOuvrir.textContent = "Ouvrir le kit";
        btnOuvrir.addEventListener("click", () => {
            const emp = entry.empId  || "";
            const kit = entry.kitId  || "";
            if (_onOpenKit && emp && kit) {
                _onOpenKit(emp, kit);
            } else {
                showToast("⚠️ Impossible d'ouvrir ce kit.", "error");
            }
        });

        const btnClore = document.createElement("button");
        btnClore.className   = "reprise-btn reprise-btn--clore";
        btnClore.textContent = "Marquer comme repris";
        btnClore.addEventListener("click", () => _marquerRepris(entry.id, card));

        actions.appendChild(btnOuvrir);
        actions.appendChild(btnClore);
    } else {
        const label = document.createElement("span");
        label.className   = "reprise-clos-label";
        label.textContent = "✓ Non-conformité close";
        actions.appendChild(label);
    }

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);

    return card;
}

// ─── Marquer comme repris ─────────────────────────────────────────────────────
async function _marquerRepris(docId, cardEl) {
    const ok = await showConfirmToast("Marquer cette non-conformité comme reprise ?");
    if (!ok) return;

    try {
        await updateDoc(doc(db, "historique_controles", docId), {
            reprise_close: true,
            reprise_date:  new Date().toISOString(),
        });

        if (_cache) {
            const entry = _cache.find(d => d.id === docId);
            if (entry) {
                entry.reprise_close = true;
                entry.reprise_date  = new Date().toISOString();
            }
        }

        cardEl.style.transition = "opacity .35s, transform .35s";
        cardEl.style.opacity    = "0";
        cardEl.style.transform  = "translateX(24px)";
        setTimeout(() => {
            _renderKPIs(_cache);
            _renderListe();
        }, 370);

        showToast("✅ Non-conformité marquée comme reprise.", "success");

    } catch (err) {
        showToast("❌ " + err.message, "error");
        console.error("[Reprises] marquerRepris:", err);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _setFilter(f) {
    _filterActif = f;
    _syncFilterBtns();
    _renderListe();
}

function _syncFilterBtns() {
    ["tous", "urgent", "recents", "clos"].forEach(f => {
        $(`reprises-filter-${f}`)?.classList.toggle("active", f === _filterActif);
    });
}

function _setLoading(on) {
    $("reprises-loading")?.classList.toggle("hidden", !on);
    if (on && $("reprises-list")) $("reprises-list").innerHTML = "";
}

function _showError(msg) {
    const el = $("reprises-empty");
    if (el) { el.textContent = msg; el.classList.remove("hidden"); }
}

function _setText(id, val) {
    const el = $(id); if (el) el.textContent = val;
}

function _formatDelai(ms) {
    const h = Math.floor(ms / 3600000);
    if (h < 24)  return `Il y a ${h}h`;
    const j = Math.floor(h / 24);
    if (j < 7)   return `Il y a ${j}j`;
    return `Il y a ${Math.floor(j / 7)} sem.`;
}
