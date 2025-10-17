document.addEventListener('DOMContentLoaded', () => {

    // ======================= GESTIONNAIRE INDEXEDDB ======================= //
    const idbManager = {
        db: null,
        initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open("StockManagerDB_v2", 1);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('products')) {
                        db.createObjectStore('products', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('folders')) {
                        db.createObjectStore('folders', { keyPath: 'id' });
                    }
                };
                request.onsuccess = (event) => { this.db = event.target.result; resolve(); };
                request.onerror = (event) => { console.error("Erreur IndexedDB:", event.target.errorCode); reject(event.target.error); };
            });
        },
        getData(storeName) {
            return new Promise((resolve, reject) => {
                if (!this.db) return reject("DB not initialized");
                const request = this.db.transaction([storeName], 'readonly').objectStore(storeName).getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
        },
        saveAllData(storeName, dataArray) {
            return new Promise((resolve, reject) => {
                if (!this.db) return reject("DB not initialized");
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                store.clear().onsuccess = () => {
                    dataArray.forEach(item => store.put(item));
                };
                transaction.oncomplete = () => resolve();
                transaction.onerror = (event) => reject(event.target.error);
            });
        }
    };

    // ======================= ÉLÉMENTS DU DOM ======================= //
    const navLinks = document.querySelectorAll('nav a');
    const tabs = document.querySelectorAll('.tab-content');
    const inventoryGrid = document.getElementById('inventory-grid');
    const productFormContainer = document.getElementById('product-form');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const statusFilter = document.getElementById('status-filter');
    const breadcrumbs = document.getElementById('breadcrumbs');
    const themeToggle = document.getElementById('theme-checkbox');
    const stockTitle = document.getElementById('stock-title');
    const backBtn = document.getElementById('back-btn');
    const exportBtn = document.querySelector('.btn-export');
    // Selection Elements
    const selectionBar = document.getElementById('selection-bar');
    const filterGroup = document.getElementById('filter-group');
    const selectAllBtn = document.getElementById('select-all-btn');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    const selectionCountLabel = document.getElementById('selection-count-label');
    const cancelSelectionBtn = document.getElementById('cancel-selection-btn');
    const selectionConfirmDelete = document.getElementById('selection-confirm-delete');
    const confirmDeleteYesBtn = document.getElementById('confirm-delete-yes-btn');
    const confirmDeleteNoBtn = document.getElementById('confirm-delete-no-btn');
    // FAB
    const fabContainer = document.querySelector('.fab-container');
    const fabBtn = document.getElementById('fab-add-btn');
    const addFolderFabBtn = document.getElementById('add-folder-fab-btn');
    const addProductFabBtn = document.getElementById('add-product-fab-btn');
    // Modals
    const createFolderModal = document.getElementById('create-folder-modal');
    const createFolderForm = document.getElementById('create-folder-form');
    const addProductModal = document.getElementById('add-product-modal');
    const modalProductFormContainer = document.getElementById('modal-product-form');
    const editModal = document.getElementById('edit-modal');
    const addPhotosModal = document.getElementById('add-photos-modal');

    // ======================= GESTION DU THÈME SOMBRE ======================= //
    const applyTheme = (theme) => {
        document.body.setAttribute('data-theme', theme);
        themeToggle.checked = theme === 'dark';
    };
    themeToggle.addEventListener('change', () => {
        const newTheme = themeToggle.checked ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    // ======================= DONNÉES DE L'APPLICATION (STATE) ======================= //
    let products = [];
    let folders = [];
    let currentFolderId = null; // null pour la racine
    let selectedItems = new Map(); // key: id (string), value: 'product' or 'folder'
    let isSelectionModeActive = false;

    // ======================= GESTION DES DONNÉES (CHARGEMENT/SAUVEGARDE) ======================= //
    async function loadData() {
        products = await idbManager.getData('products') || [];
        folders = await idbManager.getData('folders') || [];
    };

    async function saveData() {
        try {
            await idbManager.saveAllData('products', products);
            await idbManager.saveAllData('folders', folders);
            exitSelectionMode();
            updateUI();
        } catch (error) {
            showNotification("Erreur critique lors de la sauvegarde des données.", 'error');
            console.error("Erreur de sauvegarde IndexedDB:", error);
        }
    };
    
    const updateUI = () => {
        renderInventory();
        updateStatistics();
        renderBreadcrumbs();
        updateHeader();
    };
    
    const updateHeader = () => {
        if (currentFolderId === null) {
            stockTitle.innerHTML = `<i class="fas fa-box-open"></i> Inventaire de la boutique`;
            backBtn.classList.add('hidden');
        } else {
            const currentFolder = folders.find(f => f.id === currentFolderId);
            if(currentFolder) {
                stockTitle.innerHTML = `<i class="fas fa-folder-open"></i> Dossier : ${currentFolder.name}`;
                backBtn.classList.remove('hidden');
            }
        }
    };

    // ======================= FONCTIONS DE RENDU ======================= //
    const renderInventory = () => {
        inventoryGrid.innerHTML = '';
        const searchText = searchInput.value.toLowerCase();
        const category = categoryFilter.value;
        const status = statusFilter.value;

        const filteredProducts = products.filter(p => 
            p.folderId === currentFolderId &&
            (p.name.toLowerCase().includes(searchText) || (p.description && p.description.toLowerCase().includes(searchText))) &&
            (!category || p.type === category) &&
            (!status || p.condition === status)
        );

        const currentFolders = searchText ? [] : folders.filter(f => f.parentId === currentFolderId);
        
        if (currentFolders.length === 0 && filteredProducts.length === 0) {
            inventoryGrid.innerHTML = '<div class="no-products"><h3><i class="fas fa-wind"></i> Vide... pour l\'instant</h3><p>Créez un dossier ou ajoutez un produit !</p></div>';
            return;
        }

        currentFolders.forEach(folder => {
            const folderCard = document.createElement('div');
            folderCard.className = 'folder-card';
            folderCard.dataset.id = folder.id;
            folderCard.dataset.type = 'folder';
            folderCard.draggable = true;
            
            const productCount = products.filter(p => p.folderId === folder.id).length;

            folderCard.innerHTML = `
                <div class="selection-indicator" data-id="${folder.id}" data-type="folder"><i class="fas fa-check"></i></div>
                <div class="more-menu folder-actions">
                    <button class="more-btn" aria-label="Plus d'options"><i class="fas fa-cog"></i></button>
                    <div class="more-content">
                        <button class="more-item" data-action="rename-folder"><i class="fas fa-edit"></i>Renommer</button>
                        <button class="more-item" data-action="delete-folder"><i class="fas fa-trash"></i>Supprimer</button>
                    </div>
                </div>
                <div class="folder-icon-display"><i class="fas fa-folder"></i></div>
                <div class="folder-details">
                    <div class="folder-name-container">
                        <h3 class="folder-name">${folder.name}</h3>
                        <input type="text" class="folder-rename-input" value="${folder.name}">
                    </div>
                    <p class="folder-info">${productCount} produit(s)</p>
                     <div class="folder-confirm-delete">
                        <span>Êtes-vous sûr ?</span>
                        <div class="confirm-actions">
                            <button class="btn btn-confirm-yes" data-action="confirm-delete-folder">Oui</button>
                            <button class="btn btn-confirm-no" data-action="cancel-delete-folder">Non</button>
                        </div>
                    </div>
                </div>
            `;
            inventoryGrid.appendChild(folderCard);
        });

        filteredProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.dataset.id = product.id;
            card.dataset.type = 'product';
            card.draggable = true;
            card.innerHTML = createProductCardHTML(product);
            inventoryGrid.appendChild(card);
        });
    };
    
    const renderBreadcrumbs = () => {
        let path = [{ id: null, name: 'Inventaire' }];
        let parentId = currentFolderId;
        while (parentId) {
            const parentFolder = folders.find(f => f.id === parentId);
            if (parentFolder) {
                path.unshift(parentFolder);
                parentId = parentFolder.parentId;
            } else { break; }
        }
        breadcrumbs.innerHTML = path.map((p, index) => {
            if (index === path.length - 1) return `<span class="current-folder">${p.name}</span>`;
            return `<a href="#" data-folder-id="${p.id}">${p.name}</a>`;
        }).join('<span>/</span>');
    };

    const createProductCardHTML = (product) => {
        const { id, type, condition, images, name, description, sourcing } = product;
        const typeLabels = { textile: 'Textile', mobilier: 'Mobilier', accessoire: 'Accessoire', decoration: 'Décoration', oeuvre: 'Œuvre', chaussure: 'Chaussure' };
        const conditionInfo = { new: 'Neuf', good: 'Très bon état', used: 'Usé', damaged: 'Endommagé' };
        const conditionClass = { new: 'status-new', good: 'status-good', used: 'status-used', damaged: 'status-damaged' };
        const sourcingInfo = { particulier: 'Dépôt Part.', professionnel: 'Dépôt Pro', fmr: 'FMR' };

        let detailsHTML = '';
        if (product.variants && product.variants.length > 0) {
            detailsHTML = `<div class="variant-table"><div class="variant-header"><span>${product.type === 'chaussure' ? 'Pointure' : 'Taille'}</span><span>Prix</span><span>Stock</span></div>${product.variants.map(v => `<div class="variant-data-row"><span>${v.size}</span><span>${v.price ? v.price.toFixed(2) : '0.00'} €</span><span>${v.quantity}</span></div>`).join('')}</div>`;
        } else {
            detailsHTML = `${product.dimensions ? `<div><span>Dimensions:</span><span>${product.dimensions}</span></div>` : ''}${product.material ? `<div><span>Matière:</span><span>${product.material}</span></div>` : ''}<div><span>Quantité:</span><span>${product.quantity || 0}</span></div><div><span>Prix:</span><span>${(product.price || 0).toFixed(2)} €</span></div>`;
        }

        return `
            <div class="selection-indicator" data-id="${id}" data-type="product"><i class="fas fa-check"></i></div>
            <div class="product-image">
                <img src="${images && images.length > 0 ? images[0] : 'https://via.placeholder.com/400x300/cccccc/ffffff?text=Image'}" alt="${name}">
                ${images && images.length > 1 ? `<div class="carousel-controls"><div class="carousel-btn prev-btn"><i class="fas fa-chevron-left"></i></div><div class="carousel-btn next-btn"><i class="fas fa-chevron-right"></i></div></div><div class="carousel-indicators">${images.map((_, i) => `<div class="carousel-indicator ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`).join('')}</div>` : ''}
            </div>
            <div class="product-info">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 15px;">
                    <span class="product-type ${type}">${typeLabels[type] || 'Inconnu'}</span>
                    <span class="product-sourcing">${sourcingInfo[sourcing] || ''}</span>
                </div>
                <h3 class="product-title">${name}</h3>
                <p class="product-description">${description || ''}</p>
                <div class="product-details">${detailsHTML}</div>
                <div class="product-footer">
                    <div class="product-status"><div class="status-indicator ${conditionClass[condition] || ''}"></div><span>${conditionInfo[condition] || ''}</span></div>
                    <div class="more-menu">
                        <button class="more-btn" aria-label="Plus d'options"><i class="fas fa-ellipsis-v"></i></button>
                        <div class="more-content">
                            <button class="more-item" data-action="edit"><i class="fas fa-edit"></i>Modifier</button>
                            <button class="more-item" data-action="add-photos"><i class="fas fa-camera"></i>Ajouter photos</button>
                            <button class="more-item" data-action="delete"><i class="fas fa-trash"></i>Supprimer</button>
                        </div>
                    </div>
                </div>
                <div class="product-confirm-delete">
                    <span>Êtes-vous sûr ?</span>
                    <div class="confirm-actions">
                        <button class="btn btn-confirm-yes" data-action="confirm-delete">Oui</button>
                        <button class="btn btn-confirm-no" data-action="cancel-delete">Non</button>
                    </div>
                </div>
            </div>`;
    };
    
    // ======================= GESTION DE LA SÉLECTION ======================= //
    function toggleItemSelection(id, type) {
        const card = inventoryGrid.querySelector(`[data-id="${id}"]`);
        if (selectedItems.has(id)) {
            selectedItems.delete(id);
            card.classList.remove('selected');
        } else {
            selectedItems.set(id, type);
            card.classList.add('selected');
        }

        if (selectedItems.size > 0 && !isSelectionModeActive) {
            isSelectionModeActive = true;
        } else if (selectedItems.size === 0 && isSelectionModeActive) {
            isSelectionModeActive = false;
        }
        updateSelectionUI();
    }

    function exitSelectionMode() {
        selectedItems.clear();
        isSelectionModeActive = false;
        document.querySelectorAll('.product-card.selected, .folder-card.selected').forEach(card => card.classList.remove('selected'));
        selectionBar.classList.remove('is-confirming');
        updateSelectionUI();
    }

    const updateSelectionUI = () => {
        if (isSelectionModeActive) {
            inventoryGrid.classList.add('selection-mode-active');
            selectionBar.classList.add('visible');
            filterGroup.classList.add('hidden');
            selectionCountLabel.textContent = `${selectedItems.size} sélectionné(s)`;
            
            const visibleItems = inventoryGrid.querySelectorAll('.product-card, .folder-card');
            if (visibleItems.length > 0 && selectedItems.size === visibleItems.length) {
                selectAllBtn.textContent = "Tout désélectionner";
            } else {
                selectAllBtn.textContent = "Tout sélectionner";
            }
        } else {
            inventoryGrid.classList.remove('selection-mode-active');
            selectionBar.classList.remove('visible');
            filterGroup.classList.remove('hidden');
        }
    };

    // ======================= STATISTIQUES ======================= //
    const updateStatistics = () => {
        const statsContainer = document.getElementById('stats-cards-container');
        const categoryChart = document.getElementById('category-chart');
        const totalValueEl = document.getElementById('total-stock-value');
        const typeLabels = { textile: 'Textile', mobilier: 'Mobilier', accessoire: 'Accessoires', decoration: 'Décoration', oeuvre: 'Œuvres', chaussure: 'Chaussures' };
        const typeIcons = { textile: 'fa-tshirt', mobilier: 'fa-couch', accessoire: 'fa-gem', decoration: 'fa-palette', oeuvre: 'fa-paint-brush', chaussure: 'fa-shoe-prints' };
        let totalValue = 0;
        const stats = {};
        products.forEach(p => {
            let quantity = 0;
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => { quantity += (v.quantity || 0); totalValue += (v.quantity || 0) * (v.price || 0); });
            } else {
                quantity = p.quantity || 0; totalValue += quantity * (p.price || 0);
            }
            stats[p.type] = (stats[p.type] || 0) + quantity;
        });
        statsContainer.innerHTML = Object.entries(stats).map(([type, count]) => `<div class="stat-card"><div class="stat-icon ${type}"><i class="fas ${typeIcons[type] || 'fa-box'}"></i></div><div class="stat-info"><h3>${typeLabels[type] || 'Autre'}</h3><span class="stat-value">${count}</span></div></div>`).join('');
        totalValueEl.textContent = `${totalValue.toFixed(2).replace('.', ',')}`;
        const maxStat = Math.max(...Object.values(stats), 1);
        categoryChart.innerHTML = Object.entries(stats).map(([type, count]) => `<div class="chart-bar ${type}" style="--bar-height: ${(count / maxStat) * 100}%" data-label="${typeLabels[type] || 'Autre'}"><span>${count}</span></div>`).join('');
    };
    
    // ======================= GESTIONNAIRES D'ÉVÉNEMENTS ======================= //
    navLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            tabs.forEach(t => t.classList.remove('active'));
            link.classList.add('active');
            const activeTab = document.getElementById(link.dataset.tab);
            activeTab.classList.add('active');
            fabContainer.style.display = (link.dataset.tab === 'stock') ? 'block' : 'none';
        });
    });

    inventoryGrid.addEventListener('click', async (e) => {
        const card = e.target.closest('.product-card, .folder-card');
        if (!card) return;

        const moreBtn = e.target.closest('.more-btn');
        if (moreBtn && !isSelectionModeActive) {
            e.stopPropagation();
            const menu = moreBtn.nextElementSibling;
            document.querySelectorAll('.more-content.show').forEach(m => {
                if (m !== menu) m.classList.remove('show');
            });
            menu.classList.toggle('show');
            return;
        }

        const moreItem = e.target.closest('.more-item');
        if (moreItem && !isSelectionModeActive) {
            const action = moreItem.dataset.action;
            const parentCard = moreItem.closest('.product-card, .folder-card');
            const cardId = parseInt(parentCard.dataset.id, 10);
            moreItem.closest('.more-content').classList.remove('show');

            if(parentCard.classList.contains('product-card')) {
                if (action === 'delete') parentCard.classList.add('is-deleting');
                else if (action === 'edit') openEditModal(cardId);
                else if (action === 'add-photos') openAddPhotosModal(cardId);
            } else { 
                if (action === 'delete-folder') parentCard.classList.add('is-deleting');
                else if (action === 'rename-folder') startRenameFolder(parentCard);
            }
            return;
        }
        
        const confirmActionBtn = e.target.closest('.product-confirm-delete .btn, .folder-confirm-delete .btn');
        if (confirmActionBtn) {
            const parentCard = confirmActionBtn.closest('.product-card, .folder-card');
            const action = confirmActionBtn.dataset.action;

            if (action.startsWith('cancel-delete')) {
                parentCard.classList.remove('is-deleting');
            } else if (action === 'confirm-delete') {
                const productId = parseInt(parentCard.dataset.id, 10);
                products = products.filter(p => p.id !== productId);
                await saveData();
                showNotification('Produit supprimé.', 'success');
            } else if (action === 'confirm-delete-folder') {
                const folderId = parseInt(parentCard.dataset.id, 10);
                const folder = folders.find(f => f.id === folderId);
                if (folder) {
                    products.forEach(p => { if (p.folderId === folderId) p.folderId = folder.parentId; });
                    folders = folders.filter(f => f.id !== folderId);
                    await saveData();
                    showNotification('Dossier supprimé.', 'success');
                }
            }
            return;
        }

        const carouselBtn = e.target.closest('.carousel-btn');
        if (carouselBtn && !isSelectionModeActive) {
            e.stopPropagation(); 
            const productCard = carouselBtn.closest('.product-card');
            const productId = parseInt(productCard.dataset.id, 10);
            const product = products.find(p => p.id === productId);

            if (!product || !product.images || product.images.length <= 1) return;

            const imageContainer = productCard.querySelector('.product-image');
            const imgElement = imageContainer.querySelector('img');
            const indicators = imageContainer.querySelectorAll('.carousel-indicator');
            const currentSrc = imgElement.getAttribute('src');
            let currentIndex = product.images.findIndex(src => src === currentSrc);
            if (currentIndex === -1) currentIndex = 0;

            if (carouselBtn.classList.contains('next-btn')) {
                currentIndex = (currentIndex + 1) % product.images.length;
            } else {
                currentIndex = (currentIndex - 1 + product.images.length) % product.images.length;
            }

            imgElement.src = product.images[currentIndex];
            indicators.forEach((dot, index) => dot.classList.toggle('active', index === currentIndex));
            return;
        }

        if (e.target.closest('.selection-indicator') || isSelectionModeActive) {
            if (!e.target.closest('.more-menu')) {
                toggleItemSelection(card.dataset.id, card.dataset.type);
            }
            return;
        }
        
        if (card.classList.contains('folder-card') && e.target.closest('.folder-icon-display')) {
            currentFolderId = parseInt(card.dataset.id, 10);
            updateUI();
        }
    });
    
    backBtn.addEventListener('click', () => {
        if (currentFolderId !== null) {
            const currentFolder = folders.find(f => f.id === currentFolderId);
            currentFolderId = currentFolder ? currentFolder.parentId : null;
            updateUI();
        }
    });

    cancelSelectionBtn.addEventListener('click', exitSelectionMode);
    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape" && isSelectionModeActive) exitSelectionMode();
    });
    
    selectAllBtn.addEventListener('click', () => {
        const allVisibleItems = inventoryGrid.querySelectorAll('.product-card, .folder-card');
        const areAllSelected = allVisibleItems.length > 0 && selectedItems.size === allVisibleItems.length;

        allVisibleItems.forEach(item => {
            const id = item.dataset.id;
            const type = item.dataset.type;
            if (areAllSelected) {
                if (selectedItems.has(id)) {
                    selectedItems.delete(id);
                    item.classList.remove('selected');
                }
            } else {
                if (!selectedItems.has(id)) {
                    selectedItems.set(id, type);
                    item.classList.add('selected');
                }
            }
        });
        if (selectedItems.size === 0) isSelectionModeActive = false;
        else isSelectionModeActive = true;
        updateSelectionUI();
    });

    deleteSelectedBtn.addEventListener('click', () => {
        if (selectedItems.size > 0) {
            selectionBar.classList.add('is-confirming');
        }
    });

    confirmDeleteNoBtn.addEventListener('click', () => {
        selectionBar.classList.remove('is-confirming');
    });

    confirmDeleteYesBtn.addEventListener('click', async () => {
        let foldersToDelete = new Set();
        let productsToDelete = new Set();
        selectedItems.forEach((type, id) => {
            if (type === 'folder') foldersToDelete.add(parseInt(id, 10));
            else productsToDelete.add(parseInt(id, 10));
        });

        foldersToDelete.forEach(folderId => {
            const folder = folders.find(f => f.id === folderId);
            if (folder) products.forEach(p => { if (p.folderId === folderId) p.folderId = folder.parentId; });
        });

        folders = folders.filter(f => !foldersToDelete.has(f.id));
        products = products.filter(p => !productsToDelete.has(p.id));
        
        showNotification(`${selectedItems.size} élément(s) supprimé(s).`, 'success');
        await saveData();
    });

    breadcrumbs.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            e.preventDefault();
            exitSelectionMode();
            const folderId = e.target.dataset.folderId;
            currentFolderId = folderId === 'null' ? null : parseInt(folderId, 10);
            updateUI();
        }
    });

    [searchInput, categoryFilter, statusFilter].forEach(el => el.addEventListener('input', () => {
        exitSelectionMode();
        renderInventory();
    }));

    exportBtn.addEventListener('click', () => exportToCSV());

    fabBtn.addEventListener('click', () => fabContainer.classList.toggle('active'));
    addFolderFabBtn.addEventListener('click', () => { createFolderForm.reset(); createFolderModal.style.display = 'block'; document.getElementById('folder-name').focus(); });
    addProductFabBtn.addEventListener('click', () => {
        const previewContainer = document.getElementById('modal-preview-container');
        previewContainer.innerHTML = '<div class="placeholder-preview"><i class="fas fa-camera"></i><p>Ajoutez des images.</p></div>';
        modalProductFormContainer.innerHTML = createProductFormHTML('modal-'); 
        setupProductForm(modalProductFormContainer); 
        addProductModal.style.display = 'block'; 
    });

    createFolderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const folderName = document.getElementById('folder-name').value;
        if (folderName && folderName.trim() !== '') {
            folders.push({ id: generateUniqueId(), name: folderName.trim(), parentId: currentFolderId });
            await saveData();
            showNotification('Dossier créé.', 'success');
            closeModal(createFolderModal);
        }
    });

    modalProductFormContainer.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!e.target.checkValidity()) { e.target.reportValidity(); return; }
        const newProduct = createProductObjectFromForm(e.target);
        products.push(newProduct);
        await saveData();
        showNotification('Produit ajouté avec succès !', 'success');
        closeModal(addProductModal);
    });

    productFormContainer.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!e.target.checkValidity()) { e.target.reportValidity(); return; }
        const newProduct = createProductObjectFromForm(e.target);
        products.push(newProduct);
        await saveData();
        showNotification('Produit ajouté avec succès !', 'success');
        document.getElementById('preview-container').innerHTML = '<div class="placeholder-preview"><i class="fas fa-camera"></i><p>Vos images apparaîtront ici.</p></div>';
        productFormContainer.innerHTML = createProductFormHTML();
        setupProductForm(productFormContainer);
    });
    
    document.getElementById('csv-import').addEventListener('click', () => document.getElementById('csv-file-input').click());
    document.getElementById('csv-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const newProducts = parseCSV(event.target.result);
                products.push(...newProducts);
                await saveData();
                showNotification(`${newProducts.length} produit(s) importé(s) !`, 'success');
            } catch (error) {
                showNotification(`Erreur d'import : ${error.message}`, 'error');
            }
        };
        reader.readAsText(file, 'UTF-8');
        e.target.value = '';
    });
    
    // ======================= GESTION DU GLISSER-DÉPOSER (DRAG & DROP) ======================= //
    let draggedItem = null;
    inventoryGrid.addEventListener('dragstart', (e) => {
        draggedItem = e.target.closest('.product-card, .folder-card');
        if (!draggedItem || isSelectionModeActive) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', draggedItem.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => draggedItem.classList.add('is-dragging'), 0);
    });
    inventoryGrid.addEventListener('dragend', () => {
        if (draggedItem) {
            draggedItem.classList.remove('is-dragging');
            draggedItem = null;
        }
        document.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    });
    inventoryGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const targetFolder = e.target.closest('.folder-card');
        document.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
        if (targetFolder && targetFolder !== draggedItem) {
            e.dataTransfer.dropEffect = 'move';
            targetFolder.classList.add('is-drop-target');
        } else {
            e.dataTransfer.dropEffect = 'none';
        }
    });
    inventoryGrid.addEventListener('dragleave', (e) => {
        e.target.closest('.folder-card')?.classList.remove('is-drop-target');
    });
    inventoryGrid.addEventListener('drop', async (e) => {
        e.preventDefault();
        const targetFolderCard = e.target.closest('.folder-card');
        targetFolderCard?.classList.remove('is-drop-target');
        if (!targetFolderCard || !draggedItem || targetFolderCard === draggedItem) return;

        const draggedId = parseInt(draggedItem.dataset.id, 10);
        const targetFolderId = parseInt(targetFolderCard.dataset.id, 10);
        const draggedType = draggedItem.dataset.type;

        if (draggedType === 'product') {
            const product = products.find(p => p.id === draggedId);
            if (product) product.folderId = targetFolderId;
        } else if (draggedType === 'folder') {
            const folder = folders.find(f => f.id === draggedId);
            if (folder) folder.parentId = targetFolderId;
        }
        await saveData();
        showNotification('Élément déplacé.', 'success');
    });

    // ======================= GESTION DES DOSSIERS (RENOMMER) ======================= //
    function startRenameFolder(folderCard) {
        folderCard.classList.add('is-renaming');
        const input = folderCard.querySelector('.folder-rename-input');
        input.focus();
        input.select();
    
        const finishRename = async () => {
            const folderId = parseInt(folderCard.dataset.id, 10);
            const folder = folders.find(f => f.id === folderId);
            const newName = input.value.trim();
            
            folderCard.classList.remove('is-renaming');

            if (folder && newName && newName !== folder.name) {
                folder.name = newName;
                await saveData(); 
                showNotification('Dossier renommé.', 'success');
            } else {
                renderInventory();
            }
        };
    
        input.addEventListener('blur', finishRename, { once: true });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                const nameDisplay = folderCard.querySelector('.folder-name');
                input.value = nameDisplay.textContent;
                input.blur();
            }
        });
    }

    // ======================= GESTION DES MODALS & FORMULAIRES ======================= //

    function openEditModal(productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        const editModalBody = editModal.querySelector('.modal-body');
        editModalBody.innerHTML = createEditFormHTML(product);
        const editForm = editModalBody.querySelector('#edit-product-form');
        setupProductForm(editForm, product);

        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!e.target.checkValidity()) { e.target.reportValidity(); return; }
            updateProductFromForm(e.target, productId);
            await saveData();
            showNotification('Produit mis à jour.', 'success');
            closeModal(editModal);
        }, { once: true });
        editModal.style.display = 'block';
    }

    function openAddPhotosModal(productId) {
        const modalPhotoPreviewContainer = document.getElementById('modal-preview-container-photos');
        const modalFileInput = document.getElementById('modal-file-input');
        modalPhotoPreviewContainer.innerHTML = '';
        modalFileInput.value = '';
        addPhotosModal.dataset.productId = productId;
        addPhotosModal.style.display = 'block';
    }

    document.getElementById('modal-local-folder').addEventListener('click', () => document.getElementById('modal-file-input').click());
    document.getElementById('modal-file-input').addEventListener('change', (e) => handleImageFiles(e.target.files, 'modal-preview-container-photos'));
    document.getElementById('save-photos-btn').addEventListener('click', async () => {
        const productId = parseInt(addPhotosModal.dataset.productId, 10);
        const product = products.find(p => p.id === productId);
        if (product) {
            const newImages = Array.from(document.getElementById('modal-preview-container-photos').querySelectorAll('img')).map(img => img.src);
            if (newImages.length > 0) {
                if (!product.images || (product.images.length > 0 && product.images[0].includes('placeholder.com'))) {
                    product.images = []; 
                }
                product.images.push(...newImages);
                await saveData();
                showNotification('Photos ajoutées avec succès.', 'success');
            }
            closeModal(addPhotosModal);
        }
    });

    function createEditFormHTML(product) {
        const productName = product.name || '';
        return `
            <form id="edit-product-form" novalidate>
                 <div class="form-group">
                    <label for="edit-folder-select">Dossier</label>
                    <select id="edit-folder-select">${generateFolderOptions(product.folderId)}</select>
                </div>
                <div class="form-group">
                    <label for="edit-product-name">Nom du produit</label>
                    <input type="text" id="edit-product-name" value="${productName.replace(/"/g, '&quot;')}" required>
                </div>
                <div class="form-group">
                    <label for="edit-sourcing">Sourcing</label>
                    <select id="edit-sourcing" required>
                        <option value="particulier" ${product.sourcing === 'particulier' ? 'selected' : ''}>Dépôt-vente (Particulier)</option>
                        <option value="professionnel" ${product.sourcing === 'professionnel' ? 'selected' : ''}>Dépôt-vente (Pro)</option>
                        <option value="fmr" ${product.sourcing === 'fmr' ? 'selected' : ''}>FMR</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="edit-product-type">Type de produit</label>
                    <select id="edit-product-type" required>
                        <option value="textile" ${product.type === 'textile' ? 'selected' : ''}>Textile</option>
                        <option value="mobilier" ${product.type === 'mobilier' ? 'selected' : ''}>Mobilier</option>
                        <option value="accessoire" ${product.type === 'accessoire' ? 'selected' : ''}>Accessoire</option>
                        <option value="decoration" ${product.type === 'decoration' ? 'selected' : ''}>Décoration</option>
                        <option value="oeuvre" ${product.type === 'oeuvre' ? 'selected' : ''}>Œuvre</option>
                        <option value="chaussure" ${product.type === 'chaussure' ? 'selected' : ''}>Chaussure</option>
                    </select>
                </div>
                <div id="edit-dynamic-fields" class="dynamic-fields"></div>
                <button type="submit" class="btn btn-finish"><i class="fas fa-save"></i> Enregistrer les modifications</button>
            </form>
        `;
    }

    function updateProductFromForm(formElement, productId) {
        const productIndex = products.findIndex(p => p.id === productId);
        if (productIndex === -1) return;
        const idPrefix = 'edit-';
        const type = formElement.querySelector(`#${idPrefix}product-type`).value;
        const selectedFolderId = formElement.querySelector(`#${idPrefix}folder-select`).value;

        const updatedData = {
            folderId: selectedFolderId === 'null' ? null : parseInt(selectedFolderId, 10),
            name: formElement.querySelector(`#${idPrefix}product-name`).value,
            type: type,
            sourcing: formElement.querySelector(`#${idPrefix}sourcing`).value,
            description: formElement.querySelector(`#${idPrefix}description`)?.value || '',
            condition: formElement.querySelector(`#${idPrefix}condition`)?.value,
        };
        if (type === 'textile' || type === 'chaussure') {
            updatedData.material = formElement.querySelector(`#${idPrefix}material`)?.value || '';
            updatedData.variants = Array.from(formElement.querySelectorAll('.variant-row')).map(row => ({
                size: row.querySelector('.variant-size').value,
                price: parseFloat(row.querySelector('.variant-price').value) || 0,
                quantity: parseInt(row.querySelector('.variant-quantity').value, 10) || 0,
            }));
        } else {
            updatedData.quantity = parseInt(formElement.querySelector(`#${idPrefix}quantity`)?.value, 10) || 0;
            updatedData.price = parseFloat(formElement.querySelector(`#${idPrefix}price`)?.value) || 0;
            if (type === 'mobilier') {
                updatedData.dimensions = formElement.querySelector(`#${idPrefix}dimensions`)?.value || '';
                updatedData.material = formElement.querySelector(`#${idPrefix}material`)?.value || '';
            }
        }
        products[productIndex] = { ...products[productIndex], ...updatedData };
    }

    function parseCSV(csvText) {
        const lines = csvText.split(/\r\n|\n/).filter(line => line);
        const headers = lines.shift().split(',').map(h => h.trim().toLowerCase());
        const productsArray = [];
        const headerMapping = { 'type': 'name', 'marque': 'brand', 'taille': 'size', 'couleur': 'color', 'sourcing prix': 'sourcingPrice', 'prix estimé': 'price', 'détails': 'description', 'statut': 'statusText' };
        lines.forEach(line => {
            const values = line.split(',');
            const csvProduct = headers.reduce((obj, header, index) => {
                const propName = Object.keys(headerMapping).find(key => header.includes(key));
                if (propName) obj[headerMapping[propName]] = values[index];
                return obj;
            }, {});
            productsArray.push({ id: generateUniqueId(), name: csvProduct.name || "Produit sans nom", type: 'textile', condition: 'used', sourcing: 'fmr', folderId: currentFolderId, description: csvProduct.description || '', images: [], variants: [{ size: csvProduct.size || 'Taille unique', price: parseFloat(csvProduct.price) || 0, quantity: 1 }] });
        });
        return productsArray;
    }

    function generateUniqueId() { return Date.now() + Math.floor(Math.random() * 1000); }

    function generateFolderOptions(selectedFolderId, parentId = null, prefix = '') {
        let optionsHTML = parentId === null ? `<option value="null" ${selectedFolderId === null ? 'selected' : ''}>Racine de l'inventaire</option>` : '';
        const childFolders = folders.filter(f => f.parentId === parentId);
        childFolders.forEach(folder => {
            const isSelected = folder.id === selectedFolderId;
            optionsHTML += `<option value="${folder.id}" ${isSelected ? 'selected' : ''}>${prefix}${folder.name}</option>`;
            optionsHTML += generateFolderOptions(selectedFolderId, folder.id, prefix + '— ');
        });
        return optionsHTML;
    }

    function createProductObjectFromForm(formElement) {
        const idPrefix = formElement.id.includes('modal') ? 'modal-' : '';
        const imageContainerId = idPrefix ? 'modal-preview-container' : 'preview-container';
        const imageContainer = document.getElementById(imageContainerId);
        const images = Array.from(imageContainer.querySelectorAll('img')).map(img => img.src);
        const type = formElement.querySelector(`#${idPrefix}product-type`).value;
        const selectedFolderId = formElement.querySelector(`#${idPrefix}folder-select`).value;

        const newProduct = {
            id: generateUniqueId(),
            name: formElement.querySelector(`#${idPrefix}product-name`).value,
            type: type,
            sourcing: formElement.querySelector(`#${idPrefix}sourcing`).value,
            folderId: selectedFolderId === 'null' ? null : parseInt(selectedFolderId, 10),
            images: images.length > 0 ? images : ["https://via.placeholder.com/400x300/cccccc/ffffff?text=Image"],
            description: formElement.querySelector(`#${idPrefix}description`)?.value || '',
            condition: formElement.querySelector(`#${idPrefix}condition`)?.value,
        };
        if (type === 'textile' || type === 'chaussure') {
            newProduct.material = formElement.querySelector(`#${idPrefix}material`)?.value || '';
            newProduct.variants = Array.from(formElement.querySelectorAll('.variant-row')).map(row => ({ 
                size: row.querySelector('.variant-size').value, 
                price: parseFloat(row.querySelector('.variant-price').value) || 0, 
                quantity: parseInt(row.querySelector('.variant-quantity').value, 10) || 0,
            }));
        } else {
             newProduct.quantity = parseInt(formElement.querySelector(`#${idPrefix}quantity`)?.value, 10) || 0;
             newProduct.price = parseFloat(formElement.querySelector(`#${idPrefix}price`)?.value) || 0;
             if(type === 'mobilier'){
                newProduct.dimensions = formElement.querySelector(`#${idPrefix}dimensions`)?.value || '';
                newProduct.material = formElement.querySelector(`#${idPrefix}material`)?.value || '';
             }
        }
        return newProduct;
    }

    function createProductFormHTML(idPrefix = '') {
        const folderOptions = generateFolderOptions(currentFolderId);
        return `
            <div class="form-group">
                <label for="${idPrefix}folder-select">Dossier</label>
                <select id="${idPrefix}folder-select">${folderOptions}</select>
            </div>
            <div class="form-group"><label for="${idPrefix}product-name">Nom du produit</label><input type="text" id="${idPrefix}product-name" placeholder="Ex: Veste en cuir vintage" required></div>
            <div class="form-group"><label for="${idPrefix}sourcing">Sourcing</label><select id="${idPrefix}sourcing" required><option value="">Sélectionnez une source</option><option value="particulier">Dépôt-vente (Particulier)</option><option value="professionnel">Dépôt-vente (Pro)</option><option value="fmr">FMR</option></select></div>
            <div class="form-group"><label for="${idPrefix}product-type">Type de produit</label><select id="${idPrefix}product-type" required><option value="">Sélectionnez un type</option><option value="textile">Textile</option><option value="mobilier">Mobilier</option><option value="accessoire">Accessoire</option><option value="decoration">Décoration</option><option value="oeuvre">Œuvre</option><option value="chaussure">Chaussure</option></select></div>
            <div id="${idPrefix}dynamic-fields" class="dynamic-fields"><p>Sélectionnez un type de produit pour voir les champs.</p></div>
            <button type="submit" class="btn btn-finish"><i class="fas fa-plus-circle"></i> Ajouter au stock</button>`;
    }

    function setupProductForm(formContainer, productData = null) {
        let idPrefix = '';
        if (formContainer.id.includes('modal-product-form')) idPrefix = 'modal-';
        else if (formContainer.id.includes('edit-product-form')) idPrefix = 'edit-';

        const typeSelector = formContainer.querySelector(`[id$="product-type"]`);
        const dynamicFieldsContainer = formContainer.querySelector(`[id$="dynamic-fields"]`);
        
        const updateDynamicFieldsForType = () => {
            const type = typeSelector.value;
            const data = productData;
            const commonFields = `<div class="form-group"><label for="${idPrefix}condition">État</label><select id="${idPrefix}condition" class="condition" required><option value="">Choisir...</option><option value="new" ${data?.condition === 'new' ? 'selected':''}>Neuf</option><option value="good" ${data?.condition === 'good' ? 'selected':''}>Très bon état</option><option value="used" ${data?.condition === 'used' ? 'selected':''}>Usé</option><option value="damaged" ${data?.condition === 'damaged' ? 'selected':''}>Endommagé</option></select></div><div class="form-group"><label for="${idPrefix}description">Description</label><textarea id="${idPrefix}description" class="description" rows="3">${data?.description || ''}</textarea></div>`;
            let fieldsHTML = '';

            if (type === 'textile' || type === 'chaussure') {
                const sizeLabel = type === 'textile' ? 'Taille' : 'Pointure';
                const datalistId = type === 'textile' ? 'datalist-textile-sizes' : 'datalist-shoe-sizes';
                const sizeInputHTML = `<input type="text" class="variant-size" list="${datalistId}" required placeholder="Ex: M ou 42">`;
                let variantsHTML = (data?.variants && data.variants.length > 0) ? data.variants.map((v, i) => createVariantRowHTML(sizeLabel, sizeInputHTML, i === 0, v)).join('') : createVariantRowHTML(sizeLabel, sizeInputHTML, true);
                fieldsHTML = `<div class="form-group"><label for="${idPrefix}material">Matière</label><input type="text" id="${idPrefix}material" class="material" placeholder="Coton, cuir, ..." value="${data?.material || ''}"></div><div class="variants-container">${variantsHTML}</div><button type="button" class="btn-add-variant"><i class="fas fa-plus"></i> Ajouter une variante</button>${commonFields}`;
            } else if (type) {
                const specificFields = type === 'mobilier' ? `<div class="form-group"><label for="${idPrefix}dimensions">Dimensions</label><input type="text" id="${idPrefix}dimensions" class="dimensions" placeholder="80x80x45 cm" value="${data?.dimensions || ''}"></div><div class="form-group"><label for="${idPrefix}material">Matière</label><input type="text" id="${idPrefix}material" class="material" placeholder="Chêne massif" value="${data?.material || ''}"></div>` : '';
                fieldsHTML = `<div class="form-group"><label for="${idPrefix}quantity">Quantité</label><input type="number" id="${idPrefix}quantity" class="quantity" min="0" required value="${data?.quantity || ''}"></div><div class="form-group"><label for="${idPrefix}price">Prix (€)</label><input type="number" id="${idPrefix}price" class="price" min="0" step="0.01" required value="${data?.price || ''}"></div>${specificFields}${commonFields}`;
            } else { fieldsHTML = '<p>Sélectionnez un type de produit pour voir les champs.</p>'; }
            dynamicFieldsContainer.innerHTML = fieldsHTML;
        };

        if(typeSelector) typeSelector.addEventListener('change', updateDynamicFieldsForType);

        dynamicFieldsContainer.addEventListener('click', (e) => {
            if (e.target.closest('.btn-add-variant')) {
                const container = dynamicFieldsContainer.querySelector('.variants-container');
                const type = typeSelector.value;
                const sizeLabel = type === 'textile' ? 'Taille' : 'Pointure';
                const datalistId = type === 'textile' ? 'datalist-textile-sizes' : 'datalist-shoe-sizes';
                const sizeInputHTML = `<input type="text" class="variant-size" list="${datalistId}" required placeholder="Ex: M ou 42">`;
                container.insertAdjacentHTML('beforeend', createVariantRowHTML(sizeLabel, sizeInputHTML));
            }
            if (e.target.closest('.btn-remove-variant')) { e.target.closest('.variant-row').remove(); }
        });

        if (productData) updateDynamicFieldsForType();
    }

    function createVariantRowHTML(sizeLabel, sizeInputHTML, isFirst = false, data = null) {
        const size = data?.size || '';
        const price = data?.price || '';
        const quantity = data?.quantity || '';
        const finalSizeInputHTML = sizeInputHTML.replace('>', ` value="${size.replace(/"/g, '&quot;')}">`);
        return `<div class="variant-row"><div class="form-group"><label>${sizeLabel}</label>${finalSizeInputHTML}</div><div class="form-group"><label>Prix (€)</label><input type="number" class="variant-price" min="0" step="0.01" required value="${price}" placeholder="29.99"></div><div class="form-group"><label>Quantité</label><input type="number" class="variant-quantity" min="0" required value="${quantity}" placeholder="10"></div><button type="button" class="btn-remove-variant" style="visibility:${isFirst ? 'hidden' : 'visible'};">&times;</button></div>`;
    }

    function handleImageFiles(files, previewContainerId) {
        const previewContainer = document.getElementById(previewContainerId);
        const placeholder = previewContainer.querySelector('.placeholder-preview');
        if (placeholder) placeholder.style.display = 'none';

        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            const reader = new FileReader();
            reader.onload = (e) => {
                const previewItem = document.createElement('div');
                previewItem.className = 'preview-item';
                previewItem.innerHTML = `<img src="${e.target.result}" alt="Aperçu"><div class="remove" title="Supprimer l'image">&times;</div>`;
                previewContainer.appendChild(previewItem);
            };
            reader.readAsDataURL(file);
        }
    }

    document.getElementById('local-folder').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', (e) => handleImageFiles(e.target.files, 'preview-container'));
    document.getElementById('modal-local-folder-trigger').addEventListener('click', () => document.getElementById('modal-file-input-trigger').click());
    document.getElementById('modal-file-input-trigger').addEventListener('change', (e) => handleImageFiles(e.target.files, 'modal-preview-container'));

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.more-menu')) {
            document.querySelectorAll('.more-content.show').forEach(menu => menu.classList.remove('show'));
        }
        if (e.target.classList.contains('remove')) {
            const previewItem = e.target.parentElement;
            const previewContainer = previewItem.parentElement;
            previewItem.remove();
            if (previewContainer.children.length === 0 || (previewContainer.children.length === 1 && previewContainer.querySelector('.placeholder-preview'))) {
                 const placeholder = previewContainer.querySelector('.placeholder-preview');
                 if(placeholder) placeholder.style.display = 'flex';
                 else {
                    const placeholderHTML = previewContainer.id === 'preview-container' ? '<div class="placeholder-preview"><i class="fas fa-camera"></i><p>Vos images apparaîtront ici.</p></div>' : '<div class="placeholder-preview"><i class="fas fa-camera"></i><p>Ajoutez des images.</p></div>';
                    previewContainer.innerHTML = placeholderHTML;
                 }
            }
        }
    });

    function showNotification(message, type = 'success') {
        const container = document.getElementById('notification-container');
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
        notif.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
        container.appendChild(notif);
        setTimeout(() => notif.remove(), 4000);
    }
    function closeModal(modal) { if (modal) modal.style.display = 'none'; }
    document.querySelectorAll('.modal .close, .modal .close-modal-btn').forEach(btn => btn.addEventListener('click', e => closeModal(e.target.closest('.modal'))));
    window.addEventListener('click', e => { if (e.target.classList.contains('modal')) closeModal(e.target); });
    
    function exportToCSV() {
        const itemsToExport = products.filter(p => {
            const searchText = searchInput.value.toLowerCase();
            const category = categoryFilter.value;
            const status = statusFilter.value;
            return p.folderId === currentFolderId &&
                   (p.name.toLowerCase().includes(searchText) || (p.description && p.description.toLowerCase().includes(searchText))) &&
                   (!category || p.type === category) &&
                   (!status || p.condition === status);
        });

        if (itemsToExport.length === 0) {
            showNotification("Aucun produit à exporter dans la vue actuelle.", 'info');
            return;
        }

        const headers = ['ID', 'Nom', 'Type', 'Sourcing', 'État', 'Description', 'Matière', 'Dimensions', 'Taille/Pointure', 'Prix (€)', 'Quantité'];
        let csvContent = headers.join(',') + '\n';

        itemsToExport.forEach(product => {
            const commonData = [
                product.id,
                `"${(product.name || '').replace(/"/g, '""')}"`,
                product.type || '',
                product.sourcing || '',
                product.condition || '',
                `"${(product.description || '').replace(/"/g, '""')}"`,
                product.material || '',
                product.dimensions || ''
            ];

            if (product.variants && product.variants.length > 0) {
                product.variants.forEach(variant => {
                    const variantData = [...commonData, `"${variant.size || ''}"`, variant.price || 0, variant.quantity || 0];
                    csvContent += variantData.join(',') + '\n';
                });
            } else {
                const simpleData = [...commonData, '', product.price || 0, product.quantity || 0];
                csvContent += simpleData.join(',') + '\n';
            }
        });

        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);

        let fileName = 'export_inventaire_racine';
        if (currentFolderId !== null) {
            const folder = folders.find(f => f.id === currentFolderId);
            if (folder) {
                fileName = `export_${folder.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
            }
        }
        link.setAttribute("download", `${fileName}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    async function initializeApp() {
        await idbManager.initDB();
        await loadData();
        productFormContainer.innerHTML = createProductFormHTML();
        setupProductForm(productFormContainer);
        updateUI();
        document.querySelector('a[data-tab="stock"]').click();
    }

    initializeApp();
});