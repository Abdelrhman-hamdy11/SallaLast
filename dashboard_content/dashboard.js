// This function will be called by your main router when the dashboard page is loaded
function initDashboardPage() {
    const container = document.getElementById('main-content');
    if (!container) {
        console.error("Dashboard container not found!");
        return;
    }

    const salaToken = localStorage.getItem("salla_access_token");
    if (!salaToken) {
        container.innerHTML = `<p class="text-center text-red-500 p-10">خطأ: توكن سلة غير موجود. يرجى إعادة تسجيل الدخول.</p>`;
        return;
    }
    const token = "Bearer " + salaToken;
    
    // --- Helper function to fetch all pages from a Salla endpoint ---
    async function fetchAllSallaData(endpoint) {
        let page = 1, allData = [], hasMore = true;
        while (hasMore) {
            const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}&per_page=50`;
            const response = await fetch(url, { headers: { Authorization: token, Accept: "application/json" } });
            if (!response.ok) {
                if (response.status === 401) throw new Error("Unauthorized: Invalid Salla Token.");
                throw new Error(`API request failed with status ${response.status}`);
            }
            const result = await response.json();
            if (result.data && result.data.length > 0) {
                allData = allData.concat(result.data);
                page++;
                hasMore = result.pagination && page <= result.pagination.totalPages;
            } else {
                hasMore = false;
            }
        }
        return allData;
    }

    // --- Main function to update all dashboard data ---
    async function updateDashboardData() {
        // Show a loading state
        container.querySelector('#metric-total-orders').textContent = '...';
        container.querySelector('#metric-total-sales').textContent = '...';
        
        try {
            // --- Fetch all orders for the current year ---
            const today = new Date();
            const startOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
            const endOfToday = today.toISOString().split('T')[0];

            const ordersEndpoint = `https://api.salla.dev/admin/v2/orders?created_at_min=${startOfYear}&created_at_max=${endOfToday}`;
            const allOrders = await fetchAllSallaData(ordersEndpoint);

            // --- Process Data for Metrics and Chart ---
            const monthlySales = Array(12).fill(0);
            let totalSalesAllTime = 0;
            let totalOrdersAllTime = allOrders.length;
            let ordersToday = 0;
            let ordersShipping = 0;
            let cancelledOrdersLast7Days = 0;
            
            const validSaleStatuses = ["delivered", "completed", "in_progress", "delivering", "تم التنفيذ", "جاري التوصيل", "تم التوصيل"];
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 7);

            allOrders.forEach(order => {
                const orderDate = new Date(order.date.date);
                const orderStatus = order.status.slug || order.status.name;
                const orderAmount = order.total.amount || 0;
                
                // Calculate total sales
                if (validSaleStatuses.includes(orderStatus)) {
                    totalSalesAllTime += orderAmount;
                    const month = orderDate.getMonth(); // 0 for Jan, 1 for Feb, etc.
                    monthlySales[month] += orderAmount;
                }
                
                // Calculate stats
                if (orderDate.toISOString().split('T')[0] === endOfToday) {
                    ordersToday++;
                }
                if (orderStatus === "in_progress" || orderStatus === "delivering" || orderStatus === "جاري التوصيل") {
                    ordersShipping++;
                }
                if ((orderStatus === "canceled" || orderStatus === "ملغي") && orderDate >= sevenDaysAgo) {
                    cancelledOrdersLast7Days++;
                }
            });

            // --- Update UI Elements ---
            const email = localStorage.getItem('user_email') || localStorage.getItem('sala_admin_email');
            container.querySelector('#welcome-user-name').textContent = email ? email.split('@')[0] : '[المستخدم]';
            container.querySelector('#metric-total-orders').textContent = totalOrdersAllTime.toLocaleString('ar-EG');
            container.querySelector('#metric-total-sales').textContent = totalSalesAllTime.toLocaleString('ar-EG', { minimumFractionDigits: 2 });
            container.querySelector('#total-sales-year').textContent = totalSalesAllTime.toLocaleString('ar-EG', { style: 'currency', currency: 'SAR' });
            container.querySelector('#stats-orders-today').textContent = ordersToday;
            container.querySelector('#stats-orders-shipping').textContent = ordersShipping;
            container.querySelector('#stats-total-customers').textContent = (await fetchAllSallaData('https://api.salla.dev/admin/v2/customers')).length;
            container.querySelector('#stats-cancelled-orders').textContent = cancelledOrdersLast7Days;

            // --- Render the Sales Chart with the processed data ---
            renderSalesChart(monthlySales);

        } catch (error) {
            console.error("Failed to update dashboard:", error);
            container.innerHTML = `<div class="p-10 text-center text-red-500"><h2>حدث خطأ أثناء تحميل بيانات لوحة التحكم.</h2><p class="mt-2 text-sm">${error.message}</p></div>`;
        }
    }

    // --- Function to render the sales chart ---
    function renderSalesChart(monthlyData) {
        const ctx = container.querySelector('#sales-chart')?.getContext('2d');
        if (!ctx) return;
        
        // Destroy the old chart instance if it exists
        if (window.salesChart instanceof Chart) {
            window.salesChart.destroy();
        }

        const chartData = {
            labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
            datasets: [{
                label: 'المبيعات (ر.س)',
                data: monthlyData,
                borderColor: '#a855f7', // Purple line
                backgroundColor: 'rgba(168, 85, 247, 0.1)', // Light purple fill
                borderWidth: 3,
                tension: 0.4, // For the curve
                fill: true, // Fill area under the line
            }]
        };

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { 
                    beginAtZero: true, 
                    ticks: { color: '#9ca3af' }, 
                    grid: { color: 'rgba(156, 163, 175, 0.1)' } 
                },
                x: { 
                    ticks: { color: '#9ca3af' }, 
                    grid: { display: false } 
                }
            }
        };

        window.salesChart = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: chartOptions,
        });
    }

    // --- Start Execution ---
    updateDashboardData();
}