document.addEventListener('DOMContentLoaded', () => {
    const toggles = document.querySelectorAll('.module-toggle');

    // Charger tous les états depuis le storage
    chrome.storage.sync.get(null, (storageData) => {
        toggles.forEach(toggle => {
            const module = toggle.dataset.module;
            const key = `${module}Enabled`;
            toggle.checked = storageData[key] !== false; // true par défaut
        });
    });

    // Écoute tous les changements
    toggles.forEach(toggle => {
        toggle.addEventListener('change', () => {
            const module = toggle.dataset.module;
            const key = `${module}Enabled`;
            const value = toggle.checked;
            chrome.storage.sync.set({ [key]: value });
        });
    });

    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const container = document.getElementById('availability-container');

    const defaultConfig = {
        monday: [{ start: "08:00", end: "20:00" }],
        tuesday: [{ start: "08:00", end: "20:00" }],
        wednesday: [{ start: "08:00", end: "20:00" }],
        thursday: [{ start: "08:00", end: "20:00" }],
        friday: [{ start: "08:00", end: "20:00" }],
        saturday: [{ start: "08:00", end: "20:00" }],
        sunday: [{ start: "08:00", end: "20:00" }]
    };

    function buildAvailabilityForm(config) {
        container.innerHTML = '';
        days.forEach(day => {
            const row = document.createElement('div');
            row.className = 'availability-row';

            const label = document.createElement('label');
            label.textContent = day.charAt(0).toUpperCase() + day.slice(1);

            const startInput = document.createElement('input');
            startInput.type = 'time';
            startInput.value = (config[day]?.[0]?.start) || '08:00';

            const endInput = document.createElement('input');
            endInput.type = 'time';
            endInput.value = (config[day]?.[0]?.end) || '20:00';

            row.appendChild(label);
            row.appendChild(startInput);
            row.appendChild(endInput);
            container.appendChild(row);

            // Sauvegarde fiable avec clone
            [startInput, endInput].forEach(input => {
                input.addEventListener('change', () => {
                    chrome.storage.sync.get('availabilityConfig', (data) => {
                        const current = structuredClone(data.availabilityConfig || defaultConfig);
                        current[day] = [{ start: startInput.value, end: endInput.value }];
                        chrome.storage.sync.set({ availabilityConfig: current }, () => {
                            console.log(`[BetterLimitless] Sauvegardé: ${day}`, current[day]);
                        });
                    });
                });
            });
        });
    }

    chrome.storage.sync.get('availabilityConfig', (data) => {
        buildAvailabilityForm(data.availabilityConfig || defaultConfig);
    });
});

