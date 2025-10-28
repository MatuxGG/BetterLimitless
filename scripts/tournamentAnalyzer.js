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
                const response = await fetch(url);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const cardData = {};

                // Trouver toutes les div avec la classe "decklist"
                const decklistDivs = doc.querySelectorAll('.decklist');

                decklistDivs.forEach(decklistDiv => {
                    // Récupérer tous les <a> qui suivent cette div
                    let nextElement = decklistDiv.nextElementSibling;

                    // Parcourir les éléments suivants pour trouver les liens de cartes
                    while (nextElement) {
                        const links = nextElement.querySelectorAll('a');

                        links.forEach(link => {
                            const text = link.textContent.trim();
                            // Format attendu: "Qty Nom"
                            const match = text.match(/^(\d+)\s+(.+)$/);

                            if (match) {
                                const qty = parseInt(match[1]);
                                const cardName = match[2];

                                if (!cardData[cardName]) {
                                    cardData[cardName] = {};
                                }

                                if (!cardData[cardName][qty]) {
                                    cardData[cardName][qty] = 0;
                                }

                                cardData[cardName][qty]++;
                            }
                        });

                        // Si on atteint une nouvelle section decklist, on s'arrête
                        if (nextElement.classList.contains('decklist')) {
                            break;
                        }

                        nextElement = nextElement.nextElementSibling;
                    }
                });

                return cardData;
            } catch (error) {
                console.error(`[BetterLimitless] Erreur lors du parsing de ${url}:`, error);
                return {};
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

            if (tournamentLinks.length === 0) {
                statusDiv.textContent = 'Aucun tournoi trouvé';
                statusDiv.style.color = '#ff4444';
                button.disabled = false;
                return;
            }

            statusDiv.textContent = `Analyse de ${tournamentLinks.length} tournoi(s)...`;

            const allCardData = {};
            let processed = 0;

            // Analyser chaque tournoi
            for (const url of tournamentLinks) {
                const cardData = await parseTournamentPage(url);
                mergeCardData(allCardData, cardData);
                processed++;
                statusDiv.textContent = `Analysé ${processed}/${tournamentLinks.length} tournois...`;
            }

            // Afficher les résultats
            displayResults(allCardData);

            statusDiv.textContent = `Analyse terminée : ${tournamentLinks.length} tournoi(s) analysé(s)`;
            statusDiv.style.color = '#44ff44';
            button.disabled = false;
        }

        // Fonction pour afficher les résultats
        function displayResults(cardData) {
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
            html += '<th style="text-align: center; padding: 8px;">Apparitions</th>';
            html += '</tr></thead><tbody>';

            sortedCards.forEach(cardName => {
                const quantities = cardData[cardName];
                const sortedQtys = Object.keys(quantities).sort((a, b) => parseInt(b) - parseInt(a));

                sortedQtys.forEach((qty, index) => {
                    const count = quantities[qty];
                    html += '<tr style="border-bottom: 1px solid #333;">';
                    if (index === 0) {
                        html += `<td style="padding: 8px;" rowspan="${sortedQtys.length}">${cardName}</td>`;
                    }
                    html += `<td style="text-align: center; padding: 8px;">${qty}</td>`;
                    html += `<td style="text-align: center; padding: 8px;">${count}</td>`;
                    html += '</tr>';
                });
            });

            html += '</tbody></table>';
            resultsDiv.innerHTML = html;
        }

        // Création du bouton d'analyse
        function createAnalyzeButton() {
            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.alignItems = 'center';
            buttonContainer.style.padding = '12px';
            buttonContainer.style.gap = '10px';

            const button = document.createElement('button');
            button.id = 'analyze-tournaments-btn';
            button.textContent = 'Analyser les tournois';
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
        }

        // Lancer le script quand la page est chargée
        window.addEventListener('load', () => {
            console.log('[BetterLimitless] Initializing tournament analyzer button');
            createAnalyzeButton();
        });
    })();
});
