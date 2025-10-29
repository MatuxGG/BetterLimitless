chrome.storage?.sync.get('matchThresholdEnabled', (data) => {
    if (data.matchThresholdEnabled === false) {
        console.log('[BetterLimitless] Match threshold script disabled');
        return;
    }

    (function () {
        'use strict';

        console.log('[BetterLimitless] Match threshold script loaded');

        // Configuration
        const columnTitle = "Matches";
        const defaultThreshold = 20;

        // Main function to filter rows
        function filterRows(threshold) {
            const tables = document.querySelectorAll('table');
            tables.forEach(table => {
                const tbody = table.querySelector('tbody');
                if (!tbody) return;

                const headerRow = tbody.querySelector('tr:first-child');
                if (!headerRow) return;

                const headerCells = headerRow.querySelectorAll('td, th');
                let columnIndex = -1;

                headerCells.forEach((cell, index) => {
                    if (cell.textContent.trim() === columnTitle) {
                        columnIndex = index;
                    }
                });

                if (columnIndex === -1) return;

                const rows = Array.from(tbody.querySelectorAll('tr')).slice(1);
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td, th');
                    const cellValue = parseFloat(cells[columnIndex].textContent.trim());
                    if (!isNaN(cellValue) && cellValue < threshold) {
                        row.style.display = 'none';
                    } else {
                        row.style.display = '';
                    }
                });
            });
        }

        // Create input field
        function createThresholdInput() {
            const inputContainer = document.createElement('div');
            inputContainer.style.display = 'flex';
            inputContainer.style.alignItems = 'center';
            inputContainer.style.padding = '12px';

            const label = document.createElement('label');
            label.textContent = 'Minimum matches: ';
            label.style.color = '#f0f0f0';

            const input = document.createElement('input');
            input.type = 'number';
            input.value = defaultThreshold;
            input.style.backgroundColor = 'transparent';
            input.style.color = '#f0f0f0';
            input.style.border = '1px solid #444';
            input.style.marginLeft = '8px';
            input.style.width = '60px';

            label.appendChild(input);
            inputContainer.appendChild(label);

            const parentInPage = document.getElementsByClassName('player-nav')[0];
            if (!parentInPage) {
                console.warn('[BetterLimitless] player-nav not found');
                return;
            }

            parentInPage.appendChild(inputContainer);

            input.addEventListener('input', function () {
                const newThreshold = parseFloat(input.value);
                if (!isNaN(newThreshold)) {
                    filterRows(newThreshold);
                }
            });

            filterRows(defaultThreshold);
        }

        // Launch the script when the page is loaded
        window.addEventListener('load', () => {
            console.log('[BetterLimitless] Initializing match threshold input');
            createThresholdInput();
        });
    })();

});

