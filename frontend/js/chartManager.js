// js/chartManager.js
import { CONFIG } from './config.js';

export class ChartManager {
    constructor() {
        this.chart = null;
    }

    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    create(ctx, stats) {
        if (!ctx || !stats) return;

        this.destroy();

        const ratingCounts = {
            r5: 0, r4: 0, r3: 0, r2: 0, r1: 0
        };

        stats.forEach(item => {
            ratingCounts.r5 += (item.rating_5_count || 0);
            ratingCounts.r4 += (item.rating_4_count || 0);
            ratingCounts.r3 += (item.rating_3_count || 0);
            ratingCounts.r2 += (item.rating_2_count || 0);
            ratingCounts.r1 += (item.rating_1_count || 0);
        });

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['5점', '4점', '3점', '2점', '1점'],
                datasets: [{
                    label: '별점 분포',
                    data: Object.values(ratingCounts),
                    backgroundColor: Object.values(CONFIG.CHART_COLORS),
                    borderRadius: 8,
                    maxBarThickness: 50
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: { size: 14 },
                        bodyFont: { size: 13 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }
}