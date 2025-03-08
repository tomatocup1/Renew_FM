// frontend/js/utils.js
export const utils = {
    formatDate(date) {
        if (!date) return '-';
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    formatNumber(num) {
        return num?.toLocaleString() ?? '0';
    },

    calculateAverage(data, key) {
        if (!data?.length) return 0;
        const sum = data.reduce((acc, item) => acc + (item[key] || 0), 0);
        return (sum / data.length).toFixed(1);
    },

    getStatusBadge(status, statusBadges) {
        const statusClass = statusBadges[status] || 'pending';
        return `<span class="status-badge ${statusClass}">${status || '미답변'}</span>`;
    }
};