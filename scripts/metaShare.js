chrome.storage?.sync.get('metaShareEnabled', (data) => {
  if (data.metaShareEnabled === false) {
    console.log('[BetterLimitless] MetaShare disabled');
    return;
  }

  // L'ancien contenu de metaShare.js commence ici ↓
  (function () {
    'use strict';

    console.log('[BetterLimitless] Script loaded');

    function loadChartJS(callback) {
      if (window.Chart) {
        console.log('[BetterLimitless] Chart.js already loaded');
        callback();
        return;
      }

      console.log('[BetterLimitless] Loading Chart.js from CDN...');
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/chart.umd.js');
      script.onload = () => {
        console.log('[BetterLimitless] Chart.js loaded');
        callback();
      };
      script.onerror = () => {
        console.error('[BetterLimitless] Failed to load Chart.js');
      };
      document.head.appendChild(script);
    }

    function waitForMetaTable(callback) {
      console.log('[BetterLimitless] Waiting for .meta table...');
      const interval = setInterval(() => {
        const table = document.querySelector('table.meta');
        if (table) {
          clearInterval(interval);
          console.log('[BetterLimitless] .meta table found');
          callback(table);
        }
      }, 500);
    }

    function parseMetaTable(table) {
      console.log('[BetterLimitless] Parsing table...');
      const rows = table.querySelectorAll('tbody tr');
      const rawData = [];

      rows.forEach((row, index) => {
        if (index === 0) return; // Skip the header row

        const deck = row.querySelector('td:nth-child(3)')?.innerText.trim();
        const shareAttr = row.getAttribute('data-share');
        const share = parseFloat(shareAttr);

        if (deck && !isNaN(share)) {
          rawData.push({ deck, share });
        }
      });

      // Séparer les decks >= 1% et < 1%
      const mainDecks = [];
      let othersShare = 0;

      rawData.forEach(({ deck, share }) => {
        if (share >= 0.01) {
          mainDecks.push({ deck, share });
        } else {
          othersShare += share;
        }
      });

      if (othersShare > 0) {
        mainDecks.push({ deck: 'Others', share: othersShare });
      }

      const labels = mainDecks.map(d => d.deck);
      const values = mainDecks.map(d => d.share);

      console.log('[BetterLimitless] Parsed labels:', labels);
      console.log('[BetterLimitless] Parsed values:', values);
      return { labels, values };
    }

    function createChartNextToTable(table) {
      const container = document.createElement('div');
      container.style.width = '100%';
      //container.style.maxWidth = '600px';
      container.style.height = '1000px';
      container.style.marginTop = '20px';

      const canvas = document.createElement('canvas');
      canvas.id = 'deckPieChart';
      container.appendChild(canvas);

      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'row';
      wrapper.style.flexWrap = 'wrap';
      wrapper.style.gap = '20px';
      wrapper.style.marginTop = '20px';
      wrapper.style.marginBottom = '20px';

      // Appliquer un comportement responsive : colonne sur petits écrans
      wrapper.style.flexDirection = window.innerWidth < 768 ? 'column' : 'row';

      const tableParent = table.parentNode;
      tableParent.insertBefore(wrapper, table);
      wrapper.appendChild(table);
      wrapper.appendChild(container);

      return canvas;
    }

    function renderChart(labels, values, canvas) {
      console.log('[BetterLimitless] Rendering chart...');
      Chart.register(ChartDataLabels); // <<< important
      new Chart(canvas, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: labels.map((_, i) => `hsl(${i * 30 % 360}, 70%, 60%)`)
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right'
            },
            title: {
              display: true,
              text: '',
              align: 'start',
              padding: {
                top: 10,
                bottom: 20
              },
              font: {
                size: 18
              }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  const label = context.label || '';
                  const value = context.raw * 100;
                  return `${label}: ${value.toFixed(2)}%`;
                }
              }
            },
            datalabels: {
              color: '#fff',
              font: {
                weight: 'bold',
                size: 12
              },
              formatter: (value, context) => context.chart.data.labels[context.dataIndex],
            }
          }
        }
      });
      console.log('[BetterLimitless] Chart rendered');
    }

    loadChartJS(() => {
      console.log('[BetterLimitless] Starting table scan...');
      waitForMetaTable(table => {
        const { labels, values } = parseMetaTable(table);
        if (labels.length > 0 && values.length > 0) {
          const canvas = createChartNextToTable(table);
          renderChart(labels, values, canvas);
        } else {
          console.warn('[BetterLimitless] No valid data found to render chart');
        }
      });
    });

  })();
});
