/* ========================================================================
   BACKROOM by FMR - v2.0 (Google Sheets Backend)
   ======================================================================== */

// Callbacks globaux
function gapiClientLoaded() {
    googleApiManager.gapiClientLoaded();
}

function gisClientLoaded() {
    googleApiManager.gisClientLoaded();
}

// ----- Le reste du script commence ici -----

let gapiReady = false;
let gisReady = false;
let onLoginCallback = null;

// ======================= GESTIONNAIRE GOOGLE API ======================= //
const googleApiManager = {
    // La Clé API n'est plus nécessaire
    // API_KEY: 'VOTRE_CLE_API',
    CLIENT_ID: '539526644294-d6jju7s5artqk518ptt3t27laih4i7qg.apps.googleusercontent.com',

    gapi: null,
    gis: null,
    tokenClient: null, 

    initClient: (onLoginStatusChange) => {
        onLoginCallback = onLoginStatusChange;
        if (gisReady) {
            googleApiManager.checkAllReady();
        }
    },

    gapiClientLoaded: () => {
        gapi.load('client:picker', async () => {
            try {
                // Initialisation SANS Clé API
                await gapi.client.init({
                    // apiKey: googleApiManager.API_KEY, // -> Supprimé
                    discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                });
                googleApiManager.gapi = gapi;
                gapiReady = true;
                googleApiManager.checkAllReady();
            } catch (err) {
                console.error("Erreur d'init GAPI client", err);
                if (typeof showNotification === 'function') {
                    showNotification("Erreur de chargement GAPI", "error");
                }
            }
        });
    },

    gisClientLoaded: () => {
        try {
            if (!window.google || !window.google.accounts) {
                console.error("GIS chargé, mais window.google.accounts n'est pas dispo.");
                if (typeof showNotification === 'function') {
                    showNotification("Erreur critique de l'API Google", "error");
                }
                return;
            }
            googleApiManager.gis = window.google.accounts;
            
            // ‼‼ REVERT: Retour au flux POP-UP
            googleApiManager.tokenClient = googleApiManager.gis.oauth2.initTokenClient({
                client_id: googleApiManager.CLIENT_ID,
                
                // ‼‼ CORRECTION POUR L'ERREUR 403 ‼‼
                // Ajout du scope 'drive.readonly' pour que le Picker puisse voir les fichiers
                scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly',
                
                callback: (tokenResponse) => { // Le callback gère la réponse du pop-up
                    if (onLoginCallback) {
                        if (tokenResponse.error) {
                            console.error("Erreur de token:", tokenResponse.error);
                            showNotification("Échec de l'autorisation", "error");
                            onLoginCallback(false);
                            return;
                        }
                        showNotification("Connecté à Google", "success");
                        onLoginCallback(true);
                    }
                },
            });

            gisReady = true;
            googleApiManager.checkAllReady();
        } catch (e) {
            console.error("Erreur d'init GIS client", e);
            if (typeof showNotification === 'function') {
                showNotification("Erreur de chargement des API Google (GIS)", "error");
            }
        }
    },

    checkAllReady: () => {
        // ‼‼ REVERT: Vérification simple du token
        if (gapiReady && gisReady && onLoginCallback) {
            const token = googleApiManager.gapi.client.getToken();
            onLoginCallback(token !== null);
        }
    },

    // ‼‼ REVERT: handleLogin pour le POP-UP
    handleLogin: () => {
        if (googleApiManager.tokenClient) {
            googleApiManager.tokenClient.requestAccessToken();
        }
    },

    handleLogout: (onLoginStatusChange) => {
        const token = googleApiManager.gapi.client.getToken();
        if (token) {
            googleApiManager.gis.oauth2.revoke(token.access_token, () => {
                googleApiManager.gapi.client.setToken(null);
                onLoginStatusChange(false);
                showNotification("Déconnecté de Google", "info");
            });
        }
    },

    // --- API CALLS ---
    getSpreadsheetDetails: async (spreadsheetId) => {
        if (!googleApiManager.gapi || !googleApiManager.gapi.client.getToken()) return null;
        try {
            const response = await googleApiManager.gapi.client.sheets.spreadsheets.get({
                spreadsheetId: spreadsheetId,
            });
            return response.result;
        } catch (err) {
            handleApiError(err, "lecture des onglets");
            return null;
        }
    },

    getSheetData: async (spreadsheetId, range) => {
        if (!googleApiManager.gapi || !googleApiManager.gapi.client.getToken()) return null;
        try {
            const response = await googleApiManager.gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: range,
            });
            return response.result.values || [];
        } catch (err) {
            handleApiError(err, "lecture des données");
            return null;
        }
    },

    appendRow: async (spreadsheetId, range, values) => {
        if (!googleApiManager.gapi || !googleApiManager.gapi.client.getToken()) return null;
        try {
            await googleApiManager.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId,
                range: range,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [values] }
            });
            showNotification("Produit ajouté avec succès !", "success");
            return true;
        } catch (err) {
            handleApiError(err, "ajout de la ligne");
            return false;
        }
    },

    updateRow: async (spreadsheetId, range, values) => {
        if (!googleApiManager.gapi || !googleApiManager.gapi.client.getToken()) return null;
        try {
            await googleApiManager.gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: range,
                valueInputOption: 'USER_ENTERED', 
                resource: { values: [values] }
            });
            showNotification("Produit mis à jour !", "success");
            return true;
        } catch (err) {
            handleApiError(err, "mise à jour de la ligne");
            return false;
        }
    },

    deleteRow: async (spreadsheetId, sheetId, rowIndex) => {
        if (!googleApiManager.gapi || !googleApiManager.gapi.client.getToken()) return null;
        try {
            await googleApiManager.gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: spreadsheetId,
                resource: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: sheetId,
                                dimension: 'ROWS',
                                startIndex: rowIndex - 1,
                                endIndex: rowIndex
                            }
                        }
                    }]
                }
            });
            showNotification("Ligne supprimée !", "success");
            return true;
        } catch (err) {
            handleApiError(err, "suppression de la ligne");
            return false;
        }
    },

    addSheet: async (spreadsheetId, title) => {
        if (!googleApiManager.gapi || !googleApiManager.gapi.client.getToken()) return null;
        try {
            await googleApiManager.gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: spreadsheetId,
                resource: { requests: [{ addSheet: { properties: { title: title } } }] }
            });
            showNotification(`Onglet "${title}" créé !`, "success");
            return true;
        } catch (err) {
            handleApiError(err, "création de l'onglet");
            return false;
        }
    },

    renameSheet: async (spreadsheetId, sheetId, newTitle) => {
        if (!googleApiManager.gapi || !googleApiManager.gapi.client.getToken()) return null;
        try {
            await googleApiManager.gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: spreadsheetId,
                resource: {
                    requests: [{
                        updateSheetProperties: {
                            properties: { sheetId: sheetId, title: newTitle },
                            fields: 'title'
                        }
                    }]
                }
            });
            showNotification(`Onglet renommé: "${newTitle}"`, "success");
            return true;
        } catch (err) {
            handleApiError(err, "renommage de l'onglet");
            return false;
        }
    }
};

// ======================= ÉLÉMENTS DU DOM ======================= //
let navLinks, tabs, appContainer, inventoryGrid, searchInput, categoryFilter, statusFilter,
    breadcrumbs, themeToggle, stockTitle, backBtn, fabContainer, fabBtn, 
    addFolderFabBtn, addProductFabBtn, loginOverlay, sheetPrompt, gLoginBtn, 
    gLogoutBtn, sheetIdForm, spreadsheetIdInput, gLogoutBtnHeader, 
    changeSheetBtn, openPickerBtn, importFormContainer, addProductModal, 
    editModal, createSheetModal, createSheetForm;

// ======================= GESTION DU THÈME SOMBRE ======================= //
function setupTheme() {
    themeToggle = document.getElementById('theme-checkbox');
    const applyTheme = (theme) => {
        document.body.setAttribute('data-theme', theme);
        if (themeToggle) themeToggle.checked = theme === 'dark';
    };
    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            const newTheme = themeToggle.checked ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    }
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
}

// ======================= ÉTAT GLOBAL DE L'APPLICATION ======================= //
let isLoggedIn = false;
let currentSpreadsheetId = localStorage.getItem('spreadsheetId') || null;
let spreadsheetDetails = null;
let currentSheet = null;
let currentHeaders = [];
let currentData = [];
let currentView = 'sheets';

// ======================= INITIALISATION DE L'APP ======================= //
function initializeApp() {
    // 1. Assigner toutes les variables du DOM
    navLinks = document.querySelectorAll('nav a');
    tabs = document.querySelectorAll('.tab-content');
    appContainer = document.getElementById('app-container');
    inventoryGrid = document.getElementById('inventory-grid');
    searchInput = document.getElementById('search-input');
    categoryFilter = document.getElementById('category-filter');
    statusFilter = document.getElementById('status-filter');
    breadcrumbs = document.getElementById('breadcrumbs');
    stockTitle = document.getElementById('stock-title');
    backBtn = document.getElementById('back-btn');
    fabContainer = document.querySelector('.fab-container');
    fabBtn = document.getElementById('fab-add-btn');
    addFolderFabBtn = document.getElementById('add-folder-fab-btn');
    addProductFabBtn = document.getElementById('add-product-fab-btn');
    loginOverlay = document.getElementById('login-overlay');
    sheetPrompt = document.getElementById('sheet-prompt');
    gLoginBtn = document.getElementById('g-login-btn-main');
    gLogoutBtn = document.getElementById('g-logout-btn-main');
    sheetIdForm = document.getElementById('sheet-id-form');
    spreadsheetIdInput = document.getElementById('spreadsheet-id-input');
    gLogoutBtnHeader = document.getElementById('g-logout-btn-header');
    changeSheetBtn = document.getElementById('change-sheet-btn');
    openPickerBtn = document.getElementById('open-picker-btn');
    importFormContainer = document.getElementById('import');
    addProductModal = document.getElementById('add-product-modal');
    editModal = document.getElementById('edit-modal');
    createSheetModal = document.getElementById('create-sheet-modal');
    createSheetForm = document.getElementById('create-sheet-form');

    // 2. Mettre en place le thème
    setupTheme();
    appContainer.style.display = 'none';

    // 3. Mettre en place les écouteurs d'événements
    setupGlobalEventListeners();
    
    // 4. Brancher le callback de connexion
    googleApiManager.initClient(handleLoginStatusChange);
}

function setupGlobalEventListeners() {
    // Boutons de connexion / déconnexion
    gLoginBtn.addEventListener('click', googleApiManager.handleLogin);
    gLogoutBtn.addEventListener('click', () => googleApiManager.handleLogout(handleLoginStatusChange));
    gLogoutBtnHeader.addEventListener('click', () => googleApiManager.handleLogout(handleLoginStatusChange));
    
    // Gestion Sheet
    sheetIdForm.addEventListener('submit', handleSheetIdSubmit);
    changeSheetBtn.addEventListener('click', handleChangeSheet);
    openPickerBtn.addEventListener('click', createPicker);

    // Navigation App
    navLinks.forEach(link => link.addEventListener('click', handleNavClick));
    backBtn.addEventListener('click', navigateBack);
    
    // FAB
    fabBtn.addEventListener('click', () => fabContainer.classList.toggle('active'));
    addProductFabBtn.addEventListener('click', openAddProductModal);
    addFolderFabBtn.addEventListener('click', () => createSheetModal.style.display = 'block');
    
    // Modals
    createSheetForm.addEventListener('submit', handleAddSheet);
    document.querySelectorAll('.modal .close, .modal .close-modal-btn').forEach(btn => btn.addEventListener('click', e => closeModal(e.target.closest('.modal'))));
    window.addEventListener('click', e => { if (e.target.classList.contains('modal')) closeModal(e.target); });

    // Inventaire
    searchInput.addEventListener('input', renderCurrentView);
    inventoryGrid.addEventListener('click', handleGridClick);

    // Fil d'ariane
    breadcrumbs.addEventListener('click', (e) => {
        if (e.target.dataset.nav === 'root') {
            e.preventDefault();
            navigateBack();
        }
    });
}

// ======================= GESTION AUTH & SPREADSHEET ======================= //
function handleLoginStatusChange(loggedIn) {
    isLoggedIn = loggedIn;
    if (loggedIn) {
        loginOverlay.classList.add('hidden');
        if (currentSpreadsheetId) {
            sheetPrompt.classList.add('hidden');
            appContainer.style.display = 'block';
            loadSpreadsheet(currentSpreadsheetId);
        } else {
            sheetPrompt.classList.remove('hidden');
            appContainer.style.display = 'none';
        }
    } else {
        loginOverlay.classList.remove('hidden');
        sheetPrompt.classList.add('hidden');
        appContainer.style.display = 'none';
        currentSpreadsheetId = null;
        localStorage.removeItem('spreadsheetId');
        resetAppView();
    }
}

function handleSheetIdSubmit(e) {
    e.preventDefault();
    const id = spreadsheetIdInput.value.trim();
    if (id) {
        loadSpreadsheet(id);
    }
}

async function handleChangeSheet() {
    const confirmation = confirm("Voulez-vous changer de Google Sheet ? Vous retournerez à l'écran de sélection.");
    if (confirmation) {
        currentSpreadsheetId = null;
        localStorage.removeItem('spreadsheetId');
        spreadsheetDetails = null;
        
        resetAppView(); 
        
        handleLoginStatusChange(true);
    }
}

async function loadSpreadsheet(id) {
    showNotification("Chargement de la Spreadsheet...", "info");
    const details = await googleApiManager.getSpreadsheetDetails(id);
    if (details) {
        currentSpreadsheetId = id;
        localStorage.setItem('spreadsheetId', id);
        spreadsheetDetails = details;
        sheetPrompt.classList.add('hidden');
        appContainer.style.display = 'block';

        currentView = 'sheets';
        renderCurrentView();
        updateBreadcrumbs();
        showNotification("Spreadsheet chargée !", "success");
    } else {
        localStorage.removeItem('spreadsheetId');
        currentSpreadsheetId = null;
        sheetPrompt.classList.remove('hidden');
        appContainer.style.display = 'none';
        showNotification("ID de Spreadsheet invalide ou accès refusé.", "error");
    }
}

function resetAppView() {
    if (inventoryGrid) inventoryGrid.innerHTML = '<div class="no-products"><p>Veuillez vous connecter et charger une Spreadsheet.</p></div>';
    if (stockTitle) stockTitle.innerHTML = '<i class="fas fa-box-open"></i> Inventaire';
    if (breadcrumbs) breadcrumbs.innerHTML = '';
    currentSheet = null;
    currentData = [];
    currentHeaders = [];
    if (backBtn) backBtn.classList.add('hidden');
}

// ======================= LOGIQUE DE NAVIGATION & VUE ======================= //

function handleNavClick(e) {
    e.preventDefault();
    navLinks.forEach(l => l.classList.remove('active'));
    tabs.forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    const tabName = e.target.dataset.tab;
    document.getElementById(tabName).classList.add('active');

    fabContainer.style.display = (tabName === 'stock') ? 'block' : 'none';

    if (tabName === 'stock') {
        renderCurrentView();
    } else if (tabName === 'stats') {
        updateStatistics();
    } else if (tabName === 'import') {
        buildImportTabForm();
    }
}

function renderCurrentView() {
    if (!document.getElementById('stock').classList.contains('active')) return;

    if (currentView === 'sheets') {
        renderSheetListView();
    } else if (currentView === 'products') {
        renderProductListView();
    }
}

function navigateBack() {
    if (currentView === 'products') {
        currentView = 'sheets';
        currentSheet = null;
        currentData = [];
        currentHeaders = [];
        renderCurrentView();
        updateBreadcrumbs();
        backBtn.classList.add('hidden');
        searchInput.value = '';
    }
}

function updateBreadcrumbs() {
    if (!currentSpreadsheetId) {
        breadcrumbs.innerHTML = '';
        return;
    }
    const rootName = spreadsheetDetails?.properties?.title || 'Spreadsheet';

    if (currentView === 'sheets') {
        breadcrumbs.innerHTML = `<span class="current-folder">${rootName}</span>`;
        stockTitle.innerHTML = `<i class="fas fa-book"></i> ${rootName}`;
    } else if (currentView === 'products' && currentSheet) {
        breadcrumbs.innerHTML = `
            <a href="#" data-nav="root">${rootName}</a>
            <span>/</span>
            <span class="current-folder">${currentSheet.title}</span>
        `;
        stockTitle.innerHTML = `<i class="fas fa-folder-open"></i> ${currentSheet.title}`;
    }
}

// ======================= RENDU (VUES) ======================= //

async function renderSheetListView() {
    inventoryGrid.innerHTML = '';
    if (!spreadsheetDetails || !spreadsheetDetails.sheets) {
        inventoryGrid.innerHTML = '<div class="no-products"><p>Aucun onglet trouvé.</p></div>';
        return;
    }

    const details = await googleApiManager.getSpreadsheetDetails(currentSpreadsheetId);
    if (details) spreadsheetDetails = details;
    else {
        showNotification("Impossible de rafraîchir les onglets.", "error");
        return;
    }

    spreadsheetDetails.sheets.forEach(sheet => {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.dataset.sheetTitle = sheet.properties.title;
        card.dataset.sheetId = sheet.properties.sheetId;

        const productCount = (sheet.properties.gridProperties.rowCount || 1) - 1;

        card.innerHTML = `
            <div class="folder-icon-display" data-action="open-sheet"><i class="fas fa-folder"></i></div>
            <div class="folder-details">
                <div class="folder-name-container">
                    <h3 class="folder-name">${sheet.properties.title}</h3>
                    <input type="text" class="folder-rename-input" value="${sheet.properties.title}">
                </div>
                <p class="folder-info">${productCount} produit(s)</p>
            </div>
            <div class="more-menu folder-actions">
                <button class="more-btn" aria-label="Plus d'options"><i class="fas fa-cog"></i></button>
                <div class="more-content">
                    <button class="more-item" data-action="rename-sheet"><i class="fas fa-edit"></i>Renommer</button>
                </div>
            </div>
        `;
        inventoryGrid.appendChild(card);
    });
}

async function renderProductListView() {
    if (!currentSheet) return;
    inventoryGrid.innerHTML = '<div class="no-products"><p>Chargement des produits...</p></div>';

    const range = `${currentSheet.title}!A:Z`;
    const data = await googleApiManager.getSheetData(currentSpreadsheetId, range);

    if (!data || data.length === 0) {
        inventoryGrid.innerHTML = '<div class="no-products"><p>Cet onglet est vide.</p><p>Ajoutez des en-têtes en Ligne 1 (ex: Nom, Prix) pour commencer.</p></div>';
        currentHeaders = [];
        currentData = [];
        return;
    }

    currentHeaders = data.shift();

    currentData = data.map((row, index) => {
        const obj = {};
        currentHeaders.forEach((header, i) => {
            obj[header] = row[i];
        });
        obj.gSheetRowIndex = index + 2;
        return obj;
    });

    const searchText = searchInput.value.toLowerCase();
    const filteredData = currentData.filter(item => {
        return Object.values(item).some(val =>
            String(val).toLowerCase().includes(searchText)
        );
    });

    inventoryGrid.innerHTML = '';
    if (filteredData.length === 0) {
        inventoryGrid.innerHTML = '<div class="no-products"><p>Aucun produit ne correspond à votre recherche.</p></div>';
        return;
    }

    filteredData.forEach(item => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.rowIndex = item.gSheetRowIndex;
        card.innerHTML = createDynamicProductCardHTML(item, currentHeaders);
        inventoryGrid.appendChild(card);
    });
}

function createDynamicProductCardHTML(item, headers) {
    const nameKey = headers.find(h => h.toLowerCase().includes('nom')) || headers[0];
    const descKey = headers.find(h => h.toLowerCase().includes('description'));
    const priceKey = headers.find(h => h.toLowerCase().includes('prix'));
    const typeKey = headers.find(h => h.toLowerCase().includes('type') || h.toLowerCase().includes('catégorie'));
    const statusKey = headers.find(h => h.toLowerCase().includes('état') || h.toLowerCase().includes('condition'));
    const imageKey = headers.find(h => h.toLowerCase().includes('image') || h.toLowerCase().includes('photo'));
    const sourcingKey = headers.find(h => h.toLowerCase().includes('sourcing'));

    const name = item[nameKey] || 'Produit sans nom';
    const description = item[descKey] || '';
    const price = item[priceKey] ? `${parseFloat(item[priceKey]).toFixed(2)} €` : '';
    const type = item[typeKey] || '';
    const status = item[statusKey] || '';
    const sourcing = item[sourcingKey] || '';

    let imageUrl = 'https://via.placeholder.com/400x300/cccccc/ffffff?text=Image';
    if (item[imageKey]) {
        imageUrl = item[imageKey].split(',')[0].trim();
    }

    let detailsHTML = '';
    headers.forEach(header => {
        if (![nameKey, descKey, priceKey, typeKey, statusKey, imageKey, sourcingKey, 'gSheetRowIndex'].includes(header)) {
            if (item[header]) {
                detailsHTML += `<div><span>${header}:</span><span>${item[header]}</span></div>`;
            }
        }
    });

    return `
        <div class="product-image"><img src="${imageUrl}" alt="${name}"></div>
        <div class="product-info">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 15px;">
                <span class="product-type ${type.toLowerCase()}">${type}</span>
                <span class="product-sourcing">${sourcing}</span>
            </div>
            <h3 class="product-title">${name}</h3>
            ${descKey ? `<p class="product-description">${description}</p>` : ''}
            
            <div class="product-details">
                ${priceKey ? `<div><span>Prix:</span><span>${price}</span></div>` : ''}
                ${detailsHTML}
            </div>

            <div class="product-footer">
                ${statusKey ? `<div class="product-status">${status}</div>` : '<div></div>'}
                <div class="more-menu">
                    <button class="more-btn" aria-label="Plus d'options"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="more-content">
                        <button class="more-item" data-action="edit-product"><i class="fas fa-edit"></i>Modifier</button>
                        <button class="more-item" data-action="delete-product"><i class="fas fa-trash"></i>Supprimer</button>
                    </div>
                </div>
            </div>
            <div class="product-confirm-delete">
                <span>Êtes-vous sûr ?</span>
                <div class="confirm-actions">
                    <button class="btn btn-confirm-yes" data-action="confirm-delete-product">Oui</button>

                    <button class="btn btn-confirm-no" data-action="cancel-delete-product">Non</button>
                </div>
            </div>
        </div>
    `;
}

// ======================= FORMULAIRES DYNAMIQUES ======================= //

function buildImportTabForm() {
    if (!spreadsheetDetails) {
        if (importFormContainer) importFormContainer.innerHTML = '<h2 class="section-title"><i class="fas fa-file-import"></i> Ajouter un produit</h2><p>Veuillez d\'abord charger une Spreadsheet dans l\'onglet "Inventaire".</p>';
        return;
    }

    let sheetOptions = spreadsheetDetails.sheets.map(sheet =>
        `<option value="${sheet.properties.title}">${sheet.properties.title}</option>`
    ).join('');

    const select = document.getElementById('import-sheet-select');
    const form = document.getElementById('dynamic-import-form');
    const fieldsContainer = document.getElementById('dynamic-import-fields');
    const submitBtn = document.getElementById('dynamic-import-submit');

    select.innerHTML = `<option value="">Sélectionnez un onglet...</option>${sheetOptions}`;
    select.disabled = false;

    let importHeaders = [];

    select.onchange = async (e) => {
        const sheetTitle = e.target.value;
        if (!sheetTitle) {
            fieldsContainer.innerHTML = '<p>Sélectionnez un onglet...</p>';
            submitBtn.disabled = true;
            return;
        }

        const range = `${sheetTitle}!A1:Z1`;
        const headers = await googleApiManager.getSheetData(currentSpreadsheetId, range);

        if (headers && headers.length > 0) {
            importHeaders = headers[0];
            fieldsContainer.innerHTML = buildDynamicFormHTML(importHeaders);
            submitBtn.disabled = false;
        } else {
            fieldsContainer.innerHTML = '<p>Cet onglet est vide ou n\'a pas d\'en-têtes (Ligne 1).</p>';
            submitBtn.disabled = true;
        }
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }

        const sheetTitle = select.value;
        const newRowData = importHeaders.map((header, i) => {
            const fieldId = `dyn-${i}`;
            return form.elements[fieldId].value;
        });

        const range = `${sheetTitle}!A:A`;
        const success = await googleApiManager.appendRow(currentSpreadsheetId, range, newRowData);
        if (success) {
            form.reset();
            if (currentSheet && currentSheet.title === sheetTitle) {
                renderProductListView();
            }
        }
    };
}

function openAddProductModal() {
    if (!currentSheet) {
        showNotification("Veuillez d'abord ouvrir un dossier (onglet).", "info");
        return;
    }
    if (currentHeaders.length === 0) {
        showNotification("Ce dossier (onglet) est vide. Ajoutez des en-têtes (Ligne 1) d'abord.", "error");
        return;
    }

    const modalBody = addProductModal.querySelector('.modal-body');
    modalBody.innerHTML = `
        <form id="modal-product-form" novalidate>
            <div class="dynamic-fields">
                ${buildDynamicFormHTML(currentHeaders)}
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary close-modal-btn">Annuler</button>
                <button type="submit" class="btn btn-finish">Ajouter</button>
            </div>
        </form>
    `;

    const form = document.getElementById('modal-product-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }

        const newRowData = currentHeaders.map((header, i) => {
            const fieldId = `dyn-${i}`;
            return form.elements[fieldId].value;
        });

        const range = `${currentSheet.title}!A:A`;
        const success = await googleApiManager.appendRow(currentSpreadsheetId, range, newRowData);
        if (success) {
            closeModal(addProductModal);
            renderProductListView();
        }
    });

    addProductModal.style.display = 'block';
}

function openEditProductModal(rowIndex) {
    const item = currentData.find(d => d.gSheetRowIndex === rowIndex);
    if (!item) return;

    const modalBody = editModal.querySelector('.modal-body');
    modalBody.innerHTML = `
        <form id="modal-edit-form" novalidate data-row-index="${rowIndex}">
            <div class="dynamic-fields">
                ${buildDynamicFormHTML(currentHeaders, item)}
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary close-modal-btn">Annuler</button>
                <button type="submit" class="btn btn-finish">Enregistrer</button>
            </div>
        </form>
    `;

    const form = document.getElementById('modal-edit-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }

        const updatedRowData = currentHeaders.map((header, i) => {
            const fieldId = `dyn-${i}`;
            return form.elements[fieldId].value;
        });

        const endColumn = String.fromCharCode(64 + currentHeaders.length);
        const range = `${currentSheet.title}!A${rowIndex}:${endColumn}${rowIndex}`;

        const success = await googleApiManager.updateRow(currentSpreadsheetId, range, updatedRowData);
        if (success) {
            closeModal(editModal);
            renderProductListView();
        }
    });

    editModal.style.display = 'block';
}

function buildDynamicFormHTML(headers, data = null) {
    return headers.map((header, i) => {
        const fieldId = `dyn-${i}`;
        const value = data ? (data[header] || '') : '';
        const headerLower = header.toLowerCase();

        let inputHTML;
        if (headerLower.includes('description')) {
            inputHTML = `<textarea id="${fieldId}" name="${header}" rows="3" placeholder="${header}...">${value}</textarea>`;
        } else {
            let inputType = "text";
            if (headerLower.includes('prix') || headerLower.includes('quantité')) {
                inputType = "number";
            } else if (headerLower.includes('date')) {
                inputType = "date";
            }

            inputHTML = `<input type="${inputType}" id="${fieldId}" name="${header}" value="${value}"
                   placeholder="${header}..." ${inputType === 'number' ? 'step="any"' : ''} required>`;
        }

        return `<div class="form-group"><label for="${fieldId}">${header}</label>${inputHTML}</div>`;
    }).join('');
}

// ======================= GESTION DES ACTIONS ======================= //

async function handleGridClick(e) {
    const moreBtn = e.target.closest('.more-btn');
    if (moreBtn) {
        e.stopPropagation();
        const menu = moreBtn.nextElementSibling;
        document.querySelectorAll('.more-content.show').forEach(m => {
            if (m !== menu) m.classList.remove('show');
        });
        menu.classList.toggle('show');
        return;
    }

    const actionTarget = e.target.closest('[data-action]');
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    const card = actionTarget.closest('.folder-card, .product-card');

    if (card.classList.contains('folder-card')) {
        const sheetTitle = card.dataset.sheetTitle;
        const sheetId = card.dataset.sheetId;

        if (action === 'open-sheet') {
            currentSheet = { title: sheetTitle, id: sheetId };
            currentView = 'products';
            renderCurrentView();
            updateBreadcrumbs();
            backBtn.classList.remove('hidden');
        }
        if (action === 'rename-sheet') {
            const newName = prompt("Nouveau nom pour l'onglet :", sheetTitle);
            if (newName && newName !== sheetTitle) {
                const success = await googleApiManager.renameSheet(currentSpreadsheetId, sheetId, newName);
                if (success) {
                    spreadsheetDetails = await googleApiManager.getSpreadsheetDetails(currentSpreadsheetId);
                    renderSheetListView();
                }
            }
        }
    }

    if (card.classList.contains('product-card')) {
        const rowIndex = parseInt(card.dataset.rowIndex, 10);

        if (action === 'edit-product') {
            openEditProductModal(rowIndex);
        }
        if (action === 'delete-product') {
            card.classList.add('is-deleting');
        }
        if (action === 'cancel-delete-product') {
            card.classList.remove('is-deleting');
        }
        if (action === 'confirm-delete-product') {
            const success = await googleApiManager.deleteRow(currentSpreadsheetId, currentSheet.id, rowIndex);
            if (success) {
                renderProductListView();
            }
        }
    }
}

async function handleAddSheet(e) {
    e.preventDefault();
    const input = document.getElementById('sheet-name');
    const newName = input.value.trim();
    if (newName) {
        const success = await googleApiManager.addSheet(currentSpreadsheetId, newName);
        if (success) {
            spreadsheetDetails = await googleApiManager.getSpreadsheetDetails(currentSpreadsheetId);
            renderSheetListView();
            closeModal(createSheetModal);
            input.value = '';
        }
    }
}

// ======================= STATISTIQUES (adapté) ======================= //
function updateStatistics() {
    const statsContainer = document.getElementById('stats-cards-container');
    const categoryChart = document.getElementById('category-chart');
    const totalValueEl = document.getElementById('total-stock-value');

    if (!currentData || currentData.length === 0) {
        if (statsContainer) statsContainer.innerHTML = "<p>Chargez un onglet dans l'inventaire pour voir les statistiques.</p>";
        if (categoryChart) categoryChart.innerHTML = '';
        if (totalValueEl) totalValueEl.textContent = '0,00';
        return;
    }

    const typeKey = currentHeaders.find(h => h.toLowerCase().includes('type') || h.toLowerCase().includes('catégorie'));
    const priceKey = currentHeaders.find(h => h.toLowerCase().includes('prix'));
    const quantityKey = currentHeaders.find(h => h.toLowerCase().includes('quantité'));

    let totalValue = 0;
    const stats = {};

    currentData.forEach(p => {
        let quantity = (quantityKey && p[quantityKey]) ? parseInt(p[quantityKey], 10) : 1;
        let price = (priceKey && p[priceKey]) ? parseFloat(p[priceKey]) : 0;
        totalValue += quantity * price;

        if (typeKey && p[typeKey]) {
            const type = p[typeKey];
            stats[type] = (stats[type] || 0) + quantity;
        }
    });

    statsContainer.innerHTML = Object.entries(stats).map(([type, count]) =>
        `<div class="stat-card"><div class="stat-info">
         <h3>${type}</h3><span class="stat-value">${count}</span>
         </div></div>`
    ).join('');

    totalValueEl.textContent = `${totalValue.toFixed(2).replace('.', ',')}`;

    const maxStat = Math.max(...Object.values(stats), 1);
    categoryChart.innerHTML = Object.entries(stats).map(([type, count]) =>
        `<div class="chart-bar ${type.toLowerCase()}" style="--bar-height: ${(count / maxStat) * 100}%" data-label="${type}">
         <span>${count}</span></div>`
    ).join('');
}

// ======================= UTILITAIRES ======================= //

function createPicker() {
    if (!googleApiManager.gapi || !googleApiManager.tokenClient) {
        showNotification("API Google non prête.", "error");
        return;
    }

    const token = googleApiManager.gapi.client.getToken();
    if (!token) {
        showNotification("Veuillez vous reconnecter.", "error");
        googleApiManager.handleLogin();
        return;
    }
    
    // ‼‼ CORRECTION Z-INDEX ‼‼
    // Cacher notre modal AVANT d'ouvrir le Picker
    sheetPrompt.classList.add('hidden');

    const view = new google.picker.View(google.picker.ViewId.SPREADSHEETS);
    view.setMimeTypes('application/vnd.google-apps-spreadsheet');

    const picker = new google.picker.PickerBuilder()
        .setAppId(googleApiManager.CLIENT_ID.split('-')[0])
        .setOAuthToken(token.access_token)
        // .setDeveloperKey(googleApiManager.API_KEY) // -> Supprimé
        .addView(view)
        .setCallback(pickerCallback)
        .build();
    picker.setVisible(true);
}

function pickerCallback(data) {
    // ‼‼ CORRECTION Z-INDEX & CRASH ‼‼
    // Gérer le cas où l'utilisateur ferme le Picker (ou annule)
    // ou si les données sont invalides (à cause du COOP)
    if (!data || data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
        sheetPrompt.classList.remove('hidden');
        return;
    }
    
    // Gérer le cas où l'utilisateur choisit un fichier
    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
        // Vérification de sécurité avant d'accéder à [0]
        if (data[google.picker.Document.DOCUMENTS] && data[google.picker.Document.DOCUMENTS].length > 0) {
            const doc = data[google.picker.Document.DOCUMENTS][0];
            const sheetId = doc[google.picker.Document.ID];
            
            spreadsheetIdInput.value = sheetId;
            loadSpreadsheet(sheetId);
        } else {
             // Si 'PICKED' est vrai mais pas de document, c'est une erreur.
            sheetPrompt.classList.remove('hidden');
            showNotification("Erreur lors de la sélection du fichier.", "error");
        }
    } 
}


function handleApiError(err, action) {
    console.error(`Erreur GSheet lors de ${action}:`, err);
    const message = err.result?.error?.message || err.message || "Erreur inconnue";
    showNotification(`Erreur GSheet (${action}): ${message}`, "error");
}

function showNotification(message, type = 'success') {
    const container = document.getElementById('notification-container');
    if (!container) { 
        console.log(`Notification (${type}): ${message}`);
        return;
    }
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    notif.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
    container.appendChild(notif);
    setTimeout(() => notif.remove(), 4000);
}

function closeModal(modal) {
    if (modal) modal.style.display = 'none';
    const modalBody = modal.querySelector('.modal-body');
    if (modalBody) modalBody.innerHTML = '';
}

// --- DÉMARRAGE ---
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});