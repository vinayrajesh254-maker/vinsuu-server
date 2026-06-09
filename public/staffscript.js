const API = window.location.origin + "/api";
let token = localStorage.getItem("staffToken");
let lastRequestCount = 0;
let openedFormId = null;
let isUnitPopupOpen = false;
let sectionState = JSON.parse(localStorage.getItem("sectionState") || "{}");

console.log("TOKEN IN STAFF.HTML:", token);
let socket;

document.addEventListener("DOMContentLoaded", () => {
    console.log("TOKEN:", token);
    if (!token) { alert("Please login first"); window.location.href = "login.html"; return; }
    connectSocket();
    Promise.all([
        loadProfile(),
        loadRequests()
    ]);
    setInterval(() => { if (!openedFormId && !isUnitPopupOpen) loadRequests(); }, 15000);
});

function connectSocket() {
    try {
        socket = io(window.location.origin);
        console.log("Socket connected");
        socket.on("new_request", () => { loadRequests(); });
    } catch (err) { console.log("Socket error:", err); }
}

// ── PROFILE ──
async function loadProfile() {
    if (isUnitPopupOpen) return;
    let user = {};
    try {
        const res = await fetch(API + "/staff/profile", { headers: { Authorization: "Bearer " + localStorage.getItem("staffToken") } });
        if (res.ok) user = await res.json();
    } catch (err) { console.log("Profile API failed:", err); }
    if (!user.name) { const localUser = JSON.parse(localStorage.getItem("staffUser") || "{}"); user = { ...localUser, ...user }; }
    if (!user.name) { document.getElementById("profileBox").innerHTML = `<div class="noData"><div class="noDataIcon">👤</div><p>No profile data</p></div>`; return; }
    const firstLetter = user.name.charAt(0).toUpperCase();
    document.getElementById("profileBox").innerHTML = `
            <div class="profileCard">
                <div class="profileTop">
                    <div class="profileLeft">
                        <div class="profilePic">
    ${user.profile_image
            ? `<img src="${user.profile_image.startsWith('http')
                ? user.profile_image
                : user.profile_image.startsWith('data:')
                    ? user.profile_image
                    : window.location.origin + user.profile_image
            }?t=${Date.now()}">`
            : firstLetter
        }
</div>
                        <div>
                            <div class="profileName">${user.name}</div>
                            <div class="profileMobile">📞 ${user.mobile}</div>
                            <div class="profileRatingRow">
                                Rating <span class="profileRatingStars" id="avgRating"></span>
                                <span class="profileRatingCount" id="ratingCount"></span>
                            </div>
                            <span class="feedbackLink" onclick="openFeedbackPage()">Feedback</span>
                        </div>
                    </div>
                    <div class="unitBalanceBox" onclick="openUnitPopup(event)">
                        <div class="unitBalanceLabel">Unit Balance</div>
                        <div class="unitBalanceValue"><span>⭐</span><span>${user.unit_balance || 0}</span></div>
                    </div>
                </div>
                <div class="profileBtns">
                    <button class="profileBtn profileBtnPrimary" onclick="openProfilePage()">🪪 View Profile</button>
                    <button class="profileBtn profileBtnOutline" onclick="logout()">↩ Log out</button>
                </div>
            </div>`;
    loadRating();
}

function openProfilePage() { window.location.href = "staff-register.html?mode=view"; }

// ── REQUESTS ──
let allRequests = [];
let currentTab = "pending";

async function loadRequests() {
    try {
        const res = await fetch(API + "/staff/pending", { headers: { "Authorization": "Bearer " + token } });
        if (!res.ok) { document.getElementById("requests").innerHTML = `<div class="noData"><div class="noDataIcon">📋</div><p>No data</p></div>`; return; }
        allRequests = await res.json();
        console.log("API RESPONSE:", allRequests);
        if (allRequests.length > lastRequestCount && lastRequestCount !== 0) { document.getElementById("notifySound").play(); alert("🔔 New Service Request Received!"); }
        lastRequestCount = allRequests.length;
        loadStaffRequests();
    } catch (err) { console.error(err); document.getElementById("requests").innerHTML = `<div class="noData"><div class="noDataIcon">⚠️</div><p>Error loading data</p></div>`; }
}

async function loadStaffRequests() {
    const container = document.getElementById("requests");
    container.innerHTML = "";
    const filtered = allRequests.filter(r => {
        const s = (r.status || "").toLowerCase();
        if (currentTab === "pending") return ["pending", "accepted", "waiting_customer_confirm", "otp_pending", "in_progress"].includes(s);
        if (currentTab === "completed") return s === "completed";
    });
    if (filtered.length === 0) { container.innerHTML = `<div class="noData"><div class="noDataIcon">📭</div><p>No data</p></div>`; return; }

    filtered.forEach(req => {
        const card = document.createElement("div");
        card.className = "requestCard";
        const status = (req.status || "").toLowerCase();
        const isActive = ["accepted", "waiting_customer_confirm", "otp_pending", "in_progress"].includes(status);
        const savedPayment = JSON.parse(localStorage.getItem("savedPayment_" + req.id) || "null");

        // Card HTML
        card.innerHTML = `
                <div class="cardTopRow">
                    <div class="cardServiceNo">
                        <div class="cardServiceIcon">📋</div>
                        <span class="cardServiceLabel">Service No. ${req.id}</span>
                    </div>
                    <span class="cardTimeAgo">${timeAgo(req.created_at)}</span>
                </div>
                <div class="infoGrid">
                    <span class="infoLabel">Name:</span>          <span class="infoVal">${req.customer_name || "-"}</span>
                    <span class="infoLabel">Service name:</span>  <span class="infoVal">${req.service_name || "-"}</span>
                    <span class="infoLabel">Distance:</span>      <span class="infoVal">${parseFloat(req.distance).toFixed(1)} km</span>
                    <span class="infoLabel">Price:</span>         <span class="infoVal">${req.service_type === "price" ? `₹ ${req.price}` : `${req.unit_cost || 0} Unit Balance`}</span>
                    <span class="infoLabel">Pin code & location:</span> <span class="infoVal">${req.pincode}, ${req.location}</span>
                    <span class="infoLabel">Service heading:</span>     <span class="infoVal">${req.heading}</span>
                    <span class="infoLabel">Service Details:</span>     <span class="infoVal">${req.details}</span>
                </div>

                ${status === "completed" ? `
                <div class="cardDivider"></div>
                <button class="invoiceBtn" onclick="openInvoice(${req.id})">🧾 View Invoice</button>
                ` : ""}

                ${isActive ? `
                <div class="cardDivider"></div>
                <div class="accordionBlock">
                    <div class="sectionToggle" onclick="toggleSection('customer_${req.id}')">
                        <div class="sectionToggleLeft"><span>👤</span><span>Customer Details</span></div>
                        <span class="sectionToggleIcon" id="icon_customer_${req.id}">▼</span>
                    </div>
                    <div id="customer_${req.id}" class="sectionBody">
                        <div class="infoGrid">
                            <span class="infoLabel">Mob No.</span> <span class="infoVal">${req.customer_mobile || "-"}</span>
                            <span class="infoLabel">Address:</span> <span class="infoVal">${req.customer_address || "-"}</span>
                        </div>
                        <div class="detailActionBtns">
                            <a href="tel:${req.customer_mobile}" class="callBtn">📞 Call</a>
                            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(req.customer_address || req.location)}" target="_blank" class="mapBtn">📍 Open Map</a>
                        </div>
                    </div>
                </div>
                ` : ""}
                `;

        // Accept / forms
        const btns = document.createElement("div");

        if (status === "pending") {
            btns.innerHTML = `
                    <div class="cardDivider"></div>
                    <button id="acceptBtn-${req.id}" class="acceptBtn" onclick="showStartForm(${req.id}, ${req.price || 0})">Accept</button>`;
        }

        if (["accepted", "waiting_customer_confirm", "otp_pending", "in_progress"].includes(status)) {
            const showStart = req.service_type !== 'unit' && ["accepted", "waiting_customer_confirm", "otp_pending", "in_progress"].includes(status);

            btns.innerHTML = `
                    <div id="startForm-${req.id}" style="${showStart ? 'display:block;' : 'display:none;'}">
                        <div class="cardDivider"></div>
                        <div class="accordionBlock">
                            <div class="sectionToggle" onclick="toggleSection('start_${req.id}')">
                                <div class="sectionToggleLeft"><span>⚙️</span><span>Service Start Confirmation</span></div>
                                <span class="sectionToggleIcon" id="icon_start_${req.id}">▼</span>
                            </div>
                            <div id="start_${req.id}" class="sectionBody">
                                <div class="startFormBox">
                                    <div class="startRow">
                                        <label>Service Time</label>
                                        <select id="time-${req.id}">
                                            <option ${req.start_time === "Instant" ? "selected" : ""}>Instant</option>
                                            <option ${req.start_time === "1 Day" ? "selected" : ""}>1 Day</option>
                                            <option ${req.start_time === "2 Day" ? "selected" : ""}>2 Day</option>
                                            <option ${req.start_time === "3 Day" ? "selected" : ""}>3 Day</option>
                                            <option ${req.start_time === "4 Day" ? "selected" : ""}>4 Day</option>
                                            <option ${req.start_time === "5 Day" ? "selected" : ""}>5 Day</option>
                                        </select>
                                    </div>
                                    <div class="startRow"><label>Price</label><input type="text" value="₹ ${req.price || 0}" readonly></div>
                                    <div class="startLabel">Approx. Billing Amount</div>
                                    <div class="startRow"><label>Additional Service Charges</label><input type="number" id="additional-${req.id}" value="${req.additional_cost || ''}" placeholder="₹" oninput="calculateTotal(${req.id}, ${req.price || 0})"></div>
                                    <div class="startRow"><label>Additional Material Charges</label><input type="number" id="material-${req.id}" value="${req.extra_material_cost || ''}" placeholder="₹" oninput="calculateTotal(${req.id}, ${req.price || 0})"></div>
                                    <div class="startRow"><label>Approx. Total Amount</label><input type="text" id="total-${req.id}" value="${req.approx_total || req.price || 0}" readonly></div>
                                    <div class="startBtns">
                                        <button class="confirmBtn" onclick="submitStartConfirmation(${req.id}, ${req.price || 0})">✓ Confirmation</button>
                                        <button class="cancelBtn" onclick="cancelRequest(${req.id})">✕ Cancel</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    ${status === "otp_pending" ? `
                    <div class="cardDivider"></div>
                    <div class="accordionBlock">
                        <div class="sectionToggle" onclick="toggleSection('otp_${req.id}')">
                            <div class="sectionToggleLeft"><span>🔐</span><span>Confirm OTP</span></div>
                            <span class="sectionToggleIcon" id="icon_otp_${req.id}">▼</span>
                        </div>
                        <div id="otp_${req.id}" class="sectionBody">
                            <div class="otpBox">
                                <h4>Enter Customer OTP</h4>
                                <input id="otp-${req.id}" placeholder="Enter OTP">
                                <button class="otpStartBtn" onclick="verifyStartOTP(${req.id})">✓ Let's Start</button>
                            </div>
                        </div>
                    </div>
                    ` : ""}

                    ${status === "in_progress" ? `
                    <div class="cardDivider"></div>
                    <div class="accordionBlock">
                        <div class="sectionToggle" onclick="toggleSection('payment_${req.id}')">
                            <div class="sectionToggleLeft"><span>💳</span><span>Payment Details</span></div>
                            <span class="sectionToggleIcon" id="icon_payment_${req.id}">▼</span>
                        </div>
                        <div id="payment_${req.id}" class="sectionBody">
                            <div class="paymentBox">
                                <div class="paymentRow"><label>Service Time</label><input type="text" value="${req.start_time || 'Instant'}" readonly></div>
                                <div class="paymentRow"><label>Price</label><input type="text" value="₹ ${req.price || 0}" readonly></div>
                                <div class="paymentSubTitle">Additional Service Charges</div>
                                <div class="paymentRow"><label>Amount ₹</label><input type="number" id="additionalPayment-${req.id}" value="${savedPayment ? savedPayment.additional : ''}" oninput="updatePaymentTotal(${req.id}, ${req.price || 0})"></div>
                                <div class="paymentRow"><label>Remark</label><input type="text" id="remark-${req.id}" value="${savedPayment ? savedPayment.remark : ''}" placeholder=""></div>
                                <div class="paymentSubTitle">Extra Material Charges</div>
                                <div id="materialsWrap-${req.id}">
                                    <div class="paymentMaterialGrid">
                                        <div><input type="text" id="matName0-${req.id}" placeholder="Material name" value="${savedPayment && savedPayment.materials[0] ? savedPayment.materials[0].name : ''}"></div>
                                        <div><input type="number" id="matAmt0-${req.id}" class="materialAmount-${req.id}" oninput="updatePaymentTotal(${req.id}, ${req.price || 0})" placeholder="₹" value="${savedPayment && savedPayment.materials[0] ? savedPayment.materials[0].amount : ''}"></div>
                                        <div><button class="addBtn" onclick="addMaterialRow(${req.id}, ${req.price || 0})">+ Add</button></div>
                                    </div>
                                </div>
                                <div class="paymentRow"><label>Total Amount</label><input type="text" id="paymentTotal-${req.id}" value="₹ ${req.approx_total || req.price || 0}" readonly></div>
                                <div class="paymentRow">
                                    <label>Payment type</label>
                                    <select id="paymentType-${req.id}" onchange="updatePaymentButton(${req.id})">
                                        <option value="">Select type</option>
                                        <option value="Cash" ${savedPayment && savedPayment.paymentType === 'Cash' ? 'selected' : ''}>Cash</option>
                                        <option value="UPI"  ${savedPayment && savedPayment.paymentType === 'UPI' ? 'selected' : ''}>UPI</option>
                                    </select>
                                </div>
                                <div class="paymentBtns">
                                    <button id="payBtn-${req.id}" class="paymentSelectBtn" onclick="openPaymentQR()">Select Payment</button>
                                    <div class="paymentNote"><b>Note –</b> Once payment has been successfully processed and confirmed, please select the 'Payment Done' to complete the process.</div>
                                    <button class="doneBtn" onclick="completePayment(${req.id}, ${req.price || 0})">✓ Payment Done</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    ` : ""}`;
        }

        card.appendChild(btns);
        container.appendChild(card);

        // Restore toggle states
        ["customer_", "start_", "otp_", "payment_"].forEach(prefix => {
            const key = prefix + req.id;
            const el = document.getElementById(key);
            const icon = document.getElementById("icon_" + key);
            const toggle = el ? el.previousElementSibling : null;
            if (sectionState[key] === "closed" && el) {
                el.style.display = "none";
                if (icon) icon.classList.add("rotated");
                if (toggle) toggle.classList.remove("open");
            }
        });

        if (openedFormId == req.id) {
            const form = document.getElementById("startForm-" + req.id);
            const acceptBtn = document.getElementById("acceptBtn-" + req.id);
            if (form) form.style.display = "block";
            if (acceptBtn) acceptBtn.style.display = "none";
        }

        // Restore saved payment
        if (savedPayment && status === "in_progress") {
            if (savedPayment.materials && savedPayment.materials.length > 1) {
                for (let i = 1; i < savedPayment.materials.length; i++) {
                    const wrap = document.getElementById("materialsWrap-" + req.id);
                    if (!wrap) continue;
                    const div = document.createElement("div");
                    div.className = "paymentMaterialGrid";
                    div.style.marginTop = "10px";
                    div.innerHTML = `
                                <div><input type="text" placeholder="Material name" value="${savedPayment.materials[i].name || ''}"></div>
                                <div><input type="number" class="materialAmount-${req.id}" oninput="updatePaymentTotal(${req.id}, ${req.price || 0})" placeholder="₹" value="${savedPayment.materials[i].amount || ''}"></div>
                                <div><button class="removeBtn" onclick="this.parentElement.parentElement.remove();updatePaymentTotal(${req.id}, ${req.price || 0})">✕</button></div>`;
                    wrap.appendChild(div);
                }
            }
            updatePaymentTotal(req.id, req.price || 0);
            if (savedPayment.paymentType) updatePaymentButton(req.id);
        }
    });
}

// ── CANCEL ──
async function cancelRequest(id) {
    const remark = prompt("Enter cancellation remark:");
    if (!remark || remark.trim() === "") { alert("Remark is required"); return; }
    try {
        const res = await fetch(API + "/staff/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
            body: JSON.stringify({ request_id: id, remark })
        });
        if (!res.ok) { alert("Cancel failed"); return; }
        alert("Cancelled successfully");
        loadRequests();
    } catch (err) { console.log(err); alert("Server error"); }
}

document.addEventListener("focusin", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") openedFormId = openedFormId || true;
});

function timeAgo(date) {
    const diff = Math.floor((new Date() - new Date(date)) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return Math.floor(diff / 60) + " min ago";
    if (diff < 86400) return Math.floor(diff / 3600) + " hr ago";
    return Math.floor(diff / 86400) + " day ago";
}

async function acceptRequest(id) {
    try {
        const res = await fetch(API + "/staff/accept", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id }) });
        if (res.ok) { alert("Accepted"); loadRequests(); } else alert("Error accepting request");
    } catch { alert("Server error"); }
}

async function showStartForm(id) {
    const request = allRequests.find(r => r.id === id);
    if (request && request.service_type === "unit") {
        try {
            const res = await fetch(API + "/staff/accept", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id }) });
            const data = await res.json();
            if (!res.ok) { const msg = data.error || "Accept failed"; if (msg.toLowerCase().includes("unit balance")) { alert(msg); openUnitPopup(); return; } alert(msg); return; }
            alert("Accepted ✅"); loadRequests();
        } catch (err) { console.log(err); alert("Server error"); }
        return;
    }
    openedFormId = id;
    try {
        const res = await fetch(API + "/staff/accept", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id }) });
        if (!res.ok) { alert("Accept failed"); return; }
        loadRequests();
    } catch (err) { console.log(err); alert("Accept failed"); }
}

function calculateTotal(id, basePrice) {
    const add = Number(document.getElementById("additional-" + id)?.value || 0);
    const mat = Number(document.getElementById("material-" + id)?.value || 0);
    document.getElementById("total-" + id).value = Number(basePrice) + add + mat;
}

async function submitStartConfirmation(id, price) {
    const add = Number(document.getElementById("additional-" + id)?.value || 0);
    const mat = Number(document.getElementById("material-" + id)?.value || 0);
    const total = Number(price) + add + mat;
    try {
        const startRes = await fetch(API + "/staff/start-confirmation", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id, start_time: document.getElementById("time-" + id).value, approx_type: "manual", additional_cost: add, extra_service_cost: 0, extra_material_cost: mat, approx_total: total }) });
        if (!startRes.ok) { alert("Failed"); return; }
        alert("Confirmation sent"); loadRequests();
    } catch (err) { console.log(err); alert("Failed"); }
}

async function verifyStartOTP(id) {
    const otp = document.getElementById("otp-" + id).value;
    const res = await fetch(API + "/staff/verify-start-otp", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id, otp }) });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    alert("Service Started"); loadRequests();
}

function updatePaymentTotal(id, basePrice) {
    let total = Number(basePrice) + Number(document.getElementById("additionalPayment-" + id)?.value || 0);
    document.querySelectorAll(".materialAmount-" + id).forEach(inp => { total += Number(inp.value || 0); });
    document.getElementById("paymentTotal-" + id).value = "₹ " + total;
}

function addMaterialRow(id, basePrice) {
    const wrap = document.getElementById("materialsWrap-" + id);
    const div = document.createElement("div");
    div.className = "paymentMaterialGrid"; div.style.marginTop = "10px";
    div.innerHTML = `
                <div><input type="text" placeholder="Material name"></div>
                <div><input type="number" class="materialAmount-${id}" oninput="updatePaymentTotal(${id}, ${basePrice})" placeholder="₹"></div>
                <div><button class="removeBtn" onclick="this.parentElement.parentElement.remove();updatePaymentTotal(${id}, ${basePrice})">✕</button></div>`;
    wrap.appendChild(div);
}

function updatePaymentButton(id) {
    const type = document.getElementById("paymentType-" + id).value;
    const btn = document.getElementById("payBtn-" + id);
    if (type === "Cash") { btn.innerText = "Cash Received"; btn.setAttribute("onclick", "showCashPopup()"); }
    else if (type === "UPI") { btn.innerText = "Scan & Pay"; btn.onclick = () => { savePaymentDataAndRedirect(id); }; }
    else { btn.innerText = "Select Payment"; btn.removeAttribute("onclick"); }
}

function savePaymentDataAndRedirect(id) {
    const wrap = document.getElementById("materialsWrap-" + id);
    const materials = [];
    if (wrap) { wrap.querySelectorAll(".paymentMaterialGrid").forEach(row => { const n = row.querySelector("input[type='text']"); const a = row.querySelector("input[type='number']"); materials.push({ name: n ? n.value : "", amount: a ? a.value : "" }); }); }
    localStorage.setItem("savedPayment_" + id, JSON.stringify({ id, additional: document.getElementById("additionalPayment-" + id)?.value || "", remark: document.getElementById("remark-" + id)?.value || "", paymentType: document.getElementById("paymentType-" + id)?.value || "", total: document.getElementById("paymentTotal-" + id)?.value || "", materials }));
    window.location.href = "scan-pay.html";
}

function showCashPopup() { alert("Cash Received"); }

async function completePayment(id, price) {
    try {
        const additional = Number(document.getElementById("additionalPayment-" + id)?.value || 0);
        let materialTotal = 0;
        document.querySelectorAll(".materialAmount-" + id).forEach(el => { materialTotal += Number(el.value || 0); });
        const total = Number(price) + additional + materialTotal;
        const paymentType = document.getElementById("paymentType-" + id)?.value || "";
        const res = await fetch(API + "/staff/payment-done", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id, additional_cost: additional, material_total: materialTotal, total_amount: total, payment_type: paymentType }) });
        const data = await res.json();
        if (data.success) { localStorage.removeItem("savedPayment_" + id); alert("Payment Completed"); loadRequests(); } else alert("Failed");
    } catch (err) { console.log(err); alert("Error"); }
}

// ── UNIT POPUP ──
function openUnitPopup(e) {
    if (e) e.stopPropagation();
    isUnitPopupOpen = true;
    document.getElementById("unitPopup").classList.add("active");
    document.getElementById("unitOverlay").classList.add("active");
    loadUnitPopup();
    history.pushState({ unit: true }, "");
}
function closeUnitPopup() {
    isUnitPopupOpen = false;
    document.getElementById("unitPopup").classList.remove("active");
    document.getElementById("unitOverlay").classList.remove("active");
}
async function loadUnitPopup() {
    const body = document.getElementById("unitPopupBody");
    if (!body) return;
    body.innerHTML = "<tr><td colspan='2'>Loading...</td></tr>";
    try {
        const res = await fetch(API + "/staff/unit/all");
        const data = await res.json();
        console.log("UNIT POPUP DATA:", data);
        if (!Array.isArray(data)) { body.innerHTML = "<tr><td colspan='2'>Error loading</td></tr>"; return; }
        if (data.length === 0) { body.innerHTML = "<tr><td colspan='2'>No unit data</td></tr>"; return; }
        data.sort((a, b) => a.unit - b.unit);
        body.innerHTML = "";
        data.forEach(u => {
            body.innerHTML += `<tr onclick="buyUnit(${u.unit}, ${u.amount})" style="cursor:pointer;"><td>${u.unit} ⭐</td><td>₹ ${u.amount}</td></tr>`;
            console.log("CLICK:", u.unit, u.amount);
        });
    } catch (err) { console.log(err); body.innerHTML = "<tr><td colspan='2'>Server error</td></tr>"; }
}
window.addEventListener("popstate", function () { if (isUnitPopupOpen) closeUnitPopup(); });

async function buyUnit(unit, amount) {
    console.log("CLICKED:", unit, amount);
    try {
        const res = await fetch(API + "/payment/create-order", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + localStorage.getItem("staffToken") }, body: JSON.stringify({ amount, unit }) });
        const order = await res.json();
        const options = {
            key: "rzp_test_ShfyzJVzrxSupy", amount: order.amount, currency: "INR",
            name: "Unit Purchase", description: unit + " Unit Balance", order_id: order.id,
            handler: async function (response) {
                console.log("PAYMENT SUCCESS", response);
                await fetch(API + "/payment/verify-payment", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + localStorage.getItem("staffToken") }, body: JSON.stringify({ razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature, amount, unit }) });
                alert("Payment Success ⭐"); location.reload();
            },
            theme: { color: "#1a3fd4" }
        };
        new Razorpay(options).open();
    } catch (err) { console.log(err); alert("Payment failed"); }
}

// ── TABS ──
function switchTab(tab) {
    currentTab = tab;
    document.getElementById("pendingTab").classList.toggle("activeTab", tab === "pending");
    document.getElementById("completedTab").classList.toggle("activeTab", tab === "completed");
    loadStaffRequests();
}

// ── MENU ──
function toggleStaffMenu(e) { e.stopPropagation(); document.getElementById("staffDropdown").classList.toggle("show"); }
function closeStaffMenu() { document.getElementById("staffDropdown").classList.remove("show"); }
function handleMenuClick(action) { closeStaffMenu(); setTimeout(() => { action(); }, 100); }

document.addEventListener("click", (e) => {
    if (isUnitPopupOpen) return;
    if (e.target.closest(".dot-staff-menu")) return;
    if (e.target.closest("#unitPopup")) return;
    if (e.target.closest("#profileBox")) return;
    document.getElementById("staffDropdown").classList.remove("show");
});

function logout() { localStorage.clear(); window.location.href = "login.html"; }
function openWallet() { closeStaffMenu(); window.location.href = "wallet.html"; }
function openLoginActivity() { closeStaffMenu(); alert("Login Activity page coming soon"); }
function openAccountDetails() { closeStaffMenu(); window.location.href = "account-details.html"; }
function openIDCard() { closeStaffMenu(); window.location.href = "id-card.html"; }
function openFeedbackPage() { window.open("rating-feedback.html", "_blank"); }
function openInvoice(id) { window.open("invoice.html?id=" + id, "_blank"); }
function openPaymentQR() { window.location.href = "scan-pay.html"; }

async function loadRating() {
    try {
        const res = await fetch(API + "/staff/rating", { headers: { "Authorization": "Bearer " + token } });
        const data = await res.json();
        const avg = Number(data.avg || 0), count = Number(data.count || 0);
        let html = "";
        for (let i = 1; i <= 5; i++) { if (avg >= i) html += "⭐"; else if (avg >= i - 0.5) html += "⯪"; else html += "☆"; }
        document.getElementById("avgRating").innerHTML = html;
        document.getElementById("ratingCount").innerHTML = `${avg.toFixed(1)} (${count} reviews)`;
    } catch (e) { console.log("Rating load error"); }
}

function toggleSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const icon = document.getElementById("icon_" + id);
    const toggle = el.previousElementSibling;
    if (el.style.display === "none") {
        el.style.display = "block";
        if (icon) icon.classList.remove("rotated");
        if (toggle) toggle.classList.add("open");
        sectionState[id] = "open";
    } else {
        el.style.display = "none";
        if (icon) icon.classList.add("rotated");
        if (toggle) toggle.classList.remove("open");
        sectionState[id] = "closed";
    }
    localStorage.setItem("sectionState", JSON.stringify(sectionState));
}

function toggleBilling(id) {
    ["additionalBox-", "serviceBox-", "materialBox-"].forEach(p => { const el = document.getElementById(p + id); if (el) el.style.display = "none"; });
    const type = document.getElementById("billing-" + id)?.value;
    const box = document.getElementById(type + "Box-" + id);
    if (box) box.style.display = "block";
}