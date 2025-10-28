chrome.storage?.sync.get('tournamentAnalyzerEnabled', (data) => {
    if (data.tournamentAnalyzerEnabled === false) {
        console.log('[BetterLimitless] Tournament analyzer script désactivé');
        return;
    }

    (function () {
        'use strict';

        console.log('[BetterLimitless] Tournament analyzer script loaded');

        // Fonction pour parser une page de tournoi et extraire les cartes
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

                    // Chercher tous les liens À L'INTÉRIEUR de la div decklist
                    // Structure: .decklist > .column > .cards > p > a
                    const links = decklistDiv.querySelectorAll('.cards p a');
                    console.log(`[BetterLimitless] Liens trouvés dans la decklist:`, links.length);

                    links.forEach(link => {
                        const text = link.textContent.trim();
                        console.log(`[BetterLimitless] Texte du lien: "${text}"`);

                        // Format attendu: "Qty Nom (SET-NUM)" ou "Qty Nom"
                        // Exemples: "4 Dreepy (TWM-128)", "4 Iono PAL 185"
                        const match = text.match(/^(\d+)\s+(.+?)(?:\s*\([^)]+\))?$/);

                        if (match) {
                            const qty = parseInt(match[1]);
                            let cardName = match[2].trim();

                            // Enlever les informations de set à la fin si présentes (format: NOM SET NUM)
                            // Par exemple: "Iono PAL 185" -> "Iono"
                            cardName = cardName.replace(/\s+[A-Z]{2,}\s+\d+\s*$/, '');

                            console.log(`[BetterLimitless] Carte trouvée: ${cardName} x${qty}`);

                            cardsInThisTournament.add(cardName); // Ajouter au Set

                            if (!cardData[cardName]) {
                                cardData[cardName] = {};
                            }

                            if (!cardData[cardName][qty]) {
                                cardData[cardName][qty] = 0;
                            }

                            cardData[cardName][qty]++;
                        }
                    });
                });

                const totalCards = Object.keys(cardData).length;
                console.log(`[BetterLimitless] Total de cartes uniques trouvées sur cette page: ${totalCards}`);
                console.log('[BetterLimitless] Données extraites:', cardData);
                return { cardData, cardsInThisTournament };
            } catch (error) {
                console.error(`[BetterLimitless] Erreur lors du parsing de ${url}:`, error);
                return { cardData: {}, cardsInThisTournament: new Set() };
            }
        }

        // Fonction pour fusionner les données de cartes
        function mergeCardData(target, source) {
            for (const cardName in source) {
                if (!target[cardName]) {
                    target[cardName] = {};
                }

                for (const qty in source[cardName]) {
                    if (!target[cardName][qty]) {
                        target[cardName][qty] = 0;
                    }
                    target[cardName][qty] += source[cardName][qty];
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
            let processed = 0;

            // Analyser chaque tournoi
            for (const url of tournamentLinks) {
                const result = await parseTournamentPage(url);
                mergeCardData(allCardData, result.cardData);

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
            displayResults(allCardData, cardTournamentCount, tournamentLinks.length);

            statusDiv.textContent = `Analyse terminée : ${tournamentLinks.length} tournoi(s) analysé(s)`;
            statusDiv.style.color = '#44ff44';
            button.disabled = false;
        }

        // Fonction pour afficher les résultats
        function displayResults(cardData, cardTournamentCount, totalTournaments) {
            console.log('[BetterLimitless] Affichage des résultats avec les données:', cardData);
            console.log('[BetterLimitless] Nombre de cartes à afficher:', Object.keys(cardData).length);
            console.log('[BetterLimitless] Total de tournois analysés:', totalTournaments);
            // Créer ou récupérer la div de résultats
            let resultsDiv = document.getElementById('tournament-results');

            if (!resultsDiv) {
                resultsDiv = document.createElement('div');
                resultsDiv.id = 'tournament-results';
                resultsDiv.style.marginTop = '20px';
                resultsDiv.style.padding = '15px';
                resultsDiv.style.backgroundColor = '#1a1a1a';
                resultsDiv.style.border = '1px solid #444';
                resultsDiv.style.borderRadius = '4px';
                resultsDiv.style.maxHeight = '500px';
                resultsDiv.style.overflowY = 'auto';

                const container = document.querySelector('.player-nav');
                if (container) {
                    container.parentElement.insertBefore(resultsDiv, container.nextSibling);
                }
            }

            // Trier les cartes par nom
            const sortedCards = Object.keys(cardData).sort();

            let html = '<h3 style="color: #f0f0f0; margin-bottom: 15px;">Résultats de l\'analyse</h3>';
            html += '<table style="width: 100%; color: #f0f0f0; border-collapse: collapse;">';
            html += '<thead><tr style="border-bottom: 2px solid #444;">';
            html += '<th style="text-align: left; padding: 8px;">Carte</th>';
            html += '<th style="text-align: center; padding: 8px;">Quantité</th>';
            html += '<th style="text-align: center; padding: 8px;">Pourcentage</th>';
            html += '</tr></thead><tbody>';

            sortedCards.forEach(cardName => {
                const quantities = cardData[cardName];
                const sortedQtys = Object.keys(quantities).sort((a, b) => parseInt(b) - parseInt(a));

                // Calculer le total d'occurrences pour cette carte (somme de toutes les decklists)
                const totalOccurrences = sortedQtys.reduce((sum, qty) => sum + quantities[qty], 0);

                sortedQtys.forEach((qty, index) => {
                    const count = quantities[qty];
                    // Calculer le pourcentage par rapport au nombre total de decklists contenant cette carte
                    const percentage = ((count / totalOccurrences) * 100).toFixed(0);

                    html += '<tr style="border-bottom: 1px solid #333;">';
                    if (index === 0) {
                        html += `<td style="padding: 8px;" rowspan="${sortedQtys.length}">${cardName}</td>`;
                    }
                    html += `<td style="text-align: center; padding: 8px;">${qty}</td>`;
                    html += `<td style="text-align: center; padding: 8px;">${percentage}%</td>`;
                    html += '</tr>';
                });
            });

            html += '</tbody></table>';
            resultsDiv.innerHTML = html;
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
