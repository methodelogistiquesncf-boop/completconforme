// ─────────────────────────────────────────────────────────────────────────────
// modules/reprises.js — Vue "Reprises" : liste des kits non conformes à traiter
//
// Collection cible : historique_controles
// Filtre           : statut == "Incomplet" ET reprise_close != true
// Tri              : timestamp desc
// Limit            : 100
//
// Actions disponibles :
//   • "Ouvrir le kit"      → navigue vers terrain.js / ouvrirDetailKit()
//   • "Marquer comme repris" → setDoc reprise_close: true sur le doc historique
// ─────────────────────────────────────────────────────────────────────────────
import {
    collection, query, where, orderBy, limit,
    getDocs, doc, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { db }           from "./firebase.js";
import { $, showToast, showConfirmToast } from "./utils.js";

// ─── Callback externe : ouvrir le kit dans Terrain ───────────────────────────
let _onOpenKit = null;
export function setReprisesOnOpenKit(fn) { _onOpenKit = fn; }

// ─── Cache session ────────────────────────────────────────────────────────────
let _cache        = null;
let _filterActif  = "tous";   // "tous" | "urgent" | "recents" | "clos"

// ─── Init & câblage ───────────────────────────────────────────────────────────
export function initReprises() {
    $("reprises-filter-tous"   )?.addEventListener("click", () => _setFilter("tous"));
    $("reprises-filter-urgent" )?.addEventListener("click", () => _setFilter("urgent"));
    $("reprises-filter-recents")?.addEventListener("click", () => _setFilter("recents"));
    $("reprises-filter-clos"   )?.addEventListener("click", () => _setFilter("clos"));
    $("reprises-search")?.addEventListener("input", () => _renderListe());
}

// ─── Chargement principal (appelé à chaque activation de l'onglet) ────────────
export async function chargerReprises() {
    _cache = null;           // invalide le cache à chaque ouverture d'onglet
    _filterActif = "tous";
    _syncFilterBtns();
    _setLoading(true);

    try {
        // Récupère les Incomplets non clos
        const qIncomplets = query(
            collection(db, "historique_controles"),
            where("statut", "==", "Incomplet"),
            orderBy("timestamp", "desc"),
            limit(100)
        );
        // Récupère les clos récents (reprise_close == true) séparément
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

        // Fusionne et déduplique (les clos peuvent apparaître dans les deux)
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
    const maintenant  = Date.now();
    const SEUIL_7J    = 7 * 24 * 60 * 60 * 1000;

    const ouverts     = docs.filter(d => !d.reprise_close);
    const urgents     = ouverts.filter(d => d.timestamp && (maintenant - new Date(d.timestamp).getTime()) > SEUIL_7J);
    const recents     = ouverts.filter(d => d.timestamp && (maintenant - new Date(d.timestamp).getTime()) <= SEUIL_7J);
    const clos        = docs.filter(d => d.reprise_close);

    _setText("reprises-kpi-total",    ouverts.length);
    _setText("reprises-kpi-semaine",  recents.length);
    _setText("reprises-kpi-urgents",  urgents.length);
    _setText("reprises-kpi-clos",     clos.length);
}

// ─── Filtrage & rendu liste ────────────────────────────────────────────────────
function _renderListe() {
    if (!_cache) return;

    const recherche  = ($("reprises-search")?.value || "").trim().toLowerCase();
    const maintenant = Date.now();
    const SEUIL_7J   = 7 * 24 * 60 * 60 * 1000;

    let docs = _cache;

    // Filtre onglets
    switch (_filterActif) {
        case "urgent":
            docs = docs.filter(d =>
                !d.reprise_close &&
                d.timestamp &&
                (maintenant - new Date(d.timestamp).getTime()) > SEUIL_7J
            );
            break;
        case "recents":
            docs = docs.filter(d =>
                !d.reprise_close &&
                d.timestamp &&
                (maintenant - new Date(d.timestamp).getTime()) <= SEUIL_7J
            );
            break;
        case "clos":
            docs = docs.filter(d => d.reprise_close);
            break;
        default: // "tous" = ouverts uniquement
            docs = docs.filter(d => !d.reprise_close);
            break;
    }

    // Filtre recherche
    if (recherche) {
        docs = docs.filter(d =>
            (d.empId         || "").toLowerCase().includes(recherche) ||
            (d.engin         || "").toLowerCase().includes(recherche) ||
            (d.nom_du_kit    || "").toLowerCase().includes(recherche) ||
            (d.code_kit      || "").toLowerCase().includes(recherche) ||
            (d.code_contenant|| "").toLowerCase().includes(recherche)
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

// ─── Construction d'une carte ─────────────────────────────────────────────────
function _buildCard(entry) {
    const maintenant  = Date.now();
    const SEUIL_7J    = 7 * 24 * 60 * 60 * 1000;
    const ts          = entry.timestamp ? new Date(entry.timestamp) : null;
    const anciennete  = ts ? maintenant - ts.getTime() : 0;
    const estUrgent   = anciennete > SEUIL_7J && !entry.reprise_close;
    const estClos     = !!entry.reprise_close;

    // Libellé délai
    const delaiLabel  = ts ? _formatDelai(anciennete) : "—";
    const delaiClass  = estClos ? "delai-clos"
                      : anciennete > SEUIL_7J                ? "delai-urgent"
                      : anciennete > 3 * 24 * 60 * 60 * 1000 ? "delai-moyen"
                      : "delai-recent";

    // Date formatée
    const dateStr = ts ? ts.toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }) : "—";

    // Écarts composants
    const ecarts = (entry.detail_verification || []).filter(c =>
        c.quantite_comptee !== null &&
        c.quantite_comptee !== undefined &&
        c.quantite_comptee !== c.quantite_requise
    );
    const conformes = (entry.detail_verification || []).filter(c =>
        c.quantite_comptee !== null &&
        c.quantite_comptee !== undefined &&
        c.quantite_comptee === c.quantite_requise
    );

    const card = document.createElement("div");
    card.className = "reprise-card"
        + (estClos   ? " reprise-card--clos"   : "")
        + (estUrgent ? " reprise-card--urgent" : "");
    card.dataset.id = entry.id;

    card.innerHTML = `
        <div class="reprise-card__header">
            <div class="reprise-card__badges">
                <span class="reprise-badge reprise-badge--emp">${entry.empId || "—"}</span>
                ${entry.engin         ? `<span class="reprise-badge reprise-badge--engin">${entry.engin}</span>` : ""}
                ${entry.code_contenant? `<span class="reprise-badge reprise-badge--cnt">📦 ${entry.code_contenant}</span>` : ""}
            </div>
            <div class="reprise-card__meta">
                <span class="reprise-delai ${delaiClass}">
                    ${estClos ? "✓ Repris" : "⏱ " + delaiLabel}
                </span>
                <span class="reprise-date">${dateStr}</span>
            </div>
        </div>

        <div class="reprise-card__body">
            <p class="reprise-kit-nom">${entry.nom_du_kit || entry.kitId || "—"}</p>
            <p class="reprise-kit-code">${entry.code_kit || entry.kitId || ""}</p>

            ${ecarts.length ? `
            <div class="reprise-ecarts">
                ${ecarts.map(c => `
                    <span class="reprise-ecart-badge reprise-ecart-badge--ko"
                          title="${c.nom || ""}">
                        ${c.code_piece || c.nom || "?"} :
                        <strong>${c.quantite_comptee}</strong>/${c.quantite_requise}
                    </span>
                `).join("")}
                ${conformes.map(c => `
                    <span class="reprise-ecart-badge reprise-ecart-badge--ok"
                          title="${c.nom || ""}">
                        ${c.code_piece || c.nom || "?"} : ✓
                    </span>
                `).join("")}
            </div>
            ` : `<p class="reprise-no-detail">Aucun détail de vérification enregistré.</p>`}

            ${entry.observation ? `
            <div class="reprise-obs">
                <span class="reprise-obs-icon">💬</span>
                <em>${entry.observation}</em>
            </div>
            ` : ""}

            <p class="reprise-agent">👤 ${entry.verificateur_email || "—"}</p>
        </div>

        ${!estClos ? `
        <div class="reprise-card__actions">
            <button class="reprise-btn reprise-btn--ouvrir" data-id="${entry.id}"
                    data-emp="${entry.empId || ""}" data-kit="${entry.kitId || ""}">
                Ouvrir le kit
            </button>
            <button class="reprise-btn reprise-btn--clore" data-id="${entry.id}">
                Marquer comme repris
            </button>
        </div>
        ` : `
        <div class="reprise-card__actions reprise-card__actions--clos">
            <span class="reprise-clos-label">✓ Non-conformité close</span>
        </div>
        `}
    `;

    // Événements boutons
    card.querySelector(".reprise-btn--ouvrir")?.addEventListener("click", e => {
        const emp = e.currentTarget.dataset.emp;
        const kit = e.currentTarget.dataset.kit;
        if (_onOpenKit && emp && kit) _onOpenKit(emp, kit);
        else showToast("⚠️ Impossible d'ouvrir ce kit.", "error");
    });

    card.querySelector(".reprise-btn--clore")?.addEventListener("click", async e => {
        const id = e.currentTarget.dataset.id;
        await _marquerRepris(id, card);
    });

    return card;
}

// ─── Action : marquer comme repris ───────────────────────────────────────────
async function _marquerRepris(docId, cardEl) {
    const ok = await showConfirmToast("Marquer cette non-conformité comme reprise ?");
    if (!ok) return;

    try {
        await updateDoc(doc(db, "historique_controles", docId), {
            reprise_close:    true,
            reprise_date:     new Date().toISOString(),
        });

        // Mise à jour du cache local
        if (_cache) {
            const entry = _cache.find(d => d.id === docId);
            if (entry) {
                entry.reprise_close = true;
                entry.reprise_date  = new Date().toISOString();
            }
        }

        // Animation de sortie de la carte
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
    $("reprises-list")   && ($("reprises-list").innerHTML = on ? "" : $("reprises-list").innerHTML);
}

function _showError(msg) {
    const el = $("reprises-empty");
    if (el) { el.textContent = msg; el.classList.remove("hidden"); }
}

function _setText(id, val) {
    const el = $(id); if (el) el.textContent = val;
}

function _formatDelai(ms) {
    const heures = Math.floor(ms / (1000 * 60 * 60));
    if (heures < 24) return `Il y a ${heures}h`;
    const jours = Math.floor(heures / 24);
    if (jours < 7)   return `Il y a ${jours}j`;
    const semaines = Math.floor(jours / 7);
    return `Il y a ${semaines} sem.`;
}
