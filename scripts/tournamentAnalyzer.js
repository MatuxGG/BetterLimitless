chrome.storage?.sync.get('tournamentAnalyzerEnabled', (data) => {
    if (data.tournamentAnalyzerEnabled === false) {
        console.log('[BetterLimitless] Tournament analyzer script disabled');
        return;
    }

    (function () {
        'use strict';

        console.log('[BetterLimitless] Tournament analyzer script loaded');

        // Function to parse a tournament page and extract cards with their categories
        async function parseTournamentPage(url) {
            try {
                console.log('[BetterLimitless] Parsing page:', url);
                const response = await fetch(url);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const cardData = {};
                const cardsInThisTournament = new Set(); // Track unique cards from this tournament

                // Find all divs with class "decklist"
                const decklistDivs = doc.querySelectorAll('.decklist');
                console.log('[BetterLimitless] Number of decklists found:', decklistDivs.length);

                decklistDivs.forEach((decklistDiv, index) => {
                    console.log(`[BetterLimitless] Processing decklist ${index + 1}`);

                    // Go through all elements of the decklist to find categories and cards
                    const columns = decklistDiv.querySelectorAll('.column');

                    columns.forEach(column => {
                        // Find all .cards blocks that contain categories and cards
                        const cardsBlocks = column.querySelectorAll('.cards');

                        cardsBlocks.forEach(cardsBlock => {
                            let currentCategory = 'Other'; // Default category

                            // Find the heading inside the .cards block
                            const headingElement = cardsBlock.querySelector('.heading');

                            if (headingElement) {
                                // Extract category name without the number in parentheses
                                const headingText = headingElement.textContent.trim();
                                const categoryMatch = headingText.match(/^(.+?)\s*\(\d+\)$/);
                                currentCategory = categoryMatch ? categoryMatch[1].trim() : headingText;
                                console.log(`[BetterLimitless] Category detected: ${currentCategory}`);
                            }

                            // Process cards in this category
                            const links = cardsBlock.querySelectorAll('p a');

                            links.forEach(link => {
                                const text = link.textContent.trim();
                                const href = link.getAttribute('href');
                                console.log(`[BetterLimitless] Link text: "${text}" in category "${currentCategory}"`);

                                // Expected format: "Qty Name (SET-NUM)" or "Qty Name"
                                // Examples: "4 Dreepy (TWM-128)", "4 Iono PAL 185"
                                const match = text.match(/^(\d+)\s+(.+?)(?:\s*\([^)]+\))?$/);

                                if (match) {
                                    const qty = parseInt(match[1]);
                                    let cardName = match[2].trim();

                                    // Extract full name without quantity (includes reference)
                                    const fullName = text.replace(/^\d+\s+/, '');

                                    // Remove set information at the end if present (format: NAME SET NUM)
                                    // For example: "Iono PAL 185" -> "Iono"
                                    cardName = cardName.replace(/\s+[A-Z]{2,}\s+\d+\s*$/, '');

                                    console.log(`[BetterLimitless] Card found: ${cardName} x${qty} [${currentCategory}]`);

                                    cardsInThisTournament.add(cardName); // Add to Set

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
                console.log(`[BetterLimitless] Total unique cards found on this page: ${totalCards}`);
                console.log('[BetterLimitless] Extracted data:', cardData);
                return { cardData, cardsInThisTournament, decklistCount: decklistDivs.length };
            } catch (error) {
                console.error(`[BetterLimitless] Error parsing ${url}:`, error);
                return { cardData: {}, cardsInThisTournament: new Set(), decklistCount: 0 };
            }
        }

        // Function to merge card data with their categories
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

        // Function to analyze all tournaments
        async function analyzeTournaments() {
            const button = document.getElementById('analyze-tournaments-btn');
            const statusDiv = document.getElementById('tournament-status');

            if (!button || !statusDiv) return;

            button.disabled = true;
            statusDiv.textContent = 'Analysis in progress...';
            statusDiv.style.color = '#ffa500';

            // Get all tournament links that contain an <i> with class "fa-list-alt"
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

            console.log('[BetterLimitless] Tournament links found:', tournamentLinks);

            if (tournamentLinks.length === 0) {
                statusDiv.textContent = 'No tournaments found';
                statusDiv.style.color = '#ff4444';
                button.disabled = false;
                return;
            }

            statusDiv.textContent = `Analyzing ${tournamentLinks.length} tournament(s)...`;

            const allCardData = {};
            const cardTournamentCount = {}; // Count the number of tournaments where each card appears
            let totalDecklists = 0; // Count the total number of decklists analyzed
            let processed = 0;

            // Analyze each tournament
            for (const url of tournamentLinks) {
                const result = await parseTournamentPage(url);
                mergeCardData(allCardData, result.cardData);
                totalDecklists += result.decklistCount;

                // Count tournaments where each card appears
                result.cardsInThisTournament.forEach(cardName => {
                    if (!cardTournamentCount[cardName]) {
                        cardTournamentCount[cardName] = 0;
                    }
                    cardTournamentCount[cardName]++;
                });

                processed++;
                statusDiv.textContent = `Analyzed ${processed}/${tournamentLinks.length} tournaments...`;
            }

            // Display results
            displayResults(allCardData, cardTournamentCount, totalDecklists);

            statusDiv.textContent = `Analysis complete: ${tournamentLinks.length} tournament(s) analyzed`;
            statusDiv.style.color = '#44ff44';
            button.disabled = false;
        }

        // Function to distribute categories in columns in a balanced way
        function distributeCategories(categoriesData) {
            // categoriesData is an array of {category, lineCount, html}
            // Sort by decreasing line count (first-fit decreasing algorithm)
            const sortedCategories = [...categoriesData].sort((a, b) => b.lineCount - a.lineCount);

            // Initialize 3 columns
            const columns = [
                { categories: [], totalLines: 0 },
                { categories: [], totalLines: 0 },
                { categories: [], totalLines: 0 }
            ];

            // Distribute each category in the column with the fewest lines
            sortedCategories.forEach(categoryData => {
                // Find the column with the fewest lines
                let minColumn = columns[0];
                for (let i = 1; i < columns.length; i++) {
                    if (columns[i].totalLines < minColumn.totalLines) {
                        minColumn = columns[i];
                    }
                }

                // Add the category to this column
                minColumn.categories.push(categoryData);
                minColumn.totalLines += categoryData.lineCount;
            });

            return columns;
        }

        // Function to generate an automatic decklist with cards >50%, grouped by category
        function generateAutoDecklist(cardData, totalDecklists) {
            const autoDecklistByCategory = {};

            // For each card, find the most represented quantity that exceeds 50%
            for (const cardName in cardData) {
                const category = cardData[cardName].category;
                const quantities = cardData[cardName].quantities;
                let bestQty = null;
                let bestPercentage = 0;

                // Go through all quantities for this card
                for (const qty in quantities) {
                    const count = quantities[qty];
                    const percentage = (count / totalDecklists) * 100;

                    // Keep the quantity with the highest percentage that exceeds 50%
                    if (percentage > 50 && percentage > bestPercentage) {
                        bestQty = parseInt(qty);
                        bestPercentage = percentage;
                    }
                }

                // If a quantity exceeds 50%, add it to the decklist
                if (bestQty !== null) {
                    if (!autoDecklistByCategory[category]) {
                        autoDecklistByCategory[category] = [];
                    }
                    // Clean the fullName to remove the original quantity
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

            // Sort cards in each category by name
            for (const category in autoDecklistByCategory) {
                autoDecklistByCategory[category].sort((a, b) => a.name.localeCompare(b.name));
            }

            return autoDecklistByCategory;
        }

        // Function to display the automatic decklist grouped by category
        function displayAutoDecklist(autoDecklistByCategory) {
            // Get the main flex container
            let flexContainer = document.getElementById('tournament-flex-container');

            let autoDecklistDiv = document.getElementById('auto-decklist');

            if (!autoDecklistDiv) {
                autoDecklistDiv = document.createElement('div');
                autoDecklistDiv.id = 'auto-decklist';
                autoDecklistDiv.style.width = '100%';
                autoDecklistDiv.style.padding = '15px';
                autoDecklistDiv.style.backgroundColor = '#1a1a1a';
                autoDecklistDiv.style.border = '1px solid #444';
                autoDecklistDiv.style.borderRadius = '4px';

                if (flexContainer) {
                    flexContainer.appendChild(autoDecklistDiv);
                }
            }

            if (Object.keys(autoDecklistByCategory).length === 0) {
                autoDecklistDiv.innerHTML = '<h3 style="color: #f0f0f0; margin-bottom: 15px;">Automatic Decklist</h3>' +
                    '<p style="color: #ffa500;">No card exceeds 50% presence in the analyzed decklists.</p>';
                return;
            }

            // Calculate total cards
            let totalCards = 0;
            for (const category in autoDecklistByCategory) {
                totalCards += autoDecklistByCategory[category].reduce((sum, card) => sum + card.quantity, 0);
            }

            // Create HTML content
            let html = '<h3 style="color: #f0f0f0; margin-bottom: 15px;">Automatic Decklist (cards >50%)</h3>';
            html += `<p style="color: #aaa; margin-bottom: 10px;">Total: ${totalCards} cards</p>`;

            // Button to copy the decklist
            html += '<button id="copy-decklist-btn" style="background-color: #2563eb; color: #f0f0f0; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-bottom: 15px; font-weight: 500;">Copy Decklist</button>';
            html += '<span id="copy-status" style="margin-left: 10px; color: #44ff44;"></span>';

            // Prepare data for each category
            const categoriesData = [];
            const sortedCategories = Object.keys(autoDecklistByCategory).sort();

            sortedCategories.forEach((category) => {
                // Calculate total number of cards in this category
                const categoryTotal = autoDecklistByCategory[category].reduce((sum, card) => sum + card.quantity, 0);

                // Number of lines = number of cards in this category
                const categoryLineCount = autoDecklistByCategory[category].length;

                // Build HTML for this category
                let categoryHtml = '';
                categoryHtml += '<div class="cards">';
                categoryHtml += `<div class="heading">${category} (${categoryTotal})</div>`;

                // Display cards in this category
                autoDecklistByCategory[category].forEach(card => {
                    const cardNameDisplay = card.href
                        ? `<a href="${card.href}" target="_blank">${card.quantity} ${card.fullName}</a>`
                        : `${card.quantity} ${card.fullName}`;
                    categoryHtml += `<p style='display: flex; justify-content: space-between; align-items: center'>${cardNameDisplay} <span style="color: #888;">${card.percentage.toFixed(0)}%</span></p>`;
                });

                categoryHtml += '</div>'; // Close .cards

                categoriesData.push({
                    category: category,
                    lineCount: categoryLineCount,
                    html: categoryHtml
                });
            });

            // Distribute categories in columns in a balanced way
            const columns = distributeCategories(categoriesData);

            // Use Limitless TCG native structure
            html += '<div class="decklist">';

            // Generate HTML for each column
            columns.forEach(column => {
                html += '<div class="column">';
                column.categories.forEach(categoryData => {
                    html += categoryData.html;
                });
                html += '</div>'; // Close .column
            });

            html += '</div>'; // Close .decklist
            autoDecklistDiv.innerHTML = html;

            // Add event to copy the decklist
            setTimeout(() => {
                const copyBtn = document.getElementById('copy-decklist-btn');
                const copyStatus = document.getElementById('copy-status');

                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        // Generate decklist text with categories
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
                            copyStatus.textContent = 'Copied!';
                            copyStatus.style.color = '#44ff44';
                            setTimeout(() => {
                                copyStatus.textContent = '';
                            }, 2000);
                        }).catch(err => {
                            copyStatus.textContent = 'Copy error';
                            copyStatus.style.color = '#ff4444';
                            console.error('[BetterLimitless] Copy error:', err);
                        });
                    });
                }
            }, 0);
        }

        // Function to display results grouped by category
        function displayResults(cardData, cardTournamentCount, totalDecklists) {
            console.log('[BetterLimitless] Displaying results with data:', cardData);
            console.log('[BetterLimitless] Number of cards to display:', Object.keys(cardData).length);
            console.log('[BetterLimitless] Total decklists analyzed:', totalDecklists);

            // Create or get the main flex container
            let flexContainer = document.getElementById('tournament-flex-container');

            if (!flexContainer) {
                flexContainer = document.createElement('div');
                flexContainer.id = 'tournament-flex-container';
                flexContainer.style.display = 'flex';
                flexContainer.style.flexDirection = 'column';
                flexContainer.style.gap = '20px';
                flexContainer.style.marginTop = '20px';

                const container = document.querySelector('.player-nav');
                if (container) {
                    container.parentElement.insertBefore(flexContainer, container.nextSibling);
                }
            }

            // Create or get the results div
            let resultsDiv = document.getElementById('tournament-results');

            if (!resultsDiv) {
                resultsDiv = document.createElement('div');
                resultsDiv.id = 'tournament-results';
                resultsDiv.style.width = '100%';
                resultsDiv.style.padding = '15px';
                resultsDiv.style.backgroundColor = '#1a1a1a';
                resultsDiv.style.border = '1px solid #444';
                resultsDiv.style.borderRadius = '4px';

                flexContainer.appendChild(resultsDiv);
            }

            // Group cards by category
            const cardsByCategory = {};
            for (const cardName in cardData) {
                const category = cardData[cardName].category;
                if (!cardsByCategory[category]) {
                    cardsByCategory[category] = [];
                }
                cardsByCategory[category].push(cardName);
            }

            // Sort categories and cards
            const sortedCategories = Object.keys(cardsByCategory).sort();

            let html = '<h3 style="color: #f0f0f0; margin-bottom: 15px;">Analysis Results</h3>';

            // Prepare data for each category
            const categoriesData = [];

            sortedCategories.forEach(category => {
                // Count total lines in this category (one line per card+quantity combination)
                let categoryLineCount = 0;
                const sortedCards = cardsByCategory[category].sort();
                let categoryHtml = '';

                categoryHtml += '<div class="cards">';
                categoryHtml += `<div class="heading">${category} (${categoryLineCount})</div>`;

                // Build HTML for cards in this category
                sortedCards.forEach(cardName => {
                    const card = cardData[cardName];
                    const quantities = card.quantities;
                    const sortedQtys = Object.keys(quantities).sort((a, b) => parseInt(b) - parseInt(a));

                    sortedQtys.forEach(qty => {
                        const count = quantities[qty];
                        categoryLineCount++;

                        // Calculate percentage relative to total number of analyzed decklists
                        const percentage = ((count / totalDecklists) * 100).toFixed(0);

                        // Clean fullName to remove original quantity
                        const nameWithoutQty = card.fullName.replace(/^\d+\s+/, '');
                        const cardDisplay = card.href
                            ? `<a href="${card.href}" target="_blank">${qty} ${nameWithoutQty}</a>`
                            : `${qty} ${nameWithoutQty}`;
                        categoryHtml += `<p style='display: flex; justify-content: space-between; align-items: center'>${cardDisplay} <span style="color: #888;">${percentage}%</span></p>`;
                    });
                });

                categoryHtml += '</div>'; // Close .cards

                // Update heading with correct count
                categoryHtml = categoryHtml.replace(`(${0})`, `(${categoryLineCount})`);

                categoriesData.push({
                    category: category,
                    lineCount: categoryLineCount,
                    html: categoryHtml
                });
            });

            // Distribute categories in columns in a balanced way
            const columns = distributeCategories(categoriesData);

            // Use Limitless TCG native structure
            html += '<div class="decklist">';

            // Generate HTML for each column
            columns.forEach(column => {
                html += '<div class="column">';
                column.categories.forEach(categoryData => {
                    html += categoryData.html;
                });
                html += '</div>'; // Close .column
            });

            html += '</div>'; // Close .decklist
            resultsDiv.innerHTML = html;

            // Generate and display automatic decklist
            const autoDecklist = generateAutoDecklist(cardData, totalDecklists);
            displayAutoDecklist(autoDecklist);
        }

        // Create analysis button
        function createAnalyzeButton() {
            // Don't display the button if URL contains "matchups"
            if (window.location.href.includes('matchups')) {
                console.log('[BetterLimitless] Button not displayed because URL contains "matchups"');
                return;
            }

            // Check if button already exists to avoid duplicates
            if (document.getElementById('analyze-tournaments-btn')) {
                console.log('[BetterLimitless] Button already created, skipping');
                return;
            }

            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.alignItems = 'center';
            buttonContainer.style.padding = '12px';
            buttonContainer.style.gap = '10px';

            const button = document.createElement('button');
            button.id = 'analyze-tournaments-btn';
            button.textContent = 'Analyze Decklists';
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
            console.log('[BetterLimitless] Button created successfully');
        }

        // Function to initialize the button robustly
        function initializeButton() {
            // Try to create the button immediately
            const parentInPage = document.querySelector('.player-nav');
            if (parentInPage) {
                console.log('[BetterLimitless] player-nav found immediately');
                createAnalyzeButton();
                return;
            }

            // If the element doesn't exist yet, use a MutationObserver
            console.log('[BetterLimitless] player-nav not found, using MutationObserver');
            const observer = new MutationObserver((mutations, obs) => {
                const parentInPage = document.querySelector('.player-nav');
                if (parentInPage) {
                    console.log('[BetterLimitless] player-nav detected by MutationObserver');
                    createAnalyzeButton();
                    obs.disconnect(); // Stop observing once the button is created
                }
            });

            // Observe changes in the DOM
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Safety timeout after 10 seconds
            setTimeout(() => {
                observer.disconnect();
                console.log('[BetterLimitless] MutationObserver stopped after timeout');
            }, 10000);
        }

        // Start initialization as soon as the DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeButton);
        } else {
            // DOM is already loaded
            initializeButton();
        }
    })();
});
