const API = window.location.origin + "/api";
let token = localStorage.getItem("customerToken");
let isTyping = false;
let sectionState = {};

document.addEventListener("DOMContentLoaded", () => {
    if (!token) { alert("Please login first"); window.location.href = "customer-login.html"; return; }
    loadProfile();
    loadRequests();
});

// ── PROFILE ──
async function loadProfile() {
    const res  = await fetch(API + "/customer/profile", { headers: { "Authorization": "Bearer " + token } });
    let user   = await res.json();
    if (!user.name) { const localUser = JSON.parse(localStorage.getItem("user") || "{}"); user = { ...localUser, ...user }; }

    document.getElementById("profileBox").innerHTML = `
    <div class="profileCard">
        <div class="profileTopRow">
            <div class="profileTopLeft">
                <div class="profileAvatar">
                    ${user.image ? `<img src="${window.location.origin}${user.image}?t=${Date.now()}">` : "📞"}
                </div>
                <div>
                    <div class="profileName">
                        ${user.name || ""}
                        <span class="profileVerified">✔ Verified</span>
                    </div>
                    <div class="profileMobile">📞 ${user.mobile || ""}</div>
                </div>
            </div>
            <div class="profileActionBtns">
                <button class="profileBtn profileBtnOutline" onclick="openFullProfile()">👤 View Profile</button>
                <button class="profileBtn profileBtnRed"     onclick="logoutUser()">↩ Logout</button>
            </div>
        </div>
        <div class="profileInfoGrid">
            <div class="profileInfoItem">
                <div class="profileInfoLabel">Name</div>
                <div class="profileInfoVal">${user.name || "-"}</div>
            </div>
            <div class="profileInfoItem">
                <div class="profileInfoLabel">Mob No.</div>
                <div class="profileInfoVal">${user.mobile || "-"}</div>
            </div>
        </div>
    </div>`;
}

let selectedImage = null;
let editMode = false;

function openFullProfile() {
    document.getElementById("profileBox").style.display = "none";
    document.getElementById("fullProfile").style.display = "block";
    fillFullProfile();
}
function closeFullProfile() {
    document.getElementById("profileBox").style.display = "block";
    document.getElementById("fullProfile").style.display  = "none";
    loadProfile();
}
async function fillFullProfile() {
    const res  = await fetch(API + "/customer/profile", { headers: { "Authorization": "Bearer " + token } });
    let user   = await res.json();
    if (!user.name) { const lu = JSON.parse(localStorage.getItem("user") || "{}"); user = { ...lu, ...user }; }
    document.getElementById("full_name").value    = user.name    || "";
    document.getElementById("full_mobile").value  = user.mobile  || "";
    document.getElementById("full_email").value   = user.email   || "";
    document.getElementById("full_address").value = user.address || "";
    document.getElementById("full_image").src = user.image? window.location.origin + user.image: "https://via.placeholder.com/120";
    disableFull();
}
async function toggleEditFull() {
    editMode = !editMode;
    document.querySelectorAll("#fullProfile .fpInput").forEach(i => i.disabled = !editMode);
    document.getElementById("editBtn").innerText = editMode ? "Save" : "Edit Profile";
    if (!editMode) { await saveFullProfile(); closeFullProfile(); loadProfile(); }
}
async function saveFullProfile() {
    const body = { name: document.getElementById("full_name").value, mobile: document.getElementById("full_mobile").value, email: document.getElementById("full_email").value, address: document.getElementById("full_address").value };
    await fetch(API + "/customer/update-profile", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify(body) });
    localStorage.setItem("user", JSON.stringify(body));
    alert("Profile updated");
}
function disableFull() { document.querySelectorAll("#fullProfile .fpInput").forEach(i => i.disabled = true); }
function previewFullImage(e) { document.getElementById("full_image").src = URL.createObjectURL(e.target.files[0]); }
async function uploadFullImage() {
    const file = document.getElementById("imgInput").files[0];
    if (!file) { alert("Select image"); return; }
    const formData = new FormData(); formData.append("image", file);
    const res  = await fetch(API + "/customer/upload-image", { method: "POST", headers: { "Authorization": "Bearer " + token }, body: formData });
    const data = await res.json();
    let user = JSON.parse(localStorage.getItem("user") || "{}"); user.image = data.image; localStorage.setItem("user", JSON.stringify(user));
    alert("Image updated"); closeFullProfile(); loadProfile();
}

// ── TABS ──
let currentTab = "pending";
function switchTab(tab) {
    currentTab = tab;
    document.getElementById("pendingTab").classList.toggle("activeTab",   tab === "pending");
    document.getElementById("completedTab").classList.toggle("activeTab", tab === "completed");
    loadRequests();
}

// ── REQUESTS ──
async function loadRequests() {
    const res      = await fetch(API + "/customer/my-requests", { headers: { "Authorization": "Bearer " + token } });
    const requests = await res.json();
    const container = document.getElementById("requests");
    container.innerHTML = "";

    const filtered = requests.filter(r => {
        const s = (r.status || "").toLowerCase();
        if (currentTab === "pending")   return ["pending","accepted","waiting_customer_confirm","otp_pending","in_progress"].includes(s);
        if (currentTab === "completed") return s === "completed";
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="noData"><div class="noDataIcon">📭</div><p>No data found</p></div>`;
        return;
    }

    filtered.forEach(req => {
        req.status = (req.status || "").toLowerCase();
        const card = document.createElement("div");
        card.className = "requestCard " + req.status;

        // Card inner HTML
        card.innerHTML = `
        <div class="cardTopRow">
            <div class="cardServiceNo">Service No. ${req.id}</div>
            <div class="cardTimeAgo">🕐 ${timeAgo(req.created_at)}</div>
        </div>
        <div class="infoGrid2">
            <div class="infoItem"><div class="infoItemLabel">Heading</div><div class="infoItemVal">${req.heading}</div></div>
            <div class="infoItem"><div class="infoItemLabel">Details</div><div class="infoItemVal">${req.details}</div></div>
            <div class="infoItem"><div class="infoItemLabel">Location</div><div class="infoItemVal">${req.pincode}, ${req.location}</div></div>
            <div class="infoItem"><div class="infoItemLabel">Status</div><div class="infoItemVal"><span class="statusBadge ${req.status}">${req.status.replace(/_/g,' ')}</span></div></div>
        </div>

        ${req.status === "otp_pending" ? `
        <div class="otpBanner">
            <div class="otpBannerIcon">✅</div>
            <div>
                <div class="otpBannerTitle">OTP Sent Successfully</div>
                <div class="otpBannerSub">Please share OTP with staff.</div>
            </div>
        </div>
        ` : ""}

        ${req.status === "completed" ? `
        <button class="invoiceBtn" onclick="openInvoice(${req.id})">🧾 Download Invoice</button>
        <div id="reviewBox_${req.id}" class="reviewBox">
            <div class="reviewBoxTitle">⭐ Your Rating</div>
            <div class="starsRow" id="stars_${req.id}">
                <span class="starSpan" onclick="setRating(${req.id},1)">★</span>
                <span class="starSpan" onclick="setRating(${req.id},2)">★</span>
                <span class="starSpan" onclick="setRating(${req.id},3)">★</span>
                <span class="starSpan" onclick="setRating(${req.id},4)">★</span>
                <span class="starSpan" onclick="setRating(${req.id},5)">★</span>
            </div>
            <input type="hidden" id="rating_${req.id}" value="0">
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px;">Feedback</div>
            <input class="reviewInput" id="feedback_${req.id}" placeholder="Write your feedback here...">
            <button class="reviewSubmitBtn" onclick="submitReview(${req.id})">Submit Review</button>
        </div>
        ` : ""}
        `;

        // ── Staff Details Accordion ──
        if (["accepted","waiting_customer_confirm","otp_pending","in_progress"].includes(req.status) && req.staff_name) {
            const staffBlock = document.createElement("div");
            staffBlock.innerHTML = `
            <div class="cardDivider"></div>
            <div class="accordionBlock">
                <div class="sectionToggle open" onclick="toggleSection('staff_${req.id}')">
                    <div class="sectionToggleLeft"><span>👤</span><span>Staff Details</span></div>
                    <span class="sectionToggleIcon" id="icon_staff_${req.id}">▼</span>
                </div>
                <div id="staff_${req.id}" class="sectionBody">
                    <div class="staffRow">
                        <div class="staffLeft">
                            <div class="staffAvatar">👤</div>
                            <div class="staffInfoText">
                                <div class="staffInfoLine"><b>Staff ID.</b> ${req.staff_id || ""}</div>
                                <div class="staffInfoLine"><b>Name:</b> ${req.staff_name || ""}</div>
                                <div class="staffInfoLine"><b>Mob No.</b> ${req.staff_mobile || ""}</div>
                            </div>
                        </div>
                        <div class="staffRatingBox">
                            <div class="staffRatingLabel">Rating</div>
                            <div class="staffRatingStars" id="staffRating_${req.id}">☆☆☆☆☆</div>
                            <div class="staffRatingCount" id="staffRatingCount_${req.id}"></div>
                            <span class="feedbackLink" onclick="openFeedbackPage(${req.staff_id})">Feedback</span>
                        </div>
                    </div>
                </div>
            </div>`;
            card.appendChild(staffBlock);

            // Apply saved state
            const staffKey = "staff_" + req.id;
            if (!sectionState[staffKey]) sectionState[staffKey] = "open";
            if (sectionState[staffKey] === "closed") {
                const el   = document.getElementById(staffKey);
                const icon = document.getElementById("icon_" + staffKey);
                const tog  = el ? el.previousElementSibling : null;
                if (el)   el.style.display   = "none";
                if (icon) icon.classList.add("rotated");
                if (tog)  tog.classList.remove("open");
            }

            // Load staff rating
            loadStaffRating(req.staff_id, req.id);
        }

        // ── Service Start Confirmation Accordion ──
        if (["waiting_customer_confirm","otp_pending","in_progress"].includes(req.status)) {
            const confirmBlock = document.createElement("div");
            confirmBlock.innerHTML = `
            <div class="cardDivider"></div>
            <div class="accordionBlock">
                <div class="sectionToggle open" onclick="toggleSection('confirm_${req.id}')">
                    <div class="sectionToggleLeft"><span>📋</span><span>Service Start Confirmation</span></div>
                    <span class="sectionToggleIcon" id="icon_confirm_${req.id}">▼</span>
                </div>
                <div id="confirm_${req.id}" class="sectionBody">
                    <div class="confirmGrid">
                        <div class="confirmItem"><div class="confirmLabel">Service Time</div><div class="confirmVal">${req.start_time || "Instant"}</div></div>
                        <div class="confirmItem"><div class="confirmLabel">Price</div><div class="confirmVal">₹ ${req.service_price || 0}</div></div>
                        <div class="confirmItem"><div class="confirmLabel">Additional Service Charges</div><div class="confirmVal">₹ ${req.additional_cost || 0}</div></div>
                        <div class="confirmItem"><div class="confirmLabel">Additional Material Charges</div><div class="confirmVal">₹ ${req.extra_material_cost || 0}</div></div>
                    </div>
                    <div class="confirmTotal">
                        Approx. Total Amount &nbsp; <span>₹ ${req.approx_total || req.price || 0}</span>
                    </div>
                    ${req.status === "waiting_customer_confirm" ? `
                    <div class="confirmBtns">
                        <button class="btnConfirm" onclick="customerConfirm(${req.id})">✓ Confirm</button>
                        <button class="btnCancelSm" onclick="cancelRequest(${req.id})">✕ Cancel</button>
                    </div>` : ""}
                </div>
            </div>`;
            card.appendChild(confirmBlock);

            const confirmKey = "confirm_" + req.id;
            if (!sectionState[confirmKey]) sectionState[confirmKey] = "open";
            if (sectionState[confirmKey] === "closed") {
                const el   = document.getElementById(confirmKey);
                const icon = document.getElementById("icon_" + confirmKey);
                const tog  = el ? el.previousElementSibling : null;
                if (el)   el.style.display   = "none";
                if (icon) icon.classList.add("rotated");
                if (tog)  tog.classList.remove("open");
            }
        }

        // ── Action Buttons ──
        if (req.status === "accepted") {
            const btnRow = document.createElement("div");
            btnRow.className = "actionBtnRow";
            btnRow.innerHTML = `
                <button class="actionBtn actionBtnGreen"  onclick="markDone(${req.id})">✓ Service Done</button>
                <button class="actionBtn actionBtnBlue"   onclick="findOther(${req.id})">🔄 Any Other</button>
                <button class="actionBtn actionBtnOrange" onclick="notCompleted(${req.id})">⚠ Not Completed Yet</button>
                <button class="actionBtn actionBtnRed"    onclick="cancelRequest(${req.id})">✕ Cancel</button>`;
            card.appendChild(btnRow);
        }

        if (req.status === "pending") {
            const btnRow = document.createElement("div");
            btnRow.className = "actionBtnRow";
            btnRow.innerHTML = `<button class="actionBtn actionBtnRed" onclick="cancelRequest(${req.id})" style="flex:none;min-width:120px;">✕ Cancel</button>`;
            card.appendChild(btnRow);
        }

        // Hide review if already submitted
        const reviewBox = card.querySelector("#reviewBox_" + req.id);
        if (reviewBox && localStorage.getItem("review_" + req.id) === "submitted") reviewBox.style.display = "none";

        container.appendChild(card);
    });
}

// ── TIME ──
function timeAgo(date) {
    const diff = Math.floor((new Date() - new Date(date)) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return Math.floor(diff / 60) + " min ago";
    if (diff < 86400) return Math.floor(diff / 3600) + " hr ago";
    return Math.floor(diff / 86400) + " day ago";
}

// ── TOGGLE SECTION ──
function toggleSection(id) {
    const el   = document.getElementById(id);
    if (!el) return;
    const icon = document.getElementById("icon_" + id);
    const tog  = el.previousElementSibling;
    if (el.style.display === "none") {
        el.style.display = "block";
        if (icon) icon.classList.remove("rotated");
        if (tog)  tog.classList.add("open");
        sectionState[id] = "open";
    } else {
        el.style.display = "none";
        if (icon) icon.classList.add("rotated");
        if (tog)  tog.classList.remove("open");
        sectionState[id] = "closed";
    }
}

// ── ACTIONS ──
async function markDone(id) {
    await fetch(API + "/customer/mark-complete", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id }) });
    alert("Service completed"); loadRequests();
}
async function findOther(id) {
    await fetch(API + "/customer/find-other", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id }) });
    alert("Searching another staff"); loadRequests();
}
async function notCompleted(id) {
    await fetch(API + "/customer/not-completed", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id }) });
    alert("Marked not completed"); loadRequests();
}
async function cancelRequest(id) {
    const remark = prompt("Enter cancellation remark:");
    if (!remark || remark.trim() === "") { alert("Remark is required"); return; }
    await fetch(API + "/customer/cancel", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id, remark }) });
    alert("Request cancelled"); loadRequests();
}
async function customerConfirm(id) {
    await fetch(API + "/customer/confirm-start", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id }) });
    alert("Confirmed"); loadRequests();
}
function openInvoice(id) { window.open("/invoice.html?id=" + id, "_blank"); }

// ── RATING ──
function setRating(id, rating) {
    isTyping = true;
    document.getElementById("rating_" + id).value = rating;
    document.querySelectorAll("#stars_" + id + " .starSpan").forEach((s, i) => {
        s.classList.toggle("active", i < rating);
        s.style.color = i < rating ? "var(--orange)" : "#d1d5db";
    });
}
async function submitReview(id) {
    const rating   = document.getElementById("rating_" + id).value;
    const feedback = document.getElementById("feedback_" + id).value;
    if (rating == 0) { alert("Please select rating"); return; }
    try {
        const res  = await fetch(API + "/customer/review", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ request_id: id, rating, feedback }) });
        const data = await res.json();
        if (!res.ok) { alert(data.error || "Failed"); return; }
        alert("Review submitted");
        const rb = document.getElementById("reviewBox_" + id);
        if (rb) rb.style.display = "none";
        localStorage.setItem("review_" + id, "submitted");
        isTyping = false;
    } catch (err) { console.log(err); alert("Server error"); }
}
async function loadStaffRating(staffId, reqId) {
    try {
        const res = await fetch(API + "/staff/rating/" + staffId);
        if (!res.ok) return;
        const data = await res.json();
        const avg  = Number(data.avg || 0), count = Number(data.count || 0);
        let stars  = "";
        for (let i = 1; i <= 5; i++) { if (avg >= i) stars += "⭐"; else if (avg >= i - 0.5) stars += "⯪"; else stars += "☆"; }
        const starEl  = document.getElementById("staffRating_"      + reqId);
        const countEl = document.getElementById("staffRatingCount_" + reqId);
        if (starEl)  starEl.innerHTML  = stars;
        if (countEl) countEl.innerHTML = `(${avg.toFixed(1)} · ${count} reviews)`;
    } catch (err) { console.log("Rating load error:", err); }
}
function openFeedbackPage(staffId) { window.open("rating-feedback.html?staff_id=" + staffId, "_blank"); }
function logoutUser() { localStorage.removeItem("customerToken"); localStorage.removeItem("user"); alert("Logged out"); window.location.href = "customer-login.html"; }