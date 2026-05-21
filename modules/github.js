// ─────────────────────────────────────────────────────────────────────────────
// modules/github.js — Push vers GitHub + suivi pipeline Actions
// ─────────────────────────────────────────────────────────────────────────────
import { doc, setDoc }           from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db, auth, lireToken, FIRESTORE_SECRET } from "./firebase.js";
import { $, showToast }          from "./utils.js";

// ─── Constantes dépôt ────────────────────────────────────────────────────────
export const GITHUB_OWNER = "methodelogistiquesncf-boop";
export const GITHUB_REPO  = "completconforme";

const API_BASE    = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;
const API_ACTIONS = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions`;

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS  = 300_000;

// ─── Helpers communs ─────────────────────────────────────────────────────────
export function githubHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatDuration(start, end) {
    const secs = Math.round((new Date(end) - new Date(start)) / 1000);
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}min ${secs % 60}s`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG TOKEN GITHUB
// ═══════════════════════════════════════════════════════════════════════════════
export function initGithubConfig() {
    const tokenInput   = $("github-token-input");
    const btnSaveToken = $("btn-save-token");
    const tokenStatus  = $("token-status");
    if (!tokenInput || !btnSaveToken) return;

    // Indique si un token est déjà configuré
    _chargerEtatToken(tokenInput, tokenStatus);

    btnSaveToken.addEventListener("click", async () => {
        const val = tokenInput.value.trim();
        if (!val) { _setStatus(tokenStatus, "❌ Veuillez saisir un token.", "error"); return; }
        if (!val.startsWith("ghp_") && !val.startsWith("github_pat_")) {
            _setStatus(tokenStatus, "⚠️ Format inattendu. Un PAT commence par ghp_ ou github_pat_.", "error");
            return;
        }
        btnSaveToken.disabled    = true;
        btnSaveToken.textContent = "Enregistrement…";
        _setStatus(tokenStatus, "⏳ Enregistrement dans Firestore…", "info");
        try {
            await setDoc(
                doc(db, FIRESTORE_SECRET.col, FIRESTORE_SECRET.doc),
                {
                    [FIRESTORE_SECRET.field]: val,
                    token_mis_a_jour_le:      new Date().toISOString(),
                    token_mis_a_jour_par:     auth.currentUser?.email || "inconnu",
                },
                { merge: true }
            );
            tokenInput.value       = "";
            tokenInput.placeholder = "ghp_•••••••••• (déjà enregistré)";
            _setStatus(tokenStatus, "✅ Token enregistré dans Firestore avec succès.", "success");
        } catch (err) {
            _setStatus(tokenStatus, "❌ Erreur : " + err.message, "error");
        } finally {
            btnSaveToken.disabled    = false;
            btnSaveToken.textContent = "Enregistrer le token →";
        }
    });
}

async function _chargerEtatToken(tokenInput, tokenStatus) {
    try {
        const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const snap = await getDoc(doc(db, FIRESTORE_SECRET.col, FIRESTORE_SECRET.doc));
        if (snap.exists() && snap.data()[FIRESTORE_SECRET.field]) {
            _setStatus(tokenStatus, "✅ Token GitHub configuré.", "success");
            tokenInput.placeholder = "ghp_•••••••••• (déjà enregistré)";
        }
    } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLACEMENTS AUTORISÉS
// ═══════════════════════════════════════════════════════════════════════════════
const EXPECTED_FILENAME = "emplacements_autorises.txt";

export function initDropZoneEmplacements() {
    const dropZoneEmp  = $("drop-zone-emp");
    const fileInputEmp = $("file-input-emp");
    if (!dropZoneEmp || !fileInputEmp) return;

    dropZoneEmp.addEventListener("dragover",  e => { e.preventDefault(); dropZoneEmp.classList.add("dragover"); });
    dropZoneEmp.addEventListener("dragleave", ()  => dropZoneEmp.classList.remove("dragover"));
    dropZoneEmp.addEventListener("drop", e => {
        e.preventDefault();
        dropZoneEmp.classList.remove("dragover");
        const file = e.dataTransfer?.files?.[0];
        if (file) _traiterFichierEmp(file);
    });
    fileInputEmp.addEventListener("change", e => {
        const file = e.target.files?.[0];
        if (file) _traiterFichierEmp(file);
        e.target.value = "";
    });
}

async function _traiterFichierEmp(file) {
    const statusEl   = $("admin-status-emp");
    const progArea   = $("progress-area-emp");
    const progBar    = $("progress-bar-emp");
    const progLabel  = $("progress-label-emp");
    const previewWrap = $("emp-preview-wrap");
    const previewList = $("emp-preview-list");
    const previewCount = $("emp-preview-count");

    if (file.name !== EXPECTED_FILENAME) {
        _setStatus(statusEl, `❌ Nom invalide : « ${file.name} ». Attendu : « ${EXPECTED_FILENAME} ».`, "error");
        return;
    }
    previewWrap.classList.add("hidden");
    progArea.classList.remove("hidden");
    _setProgress(progBar, progLabel, 5, "Lecture du fichier…");
    _setStatus(statusEl, "⏳ Lecture du fichier…", "info");

    try {
        const text   = await file.text();
        const lignes = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
        if (!lignes.length) {
            _setStatus(statusEl, "❌ Le fichier est vide ou ne contient aucun identifiant valide.", "error");
            progArea.classList.add("hidden");
            return;
        }
        _setProgress(progBar, progLabel, 20, "Récupération du token…");
        const token = await lireToken();

        _setProgress(progBar, progLabel, 40, "Récupération du SHA actuel…");
        _setStatus(statusEl, "⏳ Connexion à GitHub…", "info");

        let sha = null;
        const getResp = await fetch(`${API_BASE}/${EXPECTED_FILENAME}`, { headers: githubHeaders(token) });
        if (getResp.ok) {
            sha = (await getResp.json()).sha;
        } else if (getResp.status !== 404) {
            throw new Error(`GitHub GET : ${(await getResp.json()).message}`);
        }

        _setProgress(progBar, progLabel, 65, "Envoi vers le dépôt…");
        _setStatus(statusEl, "⏳ Push vers GitHub…", "info");

        const base64Content = btoa(unescape(encodeURIComponent(text)));
        const putResp = await fetch(`${API_BASE}/${EXPECTED_FILENAME}`, {
            method:  "PUT",
            headers: { ...githubHeaders(token), "Content-Type": "application/json" },
            body:    JSON.stringify({
                message: "[Admin] MAJ emplacements_autorises.txt",
                content: base64Content,
                ...(sha ? { sha } : {}),
            }),
        });
        if (!putResp.ok) throw new Error(`GitHub PUT : ${(await putResp.json()).message}`);

        const result    = await putResp.json();
        const commitSha = result.commit?.sha?.slice(0, 7) || "ok";
        const commitUrl = result.commit?.html_url || "#";

        _setProgress(progBar, progLabel, 100, "Terminé.");
        statusEl.className = "admin-status success";
        statusEl.innerHTML =
            `✅ ${lignes.length} emplacement(s) envoyé(s) · Commit : ` +
            `<a href="${commitUrl}" target="_blank" rel="noopener"
                style="color:var(--green);font-family:var(--mono);font-size:.8rem;">
                ${commitSha} ↗
            </a>`;

        _afficherApercu(previewList, previewCount, previewWrap, lignes);
        await chargerListeEmplacementsAutorises();
    } catch (err) {
        console.error("[PushEmp]", err);
        _setStatus(statusEl, "❌ " + err.message, "error");
        progArea.classList.add("hidden");
    }
}

function _afficherApercu(listEl, countEl, wrapEl, lignes) {
    listEl.innerHTML = "";
    lignes.forEach(id => {
        const badge = document.createElement("span");
        badge.textContent = id;
        badge.style.cssText = `
            font-family:var(--mono);font-size:.72rem;font-weight:700;
            background:var(--accent-soft);color:var(--accent);
            border:1px solid rgba(192,53,74,.18);border-radius:6px;
            padding:.2rem .55rem;white-space:nowrap;letter-spacing:.04em;
        `;
        listEl.appendChild(badge);
    });
    countEl.textContent =
        `${lignes.length} emplacement${lignes.length > 1 ? "s" : ""} envoyé${lignes.length > 1 ? "s" : ""}`;
    wrapEl.classList.remove("hidden");
}

export async function chargerListeEmplacementsAutorises() {
    const URL     = `${API_BASE}/${EXPECTED_FILENAME}`;
    const listWrap  = $("emp-current-wrap");
    const listEl    = $("emp-current-list");
    const countEl   = $("emp-current-count");
    const loadingEl = $("emp-current-loading");
    const errorEl   = $("emp-current-error");
    if (!listWrap) return;

    loadingEl.classList.remove("hidden");
    errorEl.classList.add("hidden");
    listWrap.classList.add("hidden");

    try {
        const token  = await lireToken();
        const res    = await fetch(URL, { headers: githubHeaders(token) });
        if (!res.ok) throw new Error(`GitHub GET : ${(await res.json()).message}`);
        const data   = await res.json();
        const text   = atob(data.content.replace(/\n/g, ""));
        const lignes = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));

        loadingEl.classList.add("hidden");
        listEl.innerHTML = "";
        lignes.forEach(id => {
            const badge = document.createElement("span");
            badge.textContent = id;
            badge.style.cssText = `
                font-family:var(--mono);font-size:.72rem;font-weight:700;
                background:var(--input-bg);color:var(--text);
                border:1px solid var(--border);border-radius:6px;
                padding:.2rem .55rem;white-space:nowrap;letter-spacing:.04em;cursor:default;
            `;
            listEl.appendChild(badge);
        });
        countEl.textContent =
            `${lignes.length} emplacement${lignes.length > 1 ? "s" : ""} autorisé${lignes.length > 1 ? "s" : ""}`;
        listWrap.classList.remove("hidden");
    } catch (err) {
        loadingEl.classList.add("hidden");
        errorEl.textContent = "⚠️ " + err.message;
        errorEl.classList.remove("hidden");
    }
}

document.getElementById("btn-dl-exemple-emp")?.addEventListener("click", async () => {
    try {
        const res = await fetch("https://raw.githubusercontent.com/methodelogistiquesncf-boop/completconforme/main/emplacements_autorises.txt");
        if (!res.ok) throw new Error("Erreur réseau");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "emplacements_autorises.txt";
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert("Impossible de télécharger le fichier exemple : " + err.message);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT EXCEL + POLLING ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════
const TARGET_FOLDER = "imports/pending";
const ACCEPTED_EXT  = ["xlsx", "xls", "csv"];

export function initImportGithubXls() {
    const dropZoneXls  = $("drop-zone-xls");
    const fileInputXls = $("file-input-xls");
    if (!dropZoneXls || !fileInputXls) return;

    dropZoneXls.addEventListener("click",    () => fileInputXls.click());
    dropZoneXls.addEventListener("dragover",  e => { e.preventDefault(); dropZoneXls.classList.add("dragover"); });
    dropZoneXls.addEventListener("dragleave", ()  => dropZoneXls.classList.remove("dragover"));
    dropZoneXls.addEventListener("drop", e => {
        e.preventDefault();
        dropZoneXls.classList.remove("dragover");
        const file = e.dataTransfer?.files?.[0];
        if (file) _traiterFichierXls(file);
    });
    fileInputXls.addEventListener("change", e => {
        const file = e.target.files?.[0];
        if (file) _traiterFichierXls(file);
        e.target.value = "";
    });
}

async function _traiterFichierXls(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!ACCEPTED_EXT.includes(ext)) {
        _setStatus($("admin-status-xls"), `❌ Format invalide : « .${ext} ». Utilisez .xlsx, .xls ou .csv.`, "error");
        return;
    }

    const statusEl      = $("admin-status-xls");
    const progArea      = $("progress-area-xls");
    const progBar       = $("progress-bar-xls");
    const progLabel     = $("progress-label-xls");
    const workflowPanel = $("workflow-panel");
    const workflowLink  = $("workflow-link");
    const workflowDur   = $("workflow-duration");
    const workflowSteps = $("workflow-steps");

    workflowPanel.classList.add("hidden");
    workflowSteps.innerHTML    = "";
    workflowLink.style.display = "none";
    workflowDur.style.display  = "none";
    progArea.classList.remove("hidden");
    _setProgress(progBar, progLabel, 5, "Lecture du fichier…");
    _setStatus(statusEl, "⏳ Lecture du fichier…", "info");

    try {
        const buffer = await file.arrayBuffer();
        const uint8  = new Uint8Array(buffer);
        const base64 = btoa(uint8.reduce((d, b) => d + String.fromCharCode(b), ""));

        _setProgress(progBar, progLabel, 20, "Récupération du token…");
        const token      = await lireToken();
        const targetPath = `${TARGET_FOLDER}/${file.name}`;

        _setProgress(progBar, progLabel, 40, "Vérification du fichier existant…");
        _setStatus(statusEl, "⏳ Connexion à GitHub…", "info");

        let sha = null;
        const getResp = await fetch(`${API_BASE}/${targetPath}`, { headers: githubHeaders(token) });
        if (getResp.ok) {
            sha = (await getResp.json()).sha;
        } else if (getResp.status !== 404) {
            throw new Error(`GitHub GET : ${(await getResp.json()).message}`);
        }

        _setProgress(progBar, progLabel, 65, "Envoi vers le dépôt…");
        _setStatus(statusEl, "⏳ Push vers GitHub…", "info");

        const putResp = await fetch(`${API_BASE}/${targetPath}`, {
            method:  "PUT",
            headers: { ...githubHeaders(token), "Content-Type": "application/json" },
            body:    JSON.stringify({
                message: `[Admin] Import ${file.name} → ${TARGET_FOLDER}`,
                content: base64,
                ...(sha ? { sha } : {}),
            }),
        });
        if (!putResp.ok) throw new Error(`GitHub PUT : ${(await putResp.json()).message}`);

        const result    = await putResp.json();
        const commitSha = result.commit?.sha;
        const shortSha  = commitSha?.slice(0, 7) || "ok";
        const commitUrl = result.commit?.html_url || "#";

        _setProgress(progBar, progLabel, 100, "Fichier envoyé — pipeline en attente…");
        statusEl.className = "admin-status success";
        statusEl.innerHTML =
            `✅ « ${file.name} » envoyé dans <code style="font-family:var(--mono);font-size:.8rem;">${TARGET_FOLDER}/</code>` +
            ` · Commit : <a href="${commitUrl}" target="_blank" rel="noopener"
                style="color:var(--green);font-family:var(--mono);font-size:.8rem;">${shortSha} ↗</a>`;

        if (commitSha) await _pollWorkflow(commitSha, token);
    } catch (err) {
        console.error("[XLS]", err);
        _setStatus($("admin-status-xls"), "❌ " + err.message, "error");
        progArea.classList.add("hidden");
        showToast("❌ " + err.message, "error");
    }
}

// ─── Polling workflow ────────────────────────────────────────────────────────
async function _pollWorkflow(commitSha, token) {
    const panel   = $("workflow-panel");
    const link    = $("workflow-link");
    const spinner = $("workflow-spinner");
    const runLbl  = $("workflow-run-label");
    const runSt   = $("workflow-run-status");
    const steps   = $("workflow-steps");
    const dur     = $("workflow-duration");

    panel.classList.remove("hidden");
    _renderRunStatus(spinner, runLbl, runSt, "queued", null);
    _renderBusinessSteps(steps, [], null, null);

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        try {
            const res = await fetch(
                `${API_ACTIONS}/runs?head_sha=${commitSha}&per_page=10`,
                { headers: githubHeaders(token) }
            );
            if (!res.ok) continue;
            const data = await res.json();
            const run  = data.workflow_runs?.find(r =>
                !r.name?.toLowerCase().includes("pages") &&
                !r.path?.toLowerCase().includes("pages")
            ) ?? data.workflow_runs?.[0];
            if (!run) continue;

            link.href          = run.html_url;
            link.style.display = "inline";
            _renderRunStatus(spinner, runLbl, runSt, run.status, run.conclusion);
            await _pollRunJobs(run, token, deadline, spinner, runLbl, runSt, steps, dur);
            return;
        } catch {}
    }
    runLbl.textContent    = "⚠️ Délai dépassé — vérifiez GitHub Actions.";
    runLbl.style.color    = "var(--amber)";
    spinner.style.display = "none";
}

async function _pollRunJobs(initialRun, token, deadline, spinner, runLbl, runSt, stepsEl, durEl) {
    let run   = initialRun;
    let jobId = null;

    while (Date.now() < deadline) {
        try {
            const jobsRes = await fetch(`${API_ACTIONS}/runs/${run.id}/jobs`, { headers: githubHeaders(token) });
            if (jobsRes.ok) {
                const job = (await jobsRes.json()).jobs?.[0];
                if (job) { jobId = job.id; _renderBusinessSteps(stepsEl, job.steps || [], run.conclusion, null); }
            }
        } catch {}

        _renderRunStatus(spinner, runLbl, runSt, run.status, run.conclusion);

        if (run.status === "completed") {
            spinner.style.display = "none";
            if (run.created_at && run.updated_at) {
                durEl.textContent   = `⏱ Durée totale : ${formatDuration(run.created_at, run.updated_at)}`;
                durEl.style.display = "block";
            }
            if (jobId) {
                const kitCount = await _fetchKitCount(run.id, jobId, token);
                try {
                    const r2   = await fetch(`${API_ACTIONS}/runs/${run.id}/jobs`, { headers: githubHeaders(token) });
                    const job2 = r2.ok ? (await r2.json()).jobs?.[0] : null;
                    _renderBusinessSteps(stepsEl, job2?.steps || [], run.conclusion, kitCount);
                } catch { _renderBusinessSteps(stepsEl, [], run.conclusion, kitCount); }
            }
            return;
        }

        await sleep(POLL_INTERVAL_MS);
        try {
            const r = await fetch(`${API_ACTIONS}/runs/${run.id}`, { headers: githubHeaders(token) });
            if (r.ok) run = await r.json();
        } catch {}
    }
}

async function _fetchKitCount(runId, jobId, token) {
    try {
        const res = await fetch(
            `${API_ACTIONS}/jobs/${jobId}/logs`,
            { headers: githubHeaders(token), redirect: "follow" }
        );
        if (!res.ok) return null;
        const log = await res.text();
        const m = log.match(/(\d+)\s+kit[s(]*\s*[\w\s]*trait/)
               || log.match(/(\d+)\s+kit[s]?\s+import/i)
               || log.match(/kit[s]?\s+traité[s]?\s*:\s*(\d+)/i)
               || log.match(/(\d[\s\d]*)\s+kit/i);
        if (!m) return null;
        const n = parseInt(m[1].replace(/\s/g, ""), 10);
        return isNaN(n) ? null : n;
    } catch { return null; }
}

// ─── Rendu statut run ────────────────────────────────────────────────────────
function _renderRunStatus(spinner, runLbl, runSt, status, conclusion) {
    const MAP = {
        queued:      { icon: "⏳", label: "En file d'attente…",               color: "var(--muted)" },
        in_progress: { icon: "🔄", label: "Pipeline en cours…",              color: "var(--blue)"  },
    };
    const CONC = {
        success:   { icon: "✅", label: "Pipeline terminé avec succès !",    color: "var(--green)" },
        failure:   { icon: "❌", label: "Pipeline échoué.",                   color: "var(--red)"   },
        cancelled: { icon: "🚫", label: "Pipeline annulé.",                   color: "var(--muted)" },
    };
    const info = status === "completed"
        ? (CONC[conclusion] || { icon: "⏳", label: "Démarrage…", color: "var(--muted)" })
        : (MAP[status]      || { icon: "⏳", label: "Démarrage…", color: "var(--muted)" });

    spinner.style.display = status !== "completed" ? "block" : "none";
    runLbl.textContent    = `${info.icon} ${info.label}`;
    runLbl.style.color    = info.color;
    if (status === "completed") {
        runSt.style.borderColor = conclusion === "success" ? "rgba(63,168,118,.45)" : "rgba(192,53,74,.35)";
        runSt.style.background  = conclusion === "success" ? "rgba(63,168,118,.05)" : "rgba(192,53,74,.05)";
    }
}

// ─── Rendu étapes métier ─────────────────────────────────────────────────────
function _renderBusinessSteps(stepsEl, githubSteps, runConclusion, kitCount) {
    stepsEl.innerHTML = "";

    function groupState(matches) {
        const relevant = githubSteps.filter(s =>
            matches.some(m => s.name.toLowerCase().includes(m.toLowerCase()))
        );
        if (!relevant.length) return { status: "queued", conclusion: null };
        if (relevant.some(s => s.conclusion === "failure")) return { status: "completed", conclusion: "failure" };
        if (relevant.every(s => s.conclusion === "success" || s.conclusion === "skipped"))
            return { status: "completed", conclusion: "success" };
        if (relevant.some(s => s.status === "in_progress")) return { status: "in_progress", conclusion: null };
        return { status: "queued", conclusion: null };
    }

    const s1 = { icon: "📥", label: "Fichier importé avec succès",        status: "completed",  conclusion: "success" };
    const s2 = { icon: "⚙️", label: "Traitement du fichier",               ...groupState(["checkout","python","instal","identifier","vérif","detect"]) };
    const s3 = { icon: "🔥", label: "Exportation dans la base de données", ...groupState(["importer","firestore","injection"]) };

    let s4State;
    if (runConclusion === "success") {
        s4State = { status: "completed", conclusion: "success" };
    } else if (s2.conclusion === "failure" || s3.conclusion === "failure") {
        s4State = { status: "queued", conclusion: null };
    } else {
        s4State = groupState(["archiver","télécharger","nettoy","archiv"]);
        if (s4State.status === "queued" && s3.conclusion === "success")
            s4State = { status: "in_progress", conclusion: null };
    }

    const resultLabel = kitCount !== null
        ? `${kitCount} kit${kitCount > 1 ? "s" : ""} importé${kitCount > 1 ? "s" : ""} avec succès`
        : "Finalisation de l'import";

    const steps = [s1, s2, s3, { icon: "📦", label: resultLabel, ...s4State }];

    steps.forEach(step => {
        let displayIcon, color, rightEl;
        if (step.conclusion === "success") {
            displayIcon = "✅"; color = "var(--green)";
            rightEl = `<span style="font-family:var(--mono);font-size:.68rem;color:var(--muted);">succès</span>`;
        } else if (step.conclusion === "failure") {
            displayIcon = "❌"; color = "var(--red)";
            rightEl = `<span style="font-family:var(--mono);font-size:.68rem;color:var(--muted);">échec</span>`;
        } else if (step.status === "in_progress") {
            displayIcon = step.icon; color = "var(--blue)";
            rightEl = `<div class="spinner" style="width:14px;height:14px;border-width:2px;flex-shrink:0;"></div>`;
        } else {
            displayIcon = step.icon; color = "var(--muted)";
            rightEl = `<span style="font-family:var(--mono);font-size:.68rem;color:var(--muted);">en attente</span>`;
        }

        const borderColor = step.conclusion === "success"    ? "rgba(63,168,118,.4)"
                          : step.conclusion === "failure"    ? "rgba(192,53,74,.4)"
                          : step.status    === "in_progress" ? "var(--blue)"
                          : "var(--border)";

        const row = document.createElement("div");
        row.style.cssText = `
            display:flex;align-items:center;gap:.7rem;padding:.7rem .9rem;
            background:var(--input-bg);border:1.5px solid ${borderColor};
            border-radius:var(--radius);transition:border-color .2s;
        `;
        row.innerHTML = `
            <span style="font-size:1.05rem;flex-shrink:0;min-width:1.3rem;text-align:center;">${displayIcon}</span>
            <span style="font-size:.84rem;font-weight:600;color:${color};flex:1;line-height:1.35;">${step.label}</span>
            ${rightEl}
        `;
        stepsEl.appendChild(row);
    });
}

// ─── Helpers internes ────────────────────────────────────────────────────────
function _setStatus(el, msg, type = "info") {
    if (!el) return;
    el.textContent = msg;
    el.className   = `admin-status ${type}`;
}

function _setProgress(bar, label, pct, text) {
    if (bar)   bar.style.width     = pct + "%";
    if (label) label.textContent   = text;
}
