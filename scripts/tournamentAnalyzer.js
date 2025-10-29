chrome.storage?.sync.get('tournamentAnalyzerEnabled', (data) => {
    if (data.tournamentAnalyzerEnabled === false) {
        console.log('[BetterLimitless] Tournament analyzer script désactivé');
        return;
    }

    (function () {
        'use strict';

        console.log('[BetterLimitless] Tournament analyzer script loaded');

        // Fonction pour parser une page de tournoi et extraire les cartes avec leurs catégories
        async function parseTournamentPage(url) {
            try {
                console.log('[BetterLimitless] Parsing de la page:', url);
                const response = await fetch(url);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const cardData = {};
                const cardsInThisTournament = new Set(); // Pour tracker les cartes uniques de ce tournoi

                // Trouver toutes les div avec la classe "decklist"
                const decklistDivs = doc.querySelectorAll('.decklist');
                console.log('[BetterLimitless] Nombre de decklists trouvées:', decklistDivs.length);

                decklistDivs.forEach((decklistDiv, index) => {
                    console.log(`[BetterLimitless] Traitement de la decklist ${index + 1}`);

                    // Parcourir tous les éléments de la decklist pour trouver les catégories et les cartes
                    const columns = decklistDiv.querySelectorAll('.column');

                    columns.forEach(column => {
                        // Chercher tous les blocs .cards qui contiennent les catégories et les cartes
                        const cardsBlocks = column.querySelectorAll('.cards');

                        cardsBlocks.forEach(cardsBlock => {
                            let currentCategory = 'Autre'; // Catégorie par défaut

                            // Chercher le heading à l'intérieur du bloc .cards
                            const headingElement = cardsBlock.querySelector('.heading');

                            if (headingElement) {
                                // Extraire le nom de la catégorie sans le nombre entre parenthèses
                                const headingText = headingElement.textContent.trim();
                                const categoryMatch = headingText.match(/^(.+?)\s*\(\d+\)$/);
                                currentCategory = categoryMatch ? categoryMatch[1].trim() : headingText;
                                console.log(`[BetterLimitless] Catégorie détectée: ${currentCategory}`);
                            }

                            // Traiter les cartes de cette catégorie
                            const links = cardsBlock.querySelectorAll('p a');

                            links.forEach(link => {
                                const text = link.textContent.trim();
                                const href = link.getAttribute('href');
                                console.log(`[BetterLimitless] Texte du lien: "${text}" dans catégorie "${currentCategory}"`);

                                // Format attendu: "Qty Nom (SET-NUM)" ou "Qty Nom"
                                // Exemples: "4 Dreepy (TWM-128)", "4 Iono PAL 185"
                                const match = text.match(/^(\d+)\s+(.+?)(?:\s*\([^)]+\))?$/);

                                if (match) {
                                    const qty = parseInt(match[1]);
                                    let cardName = match[2].trim();

                                    // Extraire le nom complet sans la quantité (inclut la référence)
                                    const fullName = text.replace(/^\d+\s+/, '');

                                    // Enlever les informations de set à la fin si présentes (format: NOM SET NUM)
                                    // Par exemple: "Iono PAL 185" -> "Iono"
                                    cardName = cardName.replace(/\s+[A-Z]{2,}\s+\d+\s*$/, '');

                                    console.log(`[BetterLimitless] Carte trouvée: ${cardName} x${qty} [${currentCategory}]`);

                                    cardsInThisTournament.add(cardName); // Ajouter au Set

                                    if (!cardData[cardName]) {
                                        cardData[cardName] = {
                                            category: currentCategory,
                                            quantities: {},
                                            fullName: fullName,
                                            href: href
                                        };
                                    }

                                    if (!cardData[cardName].quantities[qty]) {
                                        cardData[cardName].quantities[qty] = 0;
                                    }

                                    cardData[cardName].quantities[qty]++;
                                }
                            });
                        });
                    });
                });

                const totalCards = Object.keys(cardData).length;
                console.log(`[BetterLimitless] Total de cartes uniques trouvées sur cette page: ${totalCards}`);
                console.log('[BetterLimitless] Données extraites:', cardData);
                return { cardData, cardsInThisTournament, decklistCount: decklistDivs.length };
            } catch (error) {
                console.error(`[BetterLimitless] Erreur lors du parsing de ${url}:`, error);
                return { cardData: {}, cardsInThisTournament: new Set(), decklistCount: 0 };
            }
        }

        // Fonction pour fusionner les données de cartes avec leurs catégories
        function mergeCardData(target, source) {
            for (const cardName in source) {
                if (!target[cardName]) {
                    target[cardName] = {
                        category: source[cardName].category,
                        quantities: {},
                        fullName: source[cardName].fullName,
                        href: source[cardName].href
                    };
                }

                for (const qty in source[cardName].quantities) {
                    if (!target[cardName].quantities[qty]) {
                        target[cardName].quantities[qty] = 0;
                    }
                    target[cardName].quantities[qty] += source[cardName].quantities[qty];
                }
            }
        }

        // Fonction pour analyser tous les tournois
        async function analyzeTournaments() {
            const button = document.getElementById('analyze-tournaments-btn');
            const statusDiv = document.getElementById('tournament-status');

            if (!button || !statusDiv) return;

            button.disabled = true;
            statusDiv.textContent = 'Analyse en cours...';
            statusDiv.style.color = '#ffa500';

            // Récupérer tous les liens vers les tournois qui contiennent un <i> avec la classe "fa-list-alt"
            const tournamentLinks = Array.from(document.querySelectorAll('a'))
                .filter(link => {
                    const href = link.getAttribute('href');
                    const hasIcon = link.querySelector('i.fa-list-alt') !== null;
                    return href?.startsWith('/tournament/') && hasIcon;
                })
                .map(link => {
                    const href = link.getAttribute('href');
                    return href.startsWith('http') ? href : `https://play.limitlesstcg.com${href}`;
                });

            console.log('[BetterLimitless] Liens de tournois trouvés:', tournamentLinks);

            if (tournamentLinks.length === 0) {
                statusDiv.textContent = 'Aucun tournoi trouvé';
                statusDiv.style.color = '#ff4444';
                button.disabled = false;
                return;
            }

            statusDiv.textContent = `Analyse de ${tournamentLinks.length} tournoi(s)...`;

            const allCardData = {};
            const cardTournamentCount = {}; // Compte le nombre de tournois où chaque carte apparaît
            let totalDecklists = 0; // Compte le nombre total de decklists analysées
            let processed = 0;

            // Analyser chaque tournoi
            for (const url of tournamentLinks) {
                const result = await parseTournamentPage(url);
                mergeCardData(allCardData, result.cardData);
                totalDecklists += result.decklistCount;

                // Compter les tournois où chaque carte apparaît
                result.cardsInThisTournament.forEach(cardName => {
                    if (!cardTournamentCount[cardName]) {
                        cardTournamentCount[cardName] = 0;
                    }
                    cardTournamentCount[cardName]++;
                });

                processed++;
                statusDiv.textContent = `Analysé ${processed}/${tournamentLinks.length} tournois...`;
            }

            // Afficher les résultats
            displayResults(allCardData, cardTournamentCount, totalDecklists);

            statusDiv.textContent = `Analyse terminée : ${tournamentLinks.length} tournoi(s) analysé(s)`;
            statusDiv.style.color = '#44ff44';
            button.disabled = false;
        }

        // Fonction pour générer une decklist automatique avec les cartes >50%, groupée par catégorie
        function generateAutoDecklist(cardData, totalDecklists) {
            const autoDecklistByCategory = {};

            // Pour chaque carte, trouver la quantité la plus représentée qui dépasse 50%
            for (const cardName in cardData) {
                const category = cardData[cardName].category;
                const quantities = cardData[cardName].quantities;
                let bestQty = null;
                let bestPercentage = 0;

                // Parcourir toutes les quantités pour cette carte
                for (const qty in quantities) {
                    const count = quantities[qty];
                    const percentage = (count / totalDecklists) * 100;

                    // Garder la quantité avec le pourcentage le plus élevé qui dépasse 50%
                    if (percentage > 50 && percentage > bestPercentage) {
                        bestQty = parseInt(qty);
                        bestPercentage = percentage;
                    }
                }

                // Si une quantité dépasse 50%, l'ajouter à la decklist
                if (bestQty !== null) {
                    if (!autoDecklistByCategory[category]) {
                        autoDecklistByCategory[category] = [];
                    }
                    // Nettoyer le fullName pour enlever la quantité d'origine
                    const nameWithoutQty = cardData[cardName].fullName.replace(/^\d+\s+/, '');
                    autoDecklistByCategory[category].push({
                        name: cardName,
                        fullName: nameWithoutQty,
                        href: cardData[cardName].href,
                        quantity: bestQty,
                        percentage: bestPercentage
                    });
                }
            }

            // Trier les cartes dans chaque catégorie par nom
            for (const category in autoDecklistByCategory) {
                autoDecklistByCategory[category].sort((a, b) => a.name.localeCompare(b.name));
            }

            return autoDecklistByCategory;
        }

        // Fonction pour afficher la decklist automatique groupée par catégorie
        function displayAutoDecklist(autoDecklistByCategory) {
            // Récupérer le conteneur flex principal
            let flexContainer = document.getElementById('tournament-flex-container');

            let autoDecklistDiv = document.getElementById('auto-decklist');

            if (!autoDecklistDiv) {
                autoDecklistDiv = document.createElement('div');
                autoDecklistDiv.id = 'auto-decklist';
                autoDecklistDiv.style.flex = '1 1 500px';
                autoDecklistDiv.style.minWidth = '300px';
                autoDecklistDiv.style.padding = '15px';
                autoDecklistDiv.style.backgroundColor = '#1a1a1a';
                autoDecklistDiv.style.border = '1px solid #444';
                autoDecklistDiv.style.borderRadius = '4px';

                if (flexContainer) {
                    flexContainer.appendChild(autoDecklistDiv);
                }
            }

            if (Object.keys(autoDecklistByCategory).length === 0) {
                autoDecklistDiv.innerHTML = '<h3 style="color: #f0f0f0; margin-bottom: 15px;">Decklist automatique</h3>' +
                    '<p style="color: #ffa500;">Aucune carte ne dépasse 50% de présence dans les decklists analysées.</p>';
                return;
            }

            // Calculer le total de cartes
            let totalCards = 0;
            for (const category in autoDecklistByCategory) {
                totalCards += autoDecklistByCategory[category].reduce((sum, card) => sum + card.quantity, 0);
            }

            // Créer le contenu HTML
            let html = '<h3 style="color: #f0f0f0; margin-bottom: 15px;">Decklist automatique (cartes >50%)</h3>';
            html += `<p style="color: #aaa; margin-bottom: 10px;">Total: ${totalCards} cartes</p>`;

            // Bouton pour copier la decklist
            html += '<button id="copy-decklist-btn" style="background-color: #2563eb; color: #f0f0f0; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-bottom: 15px; font-weight: 500;">Copier la decklist</button>';
            html += '<span id="copy-status" style="margin-left: 10px; color: #44ff44;"></span>';

            // Utiliser la structure native de Limitless TCG
            html += '<div class="decklist">';

            // Trier les catégories
            const sortedCategories = Object.keys(autoDecklistByCategory).sort();

            sortedCategories.forEach((category) => {
                // Calculer le nombre total de cartes dans cette catégorie
                const categoryTotal = autoDecklistByCategory[category].reduce((sum, card) => sum + card.quantity, 0);

                // Créer une colonne pour chaque catégorie
                html += '<div class="column">';
                html += '<div class="cards">';
                html += `<div class="heading">${category} (${categoryTotal})</div>`;

                // Afficher les cartes de cette catégorie
                autoDecklistByCategory[category].forEach(card => {
                    const cardNameDisplay = card.href
                        ? `<a href="${card.href}" target="_blank">${card.quantity} ${card.fullName}</a>`
                        : `${card.quantity} ${card.fullName}`;
                    html += `<p>${cardNameDisplay} <span style="color: #888;">(${card.percentage.toFixed(0)}%)</span></p>`;
                });

                html += '</div>'; // Fermer .cards
                html += '</div>'; // Fermer .column
            });

            html += '</div>'; // Fermer .decklist
            autoDecklistDiv.innerHTML = html;

            // Ajouter l'événement pour copier la decklist
            setTimeout(() => {
                const copyBtn = document.getElementById('copy-decklist-btn');
                const copyStatus = document.getElementById('copy-status');

                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        // Générer le texte de la decklist avec catégories
                        let decklistText = '';
                        const sortedCategories = Object.keys(autoDecklistByCategory).sort();

                        sortedCategories.forEach((category, index) => {
                            if (index > 0) {
                                decklistText += '\n';
                            }
                            decklistText += `${category}\n`;
                            autoDecklistByCategory[category].forEach(card => {
                                decklistText += `${card.quantity} ${card.fullName}\n`;
                            });
                        });

                        navigator.clipboard.writeText(decklistText).then(() => {
                            copyStatus.textContent = 'Copié !';
                            copyStatus.style.color = '#44ff44';
                            setTimeout(() => {
                                copyStatus.textContent = '';
                            }, 2000);
                        }).catch(err => {
                            copyStatus.textContent = 'Erreur lors de la copie';
                            copyStatus.style.color = '#ff4444';
                            console.error('[BetterLimitless] Erreur lors de la copie:', err);
                        });
                    });
                }
            }, 0);
        }

        // Fonction pour afficher les résultats groupés par catégorie
        function displayResults(cardData, cardTournamentCount, totalDecklists) {
            console.log('[BetterLimitless] Affichage des résultats avec les données:', cardData);
            console.log('[BetterLimitless] Nombre de cartes à afficher:', Object.keys(cardData).length);
            console.log('[BetterLimitless] Total de decklists analysées:', totalDecklists);

            // Créer ou récupérer le conteneur flex principal
            let flexContainer = document.getElementById('tournament-flex-container');

            if (!flexContainer) {
                flexContainer = document.createElement('div');
                flexContainer.id = 'tournament-flex-container';
                flexContainer.style.display = 'flex';
                flexContainer.style.flexWrap = 'wrap';
                flexContainer.style.gap = '20px';
                flexContainer.style.marginTop = '20px';

                const container = document.querySelector('.player-nav');
                if (container) {
                    container.parentElement.insertBefore(flexContainer, container.nextSibling);
                }
            }

            // Créer ou récupérer la div de résultats
            let resultsDiv = document.getElementById('tournament-results');

            if (!resultsDiv) {
                resultsDiv = document.createElement('div');
                resultsDiv.id = 'tournament-results';
                resultsDiv.style.flex = '1 1 500px';
                resultsDiv.style.minWidth = '300px';
                resultsDiv.style.padding = '15px';
                resultsDiv.style.backgroundColor = '#1a1a1a';
                resultsDiv.style.border = '1px solid #444';
                resultsDiv.style.borderRadius = '4px';
                resultsDiv.style.maxHeight = '500px';
                resultsDiv.style.overflowY = 'auto';

                flexContainer.appendChild(resultsDiv);
            }

            // Grouper les cartes par catégorie
            const cardsByCategory = {};
            for (const cardName in cardData) {
                const category = cardData[cardName].category;
                if (!cardsByCategory[category]) {
                    cardsByCategory[category] = [];
                }
                cardsByCategory[category].push(cardName);
            }

            // Trier les catégories et les cartes
            const sortedCategories = Object.keys(cardsByCategory).sort();

            let html = '<h3 style="color: #f0f0f0; margin-bottom: 15px;">Résultats de l\'analyse</h3>';

            sortedCategories.forEach(category => {
                // Afficher le nom de la catégorie
                html += `<h4 style="color: #2563eb; margin-top: 20px; margin-bottom: 10px;">${category}</h4>`;
                html += '<table style="width: 100%; color: #f0f0f0; border-collapse: collapse; margin-bottom: 20px;">';
                html += '<thead><tr style="border-bottom: 2px solid #444;">';
                html += '<th style="text-align: left; padding: 8px;">Carte</th>';
                html += '<th style="text-align: center; padding: 8px;">Quantité</th>';
                html += '<th style="text-align: center; padding: 8px;">Pourcentage</th>';
                html += '</tr></thead><tbody>';

                // Trier les cartes de la catégorie par nom
                const sortedCards = cardsByCategory[category].sort();

                sortedCards.forEach(cardName => {
                    const card = cardData[cardName];
                    const quantities = card.quantities;
                    const sortedQtys = Object.keys(quantities).sort((a, b) => parseInt(b) - parseInt(a));

                    sortedQtys.forEach((qty, index) => {
                        const count = quantities[qty];
                        // Calculer le pourcentage par rapport au nombre total de decklists analysées
                        const percentage = ((count / totalDecklists) * 100).toFixed(0);

                        html += '<tr style="border-bottom: 1px solid #333;">';

                        // Afficher le nom complet avec la quantité appropriée et créer un lien
                        // Nettoyer le fullName pour enlever la quantité d'origine
                        const nameWithoutQty = card.fullName.replace(/^\d+\s+/, '');
                        const cardDisplay = card.href
                            ? `<a href="${card.href}" target="_blank" style="color: #2563eb; text-decoration: none;">${qty} ${nameWithoutQty}</a>`
                            : `${qty} ${nameWithoutQty}`;
                        html += `<td style="padding: 8px;">${cardDisplay}</td>`;

                        html += `<td style="text-align: center; padding: 8px;">${qty}</td>`;
                        html += `<td style="text-align: center; padding: 8px;">${percentage}%</td>`;
                        html += '</tr>';
                    });
                });

                html += '</tbody></table>';
            });

            resultsDiv.innerHTML = html;

            // Générer et afficher la decklist automatique
            const autoDecklist = generateAutoDecklist(cardData, totalDecklists);
            displayAutoDecklist(autoDecklist);
        }

        // Création du bouton d'analyse
        function createAnalyzeButton() {
            // Ne pas afficher le bouton si l'URL contient "matchups"
            if (window.location.href.includes('matchups')) {
                console.log('[BetterLimitless] Bouton non affiché car l\'URL contient "matchups"');
                return;
            }

            // Vérifier si le bouton existe déjà pour éviter les doublons
            if (document.getElementById('analyze-tournaments-btn')) {
                console.log('[BetterLimitless] Bouton déjà créé, skip');
                return;
            }

            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.alignItems = 'center';
            buttonContainer.style.padding = '12px';
            buttonContainer.style.gap = '10px';

            const button = document.createElement('button');
            button.id = 'analyze-tournaments-btn';
            button.textContent = 'Analyser les decklists';
            button.style.backgroundColor = '#2563eb';
            button.style.color = '#f0f0f0';
            button.style.border = 'none';
            button.style.padding = '8px 16px';
            button.style.borderRadius = '4px';
            button.style.cursor = 'pointer';
            button.style.fontWeight = '500';

            button.addEventListener('mouseenter', () => {
                if (!button.disabled) {
                    button.style.backgroundColor = '#1d4ed8';
                }
            });

            button.addEventListener('mouseleave', () => {
                if (!button.disabled) {
                    button.style.backgroundColor = '#2563eb';
                }
            });

            button.addEventListener('click', analyzeTournaments);

            const statusSpan = document.createElement('span');
            statusSpan.id = 'tournament-status';
            statusSpan.style.color = '#f0f0f0';

            buttonContainer.appendChild(button);
            buttonContainer.appendChild(statusSpan);

            const parentInPage = document.querySelector('.player-nav');
            if (!parentInPage) {
                console.warn('[BetterLimitless] player-nav not found');
                return;
            }

            parentInPage.appendChild(buttonContainer);
            console.log('[BetterLimitless] Bouton créé avec succès');
        }

        // Fonction pour initialiser le bouton de manière robuste
        function initializeButton() {
            // Essayer de créer le bouton immédiatement
            const parentInPage = document.querySelector('.player-nav');
            if (parentInPage) {
                console.log('[BetterLimitless] player-nav trouvé immédiatement');
                createAnalyzeButton();
                return;
            }

            // Si l'élément n'existe pas encore, utiliser un MutationObserver
            console.log('[BetterLimitless] player-nav non trouvé, utilisation de MutationObserver');
            const observer = new MutationObserver((mutations, obs) => {
                const parentInPage = document.querySelector('.player-nav');
                if (parentInPage) {
                    console.log('[BetterLimitless] player-nav détecté par MutationObserver');
                    createAnalyzeButton();
                    obs.disconnect(); // Arrêter l'observation une fois le bouton créé
                }
            });

            // Observer les changements dans le DOM
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Timeout de sécurité après 10 secondes
            setTimeout(() => {
                observer.disconnect();
                console.log('[BetterLimitless] MutationObserver arrêté après timeout');
            }, 10000);
        }

        // Démarrer l'initialisation dès que le DOM est prêt
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeButton);
        } else {
            // Le DOM est déjà chargé
            initializeButton();
        }
    })();
});
