chrome.storage?.sync.get('availabilityConfig', (data) => {
    if (data.availabilityHighlighterEnabled === false) {
        console.log('[BetterLimitless] Availability highlighter script disabled');
        return;
    }

    const availability = data.availabilityConfig || {};

    const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(":").map(Number);
        return hours * 60 + minutes;
    };

    const isInInterval = (dateStr) => {
        const date = new Date(dateStr);
        const day = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
        const time = date.getHours() * 60 + date.getMinutes();

        const intervals = availability[day];
        if (!intervals || !Array.isArray(intervals)) return false;

        return intervals.some(({ start, end }) => {
            const startMin = timeToMinutes(start);
            const endMin = timeToMinutes(end);
            return time >= startMin && time <= endMin;
        });
    };

    const highlightRows = () => {
        document.querySelectorAll("table").forEach((table) => {
            table.querySelectorAll("tr[data-date]").forEach((row) => {
                const date = row.getAttribute("data-date");
                if (!date) return;

                const dateObj = new Date(date);
                const userLocale = navigator.language;
                const day = dateObj.toLocaleDateString(userLocale, { weekday: "long" });
                const capitalizedDay = day.charAt(0).toUpperCase() + day.slice(1);

                const dateCell = row.querySelector("td.date");
                if (dateCell) {
                    dateCell.textContent = `${capitalizedDay} ${dateCell.textContent}`;
                }

                const inRange = isInInterval(date);
                row.querySelectorAll("td").forEach((cell) => {
                    cell.style.backgroundColor = inRange ? "#308f5a" : "#CC4444";
                });
            });
        });
    };

    window.addEventListener("load", () => {
        highlightRows();
        console.log("[BetterLimitless] AvailabilityHighlighter executed");
    });
});
